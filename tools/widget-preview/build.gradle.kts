// Renders the Android home-screen widget on the JVM with Paparazzi (layoutlib — the
// engine behind Android Studio's layout preview), so widget changes can be checked
// without a phone or emulator. Compiles the plugin's real Kotlin + widget res/
// straight from the prayer-service plugin; nothing here ships in the app.
//
//   ./gradlew recordPaparazziDebug   → PNGs in src/test/snapshots/images/
//   open preview.html                → side-by-side gallery
plugins {
    id("com.android.library") version "8.13.2"
    id("org.jetbrains.kotlin.android") version "2.3.0"
    id("app.cash.paparazzi") version "2.0.0-alpha05"
}

val plugin = "../../src-tauri/tauri-plugin-prayer-service/android/src/main"

android {
    namespace = "com.meeqat.plugin.prayerservice"
    compileSdk = 36
    defaultConfig { minSdk = 24 }
    sourceSets["main"].apply {
        // Plugin sources arrive via syncPluginSources below (minus the Tauri bridge).
        java.setSrcDirs(emptyList<String>())
        kotlin.srcDirs(emptyList<String>())
        res.setSrcDirs(listOf("$plugin/res"))
    }
    sourceSets["test"].kotlin.srcDirs("src/test/kotlin")
}

kotlin { jvmToolchain(21) }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
}

// Everything but PrayerServicePlugin.kt (needs Tauri) — so the widget provider
// compiles here too, and a broken edit fails this build.
val pluginSources = tasks.register<Sync>("syncPluginSources") {
    from("$plugin/java/com/meeqat/plugin/prayerservice") {
        exclude("PrayerServicePlugin.kt")
    }
    into(layout.buildDirectory.dir("pluginSrc/com/meeqat/plugin/prayerservice"))
}
android.sourceSets["main"].kotlin.srcDir(layout.buildDirectory.dir("pluginSrc"))
tasks.named("preBuild") { dependsOn(pluginSources) }
