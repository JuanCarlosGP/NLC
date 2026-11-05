package app.nlc.lanbridge

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import java.io.*
import java.net.HttpURLConnection
import java.net.URL

/** Only called after JS resolves a catalogue identifier or an owned transfer. */
object PhoneWebMedia {
  data class ByteRange(val start: Long, val end: Long)
  fun range(header: String?, length: Long): ByteRange? {
    if (header == null) return null
    require(length > 0 && header.startsWith("bytes=") && !header.contains(',')) { "range" }
    val match = Regex("bytes=(\\d*)-(\\d*)").matchEntire(header) ?: throw IllegalArgumentException("range")
    val first = match.groupValues[1]; val last = match.groupValues[2]
    require(first.isNotEmpty() || last.isNotEmpty()) { "range" }
    val start = if (first.isEmpty()) maxOf(0, length - (last.toLongOrNull() ?: -1).also { require(it > 0) }) else first.toLongOrNull() ?: throw IllegalArgumentException("range")
    val end = if (first.isEmpty() || last.isEmpty()) length - 1 else minOf(length - 1, last.toLongOrNull() ?: throw IllegalArgumentException("range"))
    require(start in 0 until length && end >= start) { "range" }; return ByteRange(start, end)
  }
  fun serve(context: Context, session: NanoHTTPD.IHTTPSession, result: JSONObject): NanoHTTPD.Response {
    val uri = Uri.parse(result.getString("uri")); val type = result.optString("mime", "application/octet-stream")
    if (uri.scheme == "http" || uri.scheme == "https") return proxy(session, result, type)
    var stream: InputStream? = null
    try {
      val length: Long
      if (uri.scheme == "file") { val file = File(uri.path ?: error("missing")); length = file.length(); stream = FileInputStream(file) }
      else if (uri.scheme == "content") {
        val descriptor = context.contentResolver.openAssetFileDescriptor(uri, "r") ?: error("missing")
        var size = descriptor.length
        if (size < 0) context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor -> if (cursor.moveToFirst() && !cursor.isNull(0)) size = cursor.getLong(0) }
        stream = descriptor.createInputStream(); length = size
      } else error("unsupported_media")
      val requested = try { range(session.headers["range"], length) } catch (_: IllegalArgumentException) { stream.close(); return NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.RANGE_NOT_SATISFIABLE, "text/plain", "").apply { addHeader("Content-Range", "bytes */$length") } }
      val start = requested?.start ?: 0; val count = if (requested != null) requested.end - start + 1 else length
      var skipped = 0L
      while (skipped < start) { val step = stream.skip(start - skipped); if (step <= 0) { if (stream.read() < 0) error("short_media"); skipped++ } else skipped += step }
      val input = if (session.method == NanoHTTPD.Method.HEAD) { stream.close(); ByteArrayInputStream(ByteArray(0)) } else stream
      val response = if (count < 0) NanoHTTPD.newChunkedResponse(NanoHTTPD.Response.Status.OK, type, input) else NanoHTTPD.newFixedLengthResponse(if (requested != null) NanoHTTPD.Response.Status.PARTIAL_CONTENT else NanoHTTPD.Response.Status.OK, type, input, count)
      response.addHeader("Accept-Ranges", "bytes"); response.addHeader("Cache-Control", "no-store")
      if (requested != null) response.addHeader("Content-Range", "bytes ${requested.start}-${requested.end}/$length")
      return response
    } catch (_: Exception) { stream?.close(); return NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.NOT_FOUND, "text/plain", "media_unavailable") }
  }
  private fun proxy(session: NanoHTTPD.IHTTPSession, result: JSONObject, type: String): NanoHTTPD.Response {
    var url = URL(result.getString("uri")); val original = url
    repeat(4) {
      val connection = url.openConnection() as HttpURLConnection
      connection.instanceFollowRedirects = false; connection.connectTimeout = 15000; connection.readTimeout = 30000; connection.requestMethod = "GET"
      val headers = result.optJSONObject("headers") ?: JSONObject()
      for (key in headers.keys()) if (!key.equals("host", true)) connection.setRequestProperty(key, headers.getString(key))
      val probe = session.method == NanoHTTPD.Method.HEAD && session.headers["range"] == null
      if (probe) connection.setRequestProperty("Range", "bytes=0-0") else session.headers["range"]?.let { connection.setRequestProperty("Range", it) }
      connection.setRequestProperty("Accept-Encoding", "identity")
      val code = connection.responseCode
      if (code in listOf(301, 302, 303, 307, 308)) {
        val next = URL(url, connection.getHeaderField("Location")); connection.disconnect()
        // Stored NAS credentials never follow a redirect to a different authority.
        require(next.protocol == original.protocol && next.host == original.host && next.port == original.port) { "redirect" }; url = next
      } else {
        val length = if (probe && code == 206) connection.getHeaderField("Content-Range")?.substringAfterLast('/')?.toLongOrNull() ?: connection.contentLengthLong else connection.contentLengthLong
        val input = if (session.method == NanoHTTPD.Method.HEAD || code >= 400) ByteArrayInputStream(ByteArray(0)) else object : FilterInputStream(connection.inputStream) { override fun close() { try { super.close() } finally { connection.disconnect() } } }
        val status = NanoHTTPD.Response.Status.lookup(if (probe && code == 206) 200 else code) ?: NanoHTTPD.Response.Status.INTERNAL_ERROR
        val response = if (length >= 0) NanoHTTPD.newFixedLengthResponse(status, connection.contentType ?: type, input, if (code >= 400) 0 else length) else NanoHTTPD.newChunkedResponse(status, connection.contentType ?: type, input)
        for (name in if (probe) listOf("Accept-Ranges") else listOf("Content-Range", "Accept-Ranges")) connection.getHeaderField(name)?.let { response.addHeader(name, it) }
        response.addHeader("Cache-Control", "no-store"); if (session.method == NanoHTTPD.Method.HEAD || code >= 400) connection.disconnect(); return response
      }
    }
    error("redirect")
  }
}
