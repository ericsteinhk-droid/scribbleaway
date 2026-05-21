package com.visiteLieux;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
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
        webView.setWebChromeClient(new WebChromeClient());
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("handleAndroidBack()", null);
    }

    /* ───────────── JavaScript Bridge ───────────── */
    class Bridge {

        /**
         * Save any file (Excel, PDF…) from base64 and open the system share dialog.
         * Called from JavaScript: AndroidBridge.shareFile(base64, filename, mimeType)
         */
        @JavascriptInterface
        public void shareFile(final String base64Data,
                              final String filename,
                              final String mimeType) {
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
                        openShareDialog(file, mimeType);
                    }
                });
            } catch (final IOException e) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(MainActivity.this,
                            "Erreur : " + e.getMessage(), Toast.LENGTH_LONG).show();
                    }
                });
            }
        }

        /** Let the JavaScript close the app cleanly (home-screen back press). */
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { finish(); }
            });
        }
    }

    /* ───────────── Helpers ───────────── */
    private File getOutputDir() {
        File ext = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        return ext != null ? ext : new File(getFilesDir(), "documents");
    }

    private void openShareDialog(File file, String mimeType) {
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_STREAM, Uri.fromFile(file));
        intent.putExtra(Intent.EXTRA_SUBJECT, "Fiche de présences — Visite des lieux");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(intent, "Partager par…"));
    }
}
