package se.erovringen

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import kotlin.concurrent.thread

/**
 * En aktivitet: en synlig WebView med storskärmen och en dold (1x1 px) med spelrummet. Servern
 * (Ktor) och spelrummet lever lika länge som aktiviteten. Aktiviteten hanterar själv rotation
 * (`configChanges`), så ingenting startas om när skärmen vänds.
 */
class MainActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var log: AppLog
    private lateinit var bridge: RoomBridge
    @Volatile
    private var server: HostServer? = null
    private var network: NetworkWatcher? = null
    private var screenView: WebView? = null
    private var roomView: WebView? = null
    private var lastBack = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 28) {
            val lp = window.attributes
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.attributes = lp
        }
        log = AppLog(filesDir.resolve("logg"))
        installCrashLogger()
        log.info("Erövringen ${BuildInfo.version(this)} startar (Android ${Build.VERSION.SDK_INT}, ${Build.MODEL})")
        bridge = RoomBridge(SavedFiles(filesDir.resolve("sparade")), log, main)

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.parseColor("#1D2433"))
        setContentView(root)

        val screen = newWebView(isRoom = false)
        val room = newWebView(isRoom = true)
        screenView = screen
        roomView = room
        bridge.webView = room
        room.addJavascriptInterface(bridge, "ErovringenHost")
        root.addView(screen, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        // Den dolda sidan måste vara kvar i vyhierarkin och synlig för att fortsätta köra.
        root.addView(room, FrameLayout.LayoutParams(1, 1))

        thread(name = "erovringen-start") {
            try {
                val s = HostServer(assets, bridge, log)
                val port = s.start()
                server = s
                if (isDestroyed) {
                    s.stop()
                    return@thread
                }
                main.post { onServerStarted(port) }
            } catch (e: Throwable) {
                log.error("Servern kunde inte startas", e)
            }
        }
    }

    private fun onServerStarted(port: Int) {
        if (isDestroyed) return
        val watcher = NetworkWatcher(this, port, main, log) { bridge.setBaseUrl(it) }
        network = watcher
        watcher.start()
        roomView?.loadUrl("http://127.0.0.1:$port/room")
        screenView?.loadUrl("http://127.0.0.1:$port/?android=1")
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun newWebView(isRoom: Boolean): WebView {
        val debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        if (debuggable) WebView.setWebContentsDebuggingEnabled(true)
        val view = WebView(this)
        view.setBackgroundColor(Color.parseColor("#1D2433"))
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_NO_CACHE
            allowFileAccess = false
            allowContentAccess = false
            if (!isRoom) {
                useWideViewPort = true
                loadWithOverviewMode = true
            }
        }
        val tag = if (isRoom) "rum" else "skärm"
        view.webViewClient = object : WebViewClient() {
            override fun onReceivedError(v: WebView, request: WebResourceRequest, error: WebResourceError) {
                log.warn("[$tag] laddningsfel ${request.url}: ${error.description}")
            }

            override fun onRenderProcessGone(v: WebView, detail: RenderProcessGoneDetail): Boolean {
                log.error("[$tag] renderprocessen dog (kraschade: ${detail.didCrash()}), laddar om")
                if (isRoom) bridge.reset()
                val url = v.url
                main.post { if (url != null && !isDestroyed) v.loadUrl(url) }
                return true
            }
        }
        view.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    log.error("[$tag] ${m.message()} (${m.sourceId()}:${m.lineNumber()})")
                }
                return true
            }
        }
        if (isRoom && Build.VERSION.SDK_INT >= 26) {
            // Spelrummet ska inte strypas när appen inte är i förgrunden.
            view.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        }
        return view
    }

    private fun installCrashLogger() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                log.error("Oväntat fel i tråden ${t.name}", e)
            } catch (_: Throwable) {
            }
            previous?.uncaughtException(t, e)
        }
    }

    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(android.view.WindowInsets.Type.systemBars())
                it.systemBarsBehavior = android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                )
        }
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        screenView?.onResume()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    // Spelrummets WebView pausas aldrig (ingen onPause), så att det fortsätter svara.

    @Suppress("OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        // Ett oavsiktligt tryck ska inte stänga spelet: kräver två tryck inom två sekunder.
        val now = SystemClock.elapsedRealtime()
        if (now - lastBack < 2000) {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        } else {
            lastBack = now
            Toast.makeText(this, R.string.back_again, Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        network?.stop()
        network = null
        val s = server
        server = null
        if (s != null) thread(name = "erovringen-stop") { s.stop() }
        bridge.webView = null
        bridge.reset()
        for (v in listOf(screenView, roomView)) {
            try {
                (v?.parent as? ViewGroup)?.removeView(v)
                v?.destroy()
            } catch (e: Exception) {
                Log.w("Erovringen", "destroy: $e")
            }
        }
        screenView = null
        roomView = null
        log.info("Appen stängs")
        super.onDestroy()
    }
}

private object BuildInfo {
    fun version(a: Activity): String = try {
        a.packageManager.getPackageInfo(a.packageName, 0).versionName ?: "?"
    } catch (_: Exception) {
        "?"
    }
}
