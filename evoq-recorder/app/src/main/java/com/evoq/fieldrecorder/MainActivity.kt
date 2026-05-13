package com.evoq.fieldrecorder

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import com.evoq.fieldrecorder.databinding.ActivityMainBinding

class MainActivity : BaseActivity() {

    private lateinit var binding: ActivityMainBinding
    private var useHiFi = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)

        binding.btnModeStandard.setOnClickListener { setMode(hifi = false) }
        binding.btnModeHifi.setOnClickListener { setMode(hifi = true) }

        binding.btnEnglish.setOnClickListener { selectLanguage("en", "en-CA") }
        binding.btnFrench.setOnClickListener  { selectLanguage("fr", "fr-FR") }
    }

    private fun setMode(hifi: Boolean) {
        useHiFi = hifi
        val goldColor = getColor(R.color.evoq_gold)
        val surfaceColor = getColor(R.color.evoq_dark_grey)

        if (hifi) {
            binding.btnModeStandard.setBackgroundColor(surfaceColor)
            binding.btnModeStandard.setTextColor(goldColor)
            binding.btnModeHifi.setBackgroundColor(goldColor)
            binding.btnModeHifi.setTextColor(Color.WHITE)
        } else {
            binding.btnModeStandard.setBackgroundColor(goldColor)
            binding.btnModeStandard.setTextColor(Color.WHITE)
            binding.btnModeHifi.setBackgroundColor(surfaceColor)
            binding.btnModeHifi.setTextColor(goldColor)
        }
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
                if (useHiFi) {
                    startActivity(Intent(this, WhisperRecorderActivity::class.java).apply {
                        putExtra(WhisperRecorderActivity.EXTRA_LANGUAGE, speechLang)
                    })
                } else {
                    startActivity(Intent(this, RecorderActivity::class.java).apply {
                        putExtra(RecorderActivity.EXTRA_LANGUAGE, speechLang)
                    })
                }
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
