package expo.modules.livescan

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

internal object LiveScanNotifier {
  const val FG_CHANNEL_ID = "ss_live_scan_running"
  const val FIND_CHANNEL_ID = "ss_live_scan_finds"
  const val FG_NOTIFICATION_ID = 7101
  const val ENDED_NOTIFICATION_ID = 7102

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(
        FG_CHANNEL_ID,
        "Live Scan",
        NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "Shown while StreamSnap is capturing the screen"
        setShowBadge(false)
      }
    )
    manager.createNotificationChannel(
      NotificationChannel(
        FIND_CHANNEL_ID,
        "Product finds",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "New products found during a live scan"
      }
    )
  }

  fun buildRunningNotification(
    context: Context,
    scans: Int = 0,
    finds: Int = 0,
    error: String? = null
  ): Notification {
    ensureChannels(context)
    val stopIntent = Intent(context, LiveScanService::class.java).setAction(LiveScanService.ACTION_STOP)
    val stopPi = PendingIntent.getService(
      context,
      0,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val contentPi = launch?.let {
      PendingIntent.getActivity(
        context,
        1,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val blocked = !error.isNullOrBlank()
    val title = if (blocked) "Live Scan waiting" else "StreamSnap Live Scan"
    val text = when {
      blocked -> error
      scans > 0 -> "$scans frames · $finds finds · tap STOP SCAN or this Stop"
      else -> "Capturing. Pause on a product, or tap Stop to end."
    }
    return NotificationCompat.Builder(context, FG_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(contentPi)
      .addAction(0, "Stop", stopPi)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .build()
  }

  fun updateRunning(context: Context, scans: Int, finds: Int, error: String?) {
    try {
      NotificationManagerCompat.from(context).notify(
        FG_NOTIFICATION_ID,
        buildRunningNotification(context, scans, finds, error)
      )
    } catch (_: SecurityException) {
    }
  }

  fun notifySessionEnded(context: Context, reason: String) {
    ensureChannels(context)
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val contentPi = launch?.let {
      PendingIntent.getActivity(
        context,
        2,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val notification = NotificationCompat.Builder(context, FIND_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_close_clear_cancel)
      .setContentTitle("Live Scan ended")
      .setContentText(reason)
      .setStyle(NotificationCompat.BigTextStyle().bigText(reason))
      .setAutoCancel(true)
      .setContentIntent(contentPi)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .build()
    try {
      NotificationManagerCompat.from(context).notify(ENDED_NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
    }
  }

  fun notifyNewFinds(context: Context, products: List<JSONObject>) {
    ensureChannels(context)
    val verifiedFirst = products.firstOrNull { it.optString("asin").isNotEmpty() }
    val first = verifiedFirst ?: products.firstOrNull() ?: return
    val title = first.optString("title")
    if (title.isEmpty()) return

    val asin = first.optString("asin").ifEmpty { null }
    val price = first.optString("price").ifEmpty { null }
    val priceEstimated = first.optBoolean("priceEstimated", false)
    val headline = if (asin != null) "StreamSnap match found" else "StreamSnap spotted something"
    val subtitle = when {
      price != null && asin != null && !priceEstimated -> "$price on Amazon"
      price != null -> "~$price · tap to search Amazon"
      asin != null -> "Found on Amazon"
      else -> "Tap to search Amazon"
    }

    val builder = NotificationCompat.Builder(context, FIND_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_search)
      .setContentTitle(headline)
      .setContentText(title)
      .setSubText(subtitle)
      .setStyle(NotificationCompat.BigTextStyle().bigText("$subtitle\n$title"))
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)

    val imageUrl = first.optString("imageUrl").ifEmpty { null }
      ?: first.optString("sourceCrop").ifEmpty { null }
      ?: first.optString("frameImage").ifEmpty { null }
    decodeNotificationBitmap(imageUrl)?.let { bmp ->
      builder.setStyle(
        NotificationCompat.BigPictureStyle()
          .bigPicture(bmp)
          .setSummaryText(title)
      )
    }

    try {
      NotificationManagerCompat.from(context).notify(
        (System.currentTimeMillis() % Int.MAX_VALUE).toInt(),
        builder.build()
      )
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS not granted — foreground scan still continues.
    }
  }

  private fun decodeNotificationBitmap(imageUrl: String?): android.graphics.Bitmap? {
    if (imageUrl.isNullOrEmpty()) return null
    if (!imageUrl.startsWith("data:image")) return null
    val comma = imageUrl.indexOf(',')
    if (comma < 0) return null
    return try {
      val bytes = Base64.decode(imageUrl.substring(comma + 1), Base64.DEFAULT)
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (_: Exception) {
      null
    }
  }
}
