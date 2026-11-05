package app.nlc.lanbridge

import android.content.Context
import android.content.Intent
import android.net.Uri
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import java.io.*
import java.net.*
import java.util.UUID
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean

/** Independent of the authenticated terminal bridge and its idle/link state. */
object PhoneWebRuntime {
  const val PORT = 7682
  @Volatile var server: PhoneWebServer? = null
  private val pending = ConcurrentHashMap<String, Pending>()
  private val subscribers = CopyOnWriteArraySet<EventStream>()
  class Pending(val body: String, val latch: CountDownLatch = CountDownLatch(1)) { @Volatile var result = JSONObject().put("status", 503).put("body", "{\"error\":\"phone_unavailable\"}") }
  fun running() = server?.isAlive == true
  fun call(context: Context, method: String, path: String, body: String): JSONObject {
    val id = UUID.randomUUID().toString(); val entry = Pending(body); pending[id] = entry
    try {
      context.startService(Intent(context, PhoneWebBackendService::class.java).putExtra("requestId", id).putExtra("method", method).putExtra("path", path).putExtra("body", ""))
      if (!entry.latch.await(60, TimeUnit.SECONDS)) return JSONObject().put("status", 504).put("body", "{\"error\":\"phone_timeout\"}")
      return entry.result
    } finally { pending.remove(id) }
  }
  fun requestBody(id: String): String = pending[id]?.body ?: ""
  fun resolve(id: String, json: String) { pending[id]?.let { it.result = JSONObject(json); it.latch.countDown() } }
  fun publish(json: String) { subscribers.forEach { if (!it.offer(json)) { it.close(); subscribers.remove(it) } } }
  fun events(): InputStream {
    check(subscribers.size < 8) { "too_many_clients" }
    return EventStream { subscribers.remove(it) }.also { subscribers.add(it); it.offer("{\"type\":\"connected\"}") }
  }
  @Synchronized fun start(context: Context, directory: File, bundle: String) {
    if (running()) return
    require(PhoneWebPackage.verify(directory) == bundle) { "corrupt_package" }
    PhoneWebTransfers.recover(context)
    val candidate = PhoneWebServer(context.applicationContext, directory, bundle)
    try { candidate.start(30_000, true); server = candidate; PhoneWebService.start(context) }
    catch (error: Exception) { candidate.stop(); server = null; throw error }
  }
  @Synchronized fun stop() {
    val previous = server; previous?.stop(); server = null; previous?.stopTransfers()
    subscribers.forEach { it.close() }; subscribers.clear()
    pending.values.forEach { it.latch.countDown() }; pending.clear()
  }
  private class EventStream(val closed: (EventStream) -> Unit) : InputStream() {
    private val queue = ArrayBlockingQueue<String>(128)
    private val open = AtomicBoolean(true)
    private var buffer = ByteArray(0); private var offset = 0
    fun offer(json: String) = open.get() && queue.offer("data: " + json.replace("\n", "") + "\n\n")
    override fun read(): Int { val one = ByteArray(1); return if (read(one, 0, 1) < 0) -1 else one[0].toInt() and 255 }
    override fun read(out: ByteArray, start: Int, count: Int): Int {
      if (count == 0) return 0
      if (!open.get()) return -1
      if (offset == buffer.size) {
        val next = queue.poll(15, TimeUnit.SECONDS) ?: ": heartbeat\n\n"
        if (!open.get()) return -1
        buffer = next.toByteArray(Charsets.UTF_8); offset = 0
      }
      val length = minOf(count, buffer.size - offset); System.arraycopy(buffer, offset, out, start, length); offset += length; return length
    }
    override fun close() { if (open.getAndSet(false)) { queue.offer(": closed\n\n"); closed(this) } }
  }
}

