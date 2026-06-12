import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const DEFAULT_MODEL = 'gemini-2.5-flash-preview-05-20';

function getClient() {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('[Gemini] GOOGLE_API_KEY environment variable is not set');
  }
  return new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
}

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

function buildGeminiParts(message, attachments = [], isLast = false) {
  const parts = [];

  if (isLast && attachments.length > 0) {
    for (const att of attachments) {
      if (att.type === 'image') {
        parts.push({
          inlineData: { mimeType: att.mimeType, data: att.data },
        });
      } else if (att.type === 'pdf') {
        parts.push({
          inlineData: { mimeType: 'application/pdf', data: att.data },
        });
      } else if (att.type === 'text') {
        const decoded = Buffer.from(att.data, 'base64').toString('utf-8');
        parts.push({ text: `[Fichier: ${att.name}]\n${decoded}` });
      }
    }
  }

  const text = typeof message.content === 'string' ? message.content : '';
  if (text) parts.push({ text });

  return parts;
}

function buildGeminiHistory(messages, attachments = []) {
  const history = [];

  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const role = msg.role === 'user' ? 'user' : 'model';
    history.push({
      role,
      parts: [{ text: typeof msg.content === 'string' ? msg.content : '' }],
    });
  }

  return history;
}

export async function streamChat(params, onChunk, onDone, signal) {
  const {
    messages = [],
    model = DEFAULT_MODEL,
    systemPrompt,
    temperature,
    maxTokens = 8192,
    attachments = [],
  } = params;

  const genAI = getClient();

  const generationConfig = {
    maxOutputTokens: maxTokens,
  };
  if (temperature !== undefined && temperature !== null) {
    generationConfig.temperature = temperature;
  }

  const modelConfig = {
    model,
    safetySettings: SAFETY_SETTINGS,
    generationConfig,
  };

  if (systemPrompt) {
    modelConfig.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const genModel = genAI.getGenerativeModel(modelConfig);

  const history = buildGeminiHistory(messages, attachments);

  const chat = genModel.startChat({ history });

  const lastMessage = messages[messages.length - 1];
  const lastParts = buildGeminiParts(lastMessage, attachments, true);

  try {
    const result = await chat.sendMessageStream(lastParts);

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of result.stream) {
      if (signal?.aborted) break;

      const text = chunk.text?.();
      if (text) onChunk(text);
    }

    try {
      const response = await result.response;
      const usageMeta = response.usageMetadata;
      if (usageMeta) {
        inputTokens = usageMeta.promptTokenCount ?? 0;
        outputTokens = usageMeta.candidatesTokenCount ?? 0;
      }
    } catch {
      // Usage metadata not always available
    }

    onDone({ inputTokens, outputTokens });
  } catch (err) {
    if (signal?.aborted) return;

    const msg = err.message ?? String(err);
    if (msg.includes('API key')) throw new Error('[Gemini] Clé API invalide. Vérifiez GOOGLE_API_KEY.');
    if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) throw new Error('[Gemini] Quota dépassé. Veuillez patienter.');
    if (msg.includes('SAFETY')) throw new Error('[Gemini] Contenu bloqué par les filtres de sécurité.');

    throw new Error(`[Gemini] Échec du streaming: ${msg}`);
  }
}
