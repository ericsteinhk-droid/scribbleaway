import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/meeting_session.dart';

class SettingsProvider extends ChangeNotifier {
  static const _keyOpenAI = 'openai_api_key';
  static const _keyClaude = 'claude_api_key';
  static const _keyDefaultLang = 'default_language';
  static const _keyDefaultLexicon = 'default_lexicon_id';

  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  String _openAiKey = '';
  String _claudeKey = '';
  SessionLanguage _defaultLanguage = SessionLanguage.frCA;
  String? _defaultLexiconId;
  bool _loaded = false;

  String get openAiKey => _openAiKey;
  String get claudeKey => _claudeKey;
  SessionLanguage get defaultLanguage => _defaultLanguage;
  String? get defaultLexiconId => _defaultLexiconId;
  bool get loaded => _loaded;
  bool get isConfigured => _openAiKey.isNotEmpty && _claudeKey.isNotEmpty;

  Future<void> load() async {
    _openAiKey = await _storage.read(key: _keyOpenAI) ?? '';
    _claudeKey = await _storage.read(key: _keyClaude) ?? '';
    final lang = await _storage.read(key: _keyDefaultLang);
    _defaultLanguage = lang != null
        ? SessionLanguageExt.fromString(lang)
        : SessionLanguage.frCA;
    _defaultLexiconId = await _storage.read(key: _keyDefaultLexicon);
    _loaded = true;
    notifyListeners();
  }

  Future<void> setOpenAiKey(String key) async {
    _openAiKey = key.trim();
    await _storage.write(key: _keyOpenAI, value: _openAiKey);
    notifyListeners();
  }

  Future<void> setClaudeKey(String key) async {
    _claudeKey = key.trim();
    await _storage.write(key: _keyClaude, value: _claudeKey);
    notifyListeners();
  }

  Future<void> setDefaultLanguage(SessionLanguage lang) async {
    _defaultLanguage = lang;
    await _storage.write(key: _keyDefaultLang, value: lang.name);
    notifyListeners();
  }

  Future<void> setDefaultLexiconId(String? id) async {
    _defaultLexiconId = id;
    if (id != null) {
      await _storage.write(key: _keyDefaultLexicon, value: id);
    } else {
      await _storage.delete(key: _keyDefaultLexicon);
    }
    notifyListeners();
  }
}
