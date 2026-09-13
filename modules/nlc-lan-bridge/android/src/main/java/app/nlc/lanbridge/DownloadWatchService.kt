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
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.atomic.AtomicBoolean

class DownloadWatchService : Service() {
  private var worker: HandlerThread? = null
  private var handler: Handler? = null
  private val looping = AtomicBoolean(false)
  private var startedAt = 0L
  private var lastBody = ""

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    val config = loadConfig()
    val title = config?.title ?: "NLC"
    val body = if (config != null) {
      fill(
        config.bodyQueued,
        mapOf("done" to "0", "total" to config.ids.size.toString()),
      )
    } else {
      "…"
    }
    startForegroundWith(notification(title, body))
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopWatch()
      return START_NOT_STICKY
    }
    val raw = intent?.getStringExtra(EXTRA_CONFIG) ?: prefs().getString(PREFS_KEY, null)
    if (raw.isNullOrBlank()) {
      stopWatch()
      return START_NOT_STICKY
    }
    mergeConfig(raw)
    if (!looping.get()) {
      startedAt = System.currentTimeMillis()
      lastBody = ""
      looping.set(true)
      val thread = HandlerThread("nlc-download-watch")
      thread.start()
      worker = thread
      handler = Handler(thread.looper)
      handler?.post { tick() }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    looping.set(false)
    handler?.removeCallbacksAndMessages(null)
    worker?.quitSafely()
    handler = null
    worker = null
    running.set(false)
    super.onDestroy()
  }

  private fun tick() {
    if (!looping.get()) return
    val config = loadConfig()
    if (config == null) {
      stopWatch()
      return
    }
    if (System.currentTimeMillis() - startedAt > MAX_WATCH_MS) {
      present(config.titleDone, fill(config.bodyTimeout, emptyMap<String, String>()), finished = true)
      NlcLanBridgeModule.emitDownloadWatchFinished(0, 0)
      stopWatch()
      return
    }
    try {
      val jobs = fetchJobs(config)
      val summary = summarize(config, jobs)
      present(if (summary.finished) config.titleDone else config.title, summary.body, summary.finished)
      if (summary.finished) {
        NlcLanBridgeModule.emitDownloadWatchFinished(summary.done, summary.failed)
        prefs().edit().remove(PREFS_KEY).apply()
        stopWatch()
        return
      }
    } catch (_: Exception) {
      // Keep the last notification; retry.
    }
    if (looping.get()) handler?.postDelayed({ tick() }, POLL_MS)
  }

  private fun fetchJobs(config: WatchConfig): List<WatchJob> {
    val encoded = config.ids.joinToString(",") { URLEncoder.encode(it, "UTF-8") }
    val listed = httpGet(config, "${config.baseUrl}/jobs?ids=$encoded")
    if (listed != null && listed.first in 200..299) {
      val jobs = parseJobs(listed.second)
      if (jobs != null) return jobs
    }
    val out = ArrayList<WatchJob>()
    for (id in config.ids) {
      val one = httpGet(config, "${config.baseUrl}/jobs/${URLEncoder.encode(id, "UTF-8")}")
      if (one == null || one.first !in 200..299) continue
      parseJob(JSONObject(one.second))?.let { out.add(it) }
    }
    return out
  }

  private fun parseJobs(body: String): List<WatchJob>? {
    return try {
      val obj = JSONObject(body)
      if (!obj.has("jobs")) return null
      val arr: JSONArray = obj.getJSONArray("jobs")
      val out = ArrayList<WatchJob>(arr.length())
      for (i in 0 until arr.length()) {
        parseJob(arr.getJSONObject(i))?.let { out.add(it) }
      }
      out
    } catch (_: Exception) {
      null
    }
  }

  private fun cleanOptString(obj: JSONObject, key: String): String {
    if (!obj.has(key) || obj.isNull(key)) return ""
    val s = obj.optString(key, "").trim()
    return if (s.equals("null", ignoreCase = true)) "" else s
  }

  private fun parseJob(obj: JSONObject): WatchJob? {
    val id = cleanOptString(obj, "id")
    if (id.isEmpty()) return null
    val status = cleanOptString(obj, "status").lowercase()
    val rawTitle = cleanOptString(obj, "title")
    val rawUrl = cleanOptString(obj, "url")
    val title = rawTitle.ifBlank { rawUrl }
    val progress = if (obj.has("progress") && !obj.isNull("progress")) obj.optDouble("progress") else null
    return WatchJob(id, status, title, progress)
  }

  private fun summarize(config: WatchConfig, jobs: List<WatchJob>): Summary {
    val byId = jobs.associateBy { it.id }
    var done = 0
    var failed = 0
    var running: WatchJob? = null
    for (id in config.ids) {
      val job = byId[id] ?: continue
      when (job.status) {
        "done" -> done += 1
        "error" -> failed += 1
        "running", "queued" -> if (running == null) running = job
      }
    }
    val total = config.ids.size
    val remaining = total - done - failed
    val finished = remaining <= 0
    val current = if (running != null) {
      val label = jobLabel(config, running)
      val pct = running.progress
      if (pct != null && !pct.isNaN()) {
        fill(config.currentPct, mapOf("title" to label, "pct" to pct.toInt().toString()))
      } else {
        label
      }
    } else {
      ""
    }
    val values = mapOf(
      "done" to done.toString(),
      "failed" to failed.toString(),
      "total" to total.toString(),
      "current" to current,
    )
    val body = when {
      finished && failed > 0 -> fill(config.bodyDone, values)
      finished -> fill(config.bodyDoneAll, values)
      current.isNotEmpty() -> fill(config.body, values)
      else -> fill(config.bodyQueued, values)
    }
    return Summary(done, failed, finished, body)
  }

  private fun jobLabel(config: WatchConfig, job: WatchJob): String {
    val t = job.title.trim()
    return if (t.isEmpty() || t.equals("null", ignoreCase = true)) config.trackFallback else t
  }

  private fun present(title: String, body: String, finished: Boolean) {
    if (body == lastBody && !finished) return
    lastBody = body
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, notification(title, body, ongoing = !finished))
  }

  private fun notification(title: String, body: String, ongoing: Boolean = true): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = if (launch != null) {
      PendingIntent.getActivity(
        this,
        0,
        launch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    } else {
      null
    }
    val builder = notificationBuilder()
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setOngoing(ongoing)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_PROGRESS)
    if (contentIntent != null) builder.setContentIntent(contentIntent)
    return builder.build()
  }

  private fun notificationBuilder(): Notification.Builder {
    return if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
  }

  private fun startForegroundWith(notification: Notification) {
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val existing = manager.getNotificationChannel(CHANNEL_ID)
    if (existing != null) return
    val channel = NotificationChannel(CHANNEL_ID, "NAS downloads", NotificationManager.IMPORTANCE_DEFAULT)
    channel.setShowBadge(false)
    channel.setSound(null, null)
    manager.createNotificationChannel(channel)
  }

  private fun httpGet(config: WatchConfig, url: String): Pair<Int, String>? {
    val conn = URL(url).openConnection() as HttpURLConnection
    conn.connectTimeout = 8_000
    conn.readTimeout = 8_000
    conn.requestMethod = "GET"
    conn.instanceFollowRedirects = true
    if (config.token.isNotBlank()) {
      conn.setRequestProperty("X-Download-Token", config.token)
      conn.setRequestProperty("Authorization", "Bearer ${config.token}")
    }
    conn.setRequestProperty("Accept", "application/json")
    return try {
      val code = conn.responseCode
      val stream = if (code in 200..299) conn.inputStream else conn.errorStream
      val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      Pair(code, text)
    } catch (_: Exception) {
      null
    } finally {
      conn.disconnect()
    }
  }

  private fun mergeConfig(raw: String) {
    val incoming = JSONObject(raw)
    val stored = prefs().getString(PREFS_KEY, null)
    if (stored != null) {
      val oldIds = JSONObject(stored).optString("ids").split(",").map { it.trim() }.filter { it.isNotEmpty() }
      val newIds = incoming.optString("ids").split(",").map { it.trim() }.filter { it.isNotEmpty() }
      incoming.put("ids", (oldIds + newIds).distinct().joinToString(","))
    }
    prefs().edit().putString(PREFS_KEY, incoming.toString()).apply()
  }

  private fun loadConfig(): WatchConfig? {
    val raw = prefs().getString(PREFS_KEY, null) ?: return null
    return try {
      val obj = JSONObject(raw)
      val ids = obj.optString("ids").split(",").map { it.trim() }.filter { it.isNotEmpty() }
      if (ids.isEmpty()) return null
      WatchConfig(
        baseUrl = obj.optString("baseUrl").trim().trimEnd('/'),
        token = obj.optString("token"),
        ids = ids,
        title = obj.optString("title").ifBlank { "NLC" },
        titleDone = obj.optString("titleDone").ifBlank { "NLC" },
        body = obj.optString("body"),
        bodyQueued = obj.optString("bodyQueued"),
        bodyDone = obj.optString("bodyDone"),
        bodyDoneAll = obj.optString("bodyDoneAll"),
        bodyTimeout = obj.optString("bodyTimeout"),
        currentPct = obj.optString("currentPct"),
        trackFallback = obj.optString("trackFallback").ifBlank { "track" },
      )
    } catch (_: Exception) {
      null
    }
  }

  private fun prefs() = getSharedPreferences(PREFS, MODE_PRIVATE)

  private fun stopWatch() {
    looping.set(false)
    handler?.removeCallbacksAndMessages(null)
    running.set(false)
    stopForeground(STOP_FOREGROUND_DETACH)
    stopSelf()
  }

  private data class WatchConfig(
    val baseUrl: String,
    val token: String,
    val ids: List<String>,
    val title: String,
    val titleDone: String,
    val body: String,
    val bodyQueued: String,
    val bodyDone: String,
    val bodyDoneAll: String,
    val bodyTimeout: String,
    val currentPct: String,
    val trackFallback: String,
  )

  private data class WatchJob(
    val id: String,
    val status: String,
    val title: String,
    val progress: Double?,
  )

  private data class Summary(
    val done: Int,
    val failed: Int,
    val finished: Boolean,
    val body: String,
  )

  companion object {
    const val CHANNEL_ID = "downloads"
    const val NOTIFICATION_ID = 8091
    const val ACTION_STOP = "app.nlc.lanbridge.STOP_DOWNLOAD_WATCH"
    private const val EXTRA_CONFIG = "config"
    private const val PREFS = "nlc_download_watch"
    private const val PREFS_KEY = "config"
    private const val POLL_MS = 2_500L
    private const val MAX_WATCH_MS = 4 * 60 * 60 * 1000L
    private val running = AtomicBoolean(false)

    fun isRunning(): Boolean = running.get()

    fun start(context: Context, params: Map<String, Any?>) {
      val incoming = JSONObject()
      for ((key, value) in params) {
        if (value != null) incoming.put(key, value.toString())
      }
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val stored = prefs.getString(PREFS_KEY, null)
      if (stored != null) {
        val oldIds = JSONObject(stored).optString("ids").split(",").map { it.trim() }.filter { it.isNotEmpty() }
        val newIds = incoming.optString("ids").split(",").map { it.trim() }.filter { it.isNotEmpty() }
        incoming.put("ids", (oldIds + newIds).distinct().joinToString(","))
      }
      prefs.edit().putString(PREFS_KEY, incoming.toString()).apply()
      running.set(true)
      val intent = Intent(context, DownloadWatchService::class.java)
      intent.putExtra(EXTRA_CONFIG, incoming.toString())
      if (Build.VERSION.SDK_INT >= 26) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      running.set(false)
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(PREFS_KEY).apply()
      context.stopService(Intent(context, DownloadWatchService::class.java).setAction(ACTION_STOP))
    }

    private fun fill(template: String, values: Map<String, String>): String {
      var out = template
      for ((key, value) in values) {
        out = out.replace("{$key}", value)
      }
      return out
    }
  }
}
