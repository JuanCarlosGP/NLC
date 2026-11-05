package app.nlc.lanbridge

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/** Streaming ZIP I/O. Credentials only live in the input plan; never in archive metadata. */
internal object ServiceArchive {
  private const val META = "nlc-service.json"
  private const val HASHES = "nlc-integrity.json"
  private const val MAX_META = 32L * 1024 * 1024
  private const val MAX_FILES = 50000
  private const val BUFFER = 128 * 1024
  private const val IMPORT_MARKER = ".nlc-importing-"
  private data class Child(val uri: Uri, val name: String, val directory: Boolean, val bytes: Long)
  private val cancelled = ConcurrentHashMap.newKeySet<String>()
  private val running = ConcurrentHashMap.newKeySet<String>()
  fun cancel(job: String) { if (running.contains(job)) cancelled.add(job) }
  private fun check(job: String) { if (cancelled.contains(job)) error("cancelled") }
  private fun safePath(path: String): String {
    require(path.length in 1..2048 && !path.contains('\\') && !path.contains('\u0000')) { "format" }
    require(path.split('/').all { it.isNotEmpty() && it != "." && it != ".." && it.length <= 240 }) { "format" }
    return path
  }
  private fun digest() = MessageDigest.getInstance("SHA-256")
  private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
  private fun root(ctx: Context): File = File(ctx.cacheDir, "service-archives").apply { mkdirs() }
  private fun stage(ctx: Context, id: String): File { require(UUID.fromString(id).toString() == id); return File(root(ctx), id) }
  private fun budget(file: File, bytes: Long) { require(bytes <= 512L * 1024 * 1024 * 1024 && file.usableSpace > 32L * 1024 * 1024) { "space" } }
  private fun input(ctx: Context, raw: String, headers: JSONObject? = null, authorize: ((String, Boolean) -> JSONObject)? = null): InputStream {
    val uri = Uri.parse(raw)
    if (uri.scheme == "http" || uri.scheme == "https") {
      val url = URL(raw); require(url.userInfo == null) { "sourceUnreadable" }
      fun connect(values: JSONObject?): HttpURLConnection {
        val conn = url.openConnection() as HttpURLConnection
        conn.connectTimeout = 20000; conn.readTimeout = 30000; conn.instanceFollowRedirects = false
        values?.keys()?.forEach { name -> conn.setRequestProperty(name, values.getString(name)) }
        return conn
      }
      var conn = connect(authorize?.invoke(raw, false) ?: headers)
      try {
        if (conn.responseCode == 401 && authorize != null) { conn.disconnect(); conn = connect(authorize(raw, true)) }
        val active = conn
        require(active.responseCode in 200..299) { "sourceUnreadable" }
        val expected = active.contentLengthLong
        return object : FilterInputStream(active.inputStream) {
          var count = 0L
          override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
            val n = super.read(bytes, offset, length)
            if (n > 0) count += n
            if (n < 0 && expected >= 0 && count != expected) error("integrity")
            return n
          }
          override fun close() { try { super.close() } finally { active.disconnect() } }
        }
      } catch (error: Exception) { conn.disconnect(); throw IOException("sourceUnreadable") }
    }
    require(uri.scheme == "file" || uri.scheme == "content") { "sourceUnreadable" }
    return ctx.contentResolver.openInputStream(uri) ?: error("sourceUnreadable")
  }
  private fun output(ctx: Context, raw: String): OutputStream {
    val uri = Uri.parse(raw); require(uri.scheme == "file" || uri.scheme == "content")
    return ctx.contentResolver.openOutputStream(uri, "wt") ?: error("storage")
  }
  private fun document(ctx: Context, parent: Uri, name: String, mime: String): Uri {
    require(!name.contains('/') && name != "." && name != "..")
    return if (parent.scheme == "file") {
      val file = File(requireNotNull(parent.path), name)
      if (mime == DocumentsContract.Document.MIME_TYPE_DIR) require(file.mkdir()) else require(file.createNewFile())
      Uri.fromFile(file)
    } else DocumentsContract.createDocument(ctx.contentResolver, parent, mime, name) ?: error("storage")
  }
  private fun displayName(ctx: Context, uri: Uri): String {
    if (uri.scheme == "file") return File(requireNotNull(uri.path)).name
    ctx.contentResolver.query(uri, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) return cursor.getString(0).also { safePath(it) }
    }
    error("storage")
  }
  private fun asDocument(uri: Uri): Uri = if (uri.scheme == "content" && DocumentsContract.isTreeUri(uri) && !uri.path.orEmpty().contains("/document/")) DocumentsContract.buildDocumentUriUsingTree(uri, DocumentsContract.getTreeDocumentId(uri)) else uri

  fun list(ctx: Context, raw: String): String {
    val result = JSONArray()
    fun visit(uri: Uri, rel: String, depth: Int) {
      require(depth <= 32 && result.length() <= MAX_FILES) { "size" }
      if (uri.scheme == "file") {
        val file = File(requireNotNull(uri.path)); require(file.canonicalFile == File(file.parentFile!!.canonicalFile, file.name)) { "format" }
        if (file.isDirectory) {
          val children = file.listFiles() ?: error("sourceUnreadable")
          if (children.any { it.name.startsWith(IMPORT_MARKER) }) return
          children.sortedBy { it.name }.forEach { child -> visit(Uri.fromFile(child), if (rel.isEmpty()) child.name else "$rel/${child.name}", depth + 1) }
        } else { require(file.isFile); result.put(JSONObject().put("path", safePath(rel)).put("uri", uri.toString()).put("bytes", file.length())) }
      } else {
        require(uri.scheme == "content")
        val document = asDocument(uri)
        val id = DocumentsContract.getDocumentId(document)
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(document, id)
        val nodes = mutableListOf<Child>()
        ctx.contentResolver.query(children, arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE), null, null, null)?.use { cursor ->
          while (cursor.moveToNext()) {
            require(nodes.size < MAX_FILES) { "size" }
            nodes.add(Child(DocumentsContract.buildDocumentUriUsingTree(document, cursor.getString(0)), cursor.getString(1), cursor.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR, cursor.getLong(3)))
          }
        } ?: error("sourceUnreadable")
        if (nodes.any { it.name.startsWith(IMPORT_MARKER) }) return
        for (child in nodes) {
          val path = if (rel.isEmpty()) child.name else "$rel/${child.name}"; safePath(path)
          if (child.directory) visit(child.uri, path, depth + 1)
          else { require(result.length() < MAX_FILES) { "size" }; result.put(JSONObject().put("path", path).put("uri", child.uri.toString()).put("bytes", child.bytes)) }
        }
      }
    }
    visit(Uri.parse(raw), "", 0); return result.toString()
  }

  @JvmOverloads @Synchronized fun export(ctx: Context, planText: String, progress: (Long, Int) -> Unit, authorize: ((String, String, Boolean) -> JSONObject)? = null): String {
    val plan = JSONObject(planText); val job = plan.getString("job"); val target = plan.getString("destination")
    require(running.add(job)) { "busy" }
    try {
      val files = plan.getJSONArray("files"); require(files.length() <= MAX_FILES) { "size" }
      val metadataUri = plan.getString("metadataUri")
      val sourceAuth: ((String, Boolean) -> JSONObject)? = if (plan.optBoolean("authorize") && authorize != null) { uri, retry -> authorize(job, uri, retry) } else null
      val hashes = JSONObject(); val seen = mutableSetOf<String>(); var total = 0L; var count = 0
      output(ctx, target).buffered(BUFFER).use { stream -> ZipOutputStream(stream).use { zip ->
        zip.setLevel(0) // Media is already compressed; memory stays bounded and cancellation stays responsive.
        fun entry(path: String, source: InputStream, expected: Long = -1, limit: Long = Long.MAX_VALUE) {
          check(job); safePath(path); require(seen.add(path)) { "format" }
          zip.putNextEntry(ZipEntry(path)); val hash = digest(); var size = 0L; val buffer = ByteArray(BUFFER)
          source.use { input -> while (true) { check(job); val n = input.read(buffer); if (n < 0) break; zip.write(buffer, 0, n); hash.update(buffer, 0, n); size += n; total += n; require(size <= limit) { "size" }; if (size % (8L * 1024 * 1024) < BUFFER) progress(total, count) } }
          if (expected > 0) require(size == expected) { "integrity" }
          zip.closeEntry(); hashes.put(path, JSONObject().put("bytes", size).put("sha256", hex(hash.digest()))); count++; progress(total, count)
        }
        entry(META, input(ctx, metadataUri), limit = MAX_META)
        for (i in 0 until files.length()) { val f = files.getJSONObject(i); val path = safePath(f.getString("path")); require(path.startsWith("media/")) { "format" }; entry(path, input(ctx, f.getString("uri"), f.optJSONObject("headers"), sourceAuth), f.optLong("bytes", -1)) }
        check(job)
        val raw = hashes.toString().toByteArray(Charsets.UTF_8); require(raw.size <= MAX_META) { "size" }; zip.putNextEntry(ZipEntry(HASHES)); zip.write(raw); zip.closeEntry()
      } }
      return JSONObject().put("bytes", total).put("files", count - 1).toString()
    } catch (error: Exception) {
      try { val uri = Uri.parse(target); if (uri.scheme == "content") DocumentsContract.deleteDocument(ctx.contentResolver, uri) else File(requireNotNull(uri.path)).delete() } catch (_: Exception) {}
      throw IOException(if (cancelled.contains(job)) "cancelled" else if (error.message in listOf("cancelled", "size", "integrity", "sourceUnreadable", "format")) error.message else "storage")
    } finally { running.remove(job); cancelled.remove(job) }
  }

  @Synchronized fun prepare(ctx: Context, raw: String, job: String, progress: (Long, Int) -> Unit): String {
    require(running.add(job)) { "busy" }; val id = UUID.randomUUID().toString(); val dir = stage(ctx, id)
    try {
      require(dir.mkdirs()) { "storage" }
      // Abandoned previews never become live data; reclaim them on the next import.
      root(ctx).listFiles()?.filter { it.name != id && System.currentTimeMillis() - it.lastModified() > 24L * 3600 * 1000 }?.forEach { it.deleteRecursively() }
      val hashes = JSONObject(); val files = JSONObject(); val seen = mutableSetOf<String>(); var total = 0L; var metadataFound = false; var expected: JSONObject? = null
      input(ctx, raw).buffered(BUFFER).use { stream -> ZipInputStream(stream).use { zip ->
        while (true) {
          check(job); val entry = zip.nextEntry ?: break; val path = safePath(entry.name)
          require(!entry.isDirectory && seen.add(path) && seen.size <= MAX_FILES + 2) { "format" }
          require(path == META || path == HASHES || path.startsWith("media/")) { "format" }
          val file = File(dir, path); require(file.canonicalPath.startsWith(dir.canonicalPath + File.separator)); require(file.parentFile!!.isDirectory || file.parentFile!!.mkdirs())
          val hash = digest(); var size = 0L; val buffer = ByteArray(BUFFER)
          file.outputStream().buffered(BUFFER).use { out -> while (true) { check(job); val n = zip.read(buffer); if (n < 0) break; size += n; total += n; require((path != META && path != HASHES) || size <= MAX_META) { "size" }; budget(dir, total); out.write(buffer, 0, n); hash.update(buffer, 0, n); if (size % (8L * 1024 * 1024) < BUFFER) progress(total, seen.size - 1) } }
          zip.closeEntry()
          if (path.startsWith("media/photos/")) {
            val head = ByteArray(12); val n = file.inputStream().use { it.read(head) }
            val jpeg = n >= 3 && head[0].toInt() and 255 == 255 && head[1].toInt() and 255 == 216 && head[2].toInt() and 255 == 255
            val png = n >= 8 && head.take(8).map { it.toInt() and 255 } == listOf(137,80,78,71,13,10,26,10)
            val webp = n >= 12 && String(head, 0, 4, Charsets.US_ASCII) == "RIFF" && String(head, 8, 4, Charsets.US_ASCII) == "WEBP"
            require((path.endsWith(".jpg") && jpeg) || (path.endsWith(".png") && png) || (path.endsWith(".webp") && webp)) { "format" }
          }
          if (path == HASHES) expected = JSONObject(file.readText()) else hashes.put(path, JSONObject().put("bytes", size).put("sha256", hex(hash.digest())))
          if (path == META) metadataFound = true
          else if (path != HASHES) files.put(path, JSONObject().put("uri", Uri.fromFile(file).toString()).put("bytes", size))
        }
      } }
      require(metadataFound && expected != null && expected!!.length() == hashes.length()) { "integrity" }
      hashes.keys().forEach { path -> val a = hashes.getJSONObject(path); val b = expected!!.getJSONObject(path); require(a.getLong("bytes") == b.getLong("bytes") && a.getString("sha256") == b.getString("sha256")) { "integrity" } }
      progress(total, files.length()); check(job)
      return JSONObject().put("id", id).put("metadataUri", Uri.fromFile(File(dir, META)).toString()).put("files", files).put("bytes", total).toString()
    } catch (error: Exception) { dir.deleteRecursively(); throw IOException(if (error.message in listOf("cancelled", "space", "size")) error.message else "integrity") }
    finally { running.remove(job); cancelled.remove(job) }
  }

  private fun commitJournal(ctx: Context, job: String): File {
    require(Regex("[a-zA-Z0-9_-]{1,100}").matches(job))
    return File(File(ctx.filesDir, "service-commit-journal").apply { mkdirs() }, "$job.json")
  }
  fun pendingCommits(ctx: Context): String = org.json.JSONArray(File(ctx.filesDir, "service-commit-journal").listFiles()?.filter { it.extension == "json" }?.map { it.nameWithoutExtension } ?: emptyList<String>()).toString()
  @Synchronized fun finishCommit(ctx: Context, job: String, keep: Boolean) {
    val journal = commitJournal(ctx, job); if (!journal.isFile) return
    val data = JSONObject(journal.readText()); val target = Uri.parse(data.getString(if (keep) "marker" else "root"))
    // Both URIs were generated by this import, never supplied by a remote client.
    if (target.scheme == "file") { val file = File(requireNotNull(target.path)); if (file.exists()) { if (keep) require(file.delete()) else require(file.deleteRecursively()) } }
    else if (target.scheme == "content") { try {val exists=ctx.contentResolver.query(target,arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID),null,null,null)?.use{it.moveToFirst()}?:false;if(exists)require(DocumentsContract.deleteDocument(ctx.contentResolver,target))} catch (_: java.io.FileNotFoundException) {} }
    else error("storage")
    require(journal.delete())
  }
  @Synchronized fun commit(ctx: Context, id: String, destination: String, job: String, progress: (Long, Int) -> Unit): String {
    require(running.add(job)) { "busy" }; val dir = File(stage(ctx, id), "media"); val name = "NLC-${id.take(8)}"; var created: Uri? = null
    try {
      val root = document(ctx, asDocument(Uri.parse(destination)), name, DocumentsContract.Document.MIME_TYPE_DIR); created = root
      // Only this newly created folder is marked. Incomplete files are never indexed after an interruption.
      val marker = document(ctx, root, "$IMPORT_MARKER$id", "application/octet-stream")
      val journal=commitJournal(ctx,job);val temporary=File(journal.path+".tmp");temporary.writeText(JSONObject().put("root",root.toString()).put("marker",marker.toString()).toString());require(temporary.renameTo(journal)){"storage"}
      val mapped = JSONObject(); val paths = JSONObject(); var total = 0L
      fun copy(file: File, parent: Uri, rel: String, actual: String) {
        check(job)
        if (file.isDirectory) { val next = document(ctx, parent, file.name, DocumentsContract.Document.MIME_TYPE_DIR); val name = displayName(ctx, next); file.listFiles()!!.forEach { copy(it, next, if (rel.isEmpty()) file.name else "$rel/${file.name}", if (actual.isEmpty()) name else "$actual/$name") } }
        else {
          val path = if (rel.isEmpty()) file.name else "$rel/${file.name}"; val extension = file.extension.lowercase()
          val mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "application/x-nlc-$extension"
          val target = document(ctx, parent, file.name, mime)
          val actualName = displayName(ctx, target)
          file.inputStream().use { input -> output(ctx, target.toString()).buffered(BUFFER).use { out -> val buffer = ByteArray(BUFFER); while (true) { check(job); val n = input.read(buffer); if (n < 0) break; out.write(buffer, 0, n); total += n; if (total % (8L * 1024 * 1024) < BUFFER) progress(total, mapped.length()) } } }
          mapped.put("media/$path", target.toString()); paths.put("media/$path", if (actual.isEmpty()) actualName else "$actual/$actualName"); progress(total, mapped.length())
        }
      }
      if (dir.exists()) dir.listFiles()!!.forEach { copy(it, root, "", "") }
      check(job)
      // The marker stays until the matching SQLite receipt commits.
      return JSONObject().put("root", root.toString()).put("name", displayName(ctx, root)).put("files", mapped).put("paths", paths).toString()
    } catch (error: Exception) { created?.let { try { if (it.scheme == "content") DocumentsContract.deleteDocument(ctx.contentResolver, it) else File(requireNotNull(it.path)).deleteRecursively() } catch (_: Exception) {} }; throw IOException(if (error.message == "cancelled") "cancelled" else "storage") }
    finally { running.remove(job); cancelled.remove(job) }
  }
  fun discard(ctx: Context, id: String) { stage(ctx, id).deleteRecursively() }
}
