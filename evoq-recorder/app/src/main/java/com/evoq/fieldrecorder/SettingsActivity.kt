package com.evoq.fieldrecorder

import android.os.Bundle
import android.view.MenuItem
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.evoq.fieldrecorder.databinding.ActivitySettingsBinding

class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = getString(R.string.settings)

        val prefs = getSharedPreferences("evoq_prefs", MODE_PRIVATE)
        val savedKey = prefs.getString("claude_api_key", "") ?: ""
        if (savedKey.isNotBlank()) {
            binding.etApiKey.setText(savedKey)
        }

        binding.btnSave.setOnClickListener {
            val key = binding.etApiKey.text.toString().trim()
            prefs.edit().putString("claude_api_key", key).apply()
            Toast.makeText(this, getString(R.string.api_key_saved), Toast.LENGTH_SHORT).show()
        }
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
