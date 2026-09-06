import ActivityKit
import Foundation

public struct LiveScanActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var isScanning: Bool
        public var framesCount: Int
        public var latestTitle: String?
        public var latestPrice: String?
        public var confidence: Int?
        public var latestImageUrl: String?
        public var timestamp: Date

        public init(
            isScanning: Bool = true,
            framesCount: Int = 0,
            latestTitle: String? = nil,
            latestPrice: String? = nil,
            confidence: Int? = nil,
            latestImageUrl: String? = nil,
            timestamp: Date = Date()
        ) {
            self.isScanning = isScanning
            self.framesCount = framesCount
            self.latestTitle = latestTitle
            self.latestPrice = latestPrice
            self.confidence = confidence
            self.latestImageUrl = latestImageUrl
            self.timestamp = timestamp
        }
    }

    public var scanName: String

    public init(scanName: String = "TikTok Live Scan") {
        self.scanName = scanName
    }
}
