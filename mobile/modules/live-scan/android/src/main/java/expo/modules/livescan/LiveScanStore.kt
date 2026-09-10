package expo.modules.livescan

import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

/**
 * SharedPreferences store for live-scan session state and finds.
 * The foreground service writes; the Expo module reads and emits onUpdate.
 */
internal object LiveScanStore {
  const val ACTION_UPDATED = "com.streamsnap.ai.LIVE_SCAN_UPDATED"
  private const val PREFS = "ss_live_scan"

  private object Key {
    const val BROADCASTING = "ss.live.broadcasting"
    const val STARTED_AT = "ss.live.startedAt"
    const val LAST_FRAME_AT = "ss.live.lastFrameAt"
    const val SCAN_COUNT = "ss.live.scanCount"
    const val FIND_COUNT = "ss.live.findCount"
    const val OK_COUNT = "ss.live.okCount"
    const val FAIL_COUNT = "ss.live.failCount"
    const val SKIP_COUNT = "ss.live.skipCount"
    const val LAST_ERROR = "ss.live.lastError"
    const val LAST_PHASE = "ss.live.lastPhase"
    const val LAST_STATUS = "ss.live.lastStatus"
    const val LAST_BODY = "ss.live.lastBody"
    const val LAST_JPEG_BYTES = "ss.live.lastJpegBytes"
    const val PRODUCTS = "ss.live.products"
    const val SESSION_TOKEN = "ss.live.sessionToken"
    const val INSTALL_ID = "ss.live.installId"
    const val WORKER_URL = "ss.live.workerUrl"
  }

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun beginSession(context: Context) {
    prefs(context).edit()
      .putBoolean(Key.BROADCASTING, true)
      .putLong(Key.STARTED_AT, System.currentTimeMillis())
      .putInt(Key.SCAN_COUNT, 0)
      .putInt(Key.FIND_COUNT, 0)
      .putInt(Key.OK_COUNT, 0)
      .putInt(Key.FAIL_COUNT, 0)
      .putInt(Key.SKIP_COUNT, 0)
      .putString(Key.LAST_PHASE, "started")
      .putInt(Key.LAST_STATUS, 0)
      .putInt(Key.LAST_JPEG_BYTES, 0)
      .remove(Key.LAST_ERROR)
      .remove(Key.LAST_BODY)
      .remove(Key.LAST_FRAME_AT)
      .putString(Key.PRODUCTS, "[]")
      .apply()
    ping(context)
  }

  fun endSession(context: Context) {
    prefs(context).edit()
      .putBoolean(Key.BROADCASTING, false)
      .putString(Key.LAST_PHASE, "stopped")
      .apply()
    ping(context)
  }

  fun writeCredentials(context: Context, token: String?, installId: String, workerUrl: String) {
    val editor = prefs(context).edit()
    if (!token.isNullOrEmpty()) {
      editor.putString(Key.SESSION_TOKEN, token)
    } else {
      editor.remove(Key.SESSION_TOKEN)
    }
    editor.putString(Key.INSTALL_ID, installId)
    editor.putString(Key.WORKER_URL, workerUrl)
    editor.apply()
  }

  data class Credentials(val token: String?, val installId: String, val workerUrl: String)

  fun credentials(context: Context): Credentials {
    val p = prefs(context)
    return Credentials(
      token = p.getString(Key.SESSION_TOKEN, null),
      installId = p.getString(Key.INSTALL_ID, null) ?: "mob-unknown",
      workerUrl = p.getString(Key.WORKER_URL, null)
        ?: "https://streamsnap-lens.na0ryank0.workers.dev"
    )
  }

  fun recordEvent(
    context: Context,
    phase: String,
    error: String? = null,
    status: Int? = null,
    body: String? = null,
    jpegBytes: Int? = null,
    incrementScan: Boolean = false,
    incrementSkip: Boolean = false,
    incrementOk: Boolean = false,
    incrementFail: Boolean = false
  ) {
    val p = prefs(context)
    val editor = p.edit()
    if (incrementScan) {
      editor.putInt(Key.SCAN_COUNT, p.getInt(Key.SCAN_COUNT, 0) + 1)
      editor.putLong(Key.LAST_FRAME_AT, System.currentTimeMillis())
    }
    if (incrementSkip) editor.putInt(Key.SKIP_COUNT, p.getInt(Key.SKIP_COUNT, 0) + 1)
    if (incrementOk) editor.putInt(Key.OK_COUNT, p.getInt(Key.OK_COUNT, 0) + 1)
    if (incrementFail) editor.putInt(Key.FAIL_COUNT, p.getInt(Key.FAIL_COUNT, 0) + 1)
    editor.putString(Key.LAST_PHASE, phase)
    if (status != null) editor.putInt(Key.LAST_STATUS, status)
    if (jpegBytes != null) editor.putInt(Key.LAST_JPEG_BYTES, jpegBytes)
    if (body != null) editor.putString(Key.LAST_BODY, body.take(500))
    if (error != null) {
      editor.putString(Key.LAST_ERROR, error)
    } else if (incrementOk) {
      editor.remove(Key.LAST_ERROR)
    }
    val nextScans = p.getInt(Key.SCAN_COUNT, 0) + if (incrementScan) 1 else 0
    val finds = p.getInt(Key.FIND_COUNT, 0)
    val broadcasting = p.getBoolean(Key.BROADCASTING, false)
    editor.apply()
    ping(context)
    if (broadcasting && (incrementScan || incrementSkip || error != null)) {
      LiveScanNotifier.updateRunning(
        context,
        scans = nextScans,
        finds = finds,
        error = if (incrementOk) null else (error ?: p.getString(Key.LAST_ERROR, null))
      )
    }
  }

