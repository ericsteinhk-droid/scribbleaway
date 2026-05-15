package com.scribbleaway.meetingrecorder.api

import com.google.gson.annotations.SerializedName

data class ChatRequest(
    val model: String = "gpt-4o",
    val messages: List<ChatMessage>,
    val temperature: Double = 0.2,
    @SerializedName("max_tokens") val maxTokens: Int = 4096,
    @SerializedName("response_format") val responseFormat: ResponseFormat? = null
)

data class ChatMessage(val role: String, val content: String)

data class ResponseFormat(val type: String)  // "json_object"

data class ChatResponse(val choices: List<ChatChoice>)

data class ChatChoice(val message: ChatMessage, @SerializedName("finish_reason") val finishReason: String?)
