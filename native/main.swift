import AVFoundation
import Foundation
import Dispatch

func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
    FileHandle.standardOutput.write(data + Data([10]))
}

if CommandLine.arguments.count == 2, CommandLine.arguments[1] == "--list-devices" {
    do {
        let devices = try AudioDevices.list().map { device in
            ["uid": device.uid, "name": device.name, "default": device.isDefault] as [String: Any]
        }
        emit(["type": "devices", "devices": devices])
        exit(0)
    } catch {
        fputs("\(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: recorder output.wav | recorder --list-devices\n", stderr)
    exit(2)
}

let recorder = Recorder(path: CommandLine.arguments[1], deviceUID: ProcessInfo.processInfo.environment["OPENCODE_DICTATE_DEVICE_UID"])

// Control pipe EOF is also a parent-death signal. No audio survives cancellation.
DispatchQueue.global().async {
    while let line = readLine() {
        DispatchQueue.main.async { recorder.finish(line == "stop") }
    }
    DispatchQueue.main.async { recorder.finish(false) }
}

recorder.requestPermission()
RunLoop.main.run()
