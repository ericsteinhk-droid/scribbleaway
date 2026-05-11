package com.evoq.fieldrecorder

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import com.evoq.fieldrecorder.databinding.ActivityMainBinding

class MainActivity : BaseActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)

        binding.btnEnglish.setOnClickListener { selectLanguage("en", "en-CA") }
        binding.btnFrench.setOnClickListener  { selectLanguage("fr", "fr-FR") }
    }

    private fun selectLanguage(appLang: String, speechLang: String) {
        getSharedPreferences("evoq_prefs", MODE_PRIVATE)
            .edit().putString("app_language", appLang).apply()

        val isFr = appLang == "fr"
        val title   = if (isFr) getString(R.string.noise_warning_title_fr)   else getString(R.string.noise_warning_title_en)
        val message = if (isFr) getString(R.string.noise_warning_message_fr) else getString(R.string.noise_warning_message_en)
        val proceed = if (isFr) getString(R.string.proceed_fr)               else getString(R.string.proceed_en)

        val dialogView = layoutInflater.inflate(R.layout.dialog_noise_warning, null)
        dialogView.findViewById<TextView>(R.id.tvNoiseWarningMessage).text = message

        AlertDialog.Builder(this)
            .setTitle(title)
            .setView(dialogView)
            .setPositiveButton(proceed) { _, _ ->
                val intent = Intent(this, RecorderActivity::class.java)
                intent.putExtra(RecorderActivity.EXTRA_LANGUAGE, speechLang)
                startActivity(intent)
            }
            .setCancelable(true)
            .show()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_settings -> {
                startActivity(Intent(this, SettingsActivity::class.java))
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
}
