package com.evoq.fieldrecorder

import android.content.Intent
import android.os.Bundle
import android.view.MenuItem
import androidx.appcompat.app.AlertDialog
import com.evoq.fieldrecorder.databinding.ActivitySettingsBinding

class SettingsActivity : BaseActivity() {

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
            if (key.isBlank()) return@setOnClickListener
            prefs.edit().putString("claude_api_key", key).apply()
            showSavedDialog()
        }
    }

    private fun showSavedDialog() {
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.api_key_saved_title))
            .setMessage(getString(R.string.api_key_saved_message))
            .setPositiveButton(getString(R.string.go_home)) { _, _ ->
                // Navigate back to MainActivity, clearing the back stack
                val intent = Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
                startActivity(intent)
                finish()
            }
            .setNegativeButton(getString(R.string.stay_here)) { dialog, _ ->
                dialog.dismiss()
            }
            .setCancelable(true)
            .show()
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) { finish(); return true }
        return super.onOptionsItemSelected(item)
    }
}
