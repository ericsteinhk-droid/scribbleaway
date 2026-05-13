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

class ReportActivity : BaseActivity() {

    companion object {
        const val EXTRA_TRANSCRIPT = "extra_transcript"
        const val EXTRA_LANGUAGE = "extra_language"
        const val EXTRA_RECORDING_DATE = "extra_recording_date"
        const val DOCX_MIME =
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
        supportActionBar?.title = getString(R.string.report_title)

        setupSortSpinner()
        binding.btnShare.setOnClickListener { shareReport() }
        binding.btnRegenerate.setOnClickListener { generateReport() }
        binding.btnDownloadDocx.setOnClickListener { downloadDocx() }

        generateReport()
    }

    private fun setupSortSpinner() {
        val options = arrayOf(getString(R.string.sort_by_floor), getString(R.string.sort_by_zone))
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

Structure du rapport (respecter exactement) :

1. EN-TÊTE (3 lignes) :
   EVOQ Architecture
   Rapport de chantier
   Date : $date

2. LIGNE VIDE

3. PARAGRAPHE DE MISE EN CONTEXTE (obligatoire) :
   Rédige un paragraphe de 2 à 4 phrases résumant le contexte de la visite tel qu'énoncé dans la transcription.
   Inclure si mentionné : raison / objectif de la visite, intervenants présents, portée de l'inspection,
   limites d'observation (zones inaccessibles, conditions, etc.).
   Si aucun contexte explicite n'est fourni, indiquer : "Inspection générale du bâtiment."

4. LIGNE VIDE

5. OBSERVATIONS classées $sortInstruction :
   Chaque section : titre de section seul sur sa ligne, puis observations précédées de "•"

6. "Remarques générales" en fin de rapport si nécessaire

Glossaire architectural (corriger toute transcription erronée de ces termes) :
terrazzo, gypse, démolition, hygiène, enceinte, ossature, panneau, fenêtre,
corridor, plafond, travaux, ouvriers, travailleurs, maçons, béton, plâtre

Corrections phonétiques connues (remplacer systématiquement par le terme correct) :
"terrazo", "terrazeau", "terrasse au", "terra zo", "terra zoo" → terrazzo

Règles :
- Corriger les erreurs évidentes de transcription vocale, en s'appuyant sur le glossaire ci-dessus
- Langage professionnel d'architecture
- NE PAS utiliser de markdown (pas de **, pas de #)
- CODES DE LOCALISATION : Une combinaison lettre+chiffre (ex : V3, S4, B2) désigne une aile et un étage.
  La lettre = l'aile/zone (ex : V = Aile V, S = Aile S), le chiffre = le numéro d'étage.
  Développer systématiquement ces codes en texte complet dans les titres de section et les observations
  (ex : "V3" → "3e étage — Aile V", "S4" → "4e étage — Aile S")."""
        else """You are a specialized assistant for EVOQ Architecture.
You receive an audio transcription from a construction site inspection and generate a professional field report.

Report structure (follow exactly):

1. HEADER (3 lines):
   EVOQ Architecture
   Field Report
   Date: $date

2. BLANK LINE

3. CONTEXT PARAGRAPH (mandatory):
   Write a 2–4 sentence paragraph summarising the context of the visit as stated in the transcription.
   Include if mentioned: reason / purpose of the visit, persons present, scope of inspection,
   limits of observation (areas not accessed, conditions restricting visibility, etc.).
   If no explicit context is provided, write: "General building inspection."

4. BLANK LINE

5. OBSERVATIONS organised $sortInstruction:
   Each section: section title alone on its line, then observations prefixed with "•"

6. "General Notes" at end if needed

Architectural glossary (correct any misheard transcription of these terms):
terrazzo, gypsum, demolition, hygiene, enclosure, framing, panel, window,
corridor, ceiling, works, workers, masons, concrete, plaster
French equivalents: gypse, démolition, hygiène, enceinte, ossature, panneau,
fenêtre, plafond, travaux, ouvriers/travailleurs, maçons, béton, plâtre

Rules:
- Correct obvious voice-recognition transcription errors, using the glossary above
- Use professional architectural language
- Do NOT use markdown (no **, no #)
- LOCATION CODES: A letter+number combination (e.g. V3, S4, B2) denotes a wing and floor.
  The letter = the wing/zone (e.g. V = Wing V, S = Wing S), the number = the floor level.
  Always expand these codes into full text in section headings and observations
  (e.g. "V3" → "Floor 3 — Wing V", "S4" → "Floor 4 — Wing S")."""

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
        binding.tvReport.text = getString(
            if (language.startsWith("fr")) R.string.no_api_key_fr else R.string.no_api_key_en
        )
        binding.tvReport.visibility = View.VISIBLE
        binding.progressBar.visibility = View.GONE
        binding.btnRegenerate.isEnabled = true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) { finish(); return true }
        return super.onOptionsItemSelected(item)
    }

}
