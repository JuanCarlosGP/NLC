package app.nlc.lanbridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import java.io.File
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.atomic.AtomicReference

object WebTuiProcess {
  private val process = AtomicReference<Process?>(null)
  @Volatile var lastError: String = ""
  @Volatile private var bridgePort: Int = 0

  fun running(): Boolean = process.get()?.isAlive == true

  @Synchronized
  fun start(context: Context, token: String, port: Int) {
    if (running() && bridgePort == port) return
    if (running()) stop()
    lastError = ""
    val bin = File(context.applicationInfo.nativeLibraryDir, "libnlc_tui.so")
    if (!bin.exists()) {
      throw IllegalStateException("missing libnlc_tui.so")
    }
    val pb = ProcessBuilder(bin.absolutePath, "--serve")
    pb.directory(context.filesDir)
    pb.redirectErrorStream(true)
    val env = pb.environment()
    env["HOME"] = context.filesDir.absolutePath
    env["TMPDIR"] = context.cacheDir.absolutePath
    env["NLC_ON_PHONE"] = "1"
    env["NLC_WEB"] = "1"
    env["NLC_BRIDGE_HOST"] = "127.0.0.1"
    env["NLC_BRIDGE_PORT"] = port.coerceAtLeast(1).toString()
    env["NLC_BRIDGE_TOKEN"] = token
    bridgePort = port
    val child = pb.start()
    process.set(child)
    Thread {
      val text = child.inputStream.bufferedReader().readText()
      if (text.isNotBlank()) lastError = text.takeLast(500)
    }.start()
    val deadline = System.currentTimeMillis() + 8_000
    while (System.currentTimeMillis() < deadline) {
      if (!child.isAlive) {
        throw IllegalStateException(lastError.ifBlank { "web tui exited" })
      }
      if (portOpen()) return
      Thread.sleep(100)
    }
    throw IllegalStateException(lastError.ifBlank { "port 7681 did not open" })
  }

  fun stop() {
    process.getAndSet(null)?.destroy()
  }

  private fun portOpen(): Boolean {
    return try {
      Socket().use { socket ->
        socket.connect(InetSocketAddress("127.0.0.1", 7681), 200)
      }
      true
    } catch (_: Exception) {
      false
    }
  }
}

class WebTuiService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    startForegroundWith(notification())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      WebTuiProcess.stop()
      stopSelf()
      return START_NOT_STICKY
    }
    val token = intent?.getStringExtra(EXTRA_TOKEN).orEmpty()
    val port = intent?.getIntExtra(EXTRA_PORT, 7421) ?: 7421
    Thread {
      try {
        WebTuiProcess.start(this, token, port)
      } catch (error: Exception) {
        WebTuiProcess.lastError = error.message ?: "web tui"
        WebTuiProcess.stop()
        stopSelf()
      }
    }.start()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    WebTuiProcess.stop()
    super.onDestroy()
  }

  private fun startForegroundWith(notification: Notification) {
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun notification(): Notification {
    return notificationBuilder()
      .setContentTitle("NLC")
      .setContentText("TUI en el navegador · :7681")
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .build()
  }

  private fun notificationBuilder(): Notification.Builder {
    return if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(CHANNEL_ID, "NLC web TUI", NotificationManager.IMPORTANCE_LOW)
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  companion object {
    const val CHANNEL_ID = "nlc_web_tui"
    const val NOTIFICATION_ID = 7681
    const val EXTRA_TOKEN = "token"
    const val EXTRA_PORT = "port"
    const val ACTION_STOP = "app.nlc.lanbridge.WEB_TUI_STOP"

    fun start(context: Context, token: String, port: Int) {
      val intent = Intent(context, WebTuiService::class.java)
        .putExtra(EXTRA_TOKEN, token)
        .putExtra(EXTRA_PORT, port)
      if (Build.VERSION.SDK_INT >= 26) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      val deadline = System.currentTimeMillis() + 8_000
      while (System.currentTimeMillis() < deadline) {
        if (WebTuiProcess.running() && portOpen()) return
        if (WebTuiProcess.lastError.isNotBlank() && !WebTuiProcess.running()) {
          throw IllegalStateException(WebTuiProcess.lastError)
        }
        Thread.sleep(100)
      }
      if (!portOpen()) {
        throw IllegalStateException(WebTuiProcess.lastError.ifBlank { "port 7681 did not open" })
      }
    }

    fun stop(context: Context) {
      WebTuiProcess.stop()
      context.stopService(Intent(context, WebTuiService::class.java).setAction(ACTION_STOP))
    }

    private fun portOpen(): Boolean {
      return try {
        Socket().use { socket ->
          socket.connect(InetSocketAddress("127.0.0.1", 7681), 200)
        }
        true
      } catch (_: Exception) {
        false
      }
    }
  }
}
