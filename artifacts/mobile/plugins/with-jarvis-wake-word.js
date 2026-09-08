const { withAndroidManifest, withMainActivity, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function ensurePermission(manifest, name) {
  manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'] || [];
  if (!manifest.manifest['uses-permission'].some((item) => item.$?.['android:name'] === name)) {
    manifest.manifest['uses-permission'].push({ $: { 'android:name': name } });
  }
}

module.exports = function withJarvisWakeWord(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    ensurePermission(manifest, 'android.permission.RECORD_AUDIO');
    ensurePermission(manifest, 'android.permission.FOREGROUND_SERVICE');
    ensurePermission(manifest, 'android.permission.FOREGROUND_SERVICE_MICROPHONE');
    ensurePermission(manifest, 'android.permission.POST_NOTIFICATIONS');

    const application = manifest.manifest.application?.[0];
    if (!application) return mod;

    application.service = application.service || [];
    if (!application.service.some((item) => item.$?.['android:name'] === '.jarvis.JarvisWakeWordService')) {
      application.service.push({
        $: {
          'android:name': '.jarvis.JarvisWakeWordService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'microphone',
          'android:stopWithTask': 'false',
        },
      });
    }

    const accessKey = process.env.PICOVOICE_ACCESS_KEY || '';
    application['meta-data'] = application['meta-data'] || [];
    const existing = application['meta-data'].find((item) => item.$?.['android:name'] === 'com.appvendorai.vendorai.JARVIS_PICOVOICE_ACCESS_KEY');
    const meta = {
      $: {
        'android:name': 'com.appvendorai.vendorai.JARVIS_PICOVOICE_ACCESS_KEY',
        'android:value': accessKey,
      },
    };
    if (existing) Object.assign(existing, meta);
    else application['meta-data'].push(meta);

    return mod;
  });

  config = withMainActivity(config, (mod) => {
    let src = mod.modResults.contents;
    if (!src.includes('JarvisWakeWordService')) {
      src = src.replace(
        /import android\.os\.Bundle\s*/,
        (match) => `${match}\nimport android.Manifest\nimport android.content.Intent\nimport android.content.pm.PackageManager\nimport androidx.core.content.ContextCompat\nimport com.appvendorai.vendorai.jarvis.JarvisWakeWordService\n`,
      );
      src = src.replace(
        /super\.onResume\(\)/,
        `super.onResume()\n    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {\n      ContextCompat.startForegroundService(this, Intent(this, JarvisWakeWordService::class.java))\n    }`,
      );
    }
    mod.modResults.contents = src;
    return mod;
  });

  config = withDangerousMod(config, ['android', async (mod) => {
    const target = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java/com/appvendorai/vendorai/jarvis/JarvisWakeWordService.kt');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `package com.appvendorai.vendorai.jarvis

import ai.picovoice.porcupine.Porcupine
import ai.picovoice.porcupine.PorcupineManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.appvendorai.vendorai.MainActivity
import com.appvendorai.vendorai.R
import java.io.File

class JarvisWakeWordService : Service() {
  private var manager: PorcupineManager? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
    val openIntent = Intent(this, MainActivity::class.java)
    val pending = PendingIntent.getActivity(this, 0, openIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    startForeground(7011, NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Jarvis ativo")
      .setContentText("Escutando apenas a palavra de ativação.")
      .setOngoing(true)
      .setContentIntent(pending)
      .build())
    startDetector()
  }

  private fun startDetector() {
    if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      stopSelf()
      return
    }
    val appInfo = packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
    val accessKey = appInfo.metaData?.getString("com.appvendorai.vendorai.JARVIS_PICOVOICE_ACCESS_KEY").orEmpty()
    if (accessKey.isBlank()) {
      stopSelf()
      return
    }
    try {
      val model = File(filesDir, "jarvis_android.ppn")
      if (!model.exists()) {
        Porcupine.trainWakeWordFromPhrase(accessKey, model.absolutePath, "pt", "Jarvis")
      }
      manager = PorcupineManager.Builder()
        .setAccessKey(accessKey)
        .setKeywordPath(model.absolutePath)
        .build(this) {
          val intent = Intent(Intent.ACTION_VIEW, Uri.parse("vendorai://jarvis?wake=1"), this, MainActivity::class.java)
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
          startActivity(intent)
        }
      manager?.start()
    } catch (_: Exception) {
      stopSelf()
    }
  }

  override fun onDestroy() {
    try { manager?.stop() } catch (_: Exception) {}
    try { manager?.delete() } catch (_: Exception) {}
    manager = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "Jarvis", NotificationManager.IMPORTANCE_LOW)
      channel.description = "Ativação por voz do Jarvis"
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  companion object { private const val CHANNEL_ID = "jarvis_wake_word" }
}
`);
    return mod;
  }]);

  return config;
};
