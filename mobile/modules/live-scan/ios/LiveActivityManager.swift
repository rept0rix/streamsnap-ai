import ActivityKit
import Foundation
import UIKit

@available(iOS 16.2, *)
public final class LiveActivityManager {
    public static let shared = LiveActivityManager()

    private var currentActivity: Activity<LiveScanActivityAttributes>?

    private init() {}

    public func startActivity(scanName: String = "TikTok Live Scan") {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            print("[StreamSnap] Live activities are not enabled by user")
            return
        }

        // Avoid starting duplicates if already active
        for act in Activity<LiveScanActivityAttributes>.activities {
            if act.activityState == .active {
                self.currentActivity = act
                return
            }
        }

        let attributes = LiveScanActivityAttributes(scanName: scanName)
        let initialState = LiveScanActivityAttributes.ContentState(
            isScanning: true,
            framesCount: 0,
            latestTitle: "Scanning Screen...",
            latestPrice: nil,
            confidence: nil
        )

        do {
            let activity = try Activity<LiveScanActivityAttributes>.request(
                attributes: attributes,
                content: .init(state: initialState, staleDate: nil),
                pushType: nil
            )
            self.currentActivity = activity
            print("[StreamSnap] Live Activity started successfully: \(activity.id)")
        } catch {
            print("[StreamSnap] Failed to start Live Activity: \(error)")
        }
    }

    public func updateActivity(
        title: String?,
        price: String?,
        confidence: Int?,
        framesCount: Int = 0
    ) {
        guard let activity = currentActivity ?? Activity<LiveScanActivityAttributes>.activities.first(where: { $0.activityState == .active }) else {
            return
        }

        let updatedState = LiveScanActivityAttributes.ContentState(
            isScanning: true,
            framesCount: framesCount,
            latestTitle: title,
            latestPrice: price,
            confidence: confidence
        )

        Task {
            await activity.update(.init(state: updatedState, staleDate: nil))
        }
    }

    public func endActivity() {
        let activities = Activity<LiveScanActivityAttributes>.activities
        for activity in activities {
            Task {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
        self.currentActivity = nil
    }
}
