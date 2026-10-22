import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Versionen hämtas ur package.json, så att appen och datorfilerna alltid har samma version.
val packageJson = file("../../package.json").readText()
val appVersion = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"").find(packageJson)!!.groupValues[1]
val versionParts = Regex("(\\d+)\\.(\\d+)\\.(\\d+)").find(appVersion)!!.groupValues.drop(1).map { it.toInt() }
val appVersionCode = versionParts[0] * 1_000_000 + versionParts[1] * 1_000 + versionParts[2]

android {
    namespace = "se.erovringen"
    compileSdk = 35

    defaultConfig {
        applicationId = "se.erovringen"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersion
    }

    // Egen nyckel om GitHub-hemligheterna finns (workflown skriver ut nyckelfilen), annars debug-nyckeln.
    val keystorePath: String? = System.getenv("ANDROID_KEYSTORE_FILE")
    signingConfigs {
        if (!keystorePath.isNullOrEmpty() && file(keystorePath).exists()) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "/META-INF/INDEX.LIST",
                "/META-INF/DEPENDENCIES",
                "/META-INF/io.netty.versions.properties",
                "/META-INF/licenses/**",
                "DebugProbesKt.bin",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    val ktor = "3.0.3"
    implementation("io.ktor:ktor-server-core:$ktor")
    implementation("io.ktor:ktor-server-cio:$ktor")
    implementation("io.ktor:ktor-server-websockets:$ktor")
}

// Tydligt fel om webbfilerna inte har byggts (npm run build:android-web).
tasks.named("preBuild") {
    doFirst {
        val web = file("src/main/assets/web")
        listOf("screen", "phone", "room").forEach {
            check(file("$web/$it/index.html").exists()) {
                "Saknar assets/web/$it/index.html. Kör 'npm run build:android-web' i projektets rot först."
            }
        }
    }
}
