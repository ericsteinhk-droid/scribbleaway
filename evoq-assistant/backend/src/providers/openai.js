import OpenAI from 'openai';

const DEFAULT_MODEL = 'gpt-4o';

let _client = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('[OpenAI] OPENAI_API_KEY environment variable is not set');
  }
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

function buildOpenAIMessages(messages, attachments = []) {
  return messages.map((msg, idx) => {
    const isLast = idx === messages.length - 1;
    const isUser = msg.role === 'user';
    const shouldInjectAttachments = isLast && isUser && attachments.length > 0;

    if (!shouldInjectAttachments) {
      return {
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: typeof msg.content === 'string' ? msg.content : msg.content,
      };
    }

    const contentParts = [];

    // Text files injected as text content
    for (const att of attachments) {
      if (att.type === 'text') {
        const decoded = Buffer.from(att.data, 'base64').toString('utf-8');
        contentParts.push({ type: 'text', text: `[Fichier: ${att.name}]\n${decoded}` });
      } else if (att.type === 'pdf') {
        throw new Error('[OpenAI] Les fichiers PDF ne sont pas supportés par GPT. Veuillez utiliser Claude ou Gemini pour les documents PDF.');
      }
    }

    // Images
    for (const att of attachments) {
      if (att.type === 'image') {
        contentParts.push({
          type: 'image_url',
          image_url: { url: `data:${att.mimeType};base64,${att.data}` },
        });
      }
    }

    const text = typeof msg.content === 'string' ? msg.content : '';
    if (text) contentParts.push({ type: 'text', text });

    return { role: 'user', content: contentParts };
  });
}

export async function streamChat(params, onChunk, onDone, signal) {
  const {
    messages = [],
    model = DEFAULT_MODEL,
    systemPrompt,
    temperature,
    maxTokens = 4096,
    attachments = [],
  } = params;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('[OpenAI] OPENAI_API_KEY environment variable is not set');
  }

  // Check for PDF attachments upfront
  if (attachments.some(a => a.type === 'pdf')) {
    throw new Error('[OpenAI] Les fichiers PDF ne sont pas supportés par GPT. Veuillez utiliser Claude ou Gemini pour les documents PDF.');
  }

  const openAIMessages = buildOpenAIMessages(messages, attachments);

  if (systemPrompt) {
    openAIMessages.unshift({ role: 'system', content: systemPrompt });
  }

  const requestParams = {
    model,
    messages: openAIMessages,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (temperature !== undefined && temperature !== null) {
    requestParams.temperature = temperature;
  }
  if (maxTokens) {
    requestParams.max_tokens = maxTokens;
  }

  try {
    const stream = await getClient().chat.completions.create(requestParams, { signal });

    let usage = { inputTokens: 0, outputTokens: 0 };

    for await (const chunk of stream) {
      if (signal?.aborted) break;

      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) onChunk(delta);

      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }

    onDone(usage);
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) return;

    const status = err.status ?? err.statusCode;
    if (status === 401) throw new Error('[OpenAI] Clé API invalide. Vérifiez OPENAI_API_KEY.');
    if (status === 429) throw new Error('[OpenAI] Limite de débit dépassée. Veuillez patienter.');
    if (status === 400) throw new Error(`[OpenAI] Requête invalide: ${err.message}`);
    if (status >= 500) throw new Error(`[OpenAI] Erreur serveur (${status}). Réessayez plus tard.`);

    throw new Error(`[OpenAI] Échec du streaming: ${err.message ?? String(err)}`);
  }
}
