/**
 * StreamSnap AI — 3-Tier Multi-Modal Vision & Product Recognition Engine
 */

import { AMAZON_CATALOG } from "./amazon_service.js";

export const STREAM_PRESETS = {
  tech_podcast: {
    name: "Tech Podcast & Setup",
    detectedItems: [
      {
        asin: "B0002E4Z8M", // Shure SM7B
        boundingBox: { ymin: 35, xmin: 40, ymax: 65, xmax: 60 },
        label: "Shure SM7B Microphone",
        tier: "tier1_exact"
      },
      {
        asin: "B08PZHYWJS", // AirPods Max
        boundingBox: { ymin: 15, xmin: 42, ymax: 38, xmax: 58 },
        label: "Apple AirPods Max",
        tier: "tier1_exact"
      },
      {
        asin: "B07W755322", // Elgato Key Light
        boundingBox: { ymin: 10, xmin: 75, ymax: 45, xmax: 95 },
        label: "Elgato Key Light",
        tier: "tier1_exact"
      },
      {
        asin: "B09KND9W8Z", // Vintage Olive Hoodie
        boundingBox: { ymin: 45, xmin: 30, ymax: 90, xmax: 70 },
        label: "Olive Green Oversized Hoodie",
        tier: "tier2_lookalike"
      },
      {
        id: "req_cup_ceramic_01",
        label: "Handmade Speckled Ceramic Mug",
        category: "Drinkware / Custom",
        boundingBox: { ymin: 70, xmin: 20, ymax: 90, xmax: 35 },
        tier: "tier3_request",
        reason: "Custom artisanal pottery — no exact barcode or retail brand detected"
      }
    ]
  },
  gaming_stream: {
    name: "Twitch Gaming Battlestation",
    detectedItems: [
      {
        asin: "B09XS7JWHH", // Sony XM5
        boundingBox: { ymin: 18, xmin: 44, ymax: 40, xmax: 56 },
        label: "Sony WH-1000XM5 Headphones",
        tier: "tier1_exact"
      },
      {
        asin: "B07W5JK7B6", // Elgato Stream Deck
        boundingBox: { ymin: 75, xmin: 65, ymax: 92, xmax: 82 },
        label: "Elgato Stream Deck MK.2",
        tier: "tier1_exact"
      },
      {
        asin: "B08C7KGH71", // Govee Neon Light
        boundingBox: { ymin: 5, xmin: 10, ymax: 35, xmax: 50 },
        label: "Govee RGBIC Neon Wall Light",
        tier: "tier2_lookalike"
      },
      {
        asin: "B07W94RNVL", // Leather Desk Pad
        boundingBox: { ymin: 78, xmin: 25, ymax: 98, xmax: 75 },
        label: "Dark Walnut Desk Pad",
        tier: "tier2_lookalike"
      }
    ]
  },
  lifestyle_haul: {
    name: "TikTok Live Lifestyle & Haul",
    detectedItems: [
      {
        asin: "B0B94ZDFM9", // Stanley Quencher Cup
        boundingBox: { ymin: 50, xmin: 25, ymax: 85, xmax: 45 },
        label: "Stanley Quencher 40oz Tumbler",
        tier: "tier1_exact"
      },
      {
        asin: "B09KND9W8Z", // Hoodie
        boundingBox: { ymin: 30, xmin: 35, ymax: 80, xmax: 65 },
        label: "Drop-Shoulder Fleece Hoodie",
        tier: "tier2_lookalike"
      },
      {
        id: "req_gold_chain_02",
        label: "Layered Herringbone Gold Necklace",
        category: "Jewelry",
        boundingBox: { ymin: 40, xmin: 46, ymax: 55, xmax: 54 },
        tier: "tier3_request",
        reason: "Reflective fine jewelry piece — exact boutique brand unknown"
      }
    ]
  }
};

/**
 * Perform 3-Tier visual scan on video frame snapshot.
 */
export async function analyzeFrame(frameDataUrl, streamType = "tech_podcast") {
  // Simulate AI model inference latency (350ms - 800ms)
  await new Promise((resolve) => setTimeout(resolve, 600));

  const preset = STREAM_PRESETS[streamType] || STREAM_PRESETS.tech_podcast;
  const results = {
    timestamp: Date.now(),
    presetName: preset.name,
    exactMatches: [],
    lookAlikes: [],
    unidentifiedRequests: []
  };

  for (const item of preset.detectedItems) {
    if (item.tier === "tier1_exact") {
      const product = AMAZON_CATALOG[item.asin];
      if (product) {
        results.exactMatches.push({
          ...product,
          boundingBox: item.boundingBox,
          detectionLabel: item.label
        });
      }
    } else if (item.tier === "tier2_lookalike") {
      const product = AMAZON_CATALOG[item.asin];
      if (product) {
        results.lookAlikes.push({
          ...product,
          boundingBox: item.boundingBox,
          detectionLabel: item.label
        });
      }
    } else if (item.tier === "tier3_request") {
      results.unidentifiedRequests.push({
        id: item.id,
        label: item.label,
        category: item.category,
        boundingBox: item.boundingBox,
        reason: item.reason,
        status: "open",
        requestCount: Math.floor(Math.random() * 8) + 3
      });
    }
  }

  return results;
}
