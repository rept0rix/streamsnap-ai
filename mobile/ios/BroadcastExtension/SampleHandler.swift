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

      // `products` already equals amazon + others; older workers only sent the
      // two lists separately.
      var products = parsed?["products"] as? [[String: Any]]
        ?? ((parsed?["amazon"] as? [[String: Any]] ?? []) + (parsed?["others"] as? [[String: Any]] ?? []))

      // Save the captured video frame screenshot so the user sees exactly where it came from!
      if !products.isEmpty {
        let snapName = "snap-\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
        var frameImageUrl: String?

        if let groupUrl = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: LiveScanStore.appGroupId) {
          let fileUrl = groupUrl.appendingPathComponent(snapName)
          if (try? jpeg.write(to: fileUrl)) != nil {
            frameImageUrl = fileUrl.absoluteString
          }
        }
        if frameImageUrl == nil {
          let tempUrl = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(snapName)
          if (try? jpeg.write(to: tempUrl)) != nil {
            frameImageUrl = tempUrl.absoluteString
          }
        }

        let base64DataUrl = "data:image/jpeg;base64,\(jpeg.base64EncodedString())"

        products = products.map { item in
          var updated = item
          // Crop to the AI bounding box when available (Chrome Extension style);
          // otherwise keep the full frame. Either way this is the "Video Frame"
          // side only — imageUrl (the Amazon listing photo) is left untouched.
          if let box = item["box_2d"] as? [Any],
             let cropped = Self.cropBox(from: jpeg, box: box) {
            updated["frameImage"] = cropped
            updated["sourceCrop"] = cropped
          } else {
            updated["frameImage"] = base64DataUrl
          }
          if let imageUrl = updated["imageUrl"] as? String, imageUrl.hasPrefix("data:") {
            // Never let a frame masquerade as the catalog image.
            updated["imageUrl"] = nil
          }
          if updated["source"] == nil {
            updated["source"] = "TikTok / Live Video"
          }
          return updated
        }
      }

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
    // Lead with a verified Amazon listing when there is one.
    let verifiedFirst = products.first { ($0["asin"] as? String).map { !$0.isEmpty } ?? false }
    guard let first = verifiedFirst ?? products.first,
          let title = first["title"] as? String, !title.isEmpty
    else { return }

    let content = UNMutableNotificationContent()
    let price = first["price"] as? String
    let priceEstimated = first["priceEstimated"] as? Bool ?? false
    let asin = (first["asin"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    let url = first["url"] as? String ?? (asin.map { "https://www.amazon.com/dp/\($0)" } ?? "")
    // Prefer the listing photo; fall back to the crop we actually saw.
    let imageUrlString = (first["imageUrl"] as? String).flatMap { $0.isEmpty ? nil : $0 }
      ?? (first["sourceCrop"] as? String)
      ?? (first["frameImage"] as? String)

    content.title = asin != nil ? "⚡ StreamSnap Match Found!" : "👀 StreamSnap Spotted Something"
    if let price, !price.isEmpty {
      content.subtitle = asin != nil && !priceEstimated ? "\(price) on Amazon" : "~\(price) · tap to search Amazon"
    } else {
      content.subtitle = asin != nil ? "Found on Amazon" : "Tap to search Amazon"
    }
    content.body = title
    content.sound = .default
    content.interruptionLevel = .timeSensitive
    content.categoryIdentifier = "PRODUCT_FIND"
    content.userInfo = [
      "url": url,
      "asin": asin ?? "",
      "title": title
    ]

    func sendReq(_ attachment: UNNotificationAttachment? = nil) {
      if let attachment {
        content.attachments = [attachment]
      }
      let request = UNNotificationRequest(
        identifier: "ss-live-\(Int(Date().timeIntervalSince1970))",
        content: content,
        trigger: nil
      )
      UNUserNotificationCenter.current().add(request) { err in
        if let err {
          print("[StreamSnap] Notification error: \(err)")
        } else {
          print("[StreamSnap] Notification banner dispatched successfully!")
        }
      }
    }

    // Attach image if available
    guard let imageUrlString, !imageUrlString.isEmpty else {
      sendReq()
      return
    }

    // 1. Base64 Data URL handling (exact video snapshot)
    if imageUrlString.hasPrefix("data:image") {
      if let commaIdx = imageUrlString.firstIndex(of: ",") {
        let b64 = String(imageUrlString[imageUrlString.index(after: commaIdx)...])
        if let data = Data(base64Encoded: b64) {
          let tempDir = URL(fileURLWithPath: NSTemporaryDirectory())
          let fileUrl = tempDir.appendingPathComponent("ss-thumb-\(UUID().uuidString).jpg")
          if (try? data.write(to: fileUrl)) != nil {
            let att = try? UNNotificationAttachment(
              identifier: "product-image",
              url: fileUrl,
              options: [UNNotificationAttachmentOptionsTypeHintKey: "public.jpeg"]
            )
            sendReq(att)
            return
          }
        }
      }
      sendReq()
      return
    }

    // 2. Local File URL handling
    if let imgUrl = URL(string: imageUrlString), imgUrl.isFileURL {
      let att = try? UNNotificationAttachment(
        identifier: "product-image",
        url: imgUrl,
        options: [UNNotificationAttachmentOptionsTypeHintKey: "public.jpeg"]
      )
      sendReq(att)
      return
    }

    // 3. Remote HTTP URL handling
    if let imgUrl = URL(string: imageUrlString) {
      URLSession.shared.dataTask(with: imgUrl) { data, _, _ in
        var att: UNNotificationAttachment?
        if let data {
          let tempDir = URL(fileURLWithPath: NSTemporaryDirectory())
          let fileUrl = tempDir.appendingPathComponent("ss-thumb-\(UUID().uuidString).jpg")
          if (try? data.write(to: fileUrl)) != nil {
            att = try? UNNotificationAttachment(
              identifier: "product-image",
              url: fileUrl,
              options: [UNNotificationAttachmentOptionsTypeHintKey: "public.jpeg"]
            )
          }
        }
        sendReq(att)
      }.resume()
      return
    }

    sendReq()
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

  /// Crop a JPEG to the AI-returned bounding box [ymin, xmin, ymax, xmax] (0-1000 scale).
  /// Returns a base64 data URL of the cropped JPEG, or nil on failure.
  private static func cropBox(from jpeg: Data, box: [Any]) -> String? {
    guard box.count >= 4 else { return nil }
    let coords = box.compactMap { v -> CGFloat? in
      if let n = v as? NSNumber { return CGFloat(n.doubleValue) }
      if let d = v as? Double { return CGFloat(d) }
      if let i = v as? Int { return CGFloat(i) }
      return nil
    }
    guard coords.count >= 4 else { return nil }

    let ymin = coords[0] / 1000.0
    let xmin = coords[1] / 1000.0
    let ymax = coords[2] / 1000.0
    let xmax = coords[3] / 1000.0
    guard xmax > xmin, ymax > ymin else { return nil }

    // 4% margin, matching the Chrome extension
    let margin: CGFloat = 0.04
    let nx0 = max(0, xmin - margin)
    let ny0 = max(0, ymin - margin)
    let nx1 = min(1, xmax + margin)
    let ny1 = min(1, ymax + margin)

    // Decode the full JPEG via CIImage (no UIKit dependency)
    let ciSrc = CIImage(data: jpeg)
    guard let ciSrc else { return nil }
    let W = ciSrc.extent.width
    let H = ciSrc.extent.height

    // CIImage origin is bottom-left; invert Y so the crop matches the model's top-left origin
    let cropRect = CGRect(
      x: nx0 * W,
      y: (1 - ny1) * H,
      width: max(20, (nx1 - nx0) * W),
      height: max(20, (ny1 - ny0) * H)
    )
    let ciCropped = ciSrc.cropped(to: cropRect)

    guard let cgCropped = sharedCIContext.createCGImage(ciCropped, from: ciCropped.extent) else { return nil }

    // Encode cropped CGImage to JPEG bytes
    let mutableData = NSMutableData()
    guard
      let dest = CGImageDestinationCreateWithData(mutableData, "public.jpeg" as CFString, 1, nil)
    else { return nil }
    CGImageDestinationAddImage(dest, cgCropped, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { return nil }
    return "data:image/jpeg;base64,\(mutableData.base64EncodedString())"
  }
}
