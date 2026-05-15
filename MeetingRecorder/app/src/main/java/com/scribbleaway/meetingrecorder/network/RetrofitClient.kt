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

// apiKeyProvider is a lambda so the key is read from prefs on every call,
// not captured once at construction time (which would bake in an empty key
// if the user hadn't yet entered it when the app first started).
class OpenAiClient(private val apiKeyProvider: () -> String) {

    private val gson = Gson()

    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(300, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .build()

    fun transcribeAudio(file: File, prompt: String): WhisperResponse {
        val key = apiKeyProvider()
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
            .header("Authorization", "Bearer $key")
            .post(body)
            .build()

        http.newCall(request).execute().use { response ->
            val bodyStr = response.body?.string() ?: throw RuntimeException("Empty Whisper response")
            if (!response.isSuccessful) throw RuntimeException("Whisper error ${response.code}: $bodyStr")
            return gson.fromJson(bodyStr, WhisperResponse::class.java)
        }
    }

    fun chatCompletion(request: ChatRequest): ChatResponse {
        val key = apiKeyProvider()
        val json = gson.toJson(request)
        val reqBody = json.toRequestBody("application/json".toMediaType())

        val httpReq = Request.Builder()
            .url("https://api.openai.com/v1/chat/completions")
            .header("Authorization", "Bearer $key")
            .post(reqBody)
            .build()

        http.newCall(httpReq).execute().use { response ->
            val bodyStr = response.body?.string() ?: throw RuntimeException("Empty chat response")
            if (!response.isSuccessful) throw RuntimeException("OpenAI chat error ${response.code}: $bodyStr")
            return gson.fromJson(bodyStr, ChatResponse::class.java)
        }
    }
}
