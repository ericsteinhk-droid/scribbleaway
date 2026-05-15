package com.scribbleaway.meetingrecorder.service

import android.content.ComponentName
import android.content.ServiceConnection
import android.os.IBinder
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class RecordingServiceConnection : ServiceConnection {

    private val _service = MutableStateFlow<RecordingService?>(null)
    val service: StateFlow<RecordingService?> = _service.asStateFlow()

    override fun onServiceConnected(name: ComponentName, binder: IBinder) {
        _service.value = (binder as RecordingService.RecordingBinder).getService()
    }

    override fun onServiceDisconnected(name: ComponentName) {
        _service.value = null
    }
}
