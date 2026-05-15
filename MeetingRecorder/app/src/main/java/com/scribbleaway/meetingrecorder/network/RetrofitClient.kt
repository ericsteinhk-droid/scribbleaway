package com.scribbleaway.meetingrecorder.network

import com.scribbleaway.meetingrecorder.api.ChatRequest
import com.scribbleaway.meetingrecorder.api.ChatResponse
import com.scribbleaway.meetingrecorder.api.WhisperResponse
import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.io.File
import java.util.concurrent.TimeUnit

class OpenAiClient(private val apiKey: String) {

    private val gson = Gson()

    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(300, TimeUnit.SECONDS)  // Whisper uploads can be slow
        .writeTimeout(120, TimeUnit.SECONDS)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .build()

    fun transcribeAudio(file: File, prompt: String): WhisperResponse {
        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("model", "whisper-1")
            .addFormDataPart("language", "fr")
            .addFormDataPart("response_format", "verbose_json")
            .addFormDataPart("prompt", prompt)
            .addFormDataPart(
                "file", file.name,
                file.asRequestBody("audio/mp4".toMediaType())
            )
            .build()

        val request = Request.Builder()
            .url("https://api.openai.com/v1/audio/transcriptions")
            .header("Authorization", "Bearer $apiKey")
            .post(body)
            .build()

        http.newCall(request).execute().use { response ->
            val bodyStr = response.body?.string() ?: throw RuntimeException("Empty Whisper response")
            if (!response.isSuccessful) throw RuntimeException("Whisper error ${response.code}: $bodyStr")
            return gson.fromJson(bodyStr, WhisperResponse::class.java)
        }
    }

    fun chatCompletion(request: ChatRequest): ChatResponse {
        val json = gson.toJson(request)
        val reqBody = json.toRequestBody("application/json".toMediaType())

        val httpReq = Request.Builder()
            .url("https://api.openai.com/v1/chat/completions")
            .header("Authorization", "Bearer $apiKey")
            .post(reqBody)
            .build()

        http.newCall(httpReq).execute().use { response ->
            val bodyStr = response.body?.string() ?: throw RuntimeException("Empty chat response")
            if (!response.isSuccessful) throw RuntimeException("OpenAI chat error ${response.code}: $bodyStr")
            return gson.fromJson(bodyStr, ChatResponse::class.java)
        }
    }
}
