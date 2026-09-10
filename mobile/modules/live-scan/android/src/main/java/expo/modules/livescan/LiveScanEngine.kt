package expo.modules.livescan

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Pause + periodic frame sampling and /resolve calls, matching iOS SampleHandler.
 */
internal class LiveScanEngine(private val context: Context) {
  private val resolveExecutor = Executors.newSingleThreadExecutor()
  private val inFlight = AtomicBoolean(false)

  private var lastHashAtMs = 0L
  private var lastSampleAtMs = 0L
  private var lastScanHash = 0L
  private var stillHash = 0L
  private var stillCount = 0
  private var stillScanned = false
  private val startedAtMs = android.os.SystemClock.elapsedRealtime()

  fun shutdown() {
    resolveExecutor.shutdownNow()
  }

  fun onFrame(image: Image) {
    val now = android.os.SystemClock.elapsedRealtime()
    if (now - startedAtMs < LiveScanPolicy.WARMUP_MS) return
    if (now - lastHashAtMs < LiveScanPolicy.HASH_INTERVAL_MS) return
    if (inFlight.get()) return
    lastHashAtMs = now

    val bitmap = imageToBitmap(image) ?: return
    try {
      val hash = averageHash(bitmap)
      if (hash == 0L) return

      val decision = LiveScanPolicy.decide(
        hash = hash,
        nowMs = now,
        lastSampleAtMs = lastSampleAtMs,
        lastScanHash = lastScanHash,
        stillHash = stillHash,
        stillCount = stillCount,
        stillScanned = stillScanned
      )
      stillHash = decision.stillHash
      stillCount = decision.stillCount
      stillScanned = decision.stillScanned

      if (decision.skippedDuplicate) {
        lastSampleAtMs = now
        LiveScanStore.recordEvent(context, phase = "skipped_duplicate", incrementSkip = true)
        return
      }
      val trigger = decision.trigger ?: return

      val quality = if (trigger == LiveScanPolicy.Trigger.PAUSE) {
        LiveScanPolicy.PAUSED_JPEG_QUALITY
      } else {
        LiveScanPolicy.PERIODIC_JPEG_QUALITY
      }
      val maxEdge = if (trigger == LiveScanPolicy.Trigger.PAUSE) {
        LiveScanPolicy.PAUSED_MAX_EDGE
      } else {
        LiveScanPolicy.PERIODIC_MAX_EDGE
      }
      val jpeg = encodeJpeg(bitmap, quality, maxEdge)
      if (jpeg.isEmpty()) {
        LiveScanStore.recordEvent(context, phase = "encode_failed", error = "Could not encode frame")
        return
      }

      lastScanHash = hash
      lastSampleAtMs = now
      inFlight.set(true)
      resolveExecutor.execute {
        try {
          resolve(jpeg, trigger)
        } finally {
          inFlight.set(false)
        }
      }
    } finally {
      bitmap.recycle()
    }
  }

