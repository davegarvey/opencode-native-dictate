import Foundation

/// Guards the asynchronous macOS permission callback against cancellation and
/// duplicate resolution. AVFoundation's permission prompt itself is not
/// cancellable, so the callback must become inert after the session ends.
final class PermissionGate {
    private(set) var isCancelled = false
    private(set) var didResolve = false

    func resolve(granted: Bool, start: () -> Void, denied: () -> Void) {
        guard !isCancelled, !didResolve else { return }
        didResolve = true
        if granted { start() } else { denied() }
    }

    func cancel() {
        isCancelled = true
    }
}
