package expo.modules.livescan

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LiveScanModule : Module() {
  private var pendingStart: Promise? = null
  private var updateReceiver: BroadcastReceiver? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("LiveScan")

    Events("onUpdate")

    OnStartObserving {
      registerUpdateReceiver()
    }

    OnStopObserving {
      unregisterUpdateReceiver()
    }

    OnDestroy {
      unregisterUpdateReceiver()
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_MEDIA_PROJECTION) return@OnActivityResult
      val promise = pendingStart
      pendingStart = null
      if (payload.resultCode != Activity.RESULT_OK || payload.data == null) {
        promise?.reject("E_DENIED", "Screen capture permission was denied", null)
        return@OnActivityResult
      }
      val ctx = appContext.reactContext
      if (ctx == null) {
        promise?.reject("E_NO_CONTEXT", "React context lost", null)
        return@OnActivityResult
      }
      LiveScanService.start(ctx, payload.resultCode, payload.data!!)
      emitSnapshot()
      promise?.resolve(null)
    }

    Function("isAvailable") {
      true
    }

    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      if (Build.VERSION.SDK_INT < 33) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val granted = ContextCompat.checkSelfPermission(
        activity,
        Manifest.permission.POST_NOTIFICATIONS
      ) == PackageManager.PERMISSION_GRANTED
      if (!granted) {
        activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_POST_NOTIFICATIONS)
      }
      promise.resolve(granted)
    }

    AsyncFunction("syncCredentials") { token: String?, installId: String, workerUrl: String ->
      LiveScanStore.writeCredentials(context, token, installId, workerUrl)
    }

    Function("getState") {
      val ctx = appContext.reactContext ?: return@Function emptyMap<String, Any?>()
      LiveScanStore.snapshot(ctx, LiveScanService.isRunning)
    }

    AsyncFunction("startBroadcast") { promise: Promise ->
      if (LiveScanService.isRunning) {
        promise.resolve(null)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("E_NO_ACTIVITY", "Live scan needs the app in the foreground", null)
        return@AsyncFunction
      }
      if (Build.VERSION.SDK_INT >= 33) {
        val granted = ContextCompat.checkSelfPermission(
          activity,
          Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
          activity.requestPermissions(
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            REQUEST_POST_NOTIFICATIONS
          )
        }
      }
      pendingStart?.reject("E_CANCELLED", "Superseded by a new live scan request", null)
      pendingStart = promise
      val manager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      activity.startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_MEDIA_PROJECTION)
    }

    AsyncFunction("stopBroadcast") {
      val ctx = appContext.reactContext ?: return@AsyncFunction
      LiveScanService.stop(ctx)
      emitSnapshot()
    }
  }

  private fun registerUpdateReceiver() {
    val ctx = appContext.reactContext ?: return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        emitSnapshot()
      }
    }
    updateReceiver = receiver
    val filter = IntentFilter(LiveScanStore.ACTION_UPDATED)
    if (Build.VERSION.SDK_INT >= 33) {
      ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      ctx.registerReceiver(receiver, filter)
    }
  }

  private fun unregisterUpdateReceiver() {
    val receiver = updateReceiver ?: return
    try {
      appContext.reactContext?.unregisterReceiver(receiver)
    } catch (_: Exception) {
    }
    updateReceiver = null
  }

  private fun emitSnapshot() {
    val ctx = appContext.reactContext ?: return
    sendEvent("onUpdate", LiveScanStore.snapshot(ctx, LiveScanService.isRunning))
  }

  companion object {
    private const val REQUEST_MEDIA_PROJECTION = 7101
    private const val REQUEST_POST_NOTIFICATIONS = 7102
  }
}
