package com.scribbleaway.meetingrecorder.ui.record

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.fragment.findNavController
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.scribbleaway.meetingrecorder.R
import com.scribbleaway.meetingrecorder.databinding.FragmentRecordBinding
import com.scribbleaway.meetingrecorder.service.RecordingState
import com.scribbleaway.meetingrecorder.util.formatElapsed
import kotlinx.coroutines.launch

class RecordFragment : Fragment() {

    private var _binding: FragmentRecordBinding? = null
    private val binding get() = _binding!!
    private val viewModel: RecordViewModel by viewModels()

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        if (results.values.all { it }) viewModel.startRecording()
        else Snackbar.make(binding.root, R.string.permission_denied, Snackbar.LENGTH_LONG).show()
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentRecordBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        viewModel.bindService()

        binding.btnRecord.setOnClickListener { onRecordClicked() }
        binding.btnPause.setOnClickListener { onPauseClicked() }
        binding.btnStop.setOnClickListener { viewModel.stopRecording() }
        binding.btnCancel.setOnClickListener { onCancelClicked() }
        binding.btnSettings.setOnClickListener {
            findNavController().navigate(R.id.action_record_to_settings)
        }

        viewLifecycleOwner.lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { viewModel.recordingState.collect { updateUiForState(it) } }
                launch { viewModel.elapsedSeconds.collect { binding.tvTimer.text = formatElapsed(it) } }
                launch {
                    viewModel.chunkCount.collect { count ->
                        binding.tvChunkInfo.text = if (count > 1)
                            getString(R.string.chunk_count, count) else ""
                    }
                }
                launch {
                    viewModel.navigateToPreview.collect { meetingId ->
                        if (meetingId > 0) {
                            viewModel.onNavigatedToPreview()
                            val action = RecordFragmentDirections.actionRecordToPreview(meetingId)
                            findNavController().navigate(action)
                        }
                    }
                }
            }
        }
    }

    private fun onRecordClicked() {
        if (!viewModel.hasApiKey()) {
            MaterialAlertDialogBuilder(requireContext())
                .setTitle(R.string.api_key_required_title)
                .setMessage(R.string.api_key_required_message)
                .setPositiveButton(R.string.go_to_settings) { _, _ ->
                    findNavController().navigate(R.id.action_record_to_settings)
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
            return
        }
        requestPermissionsAndRecord()
    }

    private fun requestPermissionsAndRecord() {
        val needed = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        val missing = needed.filter {
            ContextCompat.checkSelfPermission(requireContext(), it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) viewModel.startRecording()
        else permissionLauncher.launch(missing.toTypedArray())
    }

    private fun onCancelClicked() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.cancel_confirm_title)
            .setMessage(R.string.cancel_confirm_message)
            .setPositiveButton(R.string.cancel_confirm_yes) { _, _ -> viewModel.cancelRecording() }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun onPauseClicked() {
        when (viewModel.recordingState.value) {
            RecordingState.RECORDING -> viewModel.pauseRecording()
            RecordingState.PAUSED -> viewModel.resumeRecording()
            else -> {}
        }
    }

    private fun updateUiForState(state: RecordingState) {
        when (state) {
            RecordingState.IDLE -> {
                binding.btnRecord.isEnabled = true
                binding.btnRecord.text = getString(R.string.btn_record)
                binding.btnPause.visibility = View.GONE
                binding.btnStop.visibility = View.GONE
                binding.btnCancel.visibility = View.GONE
                binding.tvStatus.setText(R.string.status_ready)
                binding.recordingIndicator.visibility = View.GONE
            }
            RecordingState.RECORDING -> {
                binding.btnRecord.isEnabled = false
                binding.btnPause.visibility = View.VISIBLE
                binding.btnPause.text = getString(R.string.btn_pause)
                binding.btnStop.visibility = View.VISIBLE
                binding.btnCancel.visibility = View.VISIBLE
                binding.tvStatus.setText(R.string.status_recording)
                binding.recordingIndicator.visibility = View.VISIBLE
            }
            RecordingState.PAUSED -> {
                binding.btnRecord.isEnabled = false
                binding.btnPause.visibility = View.VISIBLE
                binding.btnPause.text = getString(R.string.btn_resume)
                binding.btnStop.visibility = View.VISIBLE
                binding.btnCancel.visibility = View.VISIBLE
                binding.tvStatus.setText(R.string.status_paused)
                binding.recordingIndicator.visibility = View.GONE
            }
            RecordingState.STOPPED -> {
                binding.btnRecord.isEnabled = false
                binding.btnPause.visibility = View.GONE
                binding.btnStop.visibility = View.GONE
                binding.btnCancel.visibility = View.GONE
                binding.tvStatus.setText(R.string.status_processing)
                binding.recordingIndicator.visibility = View.GONE
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        viewModel.unbindService()
        _binding = null
    }
}
