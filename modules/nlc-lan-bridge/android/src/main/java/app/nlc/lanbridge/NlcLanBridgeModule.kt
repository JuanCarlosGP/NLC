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
  override fun definition() = ModuleDefinition {
    Name("NlcLanBridge")
    Events("onBridgeRequest")

    OnCreate {
      instance = this@NlcLanBridgeModule
    }

    OnDestroy {
      if (instance === this@NlcLanBridgeModule) instance = null
      LanBridgeServer.stop()
    }

    Function("getLanAddress") {
      LanBridgeServer.lanAddress()
    }

    AsyncFunction("start") { port: Int, token: String ->
      val ctx = appContext.reactContext ?: throw IllegalStateException("React context lost")
      val bound = LanBridgeServer.start(port, token) { reqId, method, path, query, range ->
        emitRequest(reqId, method, path, query, range)
      }
      LanBridgeServer.startForeground(ctx)
      mapOf("port" to bound, "lanAddress" to LanBridgeServer.lanAddress())
    }

    AsyncFunction("stop") {
      val ctx = appContext.reactContext
      if (ctx != null) LanBridgeServer.stopForeground(ctx)
      LanBridgeServer.stop()
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
  }
}
