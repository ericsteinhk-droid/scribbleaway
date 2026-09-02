package com.evoq.transcripteur;

import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Pont JavaScript vers {@link TaskService}. Appelé au début et à la fin d'un
 * enregistrement ou d'une transcription. Les échecs ne remontent jamais comme
 * erreur : le service est un renfort, la tâche doit se poursuivre sans lui.
 */
@CapacitorPlugin(
    name = "ForegroundTask",
    permissions = {
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class ForegroundTaskPlugin extends Plugin {

  private static final String TAG = "ForegroundTask";

  private String pendingText = "Tâche en cours";
  private String pendingKind = "transcribe";

  @PluginMethod
  public void start(PluginCall call) {
    pendingText = call.getString("text", "Tâche en cours");
    pendingKind = call.getString("kind", "transcribe");

    // Depuis Android 13, la notification obligatoire du service n'est visible
    // qu'avec cette autorisation. Le service fonctionne même sans elle, donc on
    // demande une fois puis on démarre dans tous les cas.
    if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
      requestPermissionForAlias("notifications", call, "notificationsCallback");
      return;
    }

    launch();
    call.resolve();
  }

  @PermissionCallback
  private void notificationsCallback(PluginCall call) {
    launch();
    call.resolve();
  }

  @PluginMethod
  public void stop(PluginCall call) {
    try {
      getContext().stopService(new Intent(getContext(), TaskService.class));
    } catch (Exception e) {
      Log.w(TAG, "arrêt du service impossible : " + e.getMessage());
    }
    call.resolve();
  }

  private void launch() {
    try {
      Intent intent = new Intent(getContext(), TaskService.class);
      intent.putExtra(TaskService.EXTRA_TEXT, pendingText);
      intent.putExtra(TaskService.EXTRA_KIND, pendingKind);
      ContextCompat.startForegroundService(getContext(), intent);
    } catch (Exception e) {
      Log.w(TAG, "démarrage du service impossible : " + e.getMessage());
    }
  }
}
