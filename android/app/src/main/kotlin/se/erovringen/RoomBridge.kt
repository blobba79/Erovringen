package se.erovringen

import android.os.Handler
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Bryggan till spelrummet (den dolda WebView:n). Appens sida är `AndroidHost` i
 * `src/shared/android.ts` (visas för sidan som `window.ErovringenHost`), spelrummets sida är
 * `EmbeddedRoom` (`window.erovringenRoom`). Anrop till spelrummet köas tills det har anropat `ready()`.
 */
class RoomBridge(
    private val files: SavedFiles,
    private val appLog: AppLog,
    private val main: Handler,
) {
    class Reply(val status: Int, val contentType: String, val body: String)

    /** Utkö per WebSocket-anslutning. `null` betyder att anslutningen ska stängas. */
    val connections = ConcurrentHashMap<String, Channel<String?>>()

    @Volatile
    var webView: WebView? = null

    private val lock = Any()
    private var ready = false
    private val queue = ArrayList<String>()
    private var baseUrl: String? = null
    private val replies = ConcurrentHashMap<String, CompletableDeferred<Reply>>()

    // --- Appens sida (anropas från JavaScript, på WebView:ns bryggtråd) ---

    @JavascriptInterface
    fun send(connId: String, json: String) {
        connections[connId]?.trySend(json)
    }

    @JavascriptInterface
    fun close(connId: String) {
        connections.remove(connId)?.trySend(null)
    }

    @JavascriptInterface
    fun httpReply(requestId: String, status: Int, contentType: String, body: String) {
        replies.remove(requestId)?.complete(Reply(status, contentType, body))
    }

    @JavascriptInterface
    fun listFiles(): String = files.list()

    @JavascriptInterface
    fun readFile(name: String): String? = try {
        files.read(name)
    } catch (e: Exception) {
        appLog.error("readFile($name) misslyckades", e)
        null
    }

    @JavascriptInterface
    fun writeFile(name: String, text: String) {
        try {
            files.write(name, text)
        } catch (e: Exception) {
            appLog.error("writeFile($name) misslyckades", e)
            throw e
        }
    }

    @JavascriptInterface
    fun log(level: String, line: String) {
        appLog.write(if (level == "warn" || level == "error") level else "info", "[rum] $line")
    }

    @JavascriptInterface
    fun ready() {
        appLog.info("Spelrummet är redo")
        synchronized(lock) {
            ready = true
            baseUrl?.let { post(baseUrlJs(it)) }
            queue.forEach { post(it) }
            queue.clear()
        }
    }

    // --- Spelrummets sida (anropas av servern och nätverksbevakningen) ---

    fun roomOpen(connId: String, local: Boolean) = call("open(${q(connId)}, $local)")

    fun roomMessage(connId: String, json: String) = call("message(${q(connId)}, ${q(json)})")

    fun roomClose(connId: String) = call("close(${q(connId)})")

    fun setBaseUrl(url: String) {
        synchronized(lock) {
            baseUrl = url
            if (ready) post(baseUrlJs(url))
        }
    }

    /** `/qr.svg` och `/join-colors`. Ger null om spelrummet inte svarar i tid. */
    suspend fun http(path: String, query: String, timeoutMs: Long = 10_000): Reply? {
        val id = UUID.randomUUID().toString()
        val deferred = CompletableDeferred<Reply>()
        replies[id] = deferred
        try {
            call("http(${q(id)}, ${q(path)}, ${q(query)})")
            return withTimeoutOrNull(timeoutMs) { deferred.await() }
        } finally {
            replies.remove(id)
        }
    }

    /** Spelrummets sida har laddats om (t.ex. efter en kraschad renderare): glöm allt gammalt. */
    fun reset() {
        synchronized(lock) {
            ready = false
            queue.clear()
        }
        val ids = connections.keys.toList()
        for (id in ids) connections.remove(id)?.trySend(null)
    }

    private fun call(method: String) {
        val js = "(function(){try{window.erovringenRoom.$method}catch(e){" +
            "try{ErovringenHost.log('error','erovringenRoom: '+e)}catch(_){}}})()"
        synchronized(lock) {
            if (ready) post(js) else queue.add(js)
        }
    }

    private fun baseUrlJs(url: String) =
        "(function(){try{window.erovringenRoom.setBaseUrl(${q(url)})}catch(e){" +
            "try{ErovringenHost.log('error','setBaseUrl: '+e)}catch(_){}}})()"

    private fun post(js: String) {
        main.post { webView?.evaluateJavascript(js, null) }
    }

    /** JSON-kodad sträng, säker att lägga in i JavaScript. */
    private fun q(s: String): String = JSONObject.quote(s)
}
