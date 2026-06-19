import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
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
  // Stay 1 MB below the hard 25 MB limit for safety
  static const _maxSingleBytes = 24 * 1024 * 1024;
  static const _chunkTargetBytes = 20 * 1024 * 1024;

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

    if (fileSize <= _maxSingleBytes) {
      onStatus?.call('Envoi du fichier audio…');
      return await _transcribeFile(audioFilePath, language, lexicon, onStatus);
    }

    onStatus?.call('Fichier volumineux — découpage en cours…');
    return await _transcribeChunked(file, language, lexicon, onStatus);
  }

  Future<String> _transcribeChunked(
    File file,
    SessionLanguage language,
    Lexicon? lexicon,
    void Function(String)? onStatus,
  ) async {
    final bytes = await file.readAsBytes();
    final ext = _ext(file.path);

    final chunks = ext == '.wav' ? _splitWav(bytes) : _splitRaw(bytes);
    if (chunks.length == 1) {
      // Fits in one chunk — send directly (avoids a temp-file round-trip)
      return await _transcribeFile(file.path, language, lexicon, onStatus);
    }

    final tmpDir = await getTemporaryDirectory();
    final results = <String>[];

    for (var i = 0; i < chunks.length; i++) {
      onStatus?.call('Transcription partie ${i + 1}/${chunks.length}…');
      final tmpPath =
          '${tmpDir.path}/chunk_${i}_${DateTime.now().millisecondsSinceEpoch}$ext';
      final tmpFile = File(tmpPath);
      await tmpFile.writeAsBytes(chunks[i]);
      try {
        final text = await _transcribeFile(tmpPath, language, lexicon, null);
        if (text.isNotEmpty) results.add(text);
      } finally {
        await tmpFile.delete().catchError((_) {});
      }
    }

    return results.join(' ');
  }

  /// Splits a WAV file into valid WAV chunks, each ≤ _chunkTargetBytes.
  /// Each chunk gets the original file's header so it's self-contained.
  List<Uint8List> _splitWav(Uint8List bytes) {
    if (bytes.length < 12 ||
        String.fromCharCodes(bytes.sublist(0, 4)) != 'RIFF') {
      return _splitRaw(bytes);
    }

    // Scan sub-chunks to find the 'data' block.
    int pos = 12;
    int dataStart = -1;
    final bd = bytes.buffer.asByteData();

    while (pos + 8 <= bytes.length) {
      final id = String.fromCharCodes(bytes.sublist(pos, pos + 4));
      final size = bd.getUint32(pos + 4, Endian.little);
      if (id == 'data') {
        dataStart = pos + 8;
        break;
      }
      pos += 8 + (size + (size & 1)); // sub-chunks are word-aligned
    }

    if (dataStart == -1 || dataStart >= bytes.length) return _splitRaw(bytes);

    // header = everything from RIFF through 'data' + 4-byte size field
    final header = Uint8List.fromList(bytes.sublist(0, dataStart));
    final pcm = bytes.sublist(dataStart);

    // Align splits to 4-byte sample boundaries (covers up to 32-bit stereo).
    const align = 4;
    final pcmChunkSize = (_chunkTargetBytes ~/ align) * align;

    final chunks = <Uint8List>[];
    for (var offset = 0; offset < pcm.length; offset += pcmChunkSize) {
      final end = min(offset + pcmChunkSize, pcm.length);
      final pcmSlice = pcm.sublist(offset, end);

      final chunk = Uint8List(header.length + pcmSlice.length);
      chunk.setAll(0, header);
      // Patch RIFF size (bytes 4-7): total file size minus the 8-byte RIFF header.
      chunk.buffer.asByteData().setUint32(4, chunk.length - 8, Endian.little);
      // Patch data size (last 4 bytes of header = offset dataStart-4).
      chunk.buffer.asByteData()
          .setUint32(dataStart - 4, pcmSlice.length, Endian.little);
      chunk.setAll(header.length, pcmSlice);

      chunks.add(chunk);
    }
    return chunks;
  }

  /// Byte-level split for MP3, OGG, WebM, FLAC, etc.
  /// ffmpeg (used by Whisper) syncs to the next valid frame header,
  /// so a few milliseconds may be lost at each split point — negligible
  /// with 20 MB chunks.
  List<Uint8List> _splitRaw(Uint8List bytes) {
    final chunks = <Uint8List>[];
    for (var offset = 0; offset < bytes.length; offset += _chunkTargetBytes) {
      chunks.add(bytes.sublist(offset, min(offset + _chunkTargetBytes, bytes.length)));
    }
    return chunks;
  }

  Future<String> _transcribeFile(
    String audioFilePath,
    SessionLanguage language,
    Lexicon? lexicon,
    void Function(String)? onStatus,
  ) async {
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
      throw TranscriptionException(_parseError(body.body),
          statusCode: body.statusCode);
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

  static String _ext(String path) {
    final dot = path.lastIndexOf('.');
    return dot >= 0 ? path.substring(dot).toLowerCase() : '';
  }
}
