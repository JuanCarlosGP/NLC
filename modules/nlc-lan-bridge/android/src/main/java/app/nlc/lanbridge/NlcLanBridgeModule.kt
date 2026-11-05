package app.nlc.lanbridge

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class PendingJson(
  val latch: CountDownLatch = CountDownLatch(1),
) {
  @Volatile var status: Int = 500
  @Volatile var body: String = "{\"error\":\"timeout\"}"
}

class PendingStream(
  val latch: CountDownLatch = CountDownLatch(1),
) {
  @Volatile var status: Int = 500
  @Volatile var uri: String? = null
  @Volatile var headersJson: String = "{}"
  @Volatile var error: String? = null
}

class NlcLanBridgeModule : Module() {
  private val ioJobs = ConcurrentHashMap.newKeySet<String>()
  private val ioExecutor = java.util.concurrent.ThreadPoolExecutor(2, 2, 30, TimeUnit.SECONDS, java.util.concurrent.ArrayBlockingQueue<Runnable>(16))
  private fun archiveIo(promise: Promise, job: String = "", work: () -> Any?) {
    if (job.isNotBlank()) ioJobs.add(job)
    try {
      ioExecutor.execute { try { promise.resolve(work()) } catch (error: Exception) { promise.reject("archive", error.message ?: "storage", error) } finally { ioJobs.remove(job) } }
    } catch (error: java.util.concurrent.RejectedExecutionException) { ioJobs.remove(job); promise.reject("busy", "busy", error) }
  }
  private class ArchiveAuth(val job: String, val latch: CountDownLatch = CountDownLatch(1)) { @Volatile var headers: String? = null }
  private val archiveAuth = ConcurrentHashMap<String, ArchiveAuth>()
  private fun requestArchiveAuth(job: String, uri: String, retry: Boolean): org.json.JSONObject {
    val id = java.util.UUID.randomUUID().toString(); val pending = ArchiveAuth(job); archiveAuth[id] = pending
    try {
      sendEvent("onServiceArchiveAuth", mapOf("id" to id, "job" to job, "uri" to uri, "retry" to retry))
      if (!pending.latch.await(20, TimeUnit.SECONDS)) throw java.io.IOException("sourceUnreadable")
      return org.json.JSONObject(pending.headers ?: throw java.io.IOException("sourceUnreadable"))
    } finally { archiveAuth.remove(id) }
  }
  override fun definition() = ModuleDefinition {
    Name("NlcLanBridge")
    AsyncFunction("pendingServiceCommits") { ServiceArchive.pendingCommits(appContext.reactContext ?: error("storage")) }
    AsyncFunction("finishServiceCommit") { job: String, keep: Boolean -> ServiceArchive.finishCommit(appContext.reactContext ?: error("storage"), job, keep) }

    AsyncFunction("interruptedWebTransfers") { PhoneWebTransfers.interrupted(appContext.reactContext ?: error("storage")) }
    Function("usesHeadlessBackend") { true }
    AsyncFunction("installWebPackage") { uri: String -> PhoneWebPackage.install(appContext.reactContext ?: error("storage"), uri) }
    AsyncFunction("startWebInterface") { directory: String, bundle: String ->
      val ctx = appContext.reactContext ?: error("storage")
      val root = java.io.File(directory).canonicalFile
      require(root.parentFile == java.io.File(ctx.filesDir, "phone-web").canonicalFile && root.name == bundle && java.io.File(root, "index.html").isFile)
      PhoneWebRuntime.start(ctx, root, bundle)
      mapOf("running" to PhoneWebRuntime.running(), "port" to 7682, "lanAddress" to LanBridgeServer.lanAddress())
    }
    AsyncFunction("stopWebInterface") { appContext.reactContext?.let { PhoneWebService.stop(it) } }
    Function("webInterfaceState") { mapOf("enabled" to (appContext.reactContext?.getSharedPreferences(PhoneWebService.PREFS, android.content.Context.MODE_PRIVATE)?.getBoolean("enabled", false) ?: false), "running" to PhoneWebRuntime.running(), "bundleId" to PhoneWebRuntime.server?.bundle, "port" to 7682, "lanAddress" to LanBridgeServer.lanAddress(), "batteryExempt" to (appContext.reactContext?.let { PhoneWebService.battery(it) } ?: false), "tuiRunning" to WebTuiProcess.running()) }
    Function("readWebRequestBody") { id:String -> PhoneWebRuntime.requestBody(id) }
    Function("resolveWebRequest") { id: String, json: String -> PhoneWebRuntime.resolve(id, json) }
    Function("publishWebEvent") { json: String -> PhoneWebRuntime.publish(json) }
    Function("openWebBatterySettings") { appContext.reactContext?.let { PhoneWebService.openBattery(it) } }
    Function("startWebChat") { body: String ->
      require(body.length < 20000)
      val ctx = appContext.reactContext ?: error("storage")
      ctx.startService(android.content.Intent(ctx, PhoneWebBackendService::class.java).putExtra("requestId", java.util.UUID.randomUUID().toString()).putExtra("method", "CHAT").putExtra("path", "chat").putExtra("body", body))
    }
    Function("startWebJob") { id: String, action: String ->
      require(Regex("[a-zA-Z0-9_-]{16,80}").matches(id) && action in listOf("preview", "restore", "export", "health-inspect", "health-restore", "health-export", "health-recovery", "track-audio-replace", "mercury-sync"))
      val ctx = appContext.reactContext ?: error("storage")
      ctx.startService(android.content.Intent(ctx, PhoneWebBackendService::class.java).putExtra("requestId", id).putExtra("method", "JOB").putExtra("path", action).putExtra("body", ""))
    }
    AsyncFunction("inspectWebPhoto") { id: String ->
      val ctx = appContext.reactContext ?: error("storage")
      val file = PhoneWebTransfers.file(ctx, id)
      val options = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
      android.graphics.BitmapFactory.decodeFile(file.path, options)
      require(options.outWidth in 1..1800 && options.outHeight in 1..1800 && options.outMimeType in listOf("image/jpeg", "image/png", "image/webp")) { "invalid_photo" }
      mapOf("width" to options.outWidth, "height" to options.outHeight, "mime" to options.outMimeType, "bytes" to file.length().toDouble())
    }
    AsyncFunction("createEmptyWebTransfer") { id:String,name:String -> PhoneWebTransfers.createEmpty(appContext.reactContext ?: error("storage"),id,name) }
    AsyncFunction("readWebTransferRecord") { id:String -> PhoneWebTransfers.read(appContext.reactContext ?: error("storage"),id).toString() }
    AsyncFunction("cancelWebTransfer") { id:String -> PhoneWebTransfers.cancelJob(appContext.reactContext ?: error("storage"),id).toString() }
    AsyncFunction("commitWebTransfer") { id:String -> PhoneWebTransfers.claimCommit(appContext.reactContext ?: error("storage"),id) }
    AsyncFunction("webTransferInfo") { id: String -> PhoneWebTransfers.resolve(appContext.reactContext ?: error("storage"), id) }
    AsyncFunction("updateWebTransfer") { id: String, json: String -> PhoneWebTransfers.update(appContext.reactContext ?: error("storage"), id, json) }

    Events("onBridgeRequest", "onBridgeUnlinked", "onBridgeClaimed", "onDownloadWatchFinished", "onServiceArchiveProgress", "onServiceArchiveAuth", "onLocalMoveProgress")

    Function("cancelServiceArchive") { job: String -> ServiceArchive.cancel(job); archiveAuth.values.filter { it.job == job }.forEach { it.latch.countDown() } }
    Function("resolveServiceArchiveAuth") { id: String, headers: String -> archiveAuth[id]?.let { it.headers = headers; it.latch.countDown() } }
    AsyncFunction("listServiceFolder") { uri: String, promise: Promise ->
      val ctx = appContext.reactContext ?: error("storage")
      archiveIo(promise) { ServiceArchive.list(ctx, uri) }
    }
    AsyncFunction("exportServiceArchive") { plan: String, promise: Promise ->
      val ctx = appContext.reactContext ?: error("storage")
      val job = org.json.JSONObject(plan).optString("job")
      archiveIo(promise, job) { ServiceArchive.export(ctx, plan, { bytes, files -> sendEvent("onServiceArchiveProgress", mapOf("bytes" to bytes.toDouble(), "files" to files, "job" to job)) }, { id, uri, retry -> requestArchiveAuth(id, uri, retry) }) }
    }
    AsyncFunction("prepareServiceArchive") { uri: String, job: String, promise: Promise ->
      val ctx = appContext.reactContext ?: error("storage")
      archiveIo(promise, job) { ServiceArchive.prepare(ctx, uri, job) { bytes, files -> sendEvent("onServiceArchiveProgress", mapOf("bytes" to bytes.toDouble(), "files" to files, "job" to job)) } }
    }
    AsyncFunction("commitServiceFiles") { id: String, destination: String, job: String, promise: Promise ->
      val ctx = appContext.reactContext ?: error("storage")
      archiveIo(promise, job) { ServiceArchive.commit(ctx, id, destination, job) { bytes, files -> sendEvent("onServiceArchiveProgress", mapOf("bytes" to bytes.toDouble(), "files" to files, "job" to job)) } }
    }
    AsyncFunction("discardServiceStage") { id: String -> ServiceArchive.discard(appContext.reactContext ?: error("storage"), id) }

    Function("cancelLocalMove") { id: String -> LocalMove.cancel(id) }
    AsyncFunction("pendingLocalMoves") { LocalMove.pending(appContext.reactContext ?: error("storage")) }
    AsyncFunction("prepareLocalMove") { id: String, uri: String -> LocalMove.prepare(appContext.reactContext ?: error("storage"), id, uri) { phase, bytes, files -> sendEvent("onLocalMoveProgress", mapOf("id" to id, "phase" to phase, "bytes" to bytes.toDouble(), "files" to files)) } }
    AsyncFunction("copyLocalMove") { id: String -> LocalMove.copy(appContext.reactContext ?: error("storage"), id) { phase, bytes, files -> sendEvent("onLocalMoveProgress", mapOf("id" to id, "phase" to phase, "bytes" to bytes.toDouble(), "files" to files)) } }
    AsyncFunction("verifyLocalMove") { id: String -> LocalMove.verify(appContext.reactContext ?: error("storage"), id) { phase, bytes, files -> sendEvent("onLocalMoveProgress", mapOf("id" to id, "phase" to phase, "bytes" to bytes.toDouble(), "files" to files)) } }
    AsyncFunction("finishLocalMove") { id: String, uri: String -> LocalMove.finish(appContext.reactContext ?: error("storage"), id, uri) { phase, bytes, files -> sendEvent("onLocalMoveProgress", mapOf("id" to id, "phase" to phase, "bytes" to bytes.toDouble(), "files" to files)) } }
    AsyncFunction("abortLocalMove") { id: String -> LocalMove.abort(appContext.reactContext ?: error("storage"), id) }
    AsyncFunction("keepLocalMoveOriginals") { id: String -> LocalMove.keepOriginals(appContext.reactContext ?: error("storage"), id) }

    OnCreate {
      instance = this@NlcLanBridgeModule
    }

    OnDestroy {
      ioJobs.forEach { ServiceArchive.cancel(it) }; ioExecutor.shutdownNow()
      archiveAuth.values.forEach { it.latch.countDown() }
      archiveAuth.clear()
      if (instance === this@NlcLanBridgeModule) instance = null
      LanBridgeServer.stop()
    }

    Function("isBridgeRunning") {
      LanBridgeServer.isRunning()
    }

    Function("bridgePort") {
      LanBridgeServer.listeningPort()
    }

    Function("isWebTuiRunning") {
      WebTuiProcess.running()
    }

    Function("getLanAddress") {
      LanBridgeServer.lanAddress()
    }

    AsyncFunction("pairToDesktop") { host: String, port: Int, token: String, jsonBody: String ->
      LanBridgeServer.postPair(host, port, token, jsonBody)
    }

    AsyncFunction("start") { port: Int, token: String, resume: Boolean ->
      val ctx = appContext.reactContext ?: throw IllegalStateException("React context lost")
      LanBridgeServer.attach(ctx)
      if (resume && BridgePrefs.isUnlinked(ctx) && token.isNotBlank()) {
        val bound = LanBridgeServer.start(port, "") { reqId, method, path, query, range ->
          emitRequest(reqId, method, path, query, range)
        }
        return@AsyncFunction mapOf(
          "port" to bound,
          "lanAddress" to LanBridgeServer.lanAddress(),
          "running" to false,
        )
      }
      if (token.isNotBlank()) {
        BridgePrefs.setUnlinked(ctx, false)
      }
      val bound = LanBridgeServer.start(port, token) { reqId, method, path, query, range ->
        emitRequest(reqId, method, path, query, range)
      }
      if (token.isNotBlank()) {
        LanBridgeServer.startForeground(ctx)
      }
      mapOf("port" to bound, "lanAddress" to LanBridgeServer.lanAddress(), "running" to token.isNotBlank())
    }

    AsyncFunction("stop") {
      val ctx = appContext.reactContext
      if (ctx != null) LanBridgeServer.stopForeground(ctx)
      LanBridgeServer.stop()
    }

    Function("isUnlinked") {
      val ctx = appContext.reactContext ?: return@Function false
      BridgePrefs.isUnlinked(ctx)
    }

    Function("linkState") {
      val ctx = appContext.reactContext
      val nativeToken = LanBridgeServer.currentToken()
      val prefsToken = if (ctx != null) BridgePrefs.token(ctx) else ""
      val host = if (ctx != null) BridgePrefs.desktopHost(ctx) else LanBridgeServer.desktopHost()
      mapOf(
        "token" to nativeToken.ifBlank { prefsToken },
        "desktopHost" to host,
        "tuiSeen" to LanBridgeServer.tuiSeen(),
      )
    }

    Function("resolveJson") { id: String, status: Int, body: String ->
      jsonWaiters.remove(id)?.let {
        it.status = status
        it.body = body
        it.latch.countDown()
      }
    }

    Function("resolveStream") { id: String, uri: String, headersJson: String ->
      streamWaiters.remove(id)?.let {
        it.status = 200
        it.uri = uri
        it.headersJson = headersJson
        it.latch.countDown()
      }
    }

    AsyncFunction("startDownloadWatch") { json: String ->
      val ctx = appContext.reactContext ?: throw IllegalStateException("React context lost")
      val obj = org.json.JSONObject(json)
      val params = mutableMapOf<String, Any?>()
      val keys = obj.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        params[key] = obj.opt(key)
      }
      DownloadWatchService.start(ctx, params)
      true
    }

