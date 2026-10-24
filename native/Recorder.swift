import AVFoundation
import AudioToolbox
import CoreAudio
import Foundation

final class Recorder {
    private let path: String
    private let configuredDeviceUID: String?
    private let engine = AVAudioEngine()
    private let permission = PermissionGate()
    private let lock = NSLock()
    private let audioCallbacks = DispatchGroup()
    private let targetFormat = CaptureAudioFormat.format
    private var converter: AVAudioConverter?
    private var file: AVAudioFile?
    private var selectedDevice: InputDevice?
    private var timer: Timer?
    private var lastBufferAt: Date?
    private var totalFrames: AVAudioFramePosition = 0
    private var finished = false
    private var tapInstalled = false
    private var readySent = false

    init(path: String, deviceUID: String? = nil) {
        self.path = path
        self.configuredDeviceUID = deviceUID
    }

    func requestPermission() {
        AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
            DispatchQueue.main.async {
                guard let self else { return }
                self.permission.resolve(granted: granted, start: {
                    self.start()
                }, denied: {
                    self.finish(false, "Microphone permission denied. Enable microphone access for the app running OpenCode (for example, Ghostty) in System Settings > Privacy & Security > Microphone, then restart it.")
                })
            }
        }
    }

    func finish(_ success: Bool, _ error: String? = nil, reason: String = "user") {
        lock.lock()
        guard !finished else {
            lock.unlock()
            return
        }
        finished = true
        lock.unlock()
        permission.cancel()
        timer?.invalidate()
        timer = nil
        if tapInstalled {
            engine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        engine.stop()
        audioCallbacks.wait()
        file = nil // Close and flush the WAV before reporting completion.
        if !success { try? FileManager.default.removeItem(atPath: path) }
        if let error {
            emit(["type": "error", "message": error])
        } else if success {
            emit(["type": "stopped", "reason": reason])
        } else {
            emit(["type": "cancelled"])
        }
        exit(error == nil ? 0 : 1)
    }

    func start() {
        guard !finished else { return }
        do {
            let devices = try AudioDevices.list()
            let selected = try AudioDevices.resolve(configuredUID: configuredDeviceUID, devices: devices)
            selectedDevice = selected
            let input = engine.inputNode
            let selectStatus = input.withAudioUnit { unit -> OSStatus in
                guard let unit else { return kAudioUnitErr_Uninitialized }
                var deviceID = selected.deviceID
                return AudioUnitSetProperty(
                    unit,
                    kAudioOutputUnitProperty_CurrentDevice,
                    kAudioUnitScope_Global,
                    0,
                    &deviceID,
                    UInt32(MemoryLayout<AudioDeviceID>.size)
                )
            }
            guard selectStatus == noErr else {
                throw NSError(domain: NSOSStatusErrorDomain, code: Int(selectStatus), userInfo: [NSLocalizedDescriptionKey: "Could not select microphone '\(selected.name)' (Core Audio status \(selectStatus))."])
            }

            let inputFormat = input.outputFormat(forBus: 0)
            guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0,
                  let audioConverter = AVAudioConverter(from: inputFormat, to: targetFormat) else {
                throw NSError(domain: "DictationCapture", code: 1, userInfo: [NSLocalizedDescriptionKey: "The selected microphone has an unsupported audio format."])
            }
            converter = audioConverter
            file = try AVAudioFile(forWriting: URL(fileURLWithPath: path), settings: CaptureAudioFormat.settings, commonFormat: .pcmFormatInt16, interleaved: true)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path)
            try installAudioTap(on: input, format: inputFormat)
            tapInstalled = true
            engine.prepare()
            try engine.start()
            guard engine.isRunning else {
                throw NSError(domain: "DictationCapture", code: 2, userInfo: [NSLocalizedDescriptionKey: "The microphone engine did not start."])
            }
            emit(["type": "ready", "deviceUID": selected.uid, "sampleRate": 16_000, "channels": 1])
            lock.lock()
            readySent = true
            lastBufferAt = Date()
            lock.unlock()
            timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.tick() }
        } catch {
            finish(false, error.localizedDescription)
        }
    }

    private func installAudioTap(on input: AVAudioInputNode, format: AVAudioFormat) throws {
        if #available(macOS 27.0, *) {
            try input.installAudioTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] readOnlyBuffer, _ in
                self?.consume(AVAudioPCMBuffer(copying: readOnlyBuffer))
            }
        } else {
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                self?.consume(buffer)
            }
        }
    }

    private func consume(_ inputBuffer: AVAudioPCMBuffer) {
        lock.lock()
        guard !finished, let converter, let file else {
            lock.unlock()
            return
        }
        audioCallbacks.enter()
        let shouldEmitLevel = readySent
        lock.unlock()
        defer { audioCallbacks.leave() }

        let db = levelDBFS(inputBuffer)
        let frameCapacity = AVAudioFrameCount(ceil(Double(inputBuffer.frameLength) * targetFormat.sampleRate / inputBuffer.format.sampleRate) + 32)
        guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCapacity) else {
            DispatchQueue.main.async { self.finish(false, "Could not allocate an audio conversion buffer.") }
            return
        }
        var suppliedInput = false
        var conversionError: NSError?
        let conversionStatus = converter.convert(to: outputBuffer, error: &conversionError) { _, inputStatus in
            guard !suppliedInput else {
                inputStatus.pointee = .noDataNow
                return nil
            }
            suppliedInput = true
            inputStatus.pointee = .haveData
            return inputBuffer
        }
        guard conversionStatus != .error, conversionError == nil else {
            DispatchQueue.main.async { self.finish(false, conversionError?.localizedDescription ?? "Could not convert microphone audio.") }
            return
        }
        do {
            if outputBuffer.frameLength > 0 { try file.write(from: outputBuffer) }
            lock.lock()
            totalFrames += AVAudioFramePosition(outputBuffer.frameLength)
            lastBufferAt = Date()
            let seconds = Double(totalFrames) / targetFormat.sampleRate
            lock.unlock()
            let bufferMs = Double(inputBuffer.frameLength) / inputBuffer.format.sampleRate * 1_000
            if shouldEmitLevel { emit(["type": "level", "db": db, "seconds": seconds, "bufferMs": bufferMs]) }
        } catch {
            DispatchQueue.main.async { self.finish(false, error.localizedDescription) }
        }
    }

    private func levelDBFS(_ buffer: AVAudioPCMBuffer) -> Float {
        let frames = Int(buffer.frameLength)
        guard frames > 0, buffer.format.channelCount > 0 else { return -120 }
        var squareSum = 0.0
        var sampleCount = 0
        if let channels = buffer.floatChannelData {
            for channel in 0..<Int(buffer.format.channelCount) {
                let samples = channels[channel]
                for index in 0..<frames {
                    let sample = Double(samples[index])
                    squareSum += sample * sample
                }
                sampleCount += frames
            }
        } else if let channels = buffer.int16ChannelData {
            for channel in 0..<Int(buffer.format.channelCount) {
                let samples = channels[channel]
                for index in 0..<frames {
                    let sample = Double(samples[index]) / 32768
                    squareSum += sample * sample
                }
                sampleCount += frames
            }
        }
        guard sampleCount > 0 else { return -120 }
        let rms = sqrt(squareSum / Double(sampleCount))
        return Float(20 * log10(max(rms, 0.000001)))
    }

    private func tick() {
        guard !finished else { return }
        guard let selectedDevice else { return }
        let deviceAlive: Bool
        do {
            deviceAlive = try AudioDevices.isAlive(selectedDevice.deviceID)
        } catch {
            finish(false, "Could not check microphone '\(selectedDevice.name)': \(error.localizedDescription)")
            return
        }
        lock.lock()
        let lastBufferAt = self.lastBufferAt
        lock.unlock()
        let secondsSinceLastBuffer = lastBufferAt.map { Date().timeIntervalSince($0) }
        switch CaptureHealth.evaluate(deviceAlive: deviceAlive, secondsSinceLastBuffer: secondsSinceLastBuffer) {
        case .healthy:
            break
        case .deviceDisconnected:
            finish(false, "Microphone '\(selectedDevice.name)' disconnected during recording.")
            return
        case .deliveryLost:
            finish(false, "Microphone '\(selectedDevice.name)' stopped delivering audio. Check the selected input device and reconnect it if needed.")
            return
        }
        if getppid() == 1 { finish(false) }
    }
}
