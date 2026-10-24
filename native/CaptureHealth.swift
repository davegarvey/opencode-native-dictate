import Foundation

enum CaptureHealth: Equatable {
    case healthy
    case deviceDisconnected
    case deliveryLost

    static func evaluate(deviceAlive: Bool, secondsSinceLastBuffer: TimeInterval?) -> CaptureHealth {
        guard deviceAlive else { return .deviceDisconnected }
        guard let secondsSinceLastBuffer, secondsSinceLastBuffer <= 1.0 else { return .deliveryLost }
        return .healthy
    }
}
