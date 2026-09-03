import WidgetKit
import SwiftUI
import ActivityKit

@main
struct LiveScanWidgetBundle: WidgetBundle {
    var body: some Widget {
        LiveScanActivityWidget()
    }
}

struct LiveScanActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveScanActivityAttributes.self) { context in
            // Lock Screen / Banner UI
            LockScreenLiveScanView(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                // 1. EXPANDED REGION (when long-pressing the camera/Dynamic Island)
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 5) {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(Color(red: 1.0, green: 0.35, blue: 0.0))
                        Text("StreamSnap")
                            .font(.system(size: 13, weight: .black))
                            .foregroundColor(.white)
                    }
                    .padding(.leading, 4)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(Color(red: 1.0, green: 0.35, blue: 0.0))
                            .frame(width: 6, height: 6)
                        Text("60 FPS")
                            .font(.system(size: 10, weight: .heavy))
                            .foregroundColor(Color(red: 1.0, green: 0.45, blue: 0.0))
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Color(red: 1.0, green: 0.35, blue: 0.0).opacity(0.18))
                    .cornerRadius(6)
                    .padding(.trailing, 4)
                }

                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.latestTitle ?? "Scanning Video Screen...")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        if let price = context.state.latestPrice {
                            Text(price)
                                .font(.system(size: 13, weight: .black))
                                .foregroundColor(Color(red: 0.1, green: 0.85, blue: 0.5))
                        }
                        if let conf = context.state.confidence {
                            Text("\(conf)% Match")
                                .font(.system(size: 11, weight: .heavy))
                                .foregroundColor(Color(red: 1.0, green: 0.5, blue: 0.0))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color(red: 1.0, green: 0.35, blue: 0.0).opacity(0.15))
                                .cornerRadius(5)
                        }
                        Spacer()
                        Text("View Deal →")
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundColor(Color(red: 1.0, green: 0.4, blue: 0.0))
                    }
                    .padding(.top, 4)
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                // ⚡ LEFT OF CAMERA: StreamSnap Glowing Bolt Icon
                Image(systemName: "bolt.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Color(red: 1.0, green: 0.35, blue: 0.0))
            } compactTrailing: {
                // 📻 RIGHT OF CAMERA: Animated Radar Waveform (Shazam-Style)
                HStack(spacing: 2) {
                    Image(systemName: "waveform")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Color(red: 1.0, green: 0.35, blue: 0.0))
                }
            } minimal: {
                // MINIMAL SINGLE ICON (when multiple apps share the Island)
                Image(systemName: "bolt.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(red: 1.0, green: 0.35, blue: 0.0))
            }
        }
    }
}

// Lock Screen Activity Card View
struct LockScreenLiveScanView: View {
    let state: LiveScanActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 12) {
            // Glowing Radar Icon
            ZStack {
                Circle()
                    .fill(Color(red: 1.0, green: 0.35, blue: 0.0).opacity(0.2))
                    .frame(width: 44, height: 44)
                Image(systemName: "bolt.fill")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(Color(red: 1.0, green: 0.35, blue: 0.0))
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text("STREAMSNAP RADAR")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundColor(Color(red: 1.0, green: 0.45, blue: 0.0))
                    Text("• 60 FPS")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.gray)
                }

                Text(state.latestTitle ?? "Scanning TikTok / Live Video...")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                if let price = state.latestPrice {
                    HStack(spacing: 8) {
                        Text(price)
                            .font(.system(size: 12, weight: .black))
                            .foregroundColor(Color(red: 0.1, green: 0.85, blue: 0.5))
                        if let conf = state.confidence {
                            Text("\(conf)% Match")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(Color(red: 1.0, green: 0.45, blue: 0.0))
                        }
                    }
                }
            }

            Spacer()

            Image(systemName: "waveform")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(Color(red: 1.0, green: 0.35, blue: 0.0))
        }
        .padding(14)
        .background(Color(red: 0.07, green: 0.09, blue: 0.13))
    }
}
