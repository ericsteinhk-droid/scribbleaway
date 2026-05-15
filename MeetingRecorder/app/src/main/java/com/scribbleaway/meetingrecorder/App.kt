package com.scribbleaway.meetingrecorder

import android.app.Application
import com.scribbleaway.meetingrecorder.di.AppModule
import com.scribbleaway.meetingrecorder.repository.MeetingRepository

class App : Application() {
    lateinit var meetingRepository: MeetingRepository
        private set

    override fun onCreate() {
        super.onCreate()
        meetingRepository = AppModule.provideMeetingRepository(this)
    }
}
