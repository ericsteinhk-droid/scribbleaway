import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import '../models/lexicon.dart';
import '../models/meeting_session.dart';

class DatabaseService {
  static const _dbName = 'scribbleaway.db';
  static const _dbVersion = 1;

  Database? _db;

  Future<void> initialize() async {
    final dbPath = await getDatabasesPath();
    _db = await openDatabase(
      join(dbPath, _dbName),
      version: _dbVersion,
      onCreate: _onCreate,
    );
  }

  Database get db {
    assert(_db != null, 'DatabaseService not initialized');
    return _db!;
  }

  Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE lexicons (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE lexicon_entries (
        id TEXT PRIMARY KEY,
        lexicon_id TEXT NOT NULL,
        term TEXT NOT NULL,
        expansion TEXT,
        context TEXT,
        type TEXT NOT NULL DEFAULT 'technicalTerm',
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used INTEGER NOT NULL,
        FOREIGN KEY (lexicon_id) REFERENCES lexicons(id) ON DELETE CASCADE
      )
    ''');

    await db.execute('''
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date INTEGER NOT NULL,
        language TEXT NOT NULL DEFAULT 'frCA',
        lexicon_id TEXT,
        lexicon_name TEXT,
        audio_file_path TEXT,
        transcription TEXT,
        minutes TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    await db.execute('CREATE INDEX idx_entries_lexicon ON lexicon_entries(lexicon_id)');
    await db.execute('CREATE INDEX idx_sessions_date ON sessions(date DESC)');
  }

  // ── Lexicons ──────────────────────────────────────────────────────────────

  Future<List<Lexicon>> getAllLexicons() async {
    final rows = await db.query('lexicons', orderBy: 'last_used_at DESC');
    final lexicons = rows.map(Lexicon.fromMap).toList();
    for (final l in lexicons) {
      l.entries = await getEntriesForLexicon(l.id);
    }
    return lexicons;
  }

  Future<Lexicon?> getLexicon(String id) async {
    final rows = await db.query('lexicons', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) return null;
    final l = Lexicon.fromMap(rows.first);
    l.entries = await getEntriesForLexicon(id);
    return l;
  }

  Future<void> insertLexicon(Lexicon lexicon) async {
    await db.insert('lexicons', lexicon.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> updateLexicon(Lexicon lexicon) async {
    await db.update('lexicons', lexicon.toMap(),
        where: 'id = ?', whereArgs: [lexicon.id]);
  }

  Future<void> deleteLexicon(String id) async {
    await db.delete('lexicons', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> touchLexicon(String id) async {
    await db.update(
      'lexicons',
      {'last_used_at': DateTime.now().millisecondsSinceEpoch},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  // ── Lexicon Entries ───────────────────────────────────────────────────────

  Future<List<LexiconEntry>> getEntriesForLexicon(String lexiconId) async {
    final rows = await db.query(
      'lexicon_entries',
      where: 'lexicon_id = ?',
      whereArgs: [lexiconId],
      orderBy: 'usage_count DESC, term ASC',
    );
    return rows.map(LexiconEntry.fromMap).toList();
  }

  Future<void> insertEntry(LexiconEntry entry) async {
    await db.insert('lexicon_entries', entry.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> updateEntry(LexiconEntry entry) async {
    await db.update('lexicon_entries', entry.toMap(),
        where: 'id = ?', whereArgs: [entry.id]);
  }

  Future<void> deleteEntry(String id) async {
    await db.delete('lexicon_entries', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> incrementEntryUsage(String entryId) async {
    await db.rawUpdate('''
      UPDATE lexicon_entries
      SET usage_count = usage_count + 1, last_used = ?
      WHERE id = ?
    ''', [DateTime.now().millisecondsSinceEpoch, entryId]);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  Future<List<MeetingSession>> getAllSessions() async {
    final rows = await db.query('sessions', orderBy: 'date DESC');
    return rows.map(MeetingSession.fromMap).toList();
  }

  Future<MeetingSession?> getSession(String id) async {
    final rows = await db.query('sessions', where: 'id = ?', whereArgs: [id]);
    return rows.isEmpty ? null : MeetingSession.fromMap(rows.first);
  }

  Future<void> insertSession(MeetingSession session) async {
    await db.insert('sessions', session.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> updateSession(MeetingSession session) async {
    await db.update('sessions', session.toMap(),
        where: 'id = ?', whereArgs: [session.id]);
  }

  Future<void> deleteSession(String id) async {
    await db.delete('sessions', where: 'id = ?', whereArgs: [id]);
  }
}
