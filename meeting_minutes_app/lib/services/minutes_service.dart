import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/lexicon.dart';
import '../models/meeting_session.dart';

class MinutesException implements Exception {
  final String message;
  const MinutesException(this.message);
  @override
  String toString() => 'MinutesException: $message';
}

class MinutesService {
  static const _endpoint = 'https://api.anthropic.com/v1/messages';
  static const _model = 'claude-sonnet-4-6';
  static const _apiVersion = '2023-06-01';

  final String apiKey;

  const MinutesService({required this.apiKey});

  Future<String> generateMinutes({
    required String transcription,
    required SessionLanguage language,
    required String meetingTitle,
    required DateTime meetingDate,
    Lexicon? lexicon,
    void Function(String status)? onStatus,
  }) async {
    onStatus?.call('Génération des procès-verbaux…');

    final systemPrompt = _buildSystemPrompt(language, lexicon);
    final userMessage = _buildUserMessage(
      transcription: transcription,
      title: meetingTitle,
      date: meetingDate,
      language: language,
    );

    final body = jsonEncode({
      'model': _model,
      'max_tokens': 4096,
      'system': systemPrompt,
      'messages': [
        {'role': 'user', 'content': userMessage}
      ],
    });

    final response = await http
        .post(
          Uri.parse(_endpoint),
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': _apiVersion,
            'content-type': 'application/json',
          },
          body: body,
        )
        .timeout(
          const Duration(minutes: 3),
          onTimeout: () => throw MinutesException('Délai d\'attente dépassé'),
        );

    if (response.statusCode != 200) {
      final err = _parseError(response.body);
      throw MinutesException(err);
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final content = (json['content'] as List?)?.first;
    if (content == null) throw MinutesException('Réponse vide du modèle');
    return (content['text'] as String? ?? '').trim();
  }

  String _buildSystemPrompt(SessionLanguage lang, Lexicon? lexicon) {
    final lexiconSection = lexicon != null && lexicon.entries.isNotEmpty
        ? _buildLexiconSection(lang, lexicon)
        : '';

    if (lang == SessionLanguage.frCA) {
      return '''Tu es un assistant expert en rédaction de procès-verbaux de réunions en français canadien.
À partir d'une transcription audio, génère des procès-verbaux structurés, professionnels et précis.

Structure requise :
# PROCÈS-VERBAL
**Réunion :** [titre]
**Date :** [date]
**Langue :** Français (Canada)

## Résumé exécutif
[Brève description de 2-3 phrases sur l'objet et le résultat global]

## Participants mentionnés
[Liste des personnes identifiées dans la transcription]

## Points discutés
[Liste numérotée des sujets abordés avec détails]

## Décisions prises
[Liste des décisions officielles prises durant la réunion]

## Points d'action
| Responsable | Action | Échéance |
|---|---|---|
[Tableau des actions à entreprendre]

## Prochaines étapes
[Éléments de suivi et prochaine réunion si mentionnée]

---
*Procès-verbal généré automatiquement – Veuillez réviser et valider*

Règles :
- Utilise le français canadien standard (pas le joual)
- Sois concis mais complet
- Identifie clairement les décisions des discussions
- Si une information est incertaine, indique-le avec [à vérifier]
$lexiconSection''';
    } else {
      return '''You are an expert assistant for writing professional meeting minutes in US English.
From an audio transcription, generate structured, accurate, professional meeting minutes.

Required structure:
# MEETING MINUTES
**Meeting:** [title]
**Date:** [date]
**Language:** English (US)

## Executive Summary
[2-3 sentence description of meeting purpose and overall outcome]

## Attendees Mentioned
[List of people identified in the transcription]

## Discussion Points
[Numbered list of topics covered with details]

## Decisions Made
[List of official decisions made during the meeting]

## Action Items
| Owner | Action | Due Date |
|---|---|---|
[Table of actions to be taken]

## Next Steps
[Follow-up items and next meeting if mentioned]

---
*Minutes generated automatically – Please review and validate*

Rules:
- Use standard US English
- Be concise but complete
- Clearly distinguish decisions from discussions
- If information is uncertain, note it with [to verify]
$lexiconSection''';
    }
  }

  String _buildLexiconSection(SessionLanguage lang, Lexicon lexicon) {
    final terms = lexicon.entries
        .map((e) => e.expansion != null ? '- ${e.term}: ${e.expansion}' : '- ${e.term}')
        .join('\n');
    if (lang == SessionLanguage.frCA) {
      return '\nLexique de référence (termes spécifiques à utiliser):\n$terms\n';
    }
    return '\nReference Lexicon (specific terms to use):\n$terms\n';
  }

  String _buildUserMessage({
    required String transcription,
    required String title,
    required DateTime date,
    required SessionLanguage language,
  }) {
    final dateStr =
        '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
    if (language == SessionLanguage.frCA) {
      return 'Titre de la réunion: $title\nDate: $dateStr\n\nTranscription:\n\n$transcription';
    }
    return 'Meeting title: $title\nDate: $dateStr\n\nTranscription:\n\n$transcription';
  }

  String _parseError(String body) {
    try {
      final j = jsonDecode(body) as Map<String, dynamic>;
      final err = j['error'];
      if (err is Map) return err['message'] as String? ?? body;
    } catch (_) {}
    return body;
  }
}
