package com.evoq.fieldrecorder

import android.content.Intent
import android.os.Bundle
import android.view.MenuItem
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.evoq.fieldrecorder.databinding.ActivityReportBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ReportActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_TRANSCRIPT = "extra_transcript"
        const val EXTRA_LANGUAGE = "extra_language"
        const val EXTRA_RECORDING_DATE = "extra_recording_date"
    }

    private lateinit var binding: ActivityReportBinding
    private var currentReport = ""
    private var sortMode = "floor"
    private var language = "en-CA"
    private var transcript = ""
    private var recordingDate = ""
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityReportBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        transcript = intent.getStringExtra(EXTRA_TRANSCRIPT) ?: ""
        language = intent.getStringExtra(EXTRA_LANGUAGE) ?: "en-CA"
        recordingDate = intent.getStringExtra(EXTRA_RECORDING_DATE) ?: ""

        val isFrench = language.startsWith("fr")
        supportActionBar?.title = if (isFrench) "Rapport de chantier" else "Field Report"

        setupSortSpinner(isFrench)

        binding.btnShare.setOnClickListener { shareReport() }
        binding.btnRegenerate.setOnClickListener { generateReport() }

        generateReport()
    }

    private fun setupSortSpinner(isFrench: Boolean) {
        val options = if (isFrench) {
            arrayOf("Trier par étage", "Trier par zone")
        } else {
            arrayOf("Sort by Floor", "Sort by Zone")
        }
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, options)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        binding.spinnerSort.adapter = adapter
        binding.spinnerSort.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val newMode = if (position == 0) "floor" else "zone"
                if (newMode != sortMode && currentReport.isNotEmpty()) {
                    sortMode = newMode
                    generateReport()
                } else {
                    sortMode = newMode
                }
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
    }

    private fun generateReport() {
        val apiKey = getSharedPreferences("evoq_prefs", MODE_PRIVATE)
            .getString("claude_api_key", "") ?: ""

        if (apiKey.isBlank()) {
            showNoApiKey()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        binding.tvReport.visibility = View.GONE
        binding.tvTranscriptPreview.text = transcript
        binding.btnShare.isEnabled = false
        binding.btnRegenerate.isEnabled = false

        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                callClaudeApi(apiKey, transcript, language, recordingDate, sortMode)
            }
            binding.progressBar.visibility = View.GONE
            binding.tvReport.visibility = View.VISIBLE
            binding.btnShare.isEnabled = true
            binding.btnRegenerate.isEnabled = true

            if (result.startsWith("ERROR:")) {
                Toast.makeText(this@ReportActivity, result.removePrefix("ERROR:").trim(), Toast.LENGTH_LONG).show()
                binding.tvReport.text = result
            } else {
                currentReport = result
                binding.tvReport.text = result
            }
        }
    }

    private fun callClaudeApi(
        apiKey: String,
        transcript: String,
        language: String,
        date: String,
        sortMode: String
    ): String {
        val isFrench = language.startsWith("fr")
        val langInstruction = if (isFrench) "en français" else "in English"
        val sortInstruction = if (sortMode == "floor") {
            if (isFrench) "par étage (ex: Sous-sol, RDC, 1er étage, 2e étage, Toit)"
            else "by floor (e.g., Basement, Ground Floor, 1st Floor, 2nd Floor, Roof)"
        } else {
            if (isFrench) "par zone (ex: Entrée, Bureau, Cuisine, Salle de conférence, Corridor)"
            else "by zone (e.g., Entrance, Office, Kitchen, Conference Room, Corridor)"
        }

        val systemPrompt = if (isFrench) {
            """Tu es un assistant spécialisé pour EVOQ Architecture.
Tu reçois une transcription audio d'inspection de chantier et tu génères un rapport de chantier professionnel.

Instructions de formatage :
- Commence par un en-tête avec : "EVOQ Architecture", "Rapport de chantier", "Date : $date"
- Organise les observations $sortInstruction
- Pour chaque section, liste les observations sous forme de points clairs et professionnels
- Corrige les erreurs de transcription évidentes dues à la reconnaissance vocale
- Utilise un langage professionnel d'architecture
- Si un étage ou une zone n'est pas mentionné, ne l'inclus pas
- Termine par une section "Remarques générales" si nécessaire"""
        } else {
            """You are a specialized assistant for EVOQ Architecture.
You receive an audio transcription from a construction site inspection and generate a professional field report.

Formatting instructions:
- Start with a header: "EVOQ Architecture", "Field Report", "Date: $date"
- Organize observations $sortInstruction
- For each section, list observations as clear, professional bullet points
- Correct obvious transcription errors from voice recognition
- Use professional architectural language
- If a floor or zone is not mentioned, do not include it
- End with a "General Notes" section if needed"""
        }

        val userMessage = if (isFrench) {
            "Voici la transcription de l'inspection :\n\n$transcript"
        } else {
            "Here is the inspection transcription:\n\n$transcript"
        }

        val requestBody = JSONObject().apply {
            put("model", "claude-sonnet-4-6")
            put("max_tokens", 2048)
            put("system", systemPrompt)
            put("messages", JSONArray().apply {
                put(JSONObject().apply {
                    put("role", "user")
                    put("content", userMessage)
                })
            })
        }

        val request = Request.Builder()
            .url("https://api.anthropic.com/v1/messages")
            .addHeader("x-api-key", apiKey)
            .addHeader("anthropic-version", "2023-06-01")
            .addHeader("content-type", "application/json")
            .post(requestBody.toString().toRequestBody("application/json".toMediaType()))
            .build()

        return try {
            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                "ERROR: API error ${response.code}: $body"
            } else {
                val json = JSONObject(body)
                json.getJSONArray("content")
                    .getJSONObject(0)
                    .getString("text")
            }
        } catch (e: Exception) {
            "ERROR: ${e.message}"
        }
    }

    private fun showNoApiKey() {
        val isFrench = language.startsWith("fr")
        binding.tvReport.text = if (isFrench) {
            "Aucune clé API configurée.\n\nVeuillez aller dans les Paramètres et entrer votre clé API Claude (Anthropic) pour générer des rapports."
        } else {
            "No API key configured.\n\nPlease go to Settings and enter your Claude (Anthropic) API key to generate reports."
        }
        binding.tvReport.visibility = View.VISIBLE
        binding.progressBar.visibility = View.GONE
        binding.btnRegenerate.isEnabled = true
    }

    private fun shareReport() {
        if (currentReport.isBlank()) return
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, currentReport)
            putExtra(Intent.EXTRA_SUBJECT, "EVOQ Field Report – $recordingDate")
        }
        startActivity(Intent.createChooser(intent, getString(R.string.share_report)))
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
