package com.evoq.transcripteur;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * Service de premier plan actif pendant un enregistrement ou une transcription.
 *
 * Le verrou de réveil de l'écran (navigator.wakeLock) empêche seulement l'écran
 * de s'éteindre : si l'usager quitte l'application ou verrouille l'appareil,
 * Android place le processus en cache et gèle le WebView, ce qui interrompt la
 * capture et suspend les requêtes en cours. Un service de premier plan empêche
 * cette mise en cache, et un verrou processeur partiel évite la mise en veille
 * profonde pendant les longs transferts.
 */
public class TaskService extends Service {

  public static final String EXTRA_TEXT = "text";
  public static final String EXTRA_KIND = "kind"; // "record" ou "transcribe"

  private static final String TAG = "TaskService";
  private static final String CHANNEL_ID = "transcripteur_taches";
  private static final int NOTIF_ID = 4711;
  private static final long MAX_HOLD_MS = 4L * 60L * 60L * 1000L; // garde-fou : 4 h

  private PowerManager.WakeLock cpuLock;

  @Override
  public void onCreate() {
    super.onCreate();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(
          CHANNEL_ID, "Tâches en cours", NotificationManager.IMPORTANCE_LOW);
      channel.setShowBadge(false);
      channel.setDescription("Indique qu'un enregistrement ou une transcription est en cours.");
      NotificationManager nm = getSystemService(NotificationManager.class);
      if (nm != null) {
        nm.createNotificationChannel(channel);
      }
    }
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String text = "Tâche en cours";
    String kind = "transcribe";
    if (intent != null) {
      if (intent.getStringExtra(EXTRA_TEXT) != null) {
        text = intent.getStringExtra(EXTRA_TEXT);
      }
      if (intent.getStringExtra(EXTRA_KIND) != null) {
        kind = intent.getStringExtra(EXTRA_KIND);
      }
    }

    Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle("Transcripteur vocal")
        .setContentText(text)
        .setSmallIcon(android.R.drawable.ic_btn_speak_now)
        .setOngoing(true)
        .setSilent(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build();

    // Le type est précisé explicitement : déclarer « microphone » pour une
    // transcription de fichier ferait échouer le démarrage sur Android 14+,
    // qui vérifie les prérequis de chaque type déclaré.
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        int type = "record".equals(kind)
            ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            : ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
        startForeground(NOTIF_ID, notif, type);
      } else {
        startForeground(NOTIF_ID, notif);
      }
    } catch (Exception e) {
      // Refus du système (restrictions de démarrage en arrière-plan, prérequis
      // manquant) : on abandonne le service sans affecter l'application.
      Log.w(TAG, "startForeground refusé : " + e.getMessage());
      stopSelf();
      return START_NOT_STICKY;
    }

    try {
      if (cpuLock == null) {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
          cpuLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "transcripteur:tache");
          cpuLock.setReferenceCounted(false);
        }
      }
      if (cpuLock != null && !cpuLock.isHeld()) {
        cpuLock.acquire(MAX_HOLD_MS);
      }
    } catch (Exception e) {
      Log.w(TAG, "verrou processeur indisponible : " + e.getMessage());
    }

    return START_NOT_STICKY;
  }

  @Override
  public void onDestroy() {
    try {
      if (cpuLock != null && cpuLock.isHeld()) {
        cpuLock.release();
      }
    } catch (Exception e) {
      Log.w(TAG, "relâchement du verrou impossible : " + e.getMessage());
    }
    cpuLock = null;
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
