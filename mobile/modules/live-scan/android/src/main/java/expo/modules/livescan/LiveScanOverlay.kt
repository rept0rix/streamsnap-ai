package expo.modules.livescan

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.view.Gravity
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Floating STOP control while MediaProjection is active.
 * Android R+ auto-grants SYSTEM_ALERT_WINDOW for the duration of a projection
 * if the permission is declared and the user has not denied it.
 */
internal object LiveScanOverlay {
  private var windowManager: WindowManager? = null
  private var view: LinearLayout? = null

  fun show(context: Context) {
    hide()
    val app = context.applicationContext
    val wm = app.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val pill = LinearLayout(app).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(36, 22, 36, 22)
      setBackgroundColor(0xF0EA4300.toInt())
      elevation = 24f
    }
    val label = TextView(app).apply {
      text = "STOP SCAN"
      setTextColor(Color.WHITE)
      textSize = 13f
      typeface = Typeface.DEFAULT_BOLD
      letterSpacing = 0.06f
    }
    pill.addView(label)
    pill.setOnClickListener {
      LiveScanService.stop(app)
    }

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      },
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.END
      x = 24
      y = 120
    }

    try {
      wm.addView(pill, params)
      windowManager = wm
      view = pill
    } catch (_: Exception) {
      // Overlay permission missing or denied — notification Stop still works.
    }
  }

  fun hide() {
    val wm = windowManager
    val current = view
    if (wm != null && current != null) {
      try {
        wm.removeView(current)
      } catch (_: Exception) {
      }
    }
    windowManager = null
    view = null
  }
}
