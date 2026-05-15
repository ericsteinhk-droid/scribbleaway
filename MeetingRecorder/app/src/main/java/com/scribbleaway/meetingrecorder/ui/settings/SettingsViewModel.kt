package com.scribbleaway.meetingrecorder.ui.settings

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import com.scribbleaway.meetingrecorder.prefs.AppPreferences

class SettingsViewModel(app: Application) : AndroidViewModel(app) {
    val prefs = AppPreferences(app)
}
