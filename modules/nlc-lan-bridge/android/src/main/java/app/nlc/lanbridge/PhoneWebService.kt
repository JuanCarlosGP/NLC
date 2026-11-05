package app.nlc.lanbridge

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.*
import android.provider.Settings
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import java.io.File

/** Hosts requests even when no React view is mounted. */
class PhoneWebService : Service() {
  private var wake: PowerManager.WakeLock? = null
  private var wifi: WifiManager.WifiLock? = null
  override fun onCreate() {
    super.onCreate()
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL, "NLC escritorio", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
    val stop = PendingIntent.getService(this, 7682, Intent(this, PhoneWebService::class.java).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let { PendingIntent.getActivity(this, 7682, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
    val notification = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this))
      .setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("NLC · Interfaz en el navegador").setContentText("Red local · :7682").setContentIntent(open).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE)
      .addAction(Notification.Action.Builder(null, "Detener", stop).build()).build()
    if (Build.VERSION.SDK_INT >= 34) startForeground(7682, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE) else startForeground(7682, notification)
    wake = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NLC:PhoneWeb").apply { setReferenceCounted(false); acquire() }
    @Suppress("DEPRECATION")
    wifi = (applicationContext.getSystemService(WIFI_SERVICE) as WifiManager).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "NLC:PhoneWeb").apply { setReferenceCounted(false); acquire() }
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP) { stop(this); return START_NOT_STICKY }
    if (!PhoneWebRuntime.running()) {
      val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
      if (!prefs.getBoolean("enabled", false)) { stopSelf(); return START_NOT_STICKY }
      try {
        val directory = File(prefs.getString("directory", "")!!); val bundle = prefs.getString("bundle", "")!!
        check(directory.isDirectory && File(directory, "index.html").isFile)
        PhoneWebRuntime.start(this, directory, bundle)
      } catch (_: Exception) { stop(this); return START_NOT_STICKY }
    }
    return START_STICKY
  }
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onDestroy() {
    PhoneWebRuntime.stop(); if (wifi?.isHeld == true) wifi?.release(); if (wake?.isHeld == true) wake?.release()
    wifi = null; wake = null; super.onDestroy()
  }
  companion object {
    const val PREFS = "nlc_phone_web"; const val CHANNEL = "nlc_phone_web"; const val STOP = "app.nlc.lanbridge.PHONE_WEB_STOP"
    fun start(context: Context) {
      context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("enabled", true).putString("directory", PhoneWebRuntime.server?.rootPath()).putString("bundle", PhoneWebRuntime.server?.bundle).apply()
      val intent = Intent(context, PhoneWebService::class.java)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
    }
    fun stop(context: Context) { context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("enabled", false).apply(); PhoneWebRuntime.stop(); context.stopService(Intent(context, PhoneWebService::class.java)) }
    fun battery(context: Context): Boolean = (context.getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(context.packageName)
    fun openBattery(context: Context) { context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
  }
}

class PhoneWebBackendService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    if (intent == null || !intent.hasExtra("requestId")) return null
    return HeadlessJsTaskConfig("NlcPhoneBackend", Arguments.fromBundle(intent.extras ?: Bundle()), 0, true)
  }
}

/** Restores only a server the user had explicitly enabled. Force-stopped apps wait until reopened. */
class PhoneWebBootReceiver : BroadcastReceiver() {
 override fun onReceive(context:Context,intent:Intent) {
  if(intent.action != Intent.ACTION_BOOT_COMPLETED || !context.getSharedPreferences(PhoneWebService.PREFS,Context.MODE_PRIVATE).getBoolean("enabled",false))return
  val service=Intent(context,PhoneWebService::class.java)
  if(Build.VERSION.SDK_INT>=26)context.startForegroundService(service)else context.startService(service)
 }
}
