package app.nlc.lanbridge

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.security.MessageDigest
import java.util.Collections
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min

object LanBridgeServer {
  private const val TAG = "NlcLanBridge"
  private const val JSON_TIMEOUT_MS = 25_000L
  private const val STREAM_SETUP_MS = 20_000L

  @Volatile private var token: String = ""
  @Volatile private var boundPort: Int = 0
  private val running = AtomicBoolean(false)
  private var serverSocket: ServerSocket? = null
  private val pool = Executors.newCachedThreadPool()

  fun start(port: Int, bearer: String, onRequest: (String, String, String, String, String?) -> Unit): Int {
    stop()
    token = bearer
    val socket = ServerSocket(if (port > 0) port else 0)
    socket.reuseAddress = true
    serverSocket = socket
    boundPort = socket.localPort
    running.set(true)
    Thread({
      while (running.get()) {
        try {
          val client = socket.accept()
          pool.execute { handleClient(client, onRequest) }
        } catch (_: Exception) {
          if (!running.get()) break
        }
      }
    }, "nlc-lan-accept").start()
    return boundPort
  }

  fun stop() {
    running.set(false)
    try {
      serverSocket?.close()
    } catch (_: Exception) {
    }
    serverSocket = null
    boundPort = 0
  }

  fun startForeground(context: Context) {
    val intent = Intent(context, LanBridgeService::class.java)
    if (Build.VERSION.SDK_INT >= 26) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }

  fun stopForeground(context: Context) {
    context.stopService(Intent(context, LanBridgeService::class.java))
  }

