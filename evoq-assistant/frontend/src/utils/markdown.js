import { marked } from 'marked';
import hljs from 'highlight.js';

// Configure marked with highlight.js and custom renderer
const renderer = new marked.Renderer();

renderer.code = function({ text, lang }) {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  let highlighted;
  try {
    highlighted = hljs.highlight(text, { language }).value;
  } catch {
    highlighted = hljs.highlightAuto(text).value;
  }
  const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
  return `<div class="code-block">${langLabel}<button class="code-copy" onclick="(function(b){const t=b.previousElementSibling||b.parentElement.querySelector('pre');navigator.clipboard.writeText(t.textContent).then(()=>{b.textContent='Copié';b.classList.add('copied');setTimeout(()=>{b.textContent='Copier';b.classList.remove('copied')},1500)})})(this)">Copier</button><pre><code class="hljs language-${language}">${highlighted}</code></pre></div>`;
};

renderer.link = function({ href, title, text }) {
  const t = title ? ` title="${title}"` : '';
  const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
  const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${href}"${t}${target}>${text}</a>`;
};

marked.setOptions({
  renderer,
  gfm: true,
  breaks: true,
});

// KaTeX math rendering (optional — renders $...$ and $$...$$ patterns)
function renderMath(html) {
  try {
    // Lazy import katex to avoid errors if not available
    const katex = window.__katex;
    if (!katex) return html;

    // Display math $$...$$
    html = html.replace(/\$\$([^$]+)\$\$/gs, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
      } catch { return _; }
    });

    // Inline math $...$
    html = html.replace(/\$([^$\n]+)\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
      } catch { return _; }
    });

    return html;
  } catch {
    return html;
  }
}

// Load KaTeX lazily
let katexLoaded = false;
function ensureKatex() {
  if (katexLoaded) return;
  katexLoaded = true;
  try {
    import('katex').then(mod => {
      window.__katex = mod.default || mod;
    }).catch(() => {});
  } catch {}
}
ensureKatex();

/**
 * Render markdown string to safe HTML.
 * @param {string} text
 * @returns {string} HTML string
 */
export function renderMarkdown(text) {
  if (!text) return '';
  let html = marked.parse(text);
  html = renderMath(html);
  return html;
}

/**
 * Render plain text (user messages) preserving newlines.
 * @param {string} text
 * @returns {string}
 */
export function renderPlainText(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}
