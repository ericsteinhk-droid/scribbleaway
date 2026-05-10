package com.evoq.fieldrecorder

import android.content.Context
import android.content.res.Configuration
import androidx.appcompat.app.AppCompatActivity
import java.util.Locale

abstract class BaseActivity : AppCompatActivity() {

    override fun attachBaseContext(newBase: Context) {
        val lang = newBase
            .getSharedPreferences("evoq_prefs", Context.MODE_PRIVATE)
            .getString("app_language", systemLanguage()) ?: "en"
        val locale = Locale(lang)
        Locale.setDefault(locale)
        val config = Configuration(newBase.resources.configuration)
        config.setLocale(locale)
        super.attachBaseContext(newBase.createConfigurationContext(config))
    }

    private fun systemLanguage() = if (Locale.getDefault().language == "fr") "fr" else "en"
}
