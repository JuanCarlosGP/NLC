package app.nlc.lanbridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

class LanBridgeService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    startForegroundWith(notification())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_DISCONNECT) {
      LanBridgeServer.requestUnlink()
      return START_NOT_STICKY
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    LanBridgeServer.stop()
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
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val disconnect = PendingIntent.getService(
      this,
      1,
      Intent(this, LanBridgeService::class.java).setAction(ACTION_DISCONNECT),
      flags,
    )
    val action = Notification.Action.Builder(
      android.R.drawable.ic_menu_close_clear_cancel,
      "Desconectar",
      disconnect,
    ).build()
    return notificationBuilder()
      .setContentTitle("NLC")
      .setContentText("Desktop bridge")
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .addAction(action)
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
    val channel = NotificationChannel(CHANNEL_ID, "NLC desktop", NotificationManager.IMPORTANCE_LOW)
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  companion object {
    const val CHANNEL_ID = "nlc_lan_bridge"
    const val NOTIFICATION_ID = 7421
    const val ACTION_DISCONNECT = "app.nlc.lanbridge.DISCONNECT"
  }
}
