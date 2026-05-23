const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-sonnet-4-20250514'

export async function reformatWithClaude(rawText, entryType) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Clé API Anthropic manquante')

  const typeLabels = {
    observation: 'Observation',
    avancement: 'Avancement des travaux',
    discussion: 'Discussion',
    directive: 'Directive',
  }

  const typeLabel = typeLabels[entryType] || 'Observation'

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Tu es un assistant spécialisé dans la rédaction professionnelle pour architectes.
Reformate le texte suivant, qui est une entrée de type "${typeLabel}" dans un rapport de chantier.

Règles:
- Corrige la grammaire et la syntaxe
- Adopte un registre professionnel et technique en français architectural
- Préserve fidèlement le contenu technique et les observations
- Sois concis et précis
- Ne change pas le sens ou les faits mentionnés
- Réponds uniquement avec le texte reformaté, sans introduction ni commentaire

Texte à reformater:
${rawText}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Erreur API: ${response.status}`)
  }

  const data = await response.json()
  return data.content[0].text.trim()
}

export async function transcribeWithWhisper(audioBlob) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) throw new Error('Clé API OpenAI manquante')

  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.webm')
  formData.append('model', 'whisper-1')
  formData.append('language', 'fr')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Erreur Whisper: ${response.status}`)
  }

  const data = await response.json()
  return data.text
}
