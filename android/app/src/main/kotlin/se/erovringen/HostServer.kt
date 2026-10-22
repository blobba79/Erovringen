package se.erovringen

import android.content.res.AssetManager
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.withCharset
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.ktor.server.request.queryString
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import java.io.FileNotFoundException
import java.net.ServerSocket
import java.util.UUID

/**
 * Appens server: serverar de byggda filerna i `assets/web/`, tar emot WebSocket på `/ws` och
 * skickar `/qr.svg` och `/join-colors` vidare till spelrummet.
 */
class HostServer(
    private val assets: AssetManager,
    private val bridge: RoomBridge,
    private val log: AppLog,
) {
    private var server: io.ktor.server.engine.EmbeddedServer<*, *>? = null

    var port: Int = 0
        private set

    /** Startar servern och ger porten (8765 om den är ledig, annars en ledig). */
    fun start(): Int {
        port = pickPort()
        val s = embeddedServer(CIO, port = port, host = "0.0.0.0") {
            install(WebSockets) {
                pingPeriodMillis = 15_000
                timeoutMillis = 30_000
            }
            routing {
                get("/") { serveAsset(call, "screen/index.html") }
                get("/p") { serveAsset(call, "phone/index.html") }
                get("/room") {
                    if (isLocal(call)) serveAsset(call, "room/index.html") else call.respond(HttpStatusCode.Forbidden)
                }
                get("/qr.svg") { forwardToRoom(call, "/qr.svg") }
                get("/join-colors") { forwardToRoom(call, "/join-colors") }
                webSocket("/ws") { handleSocket(this) }
                get("/{path...}") {
                    val parts = call.parameters.getAll("path").orEmpty()
                    serveFile(call, parts)
                }
            }
        }
        s.start(wait = false)
        server = s
        log.info("Servern lyssnar på port $port")
        return port
    }

    fun stop() {
        try {
            server?.stop(300, 1000)
        } catch (e: Exception) {
            log.error("Kunde inte stänga servern", e)
        }
        server = null
    }

    private fun pickPort(): Int {
        try {
            ServerSocket(PREFERRED_PORT).use { return PREFERRED_PORT }
        } catch (_: Exception) {
            log.warn("Port $PREFERRED_PORT är upptagen, väljer en ledig")
        }
        ServerSocket(0).use { return it.localPort }
    }

    private fun isLocal(call: ApplicationCall): Boolean {
        val addr = call.request.local.remoteAddress
        return addr.startsWith("127.") || addr == "::1" || addr.startsWith("0:0:0:0:0:0:0:1") || addr.startsWith("::1%")
    }

    private suspend fun handleSocket(session: io.ktor.server.websocket.DefaultWebSocketServerSession) {
        with(session) {
        val connId = UUID.randomUUID().toString()
        val local = isLocal(call)
        val out = Channel<String?>(Channel.UNLIMITED)
        bridge.connections[connId] = out
        bridge.roomOpen(connId, local)
        val writer = launch {
            for (message in out) {
                if (message == null) {
                    close(CloseReason(CloseReason.Codes.NORMAL, ""))
                    break
                }
                send(Frame.Text(message))
            }
        }
        try {
            for (frame in incoming) {
                if (frame is Frame.Text) bridge.roomMessage(connId, frame.readText())
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            log.warn("WebSocket-fel ($connId): $e")
        } finally {
            // Bara om spelrummet inte redan stängt anslutningen själv.
            if (bridge.connections.remove(connId) != null) bridge.roomClose(connId)
            out.close()
            writer.cancel()
        }
        }
    }

    private suspend fun forwardToRoom(call: ApplicationCall, path: String) {
        val reply = bridge.http(path, call.request.queryString())
        if (reply == null) {
            call.respondText("Spelrummet svarade inte", status = HttpStatusCode.GatewayTimeout)
            return
        }
        call.response.header("Cache-Control", "no-store")
        call.respondText(
            reply.body,
            ContentType.parse(reply.contentType),
            HttpStatusCode.fromValue(reply.status),
        )
    }

    /** Övriga sökvägar: relativt de byggda filerna. Spelrummets filer bara för enheten själv. */
    private suspend fun serveFile(call: ApplicationCall, parts: List<String>) {
        if (parts.isEmpty() || parts.any { it.isEmpty() || it == ".." || it == "." || it.contains('\\') }) {
            call.respond(HttpStatusCode.NotFound)
            return
        }
        val rel = parts.joinToString("/")
        val dirs = if (isLocal(call)) listOf("screen", "phone", "room") else listOf("phone", "screen")
        for (dir in dirs) {
            if (serveAsset(call, "$dir/$rel", missingIsOk = true)) return
        }
        call.respond(HttpStatusCode.NotFound)
    }

    private suspend fun serveAsset(call: ApplicationCall, path: String, missingIsOk: Boolean = false): Boolean {
        val bytes = try {
            assets.open("web/$path").use { it.readBytes() }
        } catch (_: FileNotFoundException) {
            if (!missingIsOk) call.respond(HttpStatusCode.NotFound)
            return false
        }
        call.response.header("Cache-Control", "no-cache")
        call.respondBytes(bytes, contentTypeFor(path))
        return true
    }

    private fun contentTypeFor(path: String): ContentType = when (path.substringAfterLast('.', "").lowercase()) {
        "html" -> ContentType.Text.Html.withCharset(Charsets.UTF_8)
        "js", "mjs" -> ContentType.parse("text/javascript; charset=utf-8")
        "css" -> ContentType.Text.CSS.withCharset(Charsets.UTF_8)
        "json", "map" -> ContentType.Application.Json
        "svg" -> ContentType.Image.SVG
        "png" -> ContentType.Image.PNG
        "jpg", "jpeg" -> ContentType.Image.JPEG
        "webp" -> ContentType.parse("image/webp")
        "ico" -> ContentType.parse("image/x-icon")
        "woff2" -> ContentType.parse("font/woff2")
        "woff" -> ContentType.parse("font/woff")
        "wasm" -> ContentType.parse("application/wasm")
        "txt" -> ContentType.Text.Plain.withCharset(Charsets.UTF_8)
        else -> ContentType.Application.OctetStream
    }

    private companion object {
        const val PREFERRED_PORT = 8765
    }
}
