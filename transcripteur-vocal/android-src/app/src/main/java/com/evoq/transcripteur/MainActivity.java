package com.evoq.transcripteur;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Activité principale. Elle ne fait qu'une chose de plus que celle générée par
 * Capacitor : enregistrer le plugin local ForegroundTask, avant
 * super.onCreate() comme Capacitor l'exige.
 *
 * Rien d'autre ne doit être ajouté ici. Une version antérieure recréait un
 * BridgeWebChromeClient dans onResume() ; son constructeur appelle
 * registerForActivityResult(), interdit après l'état STARTED, ce qui plantait
 * l'application à chaque reprise. La gestion du micro par le WebView est déjà
 * assurée par le client par défaut de Capacitor.
 */
public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(ForegroundTaskPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