    AsyncFunction("startWebTui") { token: String, port: Int ->
      val ctx = appContext.reactContext ?: throw IllegalStateException("React context lost")
      WebTuiService.start(ctx, token, port)
      true
    }

    AsyncFunction("stopWebTui") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      WebTuiService.stop(ctx)
      true
    }

    AsyncFunction("stopDownloadWatch") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      DownloadWatchService.stop(ctx)
      true
    }

    Function("isDownloadWatchRunning") {
      DownloadWatchService.isRunning()
    }

    Function("fail") { id: String, status: Int, message: String ->
      jsonWaiters.remove(id)?.let {
        it.status = status
        it.body = """{"error":${jsonString(message)}}"""
        it.latch.countDown()
      }
      streamWaiters.remove(id)?.let {
        it.status = status
        it.error = message
        it.latch.countDown()
      }
    }
  }

  private fun emitRequest(reqId: String, method: String, path: String, query: String, range: String?) {
    val ctx = appContext.reactContext ?: return
    val body = org.json.JSONObject().put("id", reqId).put("method", method).put("path", path).put("query", query).put("range", range).toString()
    ctx.startService(android.content.Intent(ctx, PhoneWebBackendService::class.java).putExtra("requestId", reqId).putExtra("method", "BRIDGE").putExtra("path", path).putExtra("body", body))
  }

  companion object {
    @Volatile
    var instance: NlcLanBridgeModule? = null

    val jsonWaiters = ConcurrentHashMap<String, PendingJson>()
    val streamWaiters = ConcurrentHashMap<String, PendingStream>()

    fun awaitJson(id: String, timeoutMs: Long): PendingJson {
      val pending = PendingJson()
      jsonWaiters[id] = pending
      if (!pending.latch.await(timeoutMs, TimeUnit.MILLISECONDS)) {
        jsonWaiters.remove(id)
        pending.status = 504
        pending.body = "{\"error\":\"js_timeout\"}"
      }
      return pending
    }

    fun awaitStream(id: String, timeoutMs: Long): PendingStream {
      val pending = PendingStream()
      streamWaiters[id] = pending
      if (!pending.latch.await(timeoutMs, TimeUnit.MILLISECONDS)) {
        streamWaiters.remove(id)
        pending.status = 504
        pending.error = "js_timeout"
      }
      return pending
    }

    fun jsonString(value: String): String {
      val escaped = value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
      return "\"$escaped\""
    }

    fun emitUnlinked() {
      instance?.sendEvent("onBridgeUnlinked", emptyMap<String, Any>())
    }

    fun emitClaimed(token: String, desktopHost: String) {
      instance?.sendEvent(
        "onBridgeClaimed",
        mapOf("token" to token, "desktopHost" to desktopHost),
      )
    }

    fun emitDownloadWatchFinished(done: Int, failed: Int) {
      instance?.sendEvent(
        "onDownloadWatchFinished",
        mapOf("done" to done, "failed" to failed, "finished" to true),
      )
    }
  }
}
