import Foundation

/// Cross-process store shared by the main app and the ReplayKit broadcast
/// extension via App Group UserDefaults. The extension writes finds; the app
/// reads them and merges into the catalog.
enum LiveScanStore {
  static let appGroupId = "group.com.streamsnap.ai"
  static let darwinName = "com.streamsnap.ai.liveScan.updated" as CFString

  private enum Key {
    static let broadcasting = "ss.live.broadcasting"
    static let startedAt = "ss.live.startedAt"
    static let lastFrameAt = "ss.live.lastFrameAt"
    static let scanCount = "ss.live.scanCount"
    static let findCount = "ss.live.findCount"
    static let lastError = "ss.live.lastError"
    static let products = "ss.live.products"
    static let sessionToken = "ss.live.sessionToken"
    static let installId = "ss.live.installId"
    static let workerUrl = "ss.live.workerUrl"
  }

  static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroupId)
  }

  static func beginSession() {
    guard let defaults else { return }
    defaults.set(true, forKey: Key.broadcasting)
    defaults.set(Date().timeIntervalSince1970, forKey: Key.startedAt)
    defaults.set(0, forKey: Key.scanCount)
    defaults.set(0, forKey: Key.findCount)
    defaults.removeObject(forKey: Key.lastError)
    defaults.removeObject(forKey: Key.lastFrameAt)
    defaults.set(Data("[]".utf8), forKey: Key.products)
    defaults.synchronize()
    ping()
  }

  static func endSession() {
    defaults?.set(false, forKey: Key.broadcasting)
    defaults?.synchronize()
    ping()
  }

  static func writeCredentials(token: String?, installId: String, workerUrl: String) {
    guard let defaults else { return }
    if let token, !token.isEmpty {
      defaults.set(token, forKey: Key.sessionToken)
    } else {
      defaults.removeObject(forKey: Key.sessionToken)
    }
    defaults.set(installId, forKey: Key.installId)
    defaults.set(workerUrl, forKey: Key.workerUrl)
    defaults.synchronize()
  }

  static func credentials() -> (token: String?, installId: String, workerUrl: String) {
    let defaults = defaults
    return (
      defaults?.string(forKey: Key.sessionToken),
      defaults?.string(forKey: Key.installId) ?? "mob-unknown",
      defaults?.string(forKey: Key.workerUrl) ?? "https://streamsnap-lens.na0ryank0.workers.dev"
    )
  }

  static func recordScan(error: String? = nil) {
    guard let defaults else { return }
    defaults.set(defaults.integer(forKey: Key.scanCount) + 1, forKey: Key.scanCount)
    defaults.set(Date().timeIntervalSince1970, forKey: Key.lastFrameAt)
    if let error {
      defaults.set(error, forKey: Key.lastError)
    } else {
      defaults.removeObject(forKey: Key.lastError)
    }
    defaults.synchronize()
    ping()
  }

  static func upsertProducts(_ incoming: [[String: Any]]) {
    guard let defaults else { return }
    var existing = products()
    let now = Date().timeIntervalSince1970 * 1000
    var added = 0

    for raw in incoming {
      guard let title = raw["title"] as? String, !title.isEmpty else { continue }
      let asin = raw["asin"] as? String
      let url = raw["url"] as? String ?? ""
      let key = (asin?.isEmpty == false ? asin! : url)
      guard !key.isEmpty else { continue }

      if let idx = existing.firstIndex(where: { item in
        let existingKey = (item["asin"] as? String).flatMap { $0.isEmpty ? nil : $0 }
          ?? (item["url"] as? String ?? "")
        return existingKey == key
      }) {
        var item = existing[idx]
        item["seenCount"] = (item["seenCount"] as? Int ?? 1) + 1
        item["lastSeenAt"] = now
        if let price = raw["price"] as? String { item["price"] = price }
        if let imageUrl = raw["imageUrl"] as? String { item["imageUrl"] = imageUrl }
        existing[idx] = item
      } else {
        var item = raw
        item["id"] = item["id"] as? String ?? "live-\(Int(now))-\(added)"
        item["seenCount"] = 1
        item["firstSeenAt"] = now
        item["lastSeenAt"] = now
        existing.insert(item, at: 0)
        added += 1
      }
    }

    if existing.count > 80 {
      existing = Array(existing.prefix(80))
    }

    if let data = try? JSONSerialization.data(withJSONObject: existing) {
      defaults.set(data, forKey: Key.products)
    }
    defaults.set(existing.count, forKey: Key.findCount)
    defaults.synchronize()
    ping()
  }

  static func products() -> [[String: Any]] {
    guard let data = defaults?.data(forKey: Key.products),
          let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else { return [] }
    return json
  }

  static func snapshot(screenCaptured: Bool) -> [String: Any] {
    let defaults = defaults
    return [
      "available": defaults != nil,
      "broadcasting": defaults?.bool(forKey: Key.broadcasting) ?? false,
      "screenCaptured": screenCaptured,
      "scanCount": defaults?.integer(forKey: Key.scanCount) ?? 0,
      "findCount": defaults?.integer(forKey: Key.findCount) ?? 0,
      "lastError": defaults?.string(forKey: Key.lastError) as Any,
      "startedAt": defaults?.object(forKey: Key.startedAt) as Any,
      "lastFrameAt": defaults?.object(forKey: Key.lastFrameAt) as Any,
      "products": products()
    ]
  }

  static func ping() {
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(darwinName),
      nil,
      nil,
      true
    )
  }
}
