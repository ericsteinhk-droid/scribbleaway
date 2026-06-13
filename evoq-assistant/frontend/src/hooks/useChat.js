import { useCallback } from 'react';
import { useStore } from '../store/index.js';
import { streamChat, convApi, generateTitle } from '../api/client.js';

const PROVIDER_LABEL = { anthropic: 'Claude', openai: 'GPT', gemini: 'Gemini' };

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Core hook that orchestrates streaming chat.
 * Returns { sendMessage, stopStreaming }.
 */
export function useChat() {
  const store = useStore();

  const sendMessage = useCallback(async ({
    text,
    attachments = [],
    provider,
    model,
    systemPrompt,
    temperature,
    maxTokens,
  }) => {
    if (store.streaming) return;

    const {
      activeConvId, conversations, messages: allMessages,
      settings, ephemeralMode,
      addConversation, addMessage, updateConversation,
      setActiveConvId, setMessages,
      appendStreamChunk, stopStream,
      showToast,
    } = store;

    // Determine effective provider (auto-route images to Gemini)
    const hasImage = attachments.some(a => a.type === 'image');
    const effectiveProvider = hasImage ? 'gemini' : provider;
    const effectiveModel = hasImage ? settings.geminiImageModel : model;

    // PDF check for OpenAI
    const hasPdf = attachments.some(a => a.type === 'pdf');
    if (hasPdf && effectiveProvider === 'openai') {
      showToast('Les PDF ne sont pas pris en charge par GPT. Utilisez Claude ou Gemini.', 'error');
      return;
    }

    // Build or find conversation
    let convId = activeConvId;
    let isNew = false;
    if (!convId) {
      convId = newId();
      isNew = true;
      const newConv = {
        id: convId,
        title: text.slice(0, 50) || 'Nouvelle conversation',
        folderId: null,
        systemPrompt: systemPrompt || '',
        model: effectiveModel,
        pinned: false,
        ephemeral: ephemeralMode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
      };
      if (!ephemeralMode) {
        try {
          await convApi.create(newConv);
        } catch (err) {
          showToast('Erreur création conversation : ' + err.message, 'error');
          return;
        }
      }
      addConversation(newConv);
      setActiveConvId(convId);
    }

    // Build user message
    const userMsg = {
      id: newId(),
      conversationId: convId,
      role: 'user',
      content: text,
      provider: effectiveProvider,
      model: effectiveModel,
      attachments: JSON.stringify(attachments.map(a => ({ name: a.name, type: a.type, mimeType: a.mimeType }))),
      createdAt: new Date().toISOString(),
    };

    addMessage(convId, userMsg);
    if (!ephemeralMode) {
      try { await convApi.update(convId, { updatedAt: userMsg.createdAt }); } catch {}
    }

    // Build messages history for API
    const existingMsgs = allMessages[convId] || [];
    const excluded = store.excluded;
    let historyMessages = [...existingMsgs, userMsg]
      .filter(m => !excluded[m.id] && m.role !== 'summary')
      .map(m => ({ role: m.role, content: m.content || '' }));

    // Apply context strategy
    if (settings.contextStrategy === 'last_n' && historyMessages.length > settings.contextLastN) {
      historyMessages = historyMessages.slice(-settings.contextLastN);
    }

    // Start streaming
    const controller = store.startStream(convId);
    const assistantId = newId();
    let fullContent = '';
    let usage = null;

    await streamChat(
      {
        provider: effectiveProvider,
        model: effectiveModel,
        messages: historyMessages,
        systemPrompt: systemPrompt || settings.defaultSystemPrompt,
        temperature: temperature ?? settings.temperature,
        maxTokens: maxTokens ?? settings.maxTokens,
        attachments,
        conversationId: ephemeralMode ? null : convId,
      },
      // onChunk
      (chunk) => {
        fullContent += chunk;
        appendStreamChunk(chunk);
      },
      // onDone
      async (u) => {
        usage = u;
        stopStream();

        const assistantMsg = {
          id: assistantId,
          conversationId: convId,
          role: 'assistant',
          content: fullContent,
          provider: effectiveProvider,
          model: effectiveModel,
          attachments: '[]',
          tokenInput: u?.inputTokens,
          tokenOutput: u?.outputTokens,
          costUsd: u?.cost,
          createdAt: new Date().toISOString(),
        };

        addMessage(convId, assistantMsg);

        // Auto-title for new conversations
        if (isNew && text) {
          const title = await generateTitle(effectiveProvider, effectiveModel, text);
          if (title) {
            updateConversation(convId, { title });
            if (!ephemeralMode) {
              try { await convApi.update(convId, { title }); } catch {}
            }
          }
        }
      },
      // onError
      (errMsg) => {
        stopStream();
        const errMsgObj = {
          id: assistantId,
          conversationId: convId,
          role: 'assistant',
          content: errMsg,
          provider: effectiveProvider,
          model: effectiveModel,
          attachments: '[]',
          error: true,
          createdAt: new Date().toISOString(),
        };
        addMessage(convId, errMsgObj);
        showToast(`Erreur ${PROVIDER_LABEL[effectiveProvider]} : ${errMsg}`, 'error');
      },
      controller.signal,
    );
  }, [store]);

  const stopStreaming = useCallback(() => {
    store.stopStream(true); // user-initiated: abort the request
  }, [store]);

  return { sendMessage, stopStreaming };
}
