package se.erovringen

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Handler
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * Håller reda på adressen som telefonerna når appen på (wifi eller hotspot) och säger till
 * när den ändras. Hotspot ger inget `Network`-återanrop, så adressen läses direkt från
 * nätverkskorten, både vid återanrop från `ConnectivityManager` och med jämna mellanrum.
 */
class NetworkWatcher(
    context: Context,
    private val port: Int,
    private val main: Handler,
    private val log: AppLog,
    private val onChange: (String) -> Unit,
) {
    private val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private var last: String? = null
    private var running = false

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            main.post { check() }
        }

        override fun onLost(network: Network) {
            main.post { check() }
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            main.post { check() }
        }
    }

    private val poll = object : Runnable {
        override fun run() {
            if (!running) return
            check()
            main.postDelayed(this, POLL_MS)
        }
    }

    fun start() {
        running = true
        try {
            cm.registerNetworkCallback(NetworkRequest.Builder().build(), callback)
        } catch (e: Exception) {
            log.warn("Kunde inte bevaka nätverket: $e")
        }
        poll.run()
    }

    fun stop() {
        running = false
        main.removeCallbacks(poll)
        try {
            cm.unregisterNetworkCallback(callback)
        } catch (_: Exception) {
        }
    }

    private fun check() {
        val url = "http://${findAddress() ?: "127.0.0.1"}:$port"
        if (url != last) {
            last = url
            log.info("Adress för telefonerna: $url")
            onChange(url)
        }
    }

    private class Candidate(val address: String, val score: Int)

    private fun findAddress(): String? {
        val candidates = ArrayList<Candidate>()
        try {
            for (nic in NetworkInterface.getNetworkInterfaces().toList()) {
                if (!nic.isUp || nic.isLoopback) continue
                val name = nic.name.lowercase()
                if (MOBILE.any { name.startsWith(it) }) continue
                for (addr in nic.inetAddresses.toList()) {
                    if (addr !is Inet4Address || !addr.isSiteLocalAddress) continue
                    val host = addr.hostAddress ?: continue
                    var score = rank(host)
                    if (WIFI.any { name.startsWith(it) }) score -= 1
                    candidates.add(Candidate(host, score))
                }
            }
        } catch (e: Exception) {
            log.warn("Kunde inte läsa nätverkskorten: $e")
        }
        return candidates.minByOrNull { it.score }?.address
    }

    /** 192.168 före 10 före 172.16-31. */
    private fun rank(host: String): Int = when {
        host.startsWith("192.168.") -> 0
        host.startsWith("10.") -> 2
        else -> 4
    }

    private companion object {
        const val POLL_MS = 3000L
        val MOBILE = listOf("rmnet", "ccmni", "v4-", "dummy", "tun", "clat", "ppp")
        val WIFI = listOf("wlan", "ap", "swlan", "softap", "eth")
    }
}