  private fun resolve(jpeg: ByteArray, trigger: LiveScanPolicy.Trigger) {
    val creds = LiveScanStore.credentials(context)
    val imageData = "data:image/jpeg;base64," + Base64.encodeToString(jpeg, Base64.NO_WRAP)
    val payload = JSONObject()
      .put("image", imageData)
      .put("installId", creds.installId)

    val url = URL("${creds.workerUrl.trimEnd('/')}/resolve")
    var connection: HttpURLConnection? = null
    try {
      connection = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        setRequestProperty("Content-Type", "application/json")
        connectTimeout = 15_000
        readTimeout = 20_000
        doOutput = true
        val token = creds.token
        if (!token.isNullOrEmpty()) {
          setRequestProperty("Authorization", "Bearer $token")
        }
      }
      connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
      val status = connection.responseCode
      val bodyStream = if (status in 200..299) connection.inputStream else connection.errorStream
      val bodyText = bodyStream?.bufferedReader()?.use { it.readText() } ?: ""
      val parsed = try {
        JSONObject(bodyText)
      } catch (_: Exception) {
        null
      }
      val workerError = parsed?.optString("error")?.ifEmpty { null }

      if (status !in 200..299 || parsed?.optBoolean("ok") != true) {
        LiveScanStore.recordEvent(
          context,
          phase = "worker_$status",
          error = workerError ?: "Worker error $status",
          status = status,
          body = bodyText,
          jpegBytes = jpeg.size,
          incrementScan = true,
          incrementFail = true
        )
        return
      }

      var products = parsed.optJSONArray("products")
      if (products == null || products.length() == 0) {
        products = JSONArray()
        mergeArray(products, parsed.optJSONArray("amazon"))
        mergeArray(products, parsed.optJSONArray("others"))
      }

      val annotated = ArrayList<JSONObject>()
      if (products.length() > 0) {
        val base64DataUrl = imageData
        for (i in 0 until products.length()) {
          val item = products.optJSONObject(i) ?: continue
          val box = item.optJSONArray("box_2d")
          val cropped = if (box != null) cropBox(jpeg, box) else null
          if (cropped != null) {
            item.put("frameImage", cropped)
            item.put("sourceCrop", cropped)
          } else {
            item.put("frameImage", base64DataUrl)
          }
          val imageUrl = item.optString("imageUrl")
          if (imageUrl.startsWith("data:")) {
            item.put("imageUrl", JSONObject.NULL)
          }
          if (!item.has("source") || item.optString("source").isEmpty()) {
            item.put("source", "TikTok / Live Video")
          }
          item.put("trigger", trigger.raw)
          item.put("capturedOnPause", trigger == LiveScanPolicy.Trigger.PAUSE)
          annotated.add(item)
        }
      }

      LiveScanStore.recordEvent(
        context,
        phase = (if (annotated.isEmpty()) "ok_empty" else "ok_finds") +
          if (trigger == LiveScanPolicy.Trigger.PAUSE) "_pause" else "",
        status = status,
        body = bodyText,
        jpegBytes = jpeg.size,
        incrementScan = true,
        incrementOk = true
      )
      if (annotated.isNotEmpty()) {
        val added = LiveScanStore.upsertProducts(context, annotated)
        if (added > 0) {
          LiveScanNotifier.notifyNewFinds(context, annotated)
        }
      }
    } catch (err: Exception) {
      LiveScanStore.recordEvent(
        context,
        phase = "network_fail",
        error = err.message ?: "Network error",
        jpegBytes = jpeg.size,
        incrementScan = true,
        incrementFail = true
      )
    } finally {
      connection?.disconnect()
    }
  }

  companion object {
    fun imageToBitmap(image: Image): Bitmap? {
      return when (image.format) {
        PixelFormat.RGBA_8888, 1 -> rgbaToBitmap(image)
        ImageFormat.YUV_420_888 -> yuvToBitmap(image)
        else -> rgbaToBitmap(image) ?: yuvToBitmap(image)
      }
    }

    private fun rgbaToBitmap(image: Image): Bitmap? {
      return try {
        val plane = image.planes[0]
        val buffer = plane.buffer
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val rowPadding = rowStride - pixelStride * image.width
        val bitmap = Bitmap.createBitmap(
          image.width + if (pixelStride > 0) rowPadding / pixelStride else 0,
          image.height,
          Bitmap.Config.ARGB_8888
        )
        buffer.rewind()
        bitmap.copyPixelsFromBuffer(buffer)
        if (bitmap.width != image.width) {
          val cropped = Bitmap.createBitmap(bitmap, 0, 0, image.width, image.height)
          bitmap.recycle()
          cropped
        } else {
          bitmap
        }
      } catch (_: Exception) {
        null
      }
    }

    private fun yuvToBitmap(image: Image): Bitmap? {
      return try {
        val yBuffer = image.planes[0].buffer
        val uBuffer = image.planes[1].buffer
        val vBuffer = image.planes[2].buffer
        val ySize = yBuffer.remaining()
        val uSize = uBuffer.remaining()
        val vSize = vBuffer.remaining()
        val nv21 = ByteArray(ySize + uSize + vSize)
        yBuffer.get(nv21, 0, ySize)
        vBuffer.get(nv21, ySize, vSize)
        uBuffer.get(nv21, ySize + vSize, uSize)
        val yuv = YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
        val out = ByteArrayOutputStream()
        yuv.compressToJpeg(Rect(0, 0, image.width, image.height), 90, out)
        val bytes = out.toByteArray()
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      } catch (_: Exception) {
        null
      }
    }

    fun averageHash(bitmap: Bitmap): Long {
      val tiny = Bitmap.createScaledBitmap(bitmap, 8, 8, true)
      val pixels = IntArray(64)
      tiny.getPixels(pixels, 0, 8, 0, 0, 8, 8)
      if (tiny !== bitmap) tiny.recycle()
      var sum = 0
      val gray = IntArray(64)
      for (i in 0 until 64) {
        val c = pixels[i]
        val r = (c shr 16) and 0xff
        gray[i] = r
        sum += r
      }
      val avg = sum / 64
      var hash = 0L
      for (i in 0 until 64) {
        if (gray[i] >= avg) {
          hash = hash or (1L shl i)
        }
      }
      return hash
    }

    fun encodeJpeg(src: Bitmap, quality: Int, maxEdge: Int): ByteArray {
      val longest = maxOf(src.width, src.height).toFloat()
      val scale = minOf(1f, maxEdge / longest)
      val w = (src.width * scale).toInt().coerceAtLeast(1)
      val h = (src.height * scale).toInt().coerceAtLeast(1)
      val scaled = if (scale < 1f) Bitmap.createScaledBitmap(src, w, h, true) else src
      val out = ByteArrayOutputStream()
      scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
      if (scaled !== src) scaled.recycle()
      return out.toByteArray()
    }

    fun cropBox(jpeg: ByteArray, box: JSONArray): String? {
      if (box.length() < 4) return null
      val coords = (0 until 4).map { box.optDouble(it, Double.NaN) }
      if (coords.any { it.isNaN() }) return null
      val ymin = coords[0] / 1000.0
      val xmin = coords[1] / 1000.0
      val ymax = coords[2] / 1000.0
      val xmax = coords[3] / 1000.0
      if (xmax <= xmin || ymax <= ymin) return null

      val margin = 0.04
      val nx0 = (xmin - margin).coerceAtLeast(0.0)
      val ny0 = (ymin - margin).coerceAtLeast(0.0)
      val nx1 = (xmax + margin).coerceAtMost(1.0)
      val ny1 = (ymax + margin).coerceAtMost(1.0)

      val full = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size) ?: return null
      val x = (nx0 * full.width).toInt().coerceIn(0, full.width - 1)
      val y = (ny0 * full.height).toInt().coerceIn(0, full.height - 1)
      val w = ((nx1 - nx0) * full.width).toInt().coerceAtLeast(20).coerceAtMost(full.width - x)
      val h = ((ny1 - ny0) * full.height).toInt().coerceAtLeast(20).coerceAtMost(full.height - y)
      val cropped = Bitmap.createBitmap(full, x, y, w, h)
      if (cropped !== full) full.recycle()
      val out = ByteArrayOutputStream()
      cropped.compress(Bitmap.CompressFormat.JPEG, 85, out)
      cropped.recycle()
      return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    private fun mergeArray(target: JSONArray, extra: JSONArray?) {
      if (extra == null) return
      for (i in 0 until extra.length()) {
        extra.optJSONObject(i)?.let { target.put(it) }
      }
    }
  }
}
