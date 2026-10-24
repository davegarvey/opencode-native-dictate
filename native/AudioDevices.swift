import AudioToolbox
import CoreAudio
import Foundation

struct InputDevice: Codable, Equatable {
    let uid: String
    let name: String
    let deviceID: AudioDeviceID
    var isDefault: Bool
}

enum AudioDeviceError: LocalizedError {
    case coreAudio(String, OSStatus)
    case missingConfiguredDevice(String)
    case noDefaultInput

    var errorDescription: String? {
        switch self {
        case let .coreAudio(operation, status):
            return "Could not \(operation) (Core Audio status \(status))."
        case let .missingConfiguredDevice(uid):
            return "Configured microphone '\(uid)' is unavailable. Run `bin/recorder --list-devices` in the plugin directory and choose an available device; no fallback microphone was selected."
        case .noDefaultInput:
            return "No default microphone is available. Connect or select an input device in macOS Sound settings."
        }
    }
}

enum AudioDevices {
    static func list() throws -> [InputDevice] {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        let system = AudioObjectID(kAudioObjectSystemObject)
        var status = AudioObjectGetPropertyDataSize(system, &address, 0, nil, &size)
        guard status == noErr else { throw AudioDeviceError.coreAudio("list audio devices", status) }
        let count = Int(size) / MemoryLayout<AudioDeviceID>.size
        var ids = Array(repeating: AudioDeviceID(kAudioObjectUnknown), count: count)
        status = ids.withUnsafeMutableBufferPointer { buffer in
            guard let baseAddress = buffer.baseAddress else { return noErr }
            return AudioObjectGetPropertyData(system, &address, 0, nil, &size, baseAddress)
        }
        guard status == noErr else { throw AudioDeviceError.coreAudio("read audio devices", status) }

        let defaultID = try defaultInputID()
        return try ids.compactMap { id in
            guard try hasInput(id) else { return nil }
            return InputDevice(
                uid: try stringProperty(id, selector: kAudioDevicePropertyDeviceUID),
                name: try stringProperty(id, selector: kAudioObjectPropertyName),
                deviceID: id,
                isDefault: id == defaultID
            )
        }
    }

    static func resolve(configuredUID: String?, devices: [InputDevice]) throws -> InputDevice {
        if let configuredUID {
            guard let device = devices.first(where: { $0.uid == configuredUID }) else {
                throw AudioDeviceError.missingConfiguredDevice(configuredUID)
            }
            return device
        }
        guard let device = devices.first(where: \.isDefault) else { throw AudioDeviceError.noDefaultInput }
        return device
    }

    static func defaultInputID() throws -> AudioDeviceID? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var id = AudioDeviceID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        let status = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &id)
        guard status == noErr else { throw AudioDeviceError.coreAudio("read default microphone", status) }
        guard id != AudioDeviceID(kAudioObjectUnknown) else { return nil }
        return id
    }

    static func isAlive(_ id: AudioDeviceID) throws -> Bool {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceIsAlive,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var alive: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        let status = AudioObjectGetPropertyData(AudioObjectID(id), &address, 0, nil, &size, &alive)
        guard status == noErr else { throw AudioDeviceError.coreAudio("check microphone connection", status) }
        return alive != 0
    }

    private static func hasInput(_ id: AudioDeviceID) throws -> Bool {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreams,
            mScope: kAudioDevicePropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        let object = AudioObjectID(id)
        let status = AudioObjectGetPropertyDataSize(object, &address, 0, nil, &size)
        guard status == noErr else { throw AudioDeviceError.coreAudio("inspect microphone inputs", status) }
        return size >= UInt32(MemoryLayout<AudioStreamID>.size)
    }

    private static func stringProperty(_ id: AudioDeviceID, selector: AudioObjectPropertySelector) throws -> String {
        var address = AudioObjectPropertyAddress(
            mSelector: selector,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var value: CFString?
        var size = UInt32(MemoryLayout<CFString>.size)
        let status = withUnsafeMutablePointer(to: &value) { pointer in
            AudioObjectGetPropertyData(AudioObjectID(id), &address, 0, nil, &size, UnsafeMutableRawPointer(pointer))
        }
        guard status == noErr else { throw AudioDeviceError.coreAudio("read microphone identity", status) }
        return (value ?? "" as CFString) as String
    }
}
