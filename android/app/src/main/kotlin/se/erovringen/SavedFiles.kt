package se.erovringen

import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** Sparade spel och startval: platta filer i `filesDir/sparade/`. Skrivningen är atomisk. */
class SavedFiles(dir: File) {
    private val dir = dir.also { it.mkdirs() }
    private val lock = Any()

    private fun fileFor(name: String): File {
        require(NAME.matches(name)) { "Ogiltigt filnamn: $name" }
        return File(dir, name)
    }

    fun list(): String = synchronized(lock) {
        val names = dir.listFiles()?.filter { it.isFile && !it.name.endsWith(TMP) }?.map { it.name }?.sorted().orEmpty()
        JSONArray(names).toString()
    }

    fun read(name: String): String? = synchronized(lock) {
        val f = fileFor(name)
        if (f.isFile) f.readText(Charsets.UTF_8) else null
    }

    fun write(name: String, text: String) = synchronized(lock) {
        val target = fileFor(name)
        val tmp = File(dir, name + TMP)
        FileOutputStream(tmp).use { out ->
            out.write(text.toByteArray(Charsets.UTF_8))
            out.flush()
            out.fd.sync()
        }
        Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        Unit
    }

    private companion object {
        const val TMP = ".tmp"
        val NAME = Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,120}")
    }
}
