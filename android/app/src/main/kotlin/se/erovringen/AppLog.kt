package se.erovringen

import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Loggfil i `filesDir/logg/`. Roterar vid cirka 1 MB: `erovringen.log` flyttas till
 * `erovringen.1.log` (den gamla ersätts), så loggen tar högst cirka 2 MB.
 */
class AppLog(dir: File) {
    private val dir = dir.also { it.mkdirs() }
    private val current = File(dir, "erovringen.log")
    private val old = File(dir, "erovringen.1.log")
    private val lock = Any()
    private val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.ROOT)

    fun info(line: String) = write("info", line)
    fun warn(line: String) = write("warn", line)
    fun error(line: String, t: Throwable? = null) =
        write("error", if (t == null) line else "$line: ${Log.getStackTraceString(t)}")

    fun write(level: String, line: String) {
        when (level) {
            "error" -> Log.e(TAG, line)
            "warn" -> Log.w(TAG, line)
            else -> Log.i(TAG, line)
        }
        synchronized(lock) {
            try {
                if (current.length() > MAX_BYTES) {
                    old.delete()
                    current.renameTo(old)
                }
                val text = "${format.format(Date())} [$level] $line\n"
                current.appendText(text, Charsets.UTF_8)
            } catch (e: Exception) {
                Log.e(TAG, "Kunde inte skriva loggen", e)
            }
        }
    }

    companion object {
        private const val TAG = "Erovringen"
        private const val MAX_BYTES = 1_000_000L
    }
}
