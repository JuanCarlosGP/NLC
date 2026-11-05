package app.nlc.lanbridge

import android.content.Context
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import java.io.*
import java.util.concurrent.ConcurrentHashMap

/** Files never enter JSON or the React Native bridge. Only owned IDs are accepted. */
object PhoneWebTransfers {
  private val locks = ConcurrentHashMap<String, Any>()
  fun recover(context: Context) {
    root(context).listFiles()?.filter { it.extension == "json" }?.forEach { record ->
      try {
        val data = JSONObject(record.readText()); val id = data.getString("id")
        if (data.optString("status") == "processing") { data.put("status", "error").put("error", "interrupted_operation_reload"); write(context, id, data) }
        if (System.currentTimeMillis() - data.optLong("createdAt") > 24L * 3600 * 1000 && data.optString("status") != "processing") {
          file(context, id).delete(); val result = data.optString("resultUri"); if (result.isNotBlank()) File(android.net.Uri.parse(result).path!!).takeIf { it.inside(context.cacheDir) }?.delete(); record.delete()
        }
      } catch (_: Exception) { /* A corrupt owned job is never treated as a completed transfer. */ }
    }
  }
  fun interrupted(context: Context): String {
    val jobs = org.json.JSONArray()
    root(context).listFiles()?.filter { it.extension == "json" }?.forEach { record -> try { val data = JSONObject(record.readText()); if(data.optString("error") == "interrupted_operation_reload") jobs.put(JSONObject().put("id",data.getString("id")).put("action",data.optString("action")).put("healthAction",data.optJSONObject("private")?.optString("healthAction"))) } catch (_: Exception) {} }
    return jobs.toString()
  }
  fun stopAll(context: Context) {
    root(context).listFiles()?.filter { it.extension == "json" }?.forEach { record ->
      try { val data = JSONObject(record.readText()); val id = data.getString("id"); synchronized(locks.getOrPut(id) { Any() }) { val current=read(context,id); if (current.optString("status") in listOf("processing", "uploading") && current.optString("phase") != "committing") { ServiceArchive.cancel(id); current.put("status", "cancelled"); write(context, id, current); file(context, id).delete() } } } catch (_: Exception) {}
    }
  }
  private val validId = Regex("[a-zA-Z0-9_-]{16,80}")
  private fun root(context: Context) = File(context.cacheDir, "phone-web-transfers").apply { mkdirs() }
  private fun metadata(context: Context, id: String): File { require(validId.matches(id)) { "invalid_transfer" }; return File(root(context), "$id.json") }
  fun read(context: Context, id: String): JSONObject = JSONObject(metadata(context, id).readText())
  fun write(context: Context, id: String, data: JSONObject) { val file = metadata(context, id); val temporary = File(file.path + ".tmp"); temporary.writeText(data.toString()); check(temporary.renameTo(file)) { "storage" } }
  fun file(context: Context, id: String): File { metadata(context, id); return File(root(context), "$id.bin") }
  fun resolve(context: Context, id: String): Map<String, Any?> = synchronized(locks.getOrPut(id) { Any() }) {
    val data = read(context, id); require(data.getString("status") !in listOf("cancelled", "error")) { "transfer_unavailable" }
    mapOf("uri" to (data.optString("resultUri").ifBlank { android.net.Uri.fromFile(file(context, id)).toString() }), "state" to data.toString())
  }
  fun createEmpty(context:Context,id:String,name:String) = synchronized(locks.getOrPut(id){Any()}) {
    require(validId.matches(id));check(!metadata(context,id).exists());file(context,id).createNewFile();write(context,id,JSONObject().put("id",id).put("name",name).put("bytes",0).put("offset",0).put("status","uploaded").put("createdAt",System.currentTimeMillis()))
  }
  fun cancelJob(context:Context,id:String): JSONObject = synchronized(locks.getOrPut(id){Any()}) {
    val data=read(context,id);check(data.optString("phase")!="committing"){"commit_started"};data.put("status","cancelled");write(context,id,data);file(context,id).delete();ServiceArchive.cancel(id);return@synchronized data
  }
  fun claimCommit(context:Context,id:String) = synchronized(locks.getOrPut(id){Any()}) {
    val data=read(context,id);check(data.optString("status")=="processing"){"cancelled"};data.put("phase","committing");write(context,id,data)
  }
  fun update(context: Context, id: String, raw: String) = synchronized(locks.getOrPut(id) { Any() }) {
    val patch = JSONObject(raw); val data = read(context, id)
    if (data.getString("status") == "cancelled") return@synchronized
    for (key in patch.keys()) { require(key in listOf("status", "progress", "error", "resultUri", "result", "name", "bytes", "mime", "private", "service", "action", "phase")); data.put(key, patch.get(key)) }
    if (data.has("resultUri")) require(File(android.net.Uri.parse(data.getString("resultUri")).path!!).inside(context.cacheDir)) { "invalid_transfer" }
    write(context, id, data); PhoneWebRuntime.publish(JSONObject().put("type", "transfer").put("id", id).toString())
  }
  private fun publicData(data: JSONObject): JSONObject = JSONObject(data.toString()).apply { put("downloadAvailable",has("resultUri") && optString("status")=="complete"); remove("resultUri"); remove("private") }
  fun serve(context: Context, session: NanoHTTPD.IHTTPSession, body: (NanoHTTPD.IHTTPSession, Int) -> String): NanoHTTPD.Response {
    fun response(status: Int, data: JSONObject) = NanoHTTPD.newFixedLengthResponse(PhoneWebStatus.of(status), "application/json", data.toString()).apply { addHeader("Cache-Control", "no-store") }
    val parts = session.uri.removePrefix("/api/v1/transfers").trim('/').split('/').filter { it.isNotEmpty() }
    if (parts.isEmpty() && session.method == NanoHTTPD.Method.POST) {
      val input = JSONObject(body(session, 16384)); val id = input.getString("id"); val length = input.getLong("bytes"); val name = input.getString("name").substringAfterLast('/').substringAfterLast('\\').take(240)
      require(validId.matches(id) && length in 0..512L*1024*1024*1024 && name.isNotBlank()) { "invalid_transfer" }
      synchronized(locks.getOrPut(id) { Any() }) {
        if (metadata(context, id).exists()) {
          val existing = read(context, id); require(existing.getLong("bytes") == length && existing.getString("name") == name) { "request_id_reused" }; return response(200, publicData(existing))
        }
        if (root(context).usableSpace < length + 64L*1024*1024) return response(507, JSONObject().put("error", "space"))
        val data = JSONObject().put("id", id).put("name", name).put("bytes", length).put("offset", 0).put("status", if (length == 0L) "uploaded" else "uploading").put("createdAt", System.currentTimeMillis())
        write(context, id, data); file(context, id).createNewFile(); return response(201, publicData(data))
      }
    }
    if (parts.isEmpty() && session.method == NanoHTTPD.Method.GET) {
      val array = org.json.JSONArray(); root(context).listFiles()?.filter { it.extension == "json" }?.forEach { try { array.put(publicData(JSONObject(it.readText()))) } catch (_: Exception) {} }; return response(200, JSONObject().put("items", array))
    }
    if (parts.isEmpty()) return response(405, JSONObject().put("error", "method_not_allowed"))
    val id = parts[0]; require(validId.matches(id)) { "invalid_transfer" }
    synchronized(locks.getOrPut(id) { Any() }) {
      val data = try { read(context, id) } catch (_: FileNotFoundException) { return response(404, JSONObject().put("error", "unknown_transfer")) }
      if (parts.size == 2 && parts[1] == "download" && session.method in listOf(NanoHTTPD.Method.GET, NanoHTTPD.Method.HEAD)) {
        if (data.optString("status") != "complete" || !data.has("resultUri")) return response(409, JSONObject().put("error", "transfer_not_ready"))
        val resultFile = File(android.net.Uri.parse(data.getString("resultUri")).path!!)
        if (!resultFile.isFile) return response(410, JSONObject().put("error", "transfer_expired"))
        return PhoneWebMedia.serve(context, session, JSONObject().put("uri", data.getString("resultUri")).put("mime", data.optString("mime", "application/zip"))).apply { addHeader("Content-Disposition", "attachment; filename*=UTF-8''" + java.net.URLEncoder.encode(data.getString("name"), "UTF-8").replace("+", "%20")) }
      }
      if (parts.size != 1) return response(404, JSONObject().put("error", "unknown_endpoint"))
      if (session.method == NanoHTTPD.Method.GET) return response(200, publicData(data))
      if (session.method == NanoHTTPD.Method.DELETE) {
        if (data.optString("status") == "processing" && data.optString("phase") == "committing") return response(409, JSONObject().put("error", "commit_started"))
        data.put("status", "cancelled"); write(context, id, data); file(context, id).delete()
        data.optJSONObject("private")?.optJSONObject("stage")?.optString("id")?.takeIf { it.isNotBlank() }?.let { try { ServiceArchive.discard(context, it) } catch (_: Exception) {} }
        val result = data.optString("resultUri"); if (result.isNotBlank()) File(android.net.Uri.parse(result).path!!).takeIf { it.inside(context.cacheDir) }?.delete()
        ServiceArchive.cancel(id); PhoneWebRuntime.publish(JSONObject().put("type", "transfer").put("id", id).toString()); return response(200, publicData(data))
      }
      if (session.method == NanoHTTPD.Method.PUT) {
        val incoming=session.headers["content-length"]?.toLongOrNull()?:throw IllegalArgumentException("length_required")
        require(incoming in 1..8L*1024*1024){"chunk_too_large"}
        fun discardBody(){val buffer=ByteArray(65536);var remaining=incoming;while(remaining>0){val count=session.inputStream.read(buffer,0,minOf(buffer.size.toLong(),remaining).toInt());if(count<0)throw EOFException();remaining-=count}}
        if(data.optString("status")!="uploading"){discardBody();return response(409,publicData(data).put("error","transfer_not_writable"))}
        val offset = session.headers["x-nlc-offset"]?.toLongOrNull() ?: throw IllegalArgumentException("offset_required")
        if (offset != data.getLong("offset")) {discardBody();return response(409, publicData(data).put("error", "offset_mismatch"))}
        val length = session.headers["content-length"]?.toLongOrNull() ?: throw IllegalArgumentException("length_required")
        require(length in 1..8L*1024*1024 && offset + length <= data.getLong("bytes")) { "chunk_too_large" }
        if (root(context).usableSpace < length + 16L*1024*1024) {discardBody();return response(507, JSONObject().put("error", "space"))}
        RandomAccessFile(file(context, id), "rw").use { out ->
          out.seek(offset); val buffer = ByteArray(65536); var remaining = length
          try {
            while (remaining > 0) { check(PhoneWebRuntime.running()) { "cancelled" }; val count = session.inputStream.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt()); if (count < 0) throw EOFException(); out.write(buffer, 0, count); remaining -= count }
            out.fd.sync()
          } catch (error: Exception) { out.setLength(offset); throw error }
        }
        data.put("offset", offset + length); if (offset + length == data.getLong("bytes")) data.put("status", "uploaded"); write(context, id, data); return response(200, publicData(data))
      }
      return response(405, JSONObject().put("error", "method_not_allowed"))
    }
  }
}
