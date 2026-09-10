package expo.modules.livescan

/**
 * Frame-sampling rules mirrored from the iOS ReplayKit SampleHandler.
 * Pause = ~1.2s of near-identical 8×8 hashes. Periodic = every 5s, skip near-dupes.
 */
internal object LiveScanPolicy {
  // Worker hourly cap is 180. 20s periodic stays under that; pause scans fire immediately.
  const val MIN_INTERVAL_MS = 20_000L
  const val HASH_INTERVAL_MS = 400L
  const val WARMUP_MS = 1_000L
  const val STILL_FRAMES_REQUIRED = 3
  const val STILL_HAMMING_MAX = 4
  const val DUPLICATE_HAMMING_MAX = 6

  const val PERIODIC_MAX_EDGE = 960
  const val PERIODIC_JPEG_QUALITY = 55
  const val PAUSED_MAX_EDGE = 1280
  const val PAUSED_JPEG_QUALITY = 72
  const val VIRTUAL_MAX_EDGE = 960

  enum class Trigger(val raw: String) {
    PAUSE("pause"),
    PERIODIC("periodic")
  }

  fun hamming(a: Long, b: Long): Int = java.lang.Long.bitCount(a xor b)

  data class Decision(
    val trigger: Trigger? = null,
    val skippedDuplicate: Boolean = false,
    val stillHash: Long,
    val stillCount: Int,
    val stillScanned: Boolean
  )

  fun decide(
    hash: Long,
    nowMs: Long,
    lastSampleAtMs: Long,
    lastScanHash: Long,
    stillHash: Long,
    stillCount: Int,
    stillScanned: Boolean
  ): Decision {
    val nextStillHash: Long
    val nextStillCount: Int
    var nextStillScanned = stillScanned

    if (stillHash != 0L && hamming(stillHash, hash) <= STILL_HAMMING_MAX) {
      nextStillHash = stillHash
      nextStillCount = stillCount + 1
    } else {
      nextStillHash = hash
      nextStillCount = 1
      nextStillScanned = false
    }

    val isDuplicateOfLastScan =
      lastScanHash != 0L && hamming(lastScanHash, hash) < DUPLICATE_HAMMING_MAX
    val pausedNow = nextStillCount >= STILL_FRAMES_REQUIRED && !nextStillScanned
    val periodicDue = nowMs - lastSampleAtMs >= MIN_INTERVAL_MS

    return if (pausedNow) {
      Decision(
        trigger = if (isDuplicateOfLastScan) null else Trigger.PAUSE,
        skippedDuplicate = isDuplicateOfLastScan,
        stillHash = nextStillHash,
        stillCount = nextStillCount,
        stillScanned = true
      )
    } else if (periodicDue) {
      Decision(
        trigger = if (isDuplicateOfLastScan) null else Trigger.PERIODIC,
        skippedDuplicate = isDuplicateOfLastScan,
        stillHash = nextStillHash,
        stillCount = nextStillCount,
        stillScanned = nextStillScanned
      )
    } else {
      Decision(
        stillHash = nextStillHash,
        stillCount = nextStillCount,
        stillScanned = nextStillScanned
      )
    }
  }
}
