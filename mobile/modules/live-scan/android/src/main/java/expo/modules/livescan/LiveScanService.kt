package expo.modules.livescan

import android.app.Activity
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Process
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import android.graphics.PixelFormat

/**
 * Foreground MediaProjection capture — Android equivalent of the iOS ReplayKit
 * Broadcast Upload Extension. Frames go through [LiveScanEngine].
 */
class LiveScanService : Service() {
  private var mediaProjection: MediaProjection? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var imageReader: ImageReader? = null
  private var engine: LiveScanEngine? = null
  private var captureThread: HandlerThread? = null
  private var captureHandler: Handler? = null

  private val projectionCallback = object : MediaProjection.Callback() {
    override fun onStop() {
      stopCapture()
      stopSelf()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    LiveScanNotifier.ensureChannels(this)
    captureThread = HandlerThread("LiveScanCapture", Process.THREAD_PRIORITY_BACKGROUND).also {
      it.start()
      captureHandler = Handler(it.looper)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopCapture()
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_START -> {
        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
        val data = if (Build.VERSION.SDK_INT >= 33) {
          intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(EXTRA_RESULT_DATA)
        }
        if (resultCode != Activity.RESULT_OK || data == null) {
          stopSelf()
          return START_NOT_STICKY
        }
        startForegroundNotification()
        LiveScanStore.beginSession(this)
        startCapture(resultCode, data)
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    stopCapture()
    LiveScanStore.endSession(this)
    captureThread?.quitSafely()
    captureThread = null
    captureHandler = null
    isRunning = false
    super.onDestroy()
  }

  private fun startForegroundNotification() {
    val stopIntent = Intent(this, LiveScanService::class.java).setAction(ACTION_STOP)
    val stopPi = PendingIntent.getService(
      this,
      0,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val contentPi = launch?.let {
      PendingIntent.getActivity(
        this,
        1,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val notification = NotificationCompat.Builder(this, LiveScanNotifier.FG_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setContentTitle("StreamSnap Live Scan")
      .setContentText("Capturing the screen. Open TikTok or YouTube, then pause on a product.")
      .setOngoing(true)
      .setContentIntent(contentPi)
      .addAction(0, "Stop", stopPi)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        LiveScanNotifier.FG_NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
      )
    } else {
      startForeground(LiveScanNotifier.FG_NOTIFICATION_ID, notification)
    }
  }

  private fun startCapture(resultCode: Int, data: Intent) {
    val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val projection = manager.getMediaProjection(resultCode, data) ?: run {
      LiveScanStore.recordEvent(this, phase = "projection_failed", error = "Could not start screen capture")
      stopSelf()
      return
    }
    mediaProjection = projection
    projection.registerCallback(projectionCallback, captureHandler)

    val metrics = displayMetrics()
    val longest = maxOf(metrics.widthPixels, metrics.heightPixels).toFloat()
    val scale = minOf(1f, LiveScanPolicy.VIRTUAL_MAX_EDGE / longest)
    val width = (metrics.widthPixels * scale).toInt().coerceAtLeast(8)
    val height = (metrics.heightPixels * scale).toInt().coerceAtLeast(8)
    val density = metrics.densityDpi

    val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
    imageReader = reader
    engine = LiveScanEngine(applicationContext)

    reader.setOnImageAvailableListener({ incoming ->
      val image = incoming.acquireLatestImage() ?: return@setOnImageAvailableListener
      try {
        engine?.onFrame(image)
      } finally {
        image.close()
      }
    }, captureHandler)

    try {
      virtualDisplay = projection.createVirtualDisplay(
        "StreamSnapLiveScan",
        width,
        height,
        density,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
        reader.surface,
        null,
        captureHandler
      )
    } catch (err: Exception) {
      LiveScanStore.recordEvent(
        this,
        phase = "display_failed",
        error = err.message ?: "Could not create screen capture display"
      )
      stopSelf()
      return
    }
    LiveScanStore.recordEvent(this, phase = "capturing")
  }

  private fun stopCapture() {
    try {
      imageReader?.setOnImageAvailableListener(null, null)
    } catch (_: Exception) {
    }
    try {
      virtualDisplay?.release()
    } catch (_: Exception) {
    }
    virtualDisplay = null
    try {
      imageReader?.close()
    } catch (_: Exception) {
    }
    imageReader = null
    try {
      mediaProjection?.unregisterCallback(projectionCallback)
      mediaProjection?.stop()
    } catch (_: Exception) {
    }
    mediaProjection = null
    engine?.shutdown()
    engine = null
  }

  @Suppress("DEPRECATION")
  private fun displayMetrics(): DisplayMetrics {
    val metrics = DisplayMetrics()
    val wm = getSystemService(WINDOW_SERVICE) as WindowManager
    wm.defaultDisplay.getRealMetrics(metrics)
    return metrics
  }

  companion object {
    const val ACTION_START = "com.streamsnap.ai.LIVE_SCAN_START"
    const val ACTION_STOP = "com.streamsnap.ai.LIVE_SCAN_STOP"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_RESULT_DATA = "resultData"

    @Volatile
    var isRunning: Boolean = false
      private set

    fun start(context: Context, resultCode: Int, data: Intent) {
      val intent = Intent(context, LiveScanService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_RESULT_CODE, resultCode)
        putExtra(EXTRA_RESULT_DATA, data)
      }
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      val intent = Intent(context, LiveScanService::class.java).setAction(ACTION_STOP)
      context.startService(intent)
    }
  }
}