  fun lanAddress(): String {
    try {
      val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
      for (intf in interfaces) {
        if (!intf.isUp || intf.isLoopback) continue
        val name = intf.name.lowercase()
        val addrs = Collections.list(intf.inetAddresses).filterIsInstance<Inet4Address>()
        val site = addrs.firstOrNull { it.isSiteLocalAddress } ?: continue
        if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("eth")) {
          return site.hostAddress ?: continue
        }
      }
      for (intf in interfaces) {
        if (!intf.isUp || intf.isLoopback) continue
        val site = Collections.list(intf.inetAddresses)
          .filterIsInstance<Inet4Address>()
          .firstOrNull { it.isSiteLocalAddress }
        if (site != null) return site.hostAddress ?: continue
      }
    } catch (_: Exception) {
    }
    return "0.0.0.0"
  }

  fun postPair(host: String, port: Int, token: String, jsonBody: String): String {
    val name = if (host.contains(":") && !host.startsWith("[")) "[$host]" else host
    val url = URL("http://$name:$port/pair")
    val conn = (url.openConnection() as HttpURLConnection).apply {
      connectTimeout = 8_000
      readTimeout = 8_000
      requestMethod = "POST"
      doOutput = true
      setRequestProperty("Authorization", "Bearer $token")
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Accept", "application/json")
    }
    try {
      conn.outputStream.use { it.write(jsonBody.toByteArray(Charsets.UTF_8)) }
      val code = conn.responseCode
      val stream = if (code >= 400) conn.errorStream else conn.inputStream
      val text = stream?.bufferedReader(Charsets.UTF_8)?.readText().orEmpty()
      if (code !in 200..299) {
        throw IllegalStateException("pair $code ${text.ifBlank { url.toString() }}")
      }
      return text
    } catch (error: Exception) {
      if (error is IllegalStateException) throw error
      throw IllegalStateException("pair ${url}: ${error.message ?: error.javaClass.simpleName}")
    } finally {
      conn.disconnect()
    }
  }

  private fun handleClient(socket: Socket, onRequest: (String, String, String, String, String?) -> Unit) {
    socket.soTimeout = 30_000
    try {
      val remote = socket.inetAddress
      if (!isLan(remote)) {
        writeStatus(socket.getOutputStream(), 403, "application/json", """{"error":"lan_only"}""")
        return
      }
      val parsed = readHeaders(socket.getInputStream()) ?: return
      if (!bearerOk(parsed.headers["authorization"])) {
        writeStatus(socket.getOutputStream(), 401, "application/json", """{"error":"unauthorized"}""")
        return
      }
      val method = parsed.method.uppercase()
      if (method != "GET" && method != "HEAD") {
        writeStatus(socket.getOutputStream(), 405, "application/json", """{"error":"method"}""")
        return
      }
      val path = parsed.path
      val query = parsed.query
      val range = parsed.headers["range"]
      val id = UUID.randomUUID().toString()
      if (path == "/v1/stream" || path.startsWith("/v1/stream/")) {
        onRequest(id, method, path, query, range)
        val result = NlcLanBridgeModule.awaitStream(id, STREAM_SETUP_MS)
        if (result.uri.isNullOrBlank() || result.error != null) {
          val status = result.status
          val msg = result.error ?: "stream"
          writeStatus(socket.getOutputStream(), status, "application/json", """{"error":${NlcLanBridgeModule.jsonString(msg)}}""")
          return
        }
        proxyStream(socket, method, result.uri!!, result.headersJson, range)
        return
      }
      onRequest(id, method, path, query, range)
      val json = NlcLanBridgeModule.awaitJson(id, JSON_TIMEOUT_MS)
      writeStatus(socket.getOutputStream(), json.status, "application/json; charset=utf-8", json.body, method == "HEAD")
    } catch (error: Exception) {
      Log.w(TAG, "client", error)
    } finally {
      try {
        socket.close()
      } catch (_: Exception) {
      }
    }
  }

  private fun proxyStream(socket: Socket, method: String, uri: String, headersJson: String, range: String?) {
    val out = socket.getOutputStream()
    when {
      uri.startsWith("data:", ignoreCase = true) -> {
        writeStatus(out, 415, "application/json", """{"error":"data_uri"}""")
      }
      uri.startsWith("file:", ignoreCase = true) || uri.startsWith("/") -> {
        proxyFile(out, method, uri, range)
      }
      uri.startsWith("content:", ignoreCase = true) -> {
        writeStatus(out, 415, "application/json", """{"error":"content_uri"}""")
      }
      else -> proxyHttp(out, method, uri, headersJson, range)
    }
  }

  private fun extraHeaders(headersJson: String): Map<String, String> {
    val map = mutableMapOf<String, String>()
    try {
      val json = JSONObject(if (headersJson.isBlank()) "{}" else headersJson)
      val keys = json.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        map[key] = json.optString(key)
      }
    } catch (_: Exception) {
    }
    return map
  }

  private fun proxyHttp(out: OutputStream, method: String, uri: String, headersJson: String, range: String?) {
    val connection = URL(uri).openConnection() as HttpURLConnection
    connection.instanceFollowRedirects = true
    connection.connectTimeout = 15_000
    connection.readTimeout = 0
    connection.requestMethod = "GET"
    connection.setRequestProperty("Accept-Encoding", "identity")
    for ((key, value) in extraHeaders(headersJson)) {
      connection.setRequestProperty(key, value)
    }
    if (!range.isNullOrBlank()) connection.setRequestProperty("Range", range)
    val code = try {
      connection.responseCode
    } catch (error: Exception) {
      writeStatus(out, 502, "application/json", """{"error":${NlcLanBridgeModule.jsonString(error.message ?: "upstream")}}""")
      return
    }
    val input = try {
      if (code in 200..299 || code == 206) connection.inputStream else connection.errorStream
    } catch (_: Exception) {
      null
    }
    val type = connection.contentType ?: "application/octet-stream"
    val headers = StringBuilder()
    headers.append("HTTP/1.1 $code ${connection.responseMessage ?: ""}\r\n")
    headers.append("Content-Type: $type\r\n")
    headers.append("Connection: close\r\n")
    val length = connection.contentLengthLong
    if (length >= 0) headers.append("Content-Length: $length\r\n")
    val contentRange = connection.getHeaderField("Content-Range")
    if (!contentRange.isNullOrBlank()) headers.append("Content-Range: $contentRange\r\n")
    val acceptRanges = connection.getHeaderField("Accept-Ranges")
    if (!acceptRanges.isNullOrBlank()) headers.append("Accept-Ranges: $acceptRanges\r\n")
    headers.append("\r\n")
    out.write(headers.toString().toByteArray(Charsets.US_ASCII))
    if (method != "HEAD" && input != null) {
      copyStream(input, out)
    }
    connection.disconnect()
  }

  private fun proxyFile(out: OutputStream, method: String, uri: String, range: String?) {
    val path = if (uri.startsWith("file:", ignoreCase = true)) {
      Uri.parse(uri).path ?: uri.removePrefix("file://")
    } else {
      uri
    }
    val file = File(path)
    if (!file.isFile) {
      writeStatus(out, 404, "application/json", """{"error":"not_found"}""")
      return
    }
    val total = file.length()
    var start = 0L
    var end = total - 1
    var code = 200
    if (!range.isNullOrBlank() && range.startsWith("bytes=")) {
      val spec = range.removePrefix("bytes=")
      val from = spec.substringBefore("-", "")
      val to = spec.substringAfter("-", "")
      if (from.isNotEmpty()) start = from.toLongOrNull() ?: 0
      if (to.isNotEmpty()) end = to.toLongOrNull() ?: end
      if (start > end || start >= total) {
        writeStatus(out, 416, "application/json", """{"error":"range"}""")
        return
      }
      code = 206
    }
    val length = end - start + 1
    val headers = StringBuilder()
    headers.append("HTTP/1.1 $code ${if (code == 206) "Partial Content" else "OK"}\r\n")
    headers.append("Content-Type: application/octet-stream\r\n")
    headers.append("Accept-Ranges: bytes\r\n")
    headers.append("Content-Length: $length\r\n")
    if (code == 206) headers.append("Content-Range: bytes $start-$end/$total\r\n")
    headers.append("Connection: close\r\n\r\n")
    out.write(headers.toString().toByteArray(Charsets.US_ASCII))
    if (method == "HEAD") return
    FileInputStream(file).use { raw ->
      raw.skip(start)
      val buf = ByteArray(16_384)
      var left = length
      while (left > 0) {
        val n = raw.read(buf, 0, min(buf.size.toLong(), left).toInt())
        if (n <= 0) break
        out.write(buf, 0, n)
        left -= n
      }
    }
  }

  private fun copyStream(input: InputStream, out: OutputStream) {
    val buf = ByteArray(16_384)
    val wrapped = BufferedInputStream(input)
    while (true) {
      val n = wrapped.read(buf)
      if (n <= 0) break
      out.write(buf, 0, n)
    }
    out.flush()
  }

  private fun bearerOk(header: String?): Boolean {
    if (token.isEmpty() || header.isNullOrBlank()) return false
    val prefix = "Bearer "
    if (!header.startsWith(prefix, ignoreCase = true)) return false
    val got = header.substring(prefix.length).trim().toByteArray(Charsets.UTF_8)
    val want = token.toByteArray(Charsets.UTF_8)
    if (got.size != want.size) return false
    return MessageDigest.isEqual(got, want)
  }

  private fun isLan(addr: InetAddress): Boolean {
    return addr.isLoopbackAddress || addr.isSiteLocalAddress || addr.isLinkLocalAddress
  }

  private data class Parsed(
    val method: String,
    val path: String,
    val query: String,
    val headers: Map<String, String>,
  )

  private fun readHeaders(input: InputStream): Parsed? {
    val buf = ByteArrayOutputStream()
    var prev = 0
    var count = 0
    while (count < 65_536) {
      val b = input.read()
      if (b < 0) return null
      buf.write(b)
      count++
      if (prev == '\r'.code && b == '\n'.code) {
        val bytes = buf.toByteArray()
        if (bytes.size >= 4 &&
          bytes[bytes.size - 4] == '\r'.code.toByte() &&
          bytes[bytes.size - 3] == '\n'.code.toByte() &&
          bytes[bytes.size - 2] == '\r'.code.toByte() &&
          bytes[bytes.size - 1] == '\n'.code.toByte()
        ) {
          break
        }
      }
      prev = b
    }
    val text = buf.toString(Charsets.ISO_8859_1)
    val lines = text.split("\r\n")
    if (lines.isEmpty()) return null
    val parts = lines[0].split(" ")
    if (parts.size < 2) return null
    val target = parts[1]
    val rawPath = target.substringBefore("?")
    val rawQuery = if (target.contains("?")) target.substringAfter("?") else ""
    val headers = mutableMapOf<String, String>()
    for (i in 1 until lines.size) {
      val line = lines[i]
      if (line.isEmpty()) break
      val idx = line.indexOf(':')
      if (idx <= 0) continue
      headers[line.substring(0, idx).trim().lowercase()] = line.substring(idx + 1).trim()
    }
    return Parsed(parts[0], rawPath, rawQuery, headers)
  }

  private fun writeStatus(out: OutputStream, status: Int, type: String, body: String, headOnly: Boolean = false) {
    val bytes = body.toByteArray(Charsets.UTF_8)
    val reason = when (status) {
      200 -> "OK"
      401 -> "Unauthorized"
      403 -> "Forbidden"
      404 -> "Not Found"
      405 -> "Method Not Allowed"
      415 -> "Unsupported Media Type"
      416 -> "Range Not Satisfiable"
      501 -> "Not Implemented"
      502 -> "Bad Gateway"
      504 -> "Gateway Timeout"
      else -> "Error"
    }
    val headers =
      "HTTP/1.1 $status $reason\r\nContent-Type: $type\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
    out.write(headers.toByteArray(Charsets.US_ASCII))
    if (!headOnly) out.write(bytes)
    out.flush()
  }
}
