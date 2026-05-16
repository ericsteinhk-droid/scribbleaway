package com.scribbleaway.meetingrecorder.network

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class AnthropicClient(private val apiKeyProvider: () -> String) {

    private val gson = Gson()

    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(300, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private data class Message(val role: String, val content: String)

    private data class ApiRequest(
        val model: String,
        @SerializedName("max_tokens") val maxTokens: Int,
        val temperature: Double,
        val system: String,
        val messages: List<Message>
    )

    private data class ContentBlock(val type: String, val text: String?)
    private data class ApiResponse(val content: List<ContentBlock>)

    fun complete(
        system: String,
        userMessage: String,
        temperature: Double = 0.2,
        maxTokens: Int = 4096
    ): String {
        val key = apiKeyProvider()
        if (key.isBlank()) throw RuntimeException(
            "Clé API Anthropic non configurée. Veuillez l'ajouter dans Paramètres."
        )

        val body = ApiRequest(
            model = "claude-sonnet-4-6",
            maxTokens = maxTokens,
            temperature = temperature,
            system = system,
            messages = listOf(Message("user", userMessage))
        )
        val reqBody = gson.toJson(body).toRequestBody("application/json".toMediaType())

        val httpReq = Request.Builder()
            .url("https://api.anthropic.com/v1/messages")
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .post(reqBody)
            .build()

        http.newCall(httpReq).execute().use { response ->
            val bodyStr = response.body?.string() ?: throw RuntimeException("Réponse Anthropic vide")
            if (!response.isSuccessful) throw RuntimeException("Erreur Anthropic ${response.code}: $bodyStr")
            val parsed = gson.fromJson(bodyStr, ApiResponse::class.java)
            return parsed.content.firstOrNull { it.type == "text" }?.text
                ?: throw RuntimeException("Aucun contenu texte dans la réponse Anthropic")
        }
    }
}