  fun upsertProducts(context: Context, incoming: List<JSONObject>): Int {
    val existing = productsJson(context)
    val now = System.currentTimeMillis().toDouble()
    var added = 0

    for (raw in incoming) {
      val title = raw.optString("title").trim()
      if (title.isEmpty()) continue
      val cleanTitle = title.lowercase()
      val asin = raw.optString("asin").trim().lowercase().ifEmpty { null }

      val alreadyExists = (0 until existing.length()).any { i ->
        val item = existing.optJSONObject(i) ?: return@any false
        val existingAsin = item.optString("asin").trim().lowercase().ifEmpty { null }
        val existingTitle = item.optString("title").trim().lowercase()
        if (asin != null && existingAsin != null) {
          asin == existingAsin
        } else {
          existingTitle == cleanTitle ||
            (cleanTitle.length > 5 && existingTitle.contains(cleanTitle)) ||
            (existingTitle.length > 5 && cleanTitle.contains(existingTitle))
        }
      }
      if (alreadyExists) continue

      if (!raw.has("id")) raw.put("id", "live-${now.toLong()}-$added")
      raw.put("firstSeenAt", now)
      raw.put("lastSeenAt", now)
      existing.put(raw)
      // Insert at front: rebuild
      added += 1
    }

    if (added == 0) return 0

    val ordered = JSONArray()
    // Newest first: last `added` items were appended; reverse the new ones to the front.
    val startNew = existing.length() - added
    for (i in existing.length() - 1 downTo startNew) {
      ordered.put(existing.getJSONObject(i))
    }
    for (i in 0 until startNew) {
      if (ordered.length() >= 80) break
      ordered.put(existing.getJSONObject(i))
    }
    while (ordered.length() > 80) {
      ordered.remove(ordered.length() - 1)
    }

    prefs(context).edit()
      .putString(Key.PRODUCTS, ordered.toString())
      .putInt(Key.FIND_COUNT, ordered.length())
      .apply()
    ping(context)
    if (prefs(context).getBoolean(Key.BROADCASTING, false)) {
      LiveScanNotifier.updateRunning(
        context,
        scans = prefs(context).getInt(Key.SCAN_COUNT, 0),
        finds = ordered.length(),
        error = null
      )
    }
    return added
  }

  fun productsJson(context: Context): JSONArray {
    return try {
      JSONArray(prefs(context).getString(Key.PRODUCTS, "[]") ?: "[]")
    } catch (_: Exception) {
      JSONArray()
    }
  }

  fun products(context: Context): List<Map<String, Any?>> {
    val arr = productsJson(context)
    return (0 until arr.length()).mapNotNull { i ->
      arr.optJSONObject(i)?.toMap()
    }
  }

  fun snapshot(context: Context, screenCaptured: Boolean): Map<String, Any?> {
    val p = prefs(context)
    val creds = credentials(context)
    val startedAtMs = p.getLong(Key.STARTED_AT, 0L)
    val lastFrameAtMs = p.getLong(Key.LAST_FRAME_AT, 0L)
    return mapOf(
      "available" to true,
      "broadcasting" to p.getBoolean(Key.BROADCASTING, false),
      "screenCaptured" to screenCaptured,
      "scanCount" to p.getInt(Key.SCAN_COUNT, 0),
      "findCount" to p.getInt(Key.FIND_COUNT, 0),
      "okCount" to p.getInt(Key.OK_COUNT, 0),
      "failCount" to p.getInt(Key.FAIL_COUNT, 0),
      "skipCount" to p.getInt(Key.SKIP_COUNT, 0),
      "lastError" to p.getString(Key.LAST_ERROR, null),
      "lastPhase" to p.getString(Key.LAST_PHASE, null),
      "lastStatus" to p.getInt(Key.LAST_STATUS, 0),
      "lastBody" to p.getString(Key.LAST_BODY, null),
      "lastJpegBytes" to p.getInt(Key.LAST_JPEG_BYTES, 0),
      "startedAt" to if (startedAtMs > 0) startedAtMs / 1000.0 else null,
      "lastFrameAt" to if (lastFrameAtMs > 0) lastFrameAtMs / 1000.0 else null,
      "workerUrl" to creds.workerUrl,
      "installId" to creds.installId,
      "hasToken" to (creds.token != null),
      "products" to products(context)
    )
  }

  fun ping(context: Context) {
    val intent = Intent(ACTION_UPDATED).setPackage(context.packageName)
    context.sendBroadcast(intent)
  }

  private fun JSONObject.toMap(): Map<String, Any?> {
    val out = mutableMapOf<String, Any?>()
    val keys = keys()
    while (keys.hasNext()) {
      val key = keys.next()
      out[key] = when (val v = opt(key)) {
        JSONObject.NULL, null -> null
        is JSONObject -> v.toMap()
        is JSONArray -> (0 until v.length()).map { v.opt(it) }
        else -> v
      }
    }
    return out
  }
}
