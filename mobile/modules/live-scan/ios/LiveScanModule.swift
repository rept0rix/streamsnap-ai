import ExpoModulesCore
import ReplayKit
import UIKit
import UserNotifications

public class LiveScanModule: Module {
  private var darwinObserver: UnsafeMutableRawPointer?

  public func definition() -> ModuleDefinition {
    Name("LiveScan")

    Events("onUpdate")

    OnCreate {
      self.observeDarwin()
    }

    OnDestroy {
      self.removeDarwin()
    }

    Function("isAvailable") { () -> Bool in
      true
    }

    AsyncFunction("requestNotificationPermission") { () -> Bool in
      await withCheckedContinuation { continuation in
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
          continuation.resume(returning: granted)
        }
      }
    }

    AsyncFunction("syncCredentials") { (token: String?, installId: String, workerUrl: String) in
      LiveScanStore.writeCredentials(token: token, installId: installId, workerUrl: workerUrl)
    }

    Function("getState") { () -> [String: Any] in
      LiveScanStore.snapshot(screenCaptured: UIScreen.main.isCaptured)
    }

    AsyncFunction("startBroadcast") {
      await MainActor.run {
        self.presentBroadcastPicker()
      }
    }
  }

  private func presentBroadcastPicker() {
    guard let window = Self.keyWindow() else { return }
    let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
    picker.preferredExtension = Self.broadcastExtensionBundleId()
    picker.showsMicrophoneButton = false
    picker.isHidden = true
    window.addSubview(picker)
    if let button = picker.subviews.first(where: { $0 is UIButton }) as? UIButton {
      button.sendActions(for: .allTouchEvents)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
      picker.removeFromSuperview()
    }
  }

  private func observeDarwin() {
    let pointer = Unmanaged.passUnretained(self).toOpaque()
    darwinObserver = pointer
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      pointer,
      { _, observer, _, _, _ in
        guard let observer else { return }
        let module = Unmanaged<LiveScanModule>.fromOpaque(observer).takeUnretainedValue()
        DispatchQueue.main.async {
          module.emitUpdate()
        }
      },
      LiveScanStore.darwinName,
      nil,
      .deliverImmediately
    )
  }

  private func removeDarwin() {
    guard let darwinObserver else { return }
    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      darwinObserver,
      CFNotificationName(LiveScanStore.darwinName),
      nil
    )
    self.darwinObserver = nil
  }

  private func emitUpdate() {
    sendEvent("onUpdate", LiveScanStore.snapshot(screenCaptured: UIScreen.main.isCaptured))
  }

  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }

  private static func broadcastExtensionBundleId() -> String {
    if let plugins = Bundle.main.builtInPlugInsURL,
       let items = try? FileManager.default.contentsOfDirectory(at: plugins, includingPropertiesForKeys: nil) {
      for url in items where url.pathExtension == "appex" {
        guard let bundle = Bundle(url: url),
              let info = bundle.infoDictionary,
              let ext = info["NSExtension"] as? [String: Any],
              ext["NSExtensionPointIdentifier"] as? String == "com.apple.broadcast-services-upload"
        else { continue }
        if let id = bundle.bundleIdentifier {
          return id
        }
      }
    }
    if let id = Bundle.main.bundleIdentifier {
      return "\(id).BroadcastExtension"
    }
    return "org.name.StreamSnapAI.BroadcastExtension"
  }
}
