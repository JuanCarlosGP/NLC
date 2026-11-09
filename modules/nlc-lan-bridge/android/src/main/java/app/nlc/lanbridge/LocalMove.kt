package app.nlc.lanbridge

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.provider.DocumentsContract
import android.system.Os
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Durable copy -> verified references -> original cleanup. Never overwrites a user file. */
internal object LocalMove {
  private val services = listOf("music", "podcast", "video", "focus", "wealth", "health")
  private const val BUFFER = 128 * 1024
  private const val ACTIVE = "local_move_active"
  private val running = ConcurrentHashMap.newKeySet<String>()
  private val cancelled = ConcurrentHashMap.newKeySet<String>()
  private data class Node(val uri: String, val name: String, val dir: Boolean, val bytes: Long)
  private data class Hash(val sha: String, val bytes: Long)
  private data class Entry(val key: String, val service: String, val source: String, val identity: String, val relative: String, val bytes: Long, val hash: String, val destination: String?, val path: String?, val verified: Boolean, val same: Boolean, val remove: Boolean, val cleaned: Boolean, val owned: Boolean)
  private fun base(ctx: Context) = File(ctx.filesDir, "local-moves").apply { mkdirs() }
  private fun dir(ctx: Context, id: String): File { require(UUID.fromString(id).toString() == id); return File(base(ctx), id) }
  private fun db(ctx: Context, id: String): SQLiteDatabase {
    val folder = dir(ctx, id).apply { mkdirs() }
    return SQLiteDatabase.openOrCreateDatabase(File(folder, "journal.db"), null).apply {
      execSQL("PRAGMA synchronous = FULL")
      execSQL("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
      execSQL("CREATE TABLE IF NOT EXISTS files (key TEXT PRIMARY KEY, service TEXT NOT NULL, source TEXT NOT NULL, identity TEXT NOT NULL, relative TEXT NOT NULL, bytes INTEGER NOT NULL, hash TEXT NOT NULL, destination TEXT, path TEXT, verified INTEGER DEFAULT 0, same_file INTEGER DEFAULT 0, remove_source INTEGER DEFAULT 1, cleaned INTEGER DEFAULT 0, owned INTEGER DEFAULT 0)")
      execSQL("CREATE TABLE IF NOT EXISTS refs (ref TEXT PRIMARY KEY, file_key TEXT NOT NULL)")
      execSQL("CREATE INDEX IF NOT EXISTS refs_file_key ON refs(file_key)")
      execSQL("CREATE TABLE IF NOT EXISTS dirs (key TEXT PRIMARY KEY, uri TEXT NOT NULL, path TEXT NOT NULL)")
    }
  }
  private fun get(db: SQLiteDatabase, key: String): String? = db.rawQuery("SELECT value FROM meta WHERE key=?", arrayOf(key)).use { if (it.moveToFirst()) it.getString(0) else null }
  private fun put(db: SQLiteDatabase, key: String, value: String) = db.execSQL("INSERT OR REPLACE INTO meta VALUES (?,?)", arrayOf(key, value))
  private fun entries(db: SQLiteDatabase): List<Entry> = db.rawQuery("SELECT key,service,source,identity,relative,bytes,hash,destination,path,verified,same_file,remove_source,cleaned,owned FROM files ORDER BY rowid", null).use { c -> buildList { while (c.moveToNext()) add(Entry(c.getString(0),c.getString(1),c.getString(2),c.getString(3),c.getString(4),c.getLong(5),c.getString(6),if(c.isNull(7))null else c.getString(7),if(c.isNull(8))null else c.getString(8),c.getInt(9)==1,c.getInt(10)==1,c.getInt(11)==1,c.getInt(12)==1,c.getInt(13)==1)) } }
  fun cancel(id: String) { if (running.contains(id)) cancelled.add(id) }
  private fun check(id: String) { if (cancelled.contains(id)) error("cancelled") }
  private fun key(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it.toInt() and 255) }
  private fun document(raw: String): Uri { val u = Uri.parse(raw); return if (u.scheme == "content" && !u.path.orEmpty().contains("/document/")) DocumentsContract.buildDocumentUriUsingTree(u, DocumentsContract.getTreeDocumentId(u)) else u }
  private fun identity(raw: String): String {
    val u = document(raw)
    if (u.scheme == "file") return "file:" + File(requireNotNull(u.path)).canonicalPath
    require(u.scheme == "content" && u.authority == "com.android.externalstorage.documents") { "sourceUnreadable" }
    return "content:" + u.authority + ":" + DocumentsContract.getDocumentId(u).trimEnd('/')
  }
  private fun inside(value: String, parent: String) = value == parent || value.startsWith(if(parent.endsWith(":"))parent else "$parent/")
  private fun protected(ctx: Context, raw: String): Boolean {
    val u = Uri.parse(raw); if (u.scheme != "file") return false
    val f = File(requireNotNull(u.path)).canonicalFile
    val roots = listOf(File(ctx.filesDir,"SQLite"),File(ctx.filesDir,"health-body-photos"),File(ctx.filesDir,"local-moves"),File(ctx.cacheDir,"service-archives"))
    return roots.any { f.path == it.canonicalPath || f.path.startsWith(it.canonicalPath + "/") }
  }
  private fun allowed(ctx: Context, raw: String) {
    val u = Uri.parse(raw)
    if (u.scheme == "file") {
      val path = File(requireNotNull(u.path)).canonicalPath
      require((path.startsWith(ctx.filesDir.canonicalPath + "/") || path.startsWith(ctx.cacheDir.canonicalPath + "/")) && !protected(ctx,raw)) { "sourceUnreadable" }
    } else identity(raw)
  }
  private fun open(ctx: Context, raw: String): InputStream = ctx.contentResolver.openInputStream(Uri.parse(raw)) ?: error("sourceUnreadable")
  private fun hash(ctx: Context, raw: String, id: String, progress: ((Long)->Unit)? = null): Hash {
    val digest = MessageDigest.getInstance("SHA-256"); var size=0L; val buffer=ByteArray(BUFFER)
    open(ctx,raw).buffered(BUFFER).use { input -> while(true) { check(id); val n=input.read(buffer); if(n<0)break; digest.update(buffer,0,n);size+=n;progress?.invoke(n.toLong()) } }
    return Hash(digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) },size)
  }
  private fun exists(ctx: Context, raw: String): Boolean = try {
    val u = document(raw)
    if(u.scheme=="file") File(requireNotNull(u.path)).exists() else ctx.contentResolver.query(u,arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID),null,null,null)?.use { it.moveToFirst() } == true
  } catch (_:Exception) { false }
  private fun knownExists(ctx:Context,raw:String):Boolean {
    val u=document(raw)
    if(u.scheme=="file")return File(requireNotNull(u.path)).exists()
    return try {(ctx.contentResolver.query(u,arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID),null,null,null) ?: error("sourceUnreadable")).use{it.moveToFirst()}}catch(_:FileNotFoundException){false}
  }
  private fun children(ctx: Context, raw: String): List<Node> {
    val u=document(raw)
    if(u.scheme=="file") return (File(requireNotNull(u.path)).listFiles() ?: error("sourceUnreadable")).map { require(it.canonicalFile==File(it.parentFile!!.canonicalFile,it.name)) { "sourceUnreadable" };Node(Uri.fromFile(it).toString(),it.name,it.isDirectory,it.length()) }
    val result=mutableListOf<Node>(); val query=DocumentsContract.buildChildDocumentsUriUsingTree(u,DocumentsContract.getDocumentId(u))
    ctx.contentResolver.query(query,arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_SIZE),null,null,null)?.use { c -> while(c.moveToNext()) { require(result.size<50000){"size"};result.add(Node(DocumentsContract.buildDocumentUriUsingTree(u,c.getString(0)).toString(),c.getString(1),c.getString(2)==DocumentsContract.Document.MIME_TYPE_DIR,c.getLong(3))) } } ?: error("sourceUnreadable")
    return result
  }
  private fun safe(path: String): String { require(path.length in 1..4096 && path.split('/').all { it.isNotEmpty() && it!="." && it!=".." && !it.contains('\\') && !it.contains('\u0000') }){"format"};return path }
  private fun create(ctx: Context, parent: String, name: String, directory: Boolean=false): Node {
    safe(name);require(!name.contains('/')){"format"};val p=document(parent)
    val mime=if(directory)DocumentsContract.Document.MIME_TYPE_DIR else android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.').lowercase()) ?: "application/octet-stream"
    if(p.scheme=="file") {
      val folder=File(requireNotNull(p.path));var candidate=File(folder,name);var index=1
      while(true) { if(if(directory)candidate.mkdir() else candidate.createNewFile())return Node(Uri.fromFile(candidate).toString(),candidate.name,directory,0);require(candidate.exists()){"storage"};val dot=name.lastIndexOf('.');candidate=File(folder,if(!directory&&dot>0)name.take(dot)+" ($index)"+name.substring(dot) else "$name ($index)");index++ }
    }
    val uri=DocumentsContract.createDocument(ctx.contentResolver,p,mime,name) ?: error("storage")
    val actual=ctx.contentResolver.query(uri,arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME),null,null,null)?.use { if(it.moveToFirst())it.getString(0) else null } ?: error("storage")
    return Node(uri.toString(),actual,directory,0)
  }
  private fun delete(ctx: Context, raw: String): Boolean { val u=document(raw);return if(u.scheme=="file")File(requireNotNull(u.path)).delete() else DocumentsContract.deleteDocument(ctx.contentResolver,u) }
  private fun rename(ctx: Context, raw: String, name: String): String {
    val u=document(raw)
    return if(u.scheme=="file") { val f=File(requireNotNull(u.path));val to=File(f.parentFile,name);require(!to.exists() && f.renameTo(to)){"storage"};Uri.fromFile(to).toString() } else (DocumentsContract.renameDocument(ctx.contentResolver,u,name) ?: error("storage")).toString()
  }
  private val audioExtensions = setOf("mp3", "m4a", "m4b", "flac", "ogg", "opus", "wav", "aac", "wma", "aiff", "aif")
  private val ignoredAudioDirs = setOf("@eadir", "#recycle", "#snapshot", "lost+found", "storyboards")
  private fun isAudio(name: String) = name.substringAfterLast('.', "").lowercase() in audioExtensions

  private fun assistantRoots(ctx: Context, video: String, music: String) {
    allowed(ctx, video)
    allowed(ctx, music)
    val from = identity(video)
    val to = identity(music)
    require(!inside(from, to) && !inside(to, from)) { "overlapping_folders" }
  }

  fun listAssistantAudio(ctx: Context, video: String, music: String): String {
    assistantRoots(ctx, video, music)
    val result = JSONArray()
    val root = identity(video)
    var directories = 0
    fun visit(folder: String, relative: String, depth: Int) {
      require(++directories <= 2000 && depth <= 12) { "folder_too_large" }
      val rows = children(ctx, folder)
      require(rows.none { it.name.startsWith(".nlc-importing-") || it.name.startsWith(".nlc-moving-") }) { "folder_busy" }
      for (node in rows) {
        if (node.name.startsWith(".") || node.name.lowercase() in ignoredAudioDirs) continue
        if (!inside(identity(node.uri), root)) continue
        val path = safe(if (relative.isEmpty()) node.name else "$relative/${node.name}")
        if (node.dir) visit(node.uri, path, depth + 1)
        else if (isAudio(node.name)) {
          require(result.length() < 2000) { "folder_too_large" }
          result.put(JSONObject().put("name", node.name).put("relative", path).put("uri", node.uri))
        }
      }
    }
    visit(video, "", 0)
    return result.toString()
  }

  @Synchronized
  fun moveAssistantAudio(ctx: Context, video: String, music: String, source: String, name: String): Boolean {
    assistantRoots(ctx, video, music)
    allowed(ctx, source)
    require(isAudio(name) && !safe(name).contains('/')) { "invalid_audio" }
    require(inside(identity(source), identity(video)) && identity(source) != identity(video)) { "outside_video" }
    val sourceUri = document(source)
    if (sourceUri.scheme == "file") require(File(requireNotNull(sourceUri.path)).name == name) { "source_changed" }
    else {
      val displayName = ctx.contentResolver.query(sourceUri, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)
        ?.use { if (it.moveToFirst()) it.getString(0) else null }
      require(displayName == name) { "source_changed" }
    }

    val musicRows = children(ctx, music)
    require(musicRows.none { it.name.startsWith(".nlc-importing-") || it.name.startsWith(".nlc-moving-") }) { "folder_busy" }
    val existing = musicRows.firstOrNull { it.name.equals("Canciones", ignoreCase = true) }
    val folder = existing ?: create(ctx, music, "Canciones", directory = true)
    require(folder.dir && inside(identity(folder.uri), identity(music))) { "music_folder_unavailable" }
    require(children(ctx, folder.uri).none { it.name.equals(name, ignoreCase = true) }) { "audio_already_exists" }

    val id = UUID.randomUUID().toString()
    val original = hash(ctx, source, id)
    require(original.bytes > 0) { "empty_audio" }
    var written = create(ctx, folder.uri, ".nlc-assistant-$id.partial").uri
    try {
      val temp = document(written)
      val output = if (temp.scheme == "file") FileOutputStream(requireNotNull(temp.path))
        else ctx.contentResolver.openOutputStream(temp, "wt") ?: error("storage")
      output.use { target ->
        open(ctx, source).use { input -> input.copyTo(target, BUFFER) }
        target.flush()
      }
      require(hash(ctx, written, id) == original && hash(ctx, source, id) == original) { "source_changed" }
      require(children(ctx, folder.uri).none { it.name.equals(name, ignoreCase = true) }) { "audio_already_exists" }
      written = rename(ctx, written, name)
      require(children(ctx, folder.uri).any { it.uri == written && it.name == name && !it.dir }) { "audio_already_exists" }
    } catch (error: Exception) {
      runCatching { delete(ctx, written) }
      throw error
    }
    // Once a verified copy is visible, keep it even if the provider refuses deletion.
    return runCatching { hash(ctx, source, id) == original && delete(ctx, source) }.getOrDefault(false)
  }

  private fun receipt(ctx: Context, id: String, nonce: String): Boolean = listOf("nlc-catalog.db","nlc-local-demo.db").any { name ->
    val file=File(ctx.filesDir,"SQLite/$name")
    if(!file.exists())false else try { SQLiteDatabase.openDatabase(file.path,null,SQLiteDatabase.OPEN_READONLY).use { d -> d.rawQuery("SELECT value FROM meta WHERE key=?",arrayOf("local_move_receipt:$id")).use { it.moveToFirst() && it.getString(0)==nonce } } } catch (_:Exception){false}
  }
  private fun committed(ctx: Context, id: String, db: SQLiteDatabase) = receipt(ctx,id,get(db,"nonce") ?: "")
  private fun dropMarkers(ctx: Context, db: SQLiteDatabase) {
    val list=JSONArray(get(db,"markers") ?: "[]");val remaining=JSONArray()
    for(i in 0 until list.length()) {
      val marker=list.getString(i)
      try {
        if(knownExists(ctx,marker)) {
          val empty=open(ctx,marker).use{it.read()==-1}
          if(empty){if(!delete(ctx,marker))remaining.put(marker)}
          else rename(ctx,marker,".nlc-retained-marker-${UUID.randomUUID()}.partial")
        }
      }
      catch (_:Exception){remaining.put(marker)}
    }
    put(db,"markers",remaining.toString())
  }
  private fun summary(ctx: Context, id: String, db: SQLiteDatabase): String {
    val state=get(db,"state") ?: "preparing";val proof=committed(ctx,id,db)
    if(proof)dropMarkers(ctx,db)
    val files=entries(db);val copy=files.filter{!it.same}
    return JSONObject().put("id",id).put("state",if(proof&&state!="done")"committed" else state).put("nonce",get(db,"nonce")).put("metadata",JSONObject(get(db,"metadata") ?: "{}")).put("files",copy.size).put("bytes",copy.sumOf{it.bytes}).put("verified",copy.count{it.verified}).put("remaining",files.count{it.remove && !it.same && !it.cleaned}).put("retained",get(db,"retained")?.toIntOrNull() ?: 0).toString()
  }
  @Synchronized fun pending(ctx: Context): String {
    val result=JSONArray()
    base(ctx).listFiles()?.filter{it.isDirectory&&File(it,"journal.db").exists()}?.forEach { folder -> db(ctx,folder.name).use { d -> if(get(d,"metadata")==null || get(d,"targets")==null)put(d,"state","aborted");if(get(d,"state") !in listOf("done","aborted"))result.put(JSONObject(summary(ctx,folder.name,d))) } }
    return result.toString()
  }
  @Synchronized fun prepare(ctx: Context, id: String, inputUri: String, progress: (String,Long,Int)->Unit): String {
    require(running.add(id)){"busy"}
    try { db(ctx,id).use { d ->
      require(!committed(ctx,id,d)){"committed"}
      val text=open(ctx,inputUri).bufferedReader().use{it.readText()};require(text.length<=32*1024*1024){"size"};val input=JSONObject(text);val metadata=input.getJSONObject("metadata")
      val previous=get(d,"metadata");if(previous!=null)require(JSONObject(previous).getString("fingerprint")==metadata.getString("fingerprint")){"settingsChanged"}
      put(d,"metadata",metadata.toString());if(get(d,"nonce")==null)put(d,"nonce",UUID.randomUUID().toString())
      put(d,"state","preparing");put(d,"targets",input.getJSONObject("targets").toString())
      val targets=input.getJSONObject("targets");val general=identity(input.getString("general"));val targetKeys=services.map { identity(targets.getJSONObject(it).getString("uri")) }
      require(targetKeys.all{inside(it,general)}){"format"}
      val roots=input.getJSONArray("sources");val sourceList=(0 until roots.length()).map{roots.getJSONObject(it)}
      var count=0;var bytes=0L;val hashes=mutableMapOf<String,Hash>();val rootRows=mutableMapOf<String,String>()
      fun record(service:String,source:String,relative:String,ref:String?=null):String {
        require(service in services){"format"};allowed(ctx,source);safe(relative);val physical=identity(source);var fileKey=key("$service:$physical")
        if(ref!=null && ref.startsWith("track:")) {
          val other=d.rawQuery("SELECT ref FROM refs WHERE file_key=? AND ref LIKE 'track:%' AND ref!=?",arrayOf(fileKey,ref)).use { it.moveToFirst() }
          if(other)fileKey=key("$service:$physical:$ref")
        }
        val target=targets.getJSONObject(service).getString("uri");val self=inside(physical,identity(target));val old=entriesForKey(d,fileKey)
        val digest=if(self)Hash("",0) else hashes.getOrPut(physical){hash(ctx,source,id){n->bytes+=n;progress("prepare",bytes,count)}}
        val unchanged=old!=null && old.hash==digest.sha && old.bytes==digest.bytes
        if(old==null){require(++count<=50000){"size"};d.execSQL("INSERT INTO files (key,service,source,identity,relative,bytes,hash,same_file,remove_source) VALUES (?,?,?,?,?,?,?,?,?)",arrayOf<Any>(fileKey,service,source,physical,relative,digest.bytes,digest.sha,if(self)1 else 0,if(self)0 else 1))}
        else {d.execSQL("UPDATE files SET source=?,bytes=?,hash=?,relative=?,same_file=? WHERE key=?",arrayOf<Any>(source,digest.bytes,digest.sha,relative,if(self)1 else 0,fileKey));if(!unchanged&&!self){retainCopy(ctx,id,old);d.execSQL("UPDATE files SET destination=NULL,path=NULL,verified=0,owned=0,cleaned=0 WHERE key=?",arrayOf(fileKey))}}
        if(self){val sourceUri=document(source);val targetUri=document(target);val canonical=if(sourceUri.scheme=="content")DocumentsContract.buildDocumentUriUsingTree(targetUri,DocumentsContract.getDocumentId(sourceUri)).toString() else source
          val relativeTarget=physical.removePrefix(identity(target)).trimStart('/');d.execSQL("UPDATE files SET destination=?,path=?,verified=1,remove_source=0 WHERE key=?",arrayOf(canonical,relativeTarget,fileKey))}
        if(ref!=null)d.execSQL("INSERT OR REPLACE INTO refs VALUES (?,?)",arrayOf(ref,fileKey))
        rootRows["$service:$relative"]=fileKey
        return fileKey
      }
      for(root in sourceList) {
        val service=root.getString("service");val source=root.getString("uri");allowed(ctx,source);val sourceKey=identity(source)
        fun visit(uri:String,path:String,depth:Int){check(id);require(depth<=32){"size"};val list=children(ctx,uri).sortedBy{it.name}
          require(list.none{it.name.startsWith(".nlc-importing-")||(it.name.startsWith(".nlc-moving-") && it.name!=".nlc-moving-$id")}){"sourceChanged"}
          for(node in list){ if(node.name==".nlc-moving-$id")continue;val logical=if(path.isEmpty())node.name else "$path/${node.name}";val physical=identity(node.uri)
            val otherSource=sourceList.any{it.getString("service")!=service && identity(it.getString("uri"))!=sourceKey && inside(physical,identity(it.getString("uri")))}
            val destination=targetKeys.any{it!=sourceKey && inside(physical,it)}
            val newGeneral=general!=sourceKey&&inside(general,sourceKey)&&inside(physical,general)
            if(otherSource||destination||newGeneral)continue
            if(node.dir)visit(node.uri,logical,depth+1) else record(service,node.uri,logical)
          }
        }
        visit(source,"",0)
      }
      val extras=input.getJSONArray("extras")
      for(i in 0 until extras.length()){check(id);val e=extras.getJSONObject(i);val service=e.getString("service");val ref=e.getString("ref")
        if(e.has("uri")){val source=e.getString("uri");if(protected(ctx,source))continue
          val baseKey=key("$service:${identity(source)}");val existing=entriesForKey(d,baseKey);record(service,existing?.source ?: source,existing?.relative ?: e.getString("path"),ref)
          // Every URI alias can still be rewritten to the same relocated bytes.
          d.execSQL("INSERT OR REPLACE INTO refs VALUES (?,?)",arrayOf("uri:$source",baseKey))
        } else {val fileKey=rootRows["$service:${e.getString("relative")}"] ?: error("sourceUnreadable");d.execSQL("INSERT OR REPLACE INTO refs VALUES (?,?)",arrayOf(ref,fileKey))}
      }
      require(entries(d).size<=50000 && entries(d).sumOf{it.bytes}<=512L*1024*1024*1024){"size"};put(d,"state","prepared");progress("prepare",bytes,entries(d).size);return summary(ctx,id,d)
    } }catch(error:Exception){throw IOException(if(error.message in listOf("cancelled","size","settingsChanged","sourceChanged","committed","format"))error.message else "sourceUnreadable")}
    finally{running.remove(id);cancelled.remove(id)}
  }
  // Keep an interrupted or edited copy, but never expose it as playable media.
  private fun retainCopy(ctx:Context,id:String,entry:Entry) {
    if(!entry.owned || entry.destination==null || !exists(ctx,entry.destination))return
    val name=".nlc-retained-${id.take(8)}-${UUID.randomUUID()}.partial"
    rename(ctx,entry.destination,name)
  }
  private fun entriesForKey(d:SQLiteDatabase,key:String):Entry?=entriesWhere(d,key)
  private fun entriesWhere(d:SQLiteDatabase,key:String):Entry? = d.rawQuery("SELECT key,service,source,identity,relative,bytes,hash,destination,path,verified,same_file,remove_source,cleaned,owned FROM files WHERE key=?",arrayOf(key)).use { c -> if(!c.moveToFirst())null else Entry(c.getString(0),c.getString(1),c.getString(2),c.getString(3),c.getString(4),c.getLong(5),c.getString(6),if(c.isNull(7))null else c.getString(7),if(c.isNull(8))null else c.getString(8),c.getInt(9)==1,c.getInt(10)==1,c.getInt(11)==1,c.getInt(12)==1,c.getInt(13)==1) }
  private fun targetParent(ctx:Context,id:String,d:SQLiteDatabase,entry:Entry):Pair<String,String>{
    var parent=JSONObject(get(d,"targets")!!).getJSONObject(entry.service).getString("uri");var actual="";var logical=""
    for(name in entry.relative.split('/').dropLast(1)){logical=if(logical.isEmpty())name else "$logical/$name";val k="${entry.service}:$logical"
      val saved=d.rawQuery("SELECT uri,path FROM dirs WHERE key=?",arrayOf(k)).use{if(it.moveToFirst())it.getString(0) to it.getString(1) else null}
      if(saved!=null&&exists(ctx,saved.first)){parent=saved.first;actual=saved.second;continue}
      val matches=children(ctx,parent).filter{it.name.equals(name,true)};val child=if(matches.size==1&&matches[0].dir)matches[0] else create(ctx,parent,if(matches.isEmpty())name else "$name (NLC-${id.take(8)})",true)
      actual=if(actual.isEmpty())child.name else "$actual/${child.name}";parent=child.uri;d.execSQL("INSERT OR REPLACE INTO dirs VALUES (?,?,?)",arrayOf(k,parent,actual))
    }
    return parent to actual
  }
  private fun result(ctx:Context,id:String,d:SQLiteDatabase):String {
    val files=JSONArray();for(entry in entries(d)){require(entry.verified&&entry.destination!=null){"integrity"};val refs=JSONArray();d.rawQuery("SELECT ref FROM refs WHERE file_key=?",arrayOf(entry.key)).use{while(it.moveToNext())refs.put(it.getString(0))}
      files.put(JSONObject().put("key",entry.key).put("service",entry.service).put("source",entry.source).put("sourceKey",entry.identity).put("relative",entry.relative).put("uri",entry.destination).put("path",entry.path).put("bytes",entry.bytes).put("refs",refs))}
    val file=File(dir(ctx,id),"result.json");file.writeText(JSONObject().put("files",files).put("metadata",JSONObject(get(d,"metadata")!!)).toString());return Uri.fromFile(file).toString()
  }
  @Synchronized fun copy(ctx:Context,id:String,progress:(String,Long,Int)->Unit):String {
    require(running.add(id)){"busy"};try{db(ctx,id).use{d->if(committed(ctx,id,d))return result(ctx,id,d)
      val markers=JSONArray(get(d,"markers") ?: "[]");val targets=JSONObject(get(d,"targets")!!)
      if(markers.length()==0){for(service in services){val marker=create(ctx,targets.getJSONObject(service).getString("uri"),".nlc-moving-$id");markers.put(marker.uri);put(d,"markers",markers.toString())}}
      var bytes=0L;var count=0
      for(entry in entries(d)){check(id);if(entry.same){count++;continue}
        if(entry.verified&&entry.destination!=null&&exists(ctx,entry.destination)&&hash(ctx,entry.destination,id).sha==entry.hash){count++;continue}
        retainCopy(ctx,id,entry)
        val (parent,path)=targetParent(ctx,id,d,entry);val target=create(ctx,parent,entry.relative.substringAfterLast('/'))
        d.execSQL("UPDATE files SET destination=?,path=?,verified=0,owned=1 WHERE key=?",arrayOf(target.uri,if(path.isEmpty())target.name else "$path/${target.name}",entry.key))
        val digest=MessageDigest.getInstance("SHA-256");var copied=0L;val buffer=ByteArray(BUFFER)
        val descriptor=ctx.contentResolver.openFileDescriptor(Uri.parse(target.uri),"w") ?: error("storage")
        descriptor.use { fd -> val space=Os.fstatvfs(fd.fileDescriptor);require(space.f_bavail*space.f_frsize>entry.bytes+8L*1024*1024){"space"}
          open(ctx,entry.source).use{input->FileOutputStream(fd.fileDescriptor).buffered(BUFFER).use{out->while(true){check(id);val n=input.read(buffer);if(n<0)break;out.write(buffer,0,n);digest.update(buffer,0,n);copied+=n;bytes+=n;if(copied%(8L*1024*1024)<BUFFER)progress("copy",bytes,count)};out.flush();fd.fileDescriptor.sync()}}
        }
        val sha=digest.digest().joinToString(""){"%02x".format(it.toInt() and 255)}
        require(copied==entry.bytes&&sha==entry.hash){"sourceChanged"};require(hash(ctx,target.uri,id).sha==entry.hash){"integrity"}
        d.execSQL("UPDATE files SET verified=1 WHERE key=?",arrayOf(entry.key));count++;progress("copy",bytes,count)
      }
      put(d,"state","copied");return result(ctx,id,d)
    }}catch(e:Exception){throw IOException(if(e.message in listOf("cancelled","space","integrity","sourceChanged"))e.message else "storage")}finally{running.remove(id);cancelled.remove(id)}
  }
  @Synchronized fun verify(ctx:Context,id:String,progress:(String,Long,Int)->Unit){require(running.add(id)){"busy"};try{db(ctx,id).use{d->var bytes=0L;var count=0;for(e in entries(d)){check(id);require(e.verified&&e.destination!=null&&exists(ctx,e.destination)){"integrity"};if(!e.same){require(hash(ctx,e.source,id){bytes+=it;progress("verify",bytes,count)}.sha==e.hash){"sourceChanged"};require(hash(ctx,e.destination,id).sha==e.hash){"integrity"}};count++;progress("verify",bytes,count)}}}finally{running.remove(id);cancelled.remove(id)}}
  private fun writeMirror(ctx:Context,id:String,d:SQLiteDatabase,service:String,payload:String){
    val root=JSONObject(get(d,"targets")!!).getJSONObject(service).getString("uri");val name=when(service){"music"->"nlc-playlists.json";"focus"->"nlc-tasks.json";else->"nlc-wealth.json"};val expected=key(payload)
    val current=children(ctx,root).firstOrNull{it.name==name&&!it.dir}
    if(get(d,"mirror:$service")==expected&&current!=null&&hash(ctx,current.uri,id).sha==expected)return
    val temp=create(ctx,root,".nlc-sync-${UUID.randomUUID()}.json");ctx.contentResolver.openFileDescriptor(Uri.parse(temp.uri),"wt")!!.use{fd->FileOutputStream(fd.fileDescriptor).use{it.write(payload.toByteArray(Charsets.UTF_8));it.flush();fd.fileDescriptor.sync()}};require(hash(ctx,temp.uri,id).sha==expected){"integrity"}
    var pending=temp.uri
    repeat(5){
      val old=children(ctx,root).firstOrNull{it.name==name}
      if(old!=null){require(!old.dir){"mirrorConflict"};val backupName=name.removeSuffix(".json")+".before-${id.take(8)}-${UUID.randomUUID()}.json";val backup=rename(ctx,old.uri,backupName)
        // A moved mirror may be rotated too; retain its verified destination for cleanup.
        d.execSQL("UPDATE files SET destination=?,path=? WHERE destination=?",arrayOf(backup,backupName,old.uri))
      }
      pending=rename(ctx,pending,name)
      if(children(ctx,root).any{it.uri==pending&&it.name==name}){put(d,"mirror:$service",expected);return}
    }
    error("mirrorConflict")
  }
  @Synchronized fun finish(ctx:Context,id:String,mirrorsUri:String,progress:(String,Long,Int)->Unit):String {
    require(running.add(id)){"busy"};try{db(ctx,id).use{d->require(committed(ctx,id,d)){"notCommitted"};put(d,"state","committed");dropMarkers(ctx,d)
      val raw=open(ctx,mirrorsUri).bufferedReader().use{it.readText()};require(raw.length<32*1024*1024){"size"};val mirrors=JSONObject(raw)
      for(service in listOf("music","focus","wealth"))writeMirror(ctx,id,d,service,mirrors.getString(service))
      require(JSONArray(get(d,"markers") ?: "[]").length()==0){"storage"}
      var retained=0;var bytes=0L;var count=0;val handled=mutableSetOf<String>();val all=entries(d);val bySource=all.groupBy{it.identity}
      for(e in all){check(id);if(e.same||!e.remove||e.cleaned||!handled.add(e.identity))continue
        // Another service may keep an in-place reference to the same physical file.
        if(bySource[e.identity]!!.any{it.same || !it.remove}){d.execSQL("UPDATE files SET cleaned=1 WHERE identity=?",arrayOf(e.identity));continue}
        val siblings=bySource[e.identity]!!.filter{it.remove&&!it.same};var valid=true
        try {
          for(copy in siblings){if(copy.destination==null||!knownExists(ctx,copy.destination)||hash(ctx,copy.destination,id).sha!=copy.hash)valid=false}
          if(valid&&knownExists(ctx,e.source))valid=hash(ctx,e.source,id){bytes+=it;progress("cleanup",bytes,count)}.sha==e.hash
          if(valid){if(knownExists(ctx,e.source))require(delete(ctx,e.source));d.execSQL("UPDATE files SET cleaned=1 WHERE identity=?",arrayOf(e.identity))}
        }catch(error:Exception){if(error.message=="cancelled")throw error;valid=false}
        if(!valid)retained++;count++;progress("cleanup",bytes,count)
      }
      put(d,"retained",retained.toString());put(d,"state",if(retained==0)"done" else "committed");return summary(ctx,id,d)
    }}catch(e:Exception){throw IOException(if(e.message in listOf("cancelled","notCommitted","mirrorConflict","integrity","size"))e.message else "storage")}finally{running.remove(id);cancelled.remove(id)}
  }
  @Synchronized fun abort(ctx:Context,id:String):String {db(ctx,id).use{d->require(!committed(ctx,id,d)){"committed"};var kept=0
    for(e in entries(d)){if(e.same||!e.owned||e.destination==null||!exists(ctx,e.destination))continue
      val sourceSafe=try{exists(ctx,e.source)&&hash(ctx,e.source,id).sha==e.hash}catch(_:Exception){false}
      val copySafe=try{e.verified&&hash(ctx,e.destination,id).sha==e.hash}catch(_:Exception){false}
      if(sourceSafe&&copySafe)try{if(!delete(ctx,e.destination))kept++}catch(_:Exception){kept++} else {try{retainCopy(ctx,id,e)}catch(_:Exception){};kept++}
    }
    dropMarkers(ctx,d);require(JSONArray(get(d,"markers") ?: "[]").length()==0){"storage"};put(d,"state","aborted");return JSONObject().put("kept",kept).toString()
  }}
  @Synchronized fun keepOriginals(ctx:Context,id:String):String {db(ctx,id).use{d->require(committed(ctx,id,d)){"notCommitted"};require(get(d,"mirror:music")!=null&&get(d,"mirror:focus")!=null&&get(d,"mirror:wealth")!=null){"mirrorConflict"};dropMarkers(ctx,d);require(JSONArray(get(d,"markers") ?: "[]").length()==0){"storage"};put(d,"state","done");return summary(ctx,id,d)}}
}
