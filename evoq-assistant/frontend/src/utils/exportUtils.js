import JSZip from 'jszip';

const PROVIDER_LABEL = { anthropic: 'Claude', openai: 'GPT', gemini: 'Gemini' };

function convToMarkdown(conv, messages) {
  const lines = [`# ${conv.title || 'Conversation'}`, ''];
  lines.push(`_Créée le ${new Date(conv.createdAt).toLocaleString('fr-CA')}_`, '');
  if (conv.systemPrompt) {
    lines.push('**Prompt système :**', '', conv.systemPrompt, '');
  }
  lines.push('---', '');
  for (const m of messages) {
    const who = m.role === 'user'
      ? '**Vous**'
      : `**${PROVIDER_LABEL[m.provider] || 'Assistant'}** \`${m.model || ''}\``;
    const when = new Date(m.createdAt).toLocaleString('fr-CA');
    lines.push(`${who} — ${when}`, '');
    const att = m.attachments ? JSON.parse(m.attachments) : [];
    if (att.length) {
      lines.push(`_Pièces jointes : ${att.map(a => a.name).join(', ')}_`, '');
    }
    if (m.content) lines.push(m.content, '');
    if (m.tokenInput || m.tokenOutput) {
      lines.push(`_Tokens : ${m.tokenInput || 0} in / ${m.tokenOutput || 0} out_`, '');
    }
    lines.push('---', '');
  }
  return lines.join('\n');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportAsMarkdown(conv, messages) {
  const md = convToMarkdown(conv, messages);
  const blob = new Blob([md], { type: 'text/markdown; charset=utf-8' });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `evoq-assistant-${stamp}.md`);
}

export function exportAsJson(conv, messages) {
  const data = JSON.stringify({ conversation: conv, messages }, null, 2);
  const blob = new Blob([data], { type: 'application/json; charset=utf-8' });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `evoq-assistant-${stamp}.json`);
}

export async function exportAllAsZip(conversations, fetchMessages) {
  const zip = new JSZip();
  const folder = zip.folder('evoq-assistant-export');
  for (const conv of conversations) {
    const messages = await fetchMessages(conv.id);
    const md = convToMarkdown(conv, messages);
    const safe = (conv.title || 'conversation').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    folder.file(`${safe}-${conv.id.slice(0, 8)}.md`, md);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `evoq-export-${stamp}.zip`);
}

/**
 * Import a ChatGPT export JSON file.
 * Returns an array of {title, messages} objects compatible with our format.
 */
export function parseChatGPTExport(json) {
  const convs = [];
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const list = Array.isArray(data) ? data : [data];
  for (const item of list) {
    const messages = [];
    const mapping = item.mapping || {};
    for (const node of Object.values(mapping)) {
      const msg = node.message;
      if (!msg || !msg.content) continue;
      const parts = msg.content.parts || [];
      const text = parts.filter(p => typeof p === 'string').join('\n');
      if (!text) continue;
      const role = msg.author?.role === 'assistant' ? 'assistant' : 'user';
      messages.push({
        role,
        content: text,
        createdAt: msg.create_time ? new Date(msg.create_time * 1000).toISOString() : new Date().toISOString(),
        attachments: '[]',
      });
    }
    if (messages.length) {
      convs.push({ title: item.title || 'Importé depuis ChatGPT', messages });
    }
  }
  return convs;
}
