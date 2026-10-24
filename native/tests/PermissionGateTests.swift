import Foundation
import AVFoundation

@main
struct PermissionGateTests {
    static func main() {
        deniedPermissionDoesNotStartCapture()
        latePermissionGrantAfterCancellationIsIgnored()
        duplicatePermissionResolutionIsIgnored()
        configuredDeviceNeverFallsBack()
        captureHealthSeparatesSilenceFromMissingInput()
        pcmWriterProducesReadableMono16kWAV()
        print("PermissionGate tests passed")
    }

    static func deniedPermissionDoesNotStartCapture() {
        let gate = PermissionGate()
        var starts = 0
        var denials = 0
        gate.resolve(granted: false, start: { starts += 1 }, denied: { denials += 1 })
        precondition(starts == 0 && denials == 1)
    }

    static func latePermissionGrantAfterCancellationIsIgnored() {
        let gate = PermissionGate()
        var starts = 0
        var denials = 0
        gate.cancel()
        gate.resolve(granted: true, start: { starts += 1 }, denied: { denials += 1 })
        precondition(starts == 0 && denials == 0)
    }

    static func duplicatePermissionResolutionIsIgnored() {
        let gate = PermissionGate()
        var starts = 0
        var denials = 0
        gate.resolve(granted: true, start: { starts += 1 }, denied: { denials += 1 })
        gate.resolve(granted: false, start: { starts += 1 }, denied: { denials += 1 })
        precondition(starts == 1 && denials == 0)
    }

    static func configuredDeviceNeverFallsBack() {
        let available = [InputDevice(uid: "default-mic", name: "Built-in", deviceID: 1, isDefault: true)]
        do {
            _ = try AudioDevices.resolve(configuredUID: "missing-usb-mic", devices: available)
            preconditionFailure("Missing configured device unexpectedly selected a fallback")
        } catch let error as AudioDeviceError {
            guard case .missingConfiguredDevice("missing-usb-mic") = error else {
                preconditionFailure("Unexpected device error: \(error)")
            }
        } catch {
            preconditionFailure("Unexpected error: \(error)")
        }
        do {
            let selected = try AudioDevices.resolve(configuredUID: nil, devices: available)
            precondition(selected.uid == "default-mic")
        } catch {
            preconditionFailure("Default microphone did not resolve: \(error)")
        }
    }

    static func captureHealthSeparatesSilenceFromMissingInput() {
        precondition(CaptureHealth.evaluate(deviceAlive: true, secondsSinceLastBuffer: 0.2) == .healthy)
        precondition(CaptureHealth.evaluate(deviceAlive: true, secondsSinceLastBuffer: nil) == .deliveryLost)
        precondition(CaptureHealth.evaluate(deviceAlive: true, secondsSinceLastBuffer: 1.1) == .deliveryLost)
        precondition(CaptureHealth.evaluate(deviceAlive: false, secondsSinceLastBuffer: 0.1) == .deviceDisconnected)
    }

    static func pcmWriterProducesReadableMono16kWAV() {
        let path = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("dictation-format-\(UUID().uuidString).wav")
        defer { try? FileManager.default.removeItem(at: path) }
        do {
            let frameCount: AVAudioFrameCount = 8_000
            let buffer = AVAudioPCMBuffer(pcmFormat: CaptureAudioFormat.format, frameCapacity: frameCount)!
            buffer.frameLength = frameCount
            let samples = buffer.int16ChannelData!.pointee
            for index in 0..<Int(frameCount) { samples[index] = Int16((index % 128) * 128 - 8_192) }
            let writer = try AVAudioFile(forWriting: path, settings: CaptureAudioFormat.settings, commonFormat: .pcmFormatInt16, interleaved: true)
            try writer.write(from: buffer)
        } catch {
            preconditionFailure("WAV writer failed: \(error)")
        }
        do {
            let reader = try AVAudioFile(forReading: path)
            precondition(reader.fileFormat.sampleRate == 16_000)
            precondition(reader.fileFormat.channelCount == 1)
            precondition(reader.fileFormat.commonFormat == .pcmFormatInt16)
            precondition(reader.fileFormat.isInterleaved)
            let readBuffer = AVAudioPCMBuffer(pcmFormat: reader.processingFormat, frameCapacity: 8_000)!
            try reader.read(into: readBuffer)
            precondition(readBuffer.frameLength == 8_000)
        } catch {
            preconditionFailure("Audio reader rejected generated WAV: \(error)")
        }
    }
}