class PhoneWebServer(private val context: Context, private val directory: File, val bundle: String) : NanoHTTPD("0.0.0.0", PhoneWebRuntime.PORT) {
  init {
    setAsyncRunner(object : AsyncRunner {
      val clients = ConcurrentHashMap.newKeySet<ClientHandler>()
      val pool = ThreadPoolExecutor(4, 32, 30, TimeUnit.SECONDS, SynchronousQueue<Runnable>())
      override fun exec(client: ClientHandler) { clients.add(client); try { pool.execute(client) } catch (_: RejectedExecutionException) { clients.remove(client); client.close() } }
      override fun closed(client: ClientHandler) { clients.remove(client) }
      override fun closeAll() { clients.forEach { it.close() }; clients.clear(); pool.shutdownNow() }
    })
  }
  // NanoHTTPD's gzip stream buffers small writes until it closes. SSE stays open.
  override fun useGzipWhenAccepted(response: Response): Boolean =
    response.mimeType?.substringBefore(";") != "text/event-stream" && super.useGzipWhenAccepted(response)
  fun stopTransfers() { PhoneWebTransfers.stopAll(context) }
  fun rootPath(): String = directory.canonicalPath
  private fun json(status: Int, body: String): Response = newFixedLengthResponse(PhoneWebStatus.of(status), "application/json; charset=utf-8", body).apply { addHeader("Cache-Control", "no-store") }
  private fun error(status: Int, code: String) = json(status, JSONObject().put("error", code).toString())
  private fun allowedHost(host: String): Boolean {
    val value = host.substringBefore(":").lowercase()
    if (value == "localhost") return true
    val parts = value.split(".").map { it.toIntOrNull() ?: return false }
    if (parts.size != 4 || parts.any { it !in 0..255 }) return false
    return parts[0] == 10 || parts[0] == 127 || parts[0] == 192 && parts[1] == 168 || parts[0] == 172 && parts[1] in 16..31 || parts[0] == 169 && parts[1] == 254
  }
  private fun body(session: IHTTPSession, limit: Int = 8 * 1048576): String {
    val length = session.headers["content-length"]?.toLongOrNull() ?: throw IllegalArgumentException("length_required")
    require(length in 0..limit.toLong()) { "body_too_large" }
    val bytes = ByteArray(length.toInt()); DataInputStream(session.inputStream).readFully(bytes); return String(bytes, Charsets.UTF_8)
  }
  override fun serve(session: IHTTPSession): Response {
    try {
      if (!allowedHost(session.remoteIpAddress)) return error(403, "lan_only")
      val host = session.headers["host"].orEmpty()
      if (!allowedHost(host)) return error(403, "invalid_host")
      val origin = session.headers["origin"]
      if (origin != null && origin != "http://$host") return error(403, "invalid_origin")
      if (session.headers["sec-fetch-site"] == "cross-site") return error(403, "invalid_origin")
      val path = session.uri
      if (path.startsWith("/api/")) {
        if (session.method !in listOf(Method.GET, Method.HEAD) && session.headers["x-nlc-protocol"] != "1") return error(400, "protocol_required")
        if (path == "/api/v1/events" && session.method == Method.GET) return newChunkedResponse(Response.Status.OK, "text/event-stream", PhoneWebRuntime.events()).apply { addHeader("Cache-Control", "no-store"); addHeader("X-Accel-Buffering", "no") }
        if (path.startsWith("/api/v1/transfers")) return PhoneWebTransfers.serve(context, session, ::body)
        if (path == "/api/v1/bootstrap" && session.method == Method.GET || path == "/api/v1/commands" && session.method == Method.POST || path.startsWith("/api/v1/media/") && session.method in listOf(Method.GET, Method.HEAD)) {
          if (session.method == Method.POST && session.headers["content-type"]?.substringBefore(";") != "application/json") return error(415, "json_required")
          val result = PhoneWebRuntime.call(context, session.method.name, path, if (session.method == Method.POST) body(session) else "")
          if (result.has("uri")) return PhoneWebMedia.serve(context, session, result)
          return json(result.optInt("status", 500), result.optString("body", "{}"))
        }
        return error(404, "unknown_endpoint")
      }
      if (session.method !in listOf(Method.GET, Method.HEAD)) return error(405, "method_not_allowed")
      val decoded = URLDecoder.decode(path, "UTF-8").removePrefix("/")
      if (decoded.split('/').any { it == ".." || it == "." } || decoded.contains('\\') || decoded.contains('\u0000')) return error(400, "invalid_path")
      var file = File(directory, if (decoded.isEmpty()) "index.html" else decoded).canonicalFile
      if (!file.inside(directory)) return error(403, "invalid_path")
      if (!file.isFile && !decoded.substringAfterLast('/').contains('.')) file = File(directory, "index.html")
      if (!file.isFile || file.name == "manifest.json") return error(404, "not_found")
      val html = if (file.name == "index.html") file.readText().replace("__NLC_BUNDLE_ID__", bundle).toByteArray(Charsets.UTF_8) else null
      val length = html?.size?.toLong() ?: file.length()
      val input = if (session.method == Method.HEAD) ByteArrayInputStream(ByteArray(0)) else if (html != null) ByteArrayInputStream(html) else file.inputStream()
      val response = newFixedLengthResponse(Response.Status.OK, mime(file.name), input, length)
      response.addHeader("Cache-Control", if (file.name == "index.html") "no-store" else "public, max-age=31536000, immutable")
      response.addHeader("X-Content-Type-Options", "nosniff"); response.addHeader("Referrer-Policy", "same-origin"); response.addHeader("X-Frame-Options", "DENY")
      return response
    } catch (_: org.json.JSONException) { return error(400, "invalid_json") }
      catch (error: IllegalArgumentException) { return error(400, error.message ?: "invalid_request") }
      catch (_: Exception) { return error(503, "phone_unavailable") }
  }
  private fun mime(name: String) = when (name.substringAfterLast('.').lowercase()) {
    "html" -> "text/html; charset=utf-8"; "js" -> "application/javascript"; "css" -> "text/css"; "json" -> "application/json"; "ttf" -> "font/ttf"; "otf" -> "font/otf"; "woff" -> "font/woff"; "woff2" -> "font/woff2"; "svg" -> "image/svg+xml"; "png" -> "image/png"; "jpg", "jpeg" -> "image/jpeg"; "webp" -> "image/webp"; "ico" -> "image/x-icon"; else -> "application/octet-stream"
  }
}
