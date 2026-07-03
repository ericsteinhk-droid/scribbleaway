package ca.scribbleaway.transcriber

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import ca.scribbleaway.transcriber.databinding.ActivityMainBinding
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val viewModel: TranscriberViewModel by viewModels()

    private val pickAudio = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) startTranscription(uri)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.pickButton.setOnClickListener {
            pickAudio.launch(arrayOf("audio/*", "application/ogg"))
        }
        binding.copyButton.setOnClickListener { copyTranscript() }
        binding.shareButton.setOnClickListener { shareTranscript() }

        observeState()
        handleIncomingIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    /** Support "Share to" / "Open with" from other apps. */
    private fun handleIncomingIntent(intent: Intent?) {
        val uri: Uri? = when (intent?.action) {
            Intent.ACTION_SEND -> intent.getParcelableExtra(Intent.EXTRA_STREAM)
            Intent.ACTION_VIEW -> intent.data
            else -> null
        }
        if (uri != null) startTranscription(uri)
    }

    private fun startTranscription(uri: Uri) {
        val name = queryDisplayName(uri)
        binding.fileNameText.text = name ?: getString(R.string.selected_file)
        viewModel.transcribe(uri, name, withTimestamps = binding.timestampsSwitch.isChecked)
    }

    private fun observeState() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { render(it) }
            }
        }
    }

    private fun render(state: UiState) = when (state) {
        is UiState.Idle -> {
            binding.progressBar.visibility = View.GONE
            binding.statusText.visibility = View.GONE
            binding.resultCard.visibility = View.GONE
            binding.pickButton.isEnabled = true
        }
        is UiState.Working -> {
            binding.pickButton.isEnabled = false
            binding.resultCard.visibility = View.GONE
            binding.statusText.visibility = View.VISIBLE
            binding.statusText.text = state.stage
            binding.progressBar.visibility = View.VISIBLE
            if (state.progress != null) {
                binding.progressBar.isIndeterminate = false
                binding.progressBar.progress = (state.progress * 100).toInt()
            } else {
                binding.progressBar.isIndeterminate = true
            }
        }
        is UiState.Success -> {
            binding.pickButton.isEnabled = true
            binding.progressBar.visibility = View.GONE
            binding.statusText.visibility = View.GONE
            binding.resultCard.visibility = View.VISIBLE
            binding.transcriptText.text = state.text
        }
        is UiState.Failure -> {
            binding.pickButton.isEnabled = true
            binding.progressBar.visibility = View.GONE
            binding.resultCard.visibility = View.GONE
            binding.statusText.visibility = View.VISIBLE
            binding.statusText.text = getString(R.string.error_prefix, state.message)
        }
    }

    private fun currentTranscript(): String? =
        (viewModel.uiState.value as? UiState.Success)?.text

    private fun copyTranscript() {
        val text = currentTranscript() ?: return
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Transcription", text))
        Toast.makeText(this, R.string.copied, Toast.LENGTH_SHORT).show()
    }

    private fun shareTranscript() {
        val text = currentTranscript() ?: return
        val share = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        startActivity(Intent.createChooser(share, getString(R.string.share_transcript)))
    }

    private fun queryDisplayName(uri: Uri): String? = try {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
    } catch (e: Exception) {
        null
    }
}
