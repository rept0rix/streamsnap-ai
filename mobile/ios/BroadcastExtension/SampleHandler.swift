import ReplayKit
import UIKit
import UserNotifications

/// Receives the device screen while the user is in TikTok / YouTube / Instagram.
/// Samples a frame every few seconds, skips near-duplicates, and POSTs to /resolve.
/// Finds are written to the App Group so the main app accumulates them.
final class SampleHandler: RPBroadcastSampleHandler {
  private let minInterval: TimeInterval = 5
  private let maxEdge: CGFloat = 960
  private let jpegQuality: CGFloat = 0.55

  private var lastSampleAt: Date = .distantPast
  private var inFlight = false
  private var lastHash: UInt64 = 0
  private static let sharedCIContext = CIContext(options: [
    .useSoftwareRenderer: false,
    .cacheIntermediates: false,
    .priorityRequestLow: true
  ])

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    LiveScanStore.beginSession()
  }

  override func broadcastPaused() {}

  override func broadcastResumed() {}

  override func broadcastFinished() {
    LiveScanStore.endSession()
  }

  override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
    guard sampleBufferType == .video else { return }
    guard !inFlight else { return }
    let now = Date()
    guard now.timeIntervalSince(lastSampleAt) >= minInterval else { return }
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

    lastSampleAt = now
    inFlight = true

    var jpeg: Data?
    var hash: UInt64 = 0
    autoreleasepool {
      let image = CIImage(cvPixelBuffer: pixelBuffer)
      hash = Self.averageHash(image)
      if lastHash != 0 && Self.hamming(lastHash, hash) < 6 {
        return
      }
      jpeg = encodeJPEG(image)
    }

    guard let jpeg, !jpeg.isEmpty else {
      inFlight = false
      if lastHash != 0 {
        LiveScanStore.recordEvent(phase: "skipped_duplicate", incrementSkip: true)
      } else {
        LiveScanStore.recordEvent(phase: "encode_failed", error: "Could not encode frame")
      }
      return
    }
    lastHash = hash
    resolve(jpeg: jpeg)
  }

  private func encodeJPEG(_ image: CIImage) -> Data? {
    let extent = image.extent.integral
    guard extent.width > 8, extent.height > 8 else { return nil }
    let longest = max(extent.width, extent.height)
    let scale = min(1, maxEdge / longest)
    let scaled = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    return Self.sharedCIContext.jpegRepresentation(of: scaled, colorSpace: colorSpace, options: [
      CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): jpegQuality
    ])
  }

  private func resolve(jpeg: Data) {
    let creds = LiveScanStore.credentials()
    let payload: [String: Any] = [
      "image": "data:image/jpeg;base64,\(jpeg.base64EncodedString())",
      "installId": creds.installId
    ]
    guard let body = try? JSONSerialization.data(withJSONObject: payload) else {
      inFlight = false
      LiveScanStore.recordScan(error: "Could not encode frame")
      return
    }

    var request = URLRequest(url: URL(string: "\(creds.workerUrl)/resolve")!)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.timeoutInterval = 20
    if let token = creds.token, !token.isEmpty {
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }
    request.httpBody = body

    URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      defer { self?.inFlight = false }
      let jpegBytes = jpeg.count
      if let error {
        LiveScanStore.recordEvent(
          phase: "network_fail",
          error: error.localizedDescription,
          jpegBytes: jpegBytes,
          incrementScan: true,
          incrementFail: true
        )
        return
      }
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let bodyText = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
      let parsed = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
      let workerError = parsed?["error"] as? String

      guard (200...299).contains(status), parsed?["ok"] as? Bool == true else {
        LiveScanStore.recordEvent(
          phase: "worker_\(status)",
          error: workerError ?? "Worker error \(status)",
          status: status,
          body: bodyText,
          jpegBytes: jpegBytes,
          incrementScan: true,
          incrementFail: true
        )
        return
      }

      let products = (parsed?["products"] as? [[String: Any]] ?? [])
        + (parsed?["others"] as? [[String: Any]] ?? [])
      LiveScanStore.recordEvent(
        phase: products.isEmpty ? "ok_empty" : "ok_finds",
        status: status,
        body: bodyText,
        jpegBytes: jpegBytes,
        incrementScan: true,
        incrementOk: true
      )
      if !products.isEmpty {
        let added = LiveScanStore.upsertProducts(products)
        if added > 0 {
          Self.notifyNewFinds(products)
        }
      }
    }.resume()
  }

  private static func notifyNewFinds(_ products: [[String: Any]]) {
    guard let first = products.first,
          let title = first["title"] as? String, !title.isEmpty
    else { return }

    let content = UNMutableNotificationContent()
    let price = first["price"] as? String
    let asin = first["asin"] as? String
    let url = first["url"] as? String ?? (asin.map { "https://www.amazon.com/dp/\($0)" } ?? "")
    let imageUrlString = first["imageUrl"] as? String

    content.title = "⚡ StreamSnap Match Found!"
    if let price, !price.isEmpty {
      content.subtitle = "\(price) on Amazon"
    } else {
      content.subtitle = "Found on Amazon"
    }
    content.body = title
    content.sound = .default
    content.categoryIdentifier = "PRODUCT_FIND"
    content.userInfo = [
      "url": url,
      "asin": asin ?? "",
      "title": title
    ]

    // Download image for rich notification attachment if available
    if let imageUrlString, let imgUrl = URL(string: imageUrlString) {
      URLSession.shared.dataTask(with: imgUrl) { data, _, _ in
        if let data {
          let tempDir = URL(fileURLWithPath: NSTemporaryDirectory())
          let fileUrl = tempDir.appendingPathComponent("ss-thumb-\(UUID().uuidString).jpg")
          if (try? data.write(to: fileUrl)) != nil {
            if let attachment = try? UNNotificationAttachment(
              identifier: "product-image",
              url: fileUrl,
              options: [UNNotificationAttachmentOptionsTypeHintKey: "public.jpeg"]
            ) {
              content.attachments = [attachment]
            }
          }
        }
        let request = UNNotificationRequest(
          identifier: "ss-live-\(Int(Date().timeIntervalSince1970))",
          content: content,
          trigger: nil
        )
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
      }.resume()
    } else {
      let request = UNNotificationRequest(
        identifier: "ss-live-\(Int(Date().timeIntervalSince1970))",
        content: content,
        trigger: nil
      )
      UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }
  }

  private static func averageHash(_ image: CIImage) -> UInt64 {
    let filter = CIFilter(name: "CILanczosScaleTransform")
    filter?.setValue(image, forKey: kCIInputImageKey)
    let scale = 8 / max(image.extent.width, 1)
    filter?.setValue(scale, forKey: kCIInputScaleKey)
    filter?.setValue(1.0, forKey: kCIInputAspectRatioKey)
    guard
      let output = filter?.outputImage,
      let cgImage = sharedCIContext.createCGImage(output, from: CGRect(x: 0, y: 0, width: 8, height: 8)),
      let data = cgImage.dataProvider?.data,
      let ptr = CFDataGetBytePtr(data)
    else { return 0 }

    var sum = 0
    var pixels = [Int](repeating: 0, count: 64)
    let bpp = max(cgImage.bitsPerPixel / 8, 1)
    for i in 0..<64 {
      let r = Int(ptr[i * bpp])
      pixels[i] = r
      sum += r
    }
    let avg = sum / 64
    var hash: UInt64 = 0
    for i in 0..<64 {
      if pixels[i] >= avg {
        hash |= (1 << i)
      }
    }
    return hash
  }

  private static func hamming(_ a: UInt64, _ b: UInt64) -> Int {
    (a ^ b).nonzeroBitCount
  }
}
