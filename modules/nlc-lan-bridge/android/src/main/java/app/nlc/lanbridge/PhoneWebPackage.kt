package app.nlc.lanbridge

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipInputStream

object PhoneWebPackage {
  private fun sha(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
  fun verify(directory: File): String {
    val manifest = JSONObject(File(directory, "manifest.json").readText())
    require(manifest.getInt("protocol") == 1) { "incompatible_package" }
    val files = manifest.getJSONArray("files"); val canonical = ArrayList<String>(); val listed = HashSet<String>()
    for (index in 0 until files.length()) {
      val row = files.getJSONObject(index); val path = row.getString("path"); require(listed.add(path) && path != "manifest.json")
      val file = File(directory, path).canonicalFile; require(file.inside(directory) && file.isFile && file.length() == row.getLong("bytes"))
      val digest = MessageDigest.getInstance("SHA-256"); file.inputStream().use { stream -> val buf = ByteArray(65536); while (true) { val read = stream.read(buf); if (read < 0) break; digest.update(buf, 0, read) } }
      val hash = digest.digest().joinToString("") { "%02x".format(it) }; require(hash == row.getString("sha256")) { "corrupt_package" }
      canonical.add("$path\t$hash\t${file.length()}")
    }
    require(File(directory, "index.html").isFile && directory.walkTopDown().count { it.isFile } == files.length() + 1)
    val bundle = sha(canonical.joinToString("\n").toByteArray()); require(bundle == manifest.getString("bundleId"))
    return bundle
  }
  fun install(context: Context, uri: String): Map<String, String> {
    val parent = File(context.filesDir, "phone-web").apply { mkdirs() }
    val stage = File(parent, ".stage-${UUID.randomUUID()}").apply { mkdirs() }
    try {
      var total = 0L; var count = 0
      val parsed = Uri.parse(uri)
      val assetName = if (parsed.scheme == "asset") parsed.path.orEmpty().trimStart('/') else if (parsed.path.orEmpty().startsWith("/android_asset/")) parsed.path!!.removePrefix("/android_asset/") else null
      val input = if (assetName != null) {
        try { context.assets.open(assetName) } catch (_: java.io.FileNotFoundException) {
          val id = context.resources.getIdentifier(assetName.substringAfterLast('/').substringBeforeLast('.'), "raw", context.packageName)
          require(id != 0) { "missing_package" }; context.resources.openRawResource(id)
        }
      } else context.contentResolver.openInputStream(parsed) ?: error("missing_package")
      ZipInputStream(input.buffered()).use { zip ->
        while (true) {
          val entry = zip.nextEntry ?: break; val name = entry.name
          require(++count <= 20000 && !name.startsWith('/') && !name.contains('\\') && name.split('/').none { it == ".." || it == "." }) { "invalid_package" }
          val file = File(stage, name).canonicalFile; require(file.inside(stage))
          if (!entry.isDirectory) { require(!file.exists()); file.parentFile?.mkdirs(); file.outputStream().use { out -> val buffer = ByteArray(65536); while (true) { val read = zip.read(buffer); if (read < 0) break; total += read; require(total <= 128L * 1024 * 1024) { "package_too_large" }; out.write(buffer, 0, read) } } }
          zip.closeEntry()
        }
      }
      val bundle = verify(stage)
      val destination = File(parent, bundle)
      if (destination.exists()) stage.deleteRecursively()
      else require(stage.renameTo(destination)) { "storage" }
      // An active old package remains readable until its server is restarted.
      parent.listFiles()?.filter { it.isDirectory && it.name != bundle && it.canonicalPath != PhoneWebRuntime.server?.rootPath() }?.sortedByDescending { it.lastModified() }?.drop(1)?.forEach { it.deleteRecursively() }
      return mapOf("directory" to destination.absolutePath, "bundleId" to bundle)
    } finally { if (stage.exists()) stage.deleteRecursively() }
  }
}

// java.nio.file.Path is unavailable on supported Android 7 devices.
internal fun File.inside(parent: File): Boolean {
 val base = parent.canonicalPath
 val candidate = canonicalPath
 return candidate == base || candidate.startsWith(base + File.separator)
}
