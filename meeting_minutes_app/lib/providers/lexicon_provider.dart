import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../models/lexicon.dart';
import '../services/database_service.dart';

class LexiconProvider extends ChangeNotifier {
  final DatabaseService _db;
  final _uuid = const Uuid();

  List<Lexicon> _lexicons = [];
  bool _loading = false;

  LexiconProvider(this._db);

  List<Lexicon> get lexicons => _lexicons;
  bool get loading => _loading;

  Future<void> loadAll() async {
    _loading = true;
    notifyListeners();
    _lexicons = await _db.getAllLexicons();
    _loading = false;
    notifyListeners();
  }

  Future<Lexicon> createLexicon({
    required String name,
    String description = '',
  }) async {
    final l = Lexicon(
      id: _uuid.v4(),
      name: name,
      description: description,
    );
    await _db.insertLexicon(l);
    _lexicons.insert(0, l);
    notifyListeners();
    return l;
  }

  Future<void> updateLexicon(Lexicon lexicon) async {
    await _db.updateLexicon(lexicon);
    final idx = _lexicons.indexWhere((l) => l.id == lexicon.id);
    if (idx != -1) _lexicons[idx] = lexicon;
    notifyListeners();
  }

  Future<void> deleteLexicon(String id) async {
    await _db.deleteLexicon(id);
    _lexicons.removeWhere((l) => l.id == id);
    notifyListeners();
  }

  Future<void> touchLexicon(String id) async {
    await _db.touchLexicon(id);
    final idx = _lexicons.indexWhere((l) => l.id == id);
    if (idx != -1) {
      _lexicons[idx] = _lexicons[idx].copyWith(lastUsedAt: DateTime.now());
      _lexicons.sort((a, b) => b.lastUsedAt.compareTo(a.lastUsedAt));
      notifyListeners();
    }
  }

  // ── Entries ────────────────────────────────────────────────────────────────

  Future<LexiconEntry> addEntry({
    required String lexiconId,
    required String term,
    String? expansion,
    String? context,
    LexiconEntryType type = LexiconEntryType.technicalTerm,
  }) async {
    final entry = LexiconEntry(
      id: _uuid.v4(),
      lexiconId: lexiconId,
      term: term.trim(),
      expansion: expansion?.trim(),
      context: context?.trim(),
      type: type,
    );
    await _db.insertEntry(entry);
    _addEntryToCache(lexiconId, entry);
    notifyListeners();
    return entry;
  }

  Future<void> updateEntry(LexiconEntry entry) async {
    await _db.updateEntry(entry);
    final l = _lexicons.firstWhere((l) => l.id == entry.lexiconId,
        orElse: () => throw StateError('Lexicon not found'));
    final idx = l.entries.indexWhere((e) => e.id == entry.id);
    if (idx != -1) l.entries[idx] = entry;
    notifyListeners();
  }

  Future<void> deleteEntry(String lexiconId, String entryId) async {
    await _db.deleteEntry(entryId);
    final l = _lexicons.firstWhere((l) => l.id == lexiconId,
        orElse: () => throw StateError('Lexicon not found'));
    l.entries.removeWhere((e) => e.id == entryId);
    notifyListeners();
  }

  Future<void> incrementUsage(String lexiconId, String entryId) async {
    await _db.incrementEntryUsage(entryId);
    final l = _lexicons.firstWhere((l) => l.id == lexiconId,
        orElse: () => throw StateError('Lexicon not found'));
    final idx = l.entries.indexWhere((e) => e.id == entryId);
    if (idx != -1) {
      l.entries[idx] = l.entries[idx].copyWith(
        usageCount: l.entries[idx].usageCount + 1,
        lastUsed: DateTime.now(),
      );
    }
    notifyListeners();
  }

  Lexicon? getLexicon(String id) {
    try {
      return _lexicons.firstWhere((l) => l.id == id);
    } catch (_) {
      return null;
    }
  }

  void _addEntryToCache(String lexiconId, LexiconEntry entry) {
    final idx = _lexicons.indexWhere((l) => l.id == lexiconId);
    if (idx != -1) _lexicons[idx].entries.insert(0, entry);
  }
}
