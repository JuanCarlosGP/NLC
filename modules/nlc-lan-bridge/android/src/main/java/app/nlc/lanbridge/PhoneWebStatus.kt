package app.nlc.lanbridge
import fi.iki.elonen.NanoHTTPD
/** NanoHTTPD 2.3.1 omits 423/426/507 from its enum. Preserve API statuses on the wire. */
object PhoneWebStatus {
 fun of(code: Int): NanoHTTPD.Response.IStatus = NanoHTTPD.Response.Status.lookup(code) ?: object : NanoHTTPD.Response.IStatus {
  override fun getRequestStatus() = code
  override fun getDescription() = "$code " + when (code) { 423 -> "Locked"; 426 -> "Upgrade Required"; 507 -> "Insufficient Storage"; else -> "NLC" }
 }
}
