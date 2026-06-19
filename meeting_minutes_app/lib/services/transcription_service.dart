import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../models/lexicon.dart';
import '../models/meeting_session.dart';

class TranscriptionException implements Exception {
  final String message;
  final int? statusCode;
  const TranscriptionException(this.message, {this.statusCode});
  @override
  String toString() => 'TranscriptionException: $message';
}

class TranscriptionService {
  static const _endpoint = 'https://api.openai.com/v1/audio/transcriptions';
  static const _maxFileSizeBytes = 25 * 1024 * 1024; // 25 MB Whisper limit

  final String apiKey;

  const TranscriptionService({required this.apiKey});

  Future<String> transcribe({
    required String audioFilePath,
    required SessionLanguage language,
    Lexicon? lexicon,
    void Function(String status)? onStatus,
  }) async {
    final file = File(audioFilePath);
    if (!await file.exists()) {
      throw TranscriptionException('Audio file not found: $audioFilePath');
    }

    final fileSize = await file.length();
    if (fileSize > _maxFileSizeBytes) {
      throw TranscriptionException(
        'File too large (${(fileSize / 1024 / 1024).toStringAsFixed(1)} MB). '
        'Whisper supports up to 25 MB.',
      );
    }

    onStatus?.call('Envoi du fichier audio…');

    final request = http.MultipartRequest('POST', Uri.parse(_endpoint));
    request.headers['Authorization'] = 'Bearer $apiKey';
    request.fields['model'] = 'whisper-1';
    request.fields['language'] = language.whisperCode;
    request.fields['response_format'] = 'json';

    final whisperPrompt = lexicon?.toWhisperPrompt() ?? '';
    if (whisperPrompt.isNotEmpty) {
      request.fields['prompt'] = whisperPrompt;
    }

    request.files.add(await http.MultipartFile.fromPath('file', audioFilePath));

    onStatus?.call('Transcription en cours…');

    final streamed = await request.send().timeout(
      const Duration(minutes: 10),
      onTimeout: () => throw TranscriptionException('Délai d\'attente dépassé'),
    );
    final body = await http.Response.fromStream(streamed);

    if (body.statusCode != 200) {
      final err = _parseError(body.body);
      throw TranscriptionException(err, statusCode: body.statusCode);
    }

    final json = jsonDecode(body.body) as Map<String, dynamic>;
    return (json['text'] as String? ?? '').trim();
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
