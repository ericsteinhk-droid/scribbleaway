package com.visiteLieux;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

public class MainActivity extends Activity {

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setBuiltInZoomControls(false);

        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient());
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    class Bridge {

        @JavascriptInterface
        public void saveExcel(final String base64Data, final String filename) {
            try {
                byte[] data = Base64.decode(base64Data, Base64.DEFAULT);
                File dir = getOutputDir();
                dir.mkdirs();
                final File file = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(file);
                fos.write(data);
                fos.close();

                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(MainActivity.this,
                            "Fichier sauvegardé :\n" + file.getAbsolutePath(),
                            Toast.LENGTH_LONG).show();
                        shareFile(file);
                    }
                });

            } catch (final IOException e) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(MainActivity.this,
                            "Erreur : " + e.getMessage(),
                            Toast.LENGTH_LONG).show();
                    }
                });
            }
        }
    }

    private File getOutputDir() {
        // App-specific external dir — no permission required
        File ext = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        if (ext != null) return ext;
        return new File(getFilesDir(), "documents");
    }

    private void shareFile(File file) {
        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        share.putExtra(Intent.EXTRA_STREAM, Uri.fromFile(file));
        share.putExtra(Intent.EXTRA_SUBJECT, "Fiche de présences — Visite des lieux");
        share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(share, "Enregistrer / Partager le fichier Excel"));
    }
}
