package com.scribbleaway.meetingrecorder.ui.preview

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.fragment.navArgs
import com.google.android.material.snackbar.Snackbar
import com.scribbleaway.meetingrecorder.R
import com.scribbleaway.meetingrecorder.databinding.FragmentPreviewBinding
import com.scribbleaway.meetingrecorder.model.MeetingSummary
import com.scribbleaway.meetingrecorder.model.TranscriptSegment
import com.scribbleaway.meetingrecorder.util.formatTimestamp
import kotlinx.coroutines.launch

class PreviewFragment : Fragment() {

    private var _binding: FragmentPreviewBinding? = null
    private val binding get() = _binding!!
    private val viewModel: PreviewViewModel by viewModels()
    private val args: PreviewFragmentArgs by navArgs()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentPreviewBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnExport.setOnClickListener { viewModel.exportDocx() }

        viewLifecycleOwner.lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { viewModel.processing.collect { showProgress(it) } }
                launch { viewModel.processingStatus.collect { binding.tvProcessingStatus.text = it } }
                launch { viewModel.summary.collect { s -> s?.let { renderSummary(it) } } }
                launch { viewModel.transcript.collect { t -> if (t.isNotEmpty()) renderTranscript(t) } }
                launch {
                    viewModel.exportUri.collect { uri ->
                        uri ?: return@collect
                        shareDocx(uri)
                        viewModel.clearExportUri()
                    }
                }
                launch {
                    viewModel.error.collect { err ->
                        err ?: return@collect
                        Snackbar.make(binding.root, err, Snackbar.LENGTH_INDEFINITE)
                            .setAction("OK") { viewModel.clearError() }
                            .show()
                    }
                }
            }
        }

        viewModel.loadAndProcess(args.meetingId)
    }

    private fun showProgress(show: Boolean) {
        binding.progressBar.visibility = if (show) View.VISIBLE else View.GONE
        binding.tvProcessingStatus.visibility = if (show) View.VISIBLE else View.GONE
        binding.btnExport.isEnabled = !show
        binding.scrollContent.visibility = if (show) View.GONE else View.VISIBLE
    }

    private fun renderSummary(summary: MeetingSummary) {
        val sb = StringBuilder()
        sb.appendLine("═══════════════════════════════════")
        sb.appendLine("  RÉSUMÉ EXÉCUTIF")
        sb.appendLine("═══════════════════════════════════\n")
        sb.appendLine(summary.resumeExecutif)
        sb.appendLine()

        if (summary.pointsDiscutes.isNotEmpty()) {
            sb.appendLine("───────────────────────────────────")
            sb.appendLine("  POINTS DISCUTÉS")
            sb.appendLine("───────────────────────────────────\n")
            summary.pointsDiscutes.forEach { p ->
                sb.appendLine("▸ [${p.timestamp}] ${p.sujet}")
                if (p.details.isNotBlank()) sb.appendLine("  ${p.details}")
                sb.appendLine()
            }
        }

        if (summary.decisions.isNotEmpty()) {
            sb.appendLine("───────────────────────────────────")
            sb.appendLine("  DÉCISIONS PRISES")
            sb.appendLine("───────────────────────────────────\n")
            summary.decisions.forEach { sb.appendLine("✓ $it") }
            sb.appendLine()
        }

        if (summary.actions.isNotEmpty()) {
            sb.appendLine("───────────────────────────────────")
            sb.appendLine("  ACTIONS À ENTREPRENDRE")
            sb.appendLine("───────────────────────────────────\n")
            summary.actions.forEach { a ->
                sb.appendLine("→ ${a.action}")
                if (a.responsable.isNotBlank()) sb.appendLine("  Responsable : ${a.responsable}")
                if (a.echeance.isNotBlank()) sb.appendLine("  Échéance    : ${a.echeance}")
                sb.appendLine()
            }
        }

        if (summary.pointsEnSuspens.isNotEmpty()) {
            sb.appendLine("───────────────────────────────────")
            sb.appendLine("  POINTS EN SUSPENS")
            sb.appendLine("───────────────────────────────────\n")
            summary.pointsEnSuspens.forEach { sb.appendLine("? $it") }
            sb.appendLine()
        }

        binding.tvSummary.text = sb.toString()
    }

    private fun renderTranscript(segments: List<TranscriptSegment>) {
        val sb = StringBuilder()
        sb.appendLine("═══════════════════════════════════")
        sb.appendLine("  TRANSCRIPTION COMPLÈTE")
        sb.appendLine("═══════════════════════════════════\n")
        var lastSpeaker = ""
        segments.forEach { seg ->
            if (seg.speaker != lastSpeaker) {
                if (lastSpeaker.isNotEmpty()) sb.appendLine()
                lastSpeaker = seg.speaker
            }
            sb.appendLine("[${formatTimestamp(seg.startSeconds)}] ${seg.speaker}")
            sb.appendLine(seg.text)
        }
        binding.tvTranscript.text = sb.toString()
    }

    private fun shareDocx(uri: android.net.Uri) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(intent, getString(R.string.share_docx)))
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
