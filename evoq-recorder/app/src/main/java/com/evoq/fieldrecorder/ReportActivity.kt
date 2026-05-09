package com.evoq.fieldrecorder

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.MenuItem
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
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
import java.io.File
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
        binding.btnDownloadDocx.setOnClickListener { downloadDocx() }

        generateReport()
    }

    private fun setupSortSpinner(isFrench: Boolean) {
        val options = if (isFrench) arrayOf("Trier par étage", "Trier par zone")
                      else arrayOf("Sort by Floor", "Sort by Zone")
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
        if (apiKey.isBlank()) { showNoApiKey(); return }

        setLoading(true)
        binding.tvTranscriptPreview.text = transcript

        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                callClaudeApi(apiKey, transcript, language, recordingDate, sortMode)
            }
            setLoading(false)
            if (result.startsWith("ERROR:")) {
                Toast.makeText(this@ReportActivity,
                    result.removePrefix("ERROR:").trim(), Toast.LENGTH_LONG).show()
                binding.tvReport.text = result
            } else {
                currentReport = result
                binding.tvReport.text = result
            }
        }
    }

    private fun setLoading(loading: Boolean) {
        binding.progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        binding.tvReport.visibility = if (loading) View.GONE else View.VISIBLE
        binding.btnShare.isEnabled = !loading
        binding.btnRegenerate.isEnabled = !loading
        binding.btnDownloadDocx.isEnabled = !loading
    }

    private fun callClaudeApi(
        apiKey: String, transcript: String, language: String,
        date: String, sortMode: String
    ): String {
        val isFrench = language.startsWith("fr")
        val sortInstruction = if (sortMode == "floor") {
            if (isFrench) "par étage (ex: Sous-sol, RDC, 1er étage, 2e étage, Toit)"
            else "by floor (e.g., Basement, Ground Floor, 1st Floor, 2nd Floor, Roof)"
        } else {
            if (isFrench) "par zone (ex: Entrée, Bureau, Cuisine, Salle de conférence, Corridor)"
            else "by zone (e.g., Entrance, Office, Kitchen, Conference Room, Corridor)"
        }

        val systemPrompt = if (isFrench) """Tu es un assistant spécialisé pour EVOQ Architecture.
Tu reçois une transcription audio d'inspection de chantier et tu génères un rapport de chantier professionnel.

Instructions de formatage (IMPORTANT — respecter exactement) :
- Ligne 1 : "EVOQ Architecture"
- Ligne 2 : "Rapport de chantier"
- Ligne 3 : "Date : $date"
- Ligne 4 : vide
- Organise les observations $sortInstruction
- Chaque section : titre de section seul sur sa ligne, puis observations précédées de "•"
- Corrige les erreurs de transcription évidentes
- Utilise un langage professionnel d'architecture
- Termine par "Remarques générales" si nécessaire
- NE PAS utiliser de markdown (pas de **, pas de #)"""
        else """You are a specialized assistant for EVOQ Architecture.
You receive an audio transcription from a construction site inspection and generate a professional field report.

Formatting instructions (IMPORTANT — follow exactly):
- Line 1: "EVOQ Architecture"
- Line 2: "Field Report"
- Line 3: "Date: $date"
- Line 4: blank
- Organize observations $sortInstruction
- Each section: section title alone on its line, then observations prefixed with "•"
- Correct obvious transcription errors
- Use professional architectural language
- End with "General Notes" if needed
- Do NOT use markdown (no **, no #)"""

        val userMessage = if (isFrench) "Transcription :\n\n$transcript"
                          else "Transcription:\n\n$transcript"

        val body = JSONObject().apply {
            put("model", "claude-sonnet-4-6")
            put("max_tokens", 2048)
            put("system", systemPrompt)
            put("messages", JSONArray().put(JSONObject().apply {
                put("role", "user")
                put("content", userMessage)
            }))
        }

        val request = Request.Builder()
            .url("https://api.anthropic.com/v1/messages")
            .addHeader("x-api-key", apiKey)
            .addHeader("anthropic-version", "2023-06-01")
            .addHeader("content-type", "application/json")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()

        return try {
            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""
            if (!response.isSuccessful) "ERROR: ${response.code}: $responseBody"
            else JSONObject(responseBody).getJSONArray("content")
                .getJSONObject(0).getString("text")
        } catch (e: Exception) {
            "ERROR: ${e.message}"
        }
    }

    private fun downloadDocx() {
        if (currentReport.isBlank()) return
        val filename = "EVOQ_FieldReport_${recordingDate}.docx"

        lifecycleScope.launch {
            val docxBytes = withContext(Dispatchers.IO) {
                DocxGenerator.generate(currentReport)
            }

            val saved = withContext(Dispatchers.IO) { saveToDownloads(filename, docxBytes) }

            if (saved) {
                Toast.makeText(
                    this@ReportActivity,
                    getString(R.string.docx_saved, filename),
                    Toast.LENGTH_LONG
                ).show()
            } else {
                // Fall back to share sheet
                shareDocxBytes(filename, docxBytes)
            }
        }
    }

    private fun saveToDownloads(filename: String, data: ByteArray): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, filename)
                    put(MediaStore.Downloads.MIME_TYPE, DOCX_MIME)
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val uri = contentResolver.insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
                contentResolver.openOutputStream(uri)?.use { it.write(data) }
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                contentResolver.update(uri, values, null, null)
                true
            } else {
                @Suppress("DEPRECATION")
                val dir = Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_DOWNLOADS)
                dir.mkdirs()
                File(dir, filename).writeBytes(data)
                true
            }
        } catch (e: Exception) {
            false
        }
    }

    private fun shareDocxBytes(filename: String, data: ByteArray) {
        try {
            val docxDir = File(cacheDir, "docx").apply { mkdirs() }
            val file = File(docxDir, filename).apply { writeBytes(data) }
            val uri: Uri = FileProvider.getUriForFile(
                this, "${packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = DOCX_MIME
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(intent, getString(R.string.share_report)))
        } catch (e: Exception) {
            Toast.makeText(this, e.message, Toast.LENGTH_LONG).show()
        }
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

    private fun showNoApiKey() {
        val isFrench = language.startsWith("fr")
        binding.tvReport.text = if (isFrench)
            "Aucune clé API configurée.\n\nAllez dans Paramètres et entrez votre clé API Claude."
        else
            "No API key configured.\n\nGo to Settings and enter your Claude API key."
        binding.tvReport.visibility = View.VISIBLE
        binding.progressBar.visibility = View.GONE
        binding.btnRegenerate.isEnabled = true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) { finish(); return true }
        return super.onOptionsItemSelected(item)
    }

    private companion object {
        const val DOCX_MIME =
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }
}
