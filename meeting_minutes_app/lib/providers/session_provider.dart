import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../models/meeting_session.dart';
import '../models/lexicon.dart';
import '../services/database_service.dart';
import '../services/transcription_service.dart';
import '../services/minutes_service.dart';

class SessionProvider extends ChangeNotifier {
  final DatabaseService _db;
  final _uuid = const Uuid();

  List<MeetingSession> _sessions = [];
  MeetingSession? _activeSession;
  bool _loading = false;
  String _statusMessage = '';

  SessionProvider(this._db);

  List<MeetingSession> get sessions => _sessions;
  MeetingSession? get activeSession => _activeSession;
  bool get loading => _loading;
  String get statusMessage => _statusMessage;

  Future<void> loadAll() async {
    _loading = true;
    notifyListeners();
    _sessions = await _db.getAllSessions();
    _loading = false;
    notifyListeners();
  }

  Future<MeetingSession> createSession({
    required String title,
    required SessionLanguage language,
    required String audioFilePath,
    String? lexiconId,
    String? lexiconName,
    DateTime? date,
  }) async {
    final session = MeetingSession(
      id: _uuid.v4(),
      title: title,
      date: date ?? DateTime.now(),
      language: language,
      lexiconId: lexiconId,
      lexiconName: lexiconName,
      audioFilePath: audioFilePath,
      status: SessionStatus.pending,
    );
    await _db.insertSession(session);
    _sessions.insert(0, session);
    _activeSession = session;
    notifyListeners();
    return session;
  }

  Future<void> transcribe({
    required String openAiKey,
    Lexicon? lexicon,
  }) async {
    final session = _activeSession;
    if (session == null) return;

    try {
      _setStatus(session.copyWith(status: SessionStatus.transcribing));

      final service = TranscriptionService(apiKey: openAiKey);
      final text = await service.transcribe(
        audioFilePath: session.audioFilePath!,
        language: session.language,
        lexicon: lexicon,
        onStatus: (s) {
          _statusMessage = s;
          notifyListeners();
        },
      );

      final updated = session.copyWith(
        transcription: text,
        status: SessionStatus.transcribed,
      );
      await _save(updated);
    } catch (e) {
      await _save(session.copyWith(
        status: SessionStatus.error,
        errorMessage: e.toString(),
      ));
      rethrow;
    }
  }

  Future<void> generateMinutes({
    required String claudeKey,
    Lexicon? lexicon,
  }) async {
    final session = _activeSession;
    if (session == null || session.transcription == null) return;

    try {
      _setStatus(session.copyWith(status: SessionStatus.generatingMinutes));

      final service = MinutesService(apiKey: claudeKey);
      final minutes = await service.generateMinutes(
        transcription: session.transcription!,
        language: session.language,
        meetingTitle: session.title,
        meetingDate: session.date,
        lexicon: lexicon,
        onStatus: (s) {
          _statusMessage = s;
          notifyListeners();
        },
      );

      final updated = session.copyWith(
        minutes: minutes,
        status: SessionStatus.complete,
      );
      await _save(updated);
    } catch (e) {
      await _save(session.copyWith(
        status: SessionStatus.error,
        errorMessage: e.toString(),
      ));
      rethrow;
    }
  }

  Future<void> updateTranscription(String text) async {
    final session = _activeSession;
    if (session == null) return;
    await _save(session.copyWith(transcription: text));
  }

  Future<void> updateMinutes(String text) async {
    final session = _activeSession;
    if (session == null) return;
    await _save(session.copyWith(minutes: text));
  }

  Future<void> deleteSession(String id) async {
    await _db.deleteSession(id);
    _sessions.removeWhere((s) => s.id == id);
    if (_activeSession?.id == id) _activeSession = null;
    notifyListeners();
  }

  void setActiveSession(MeetingSession session) {
    _activeSession = session;
    notifyListeners();
  }

  void clearActiveSession() {
    _activeSession = null;
    notifyListeners();
  }

  Future<void> _save(MeetingSession session) async {
    await _db.updateSession(session);
    _activeSession = session;
    final idx = _sessions.indexWhere((s) => s.id == session.id);
    if (idx != -1) _sessions[idx] = session;
    notifyListeners();
  }

  void _setStatus(MeetingSession session) {
    _activeSession = session;
    final idx = _sessions.indexWhere((s) => s.id == session.id);
    if (idx != -1) _sessions[idx] = session;
    notifyListeners();
  }
}
