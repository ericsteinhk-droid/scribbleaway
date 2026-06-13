import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

let _client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('[Anthropic] ANTHROPIC_API_KEY environment variable is not set');
  }
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/**
 * Convert internal message format to Anthropic content blocks,
 * injecting any attachments into the appropriate message.
 *
 * @param {Array} messages - Internal messages array
 * @param {Array} attachments - [{type, name, mimeType, data}]
 * @returns {Array} Anthropic-formatted messages
 */
function buildAnthropicMessages(messages, attachments = []) {
  const converted = messages.map((msg, idx) => {
    const isLast = idx === messages.length - 1;
    const isUser = msg.role === 'user';

    // Only attach files to the last user message
    const shouldInjectAttachments = isLast && isUser && attachments.length > 0;

    if (!shouldInjectAttachments) {
      return {
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: typeof msg.content === 'string'
          ? [{ type: 'text', text: msg.content }]
          : msg.content,
      };
    }

    // Build content blocks for the last user message with attachments
    const contentBlocks = [];

    // Prepend text attachments as text blocks first
    for (const attachment of attachments) {
      if (attachment.type === 'text') {
        const decoded = Buffer.from(attachment.data, 'base64').toString('utf-8');
        contentBlocks.push({
          type: 'text',
          text: `[File: ${attachment.name}]\n${decoded}`,
        });
      }
    }

    // Add image and PDF attachments
    for (const attachment of attachments) {
      if (attachment.type === 'image') {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: attachment.mimeType,
            data: attachment.data,
          },
        });
      } else if (attachment.type === 'pdf') {
        contentBlocks.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: attachment.data,
          },
        });
      }
    }

    // Add the actual message text
    const messageText = typeof msg.content === 'string'
      ? msg.content
      : msg.content?.map?.(b => b.text ?? '').join('') ?? '';

    if (messageText) {
      contentBlocks.push({ type: 'text', text: messageText });
    }

    return {
      role: 'user',
      content: contentBlocks,
    };
  });

  return converted;
}

/**
 * Stream a chat completion from Anthropic.
 *
 * @param {Object} params
 * @param {Array}  params.messages      - Conversation messages
 * @param {string} [params.model]       - Model ID override
 * @param {string} [params.systemPrompt]
 * @param {number} [params.temperature]
 * @param {number} [params.maxTokens]
 * @param {Array}  [params.attachments] - [{type, name, mimeType, data}]
 * @param {Function} onChunk  - Called with each text delta string
 * @param {Function} onDone   - Called with { inputTokens, outputTokens } on completion
 * @param {AbortSignal} signal - AbortController signal for cancellation
 */
export async function streamChat(params, onChunk, onDone, signal) {
  const {
    messages = [],
    model = DEFAULT_MODEL,
    systemPrompt,
    temperature,
    maxTokens = 8192,
    attachments = [],
  } = params;

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('[Anthropic] ANTHROPIC_API_KEY environment variable is not set');
  }

  const anthropicMessages = buildAnthropicMessages(messages, attachments);

  const requestParams = {
    model,
    max_tokens: maxTokens,
    messages: anthropicMessages,
  };

  if (systemPrompt) {
    requestParams.system = systemPrompt;
  }

  if (temperature !== undefined && temperature !== null) {
    requestParams.temperature = temperature;
  }

  try {
    const stream = await getClient().messages.stream(requestParams, {
      signal,
    });

    for await (const event of stream) {
      if (signal?.aborted) {
        break;
      }

      if (
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta'
      ) {
        onChunk(event.delta.text);
      }
    }

    const finalMessage = await stream.finalMessage();
    const usage = finalMessage.usage ?? {};

    onDone({
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    });
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) {
      // Graceful abort — not an error condition
      return;
    }

    const status = err.status ?? err.statusCode;
    if (status === 401) {
      throw new Error('[Anthropic] Invalid API key. Please check your ANTHROPIC_API_KEY.');
    }
    if (status === 429) {
      throw new Error('[Anthropic] Rate limit exceeded. Please wait before retrying.');
    }
    if (status === 400) {
      throw new Error(`[Anthropic] Bad request: ${err.message ?? 'Invalid request parameters.'}`);
    }
    if (status >= 500) {
      throw new Error(`[Anthropic] Server error (${status}). Please try again later.`);
    }

    throw new Error(`[Anthropic] Streaming failed: ${err.message ?? String(err)}`);
  }
}
