package com.scribbleaway.meetingrecorder.ui.settings

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.google.android.material.snackbar.Snackbar
import com.scribbleaway.meetingrecorder.R
import com.scribbleaway.meetingrecorder.databinding.FragmentSettingsBinding

class SettingsFragment : Fragment() {

    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!
    private val viewModel: SettingsViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val prefs = viewModel.prefs
        binding.etApiKey.setText(prefs.openAiApiKey)
        binding.etMeetingTitle.setText(prefs.meetingTitleTemplate)
        binding.sliderChunkDuration.value = prefs.chunkDurationMinutes.toFloat()
        binding.sliderSpeakers.value = prefs.defaultSpeakerCount.toFloat()
        updateChunkLabel(prefs.chunkDurationMinutes)
        updateSpeakerLabel(prefs.defaultSpeakerCount)

        binding.sliderChunkDuration.addOnChangeListener { _, value, _ ->
            updateChunkLabel(value.toInt())
        }
        binding.sliderSpeakers.addOnChangeListener { _, value, _ ->
            updateSpeakerLabel(value.toInt())
        }

        binding.btnSave.setOnClickListener {
            val key = binding.etApiKey.text?.toString()?.trim() ?: ""
            if (key.isBlank()) {
                Snackbar.make(binding.root, R.string.api_key_empty, Snackbar.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            prefs.openAiApiKey = key
            prefs.meetingTitleTemplate = binding.etMeetingTitle.text?.toString()?.trim()
                ?.ifBlank { "Réunion de chantier" } ?: "Réunion de chantier"
            prefs.chunkDurationMinutes = binding.sliderChunkDuration.value.toInt()
            prefs.defaultSpeakerCount = binding.sliderSpeakers.value.toInt()
            Snackbar.make(binding.root, R.string.settings_saved, Snackbar.LENGTH_SHORT).show()
            findNavController().popBackStack()
        }
    }

    private fun updateChunkLabel(minutes: Int) {
        binding.tvChunkLabel.text = getString(R.string.chunk_duration_label, minutes)
    }

    private fun updateSpeakerLabel(count: Int) {
        binding.tvSpeakerLabel.text = getString(R.string.speaker_count_label, count)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
