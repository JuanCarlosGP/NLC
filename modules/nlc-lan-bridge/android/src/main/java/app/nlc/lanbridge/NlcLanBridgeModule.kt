package app.nlc.lanbridge

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
    Events("onBridgeRequest", "onBridgeUnlinked", "onBridgeClaimed", "onDownloadWatchFinished", "onServiceArchiveProgress", "onServiceArchiveAuth", "onLocalMoveProgress")

    Function("cancelServiceArchive") { job: String -> ServiceArchive.cancel(job); archiveAuth.values.filter { it.job == job }.forEach { it.latch.countDown() } }
    Function("resolveServiceArchiveAuth") { id: String, headers: String -> archiveAuth[id]?.let { it.headers = headers; it.latch.countDown() } }
    AsyncFunction("listServiceFolder") { uri: String ->
      ServiceArchive.list(appContext.reactContext ?: error("storage"), uri)
    }
    AsyncFunction("exportServiceArchive") { plan: String ->
      val ctx = appContext.reactContext ?: error("storage")
      ServiceArchive.export(ctx, plan, { bytes, files -> sendEvent("onServiceArchiveProgress", mapOf("bytes" to bytes.toDouble(), "files" to files)) }, { job, uri, retry -> requestArchiveAuth(job, uri, retry) })
    }
    AsyncFunction("prepareServiceArchive") { uri: String, job: String ->
      ServiceArchive.prepare(appContext.reactContext ?: error("storage"), uri, job) { bytes, files -> sendEvent("onServiceArchiveProgress", mapOf("bytes" to bytes.toDouble(), "files" to files)) }
    }
    AsyncFunction("commitServiceFiles") { id: String, destination: String, job: String ->
      ServiceArchive.commit(appContext.reactContext ?: error("storage"), id, destination, job) { bytes, files -> sendEvent("onServiceArchiveProgress", mapOf("bytes" to bytes.toDouble(), "files" to files)) }
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
    sendEvent(
      "onBridgeRequest",
      mapOf(
        "id" to reqId,
        "method" to method,
        "path" to path,
        "query" to query,
        "range" to range,
      ),
    )
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
