package com.evoq.fieldrecorder

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import com.evoq.fieldrecorder.databinding.ActivityMainBinding

class MainActivity : BaseActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)

        binding.btnEnglish.setOnClickListener { selectLanguage("en", "en-CA") }
        binding.btnFrench.setOnClickListener  { selectLanguage("fr", "fr-CA") }
    }

    private fun selectLanguage(appLang: String, speechLang: String) {
        getSharedPreferences("evoq_prefs", MODE_PRIVATE)
            .edit().putString("app_language", appLang).apply()
        val intent = Intent(this, RecorderActivity::class.java)
        intent.putExtra(RecorderActivity.EXTRA_LANGUAGE, speechLang)
        startActivity(intent)
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
