/**
 * Database schema initialization for EVOQ Assistant.
 * Uses better-sqlite3 synchronous API.
 */

/**
 * Initialize all database tables, indexes, and virtual tables.
 * Safe to call on every startup — all statements use IF NOT EXISTS.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function initializeSchema(db) {
  // Enable foreign keys every connection
  db.pragma('foreign_keys = ON');

  // ── Folders ─────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  // ── Conversations ────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL DEFAULT 'New Conversation',
      folder_id     TEXT REFERENCES folders(id) ON DELETE SET NULL,
      system_prompt TEXT,
      model         TEXT,
      pinned        INTEGER NOT NULL DEFAULT 0,
      ephemeral     INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_created_at
      ON conversations(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_conversations_folder_id
      ON conversations(folder_id);

    CREATE INDEX IF NOT EXISTS idx_conversations_pinned
      ON conversations(pinned DESC, updated_at DESC);
  `);

  // ── Messages ─────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id                   TEXT PRIMARY KEY,
      conversation_id      TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role                 TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content              TEXT NOT NULL DEFAULT '',
      model                TEXT,
      provider             TEXT,
      attachments          TEXT,          -- JSON array of attachment metadata
      excluded_from_context INTEGER NOT NULL DEFAULT 0,
      token_input          INTEGER,
      token_output         INTEGER,
      cost_usd             REAL,
      created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages(conversation_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_messages_created_at
      ON messages(created_at DESC);
  `);

  // ── Full-Text Search on messages ─────────────────────────────────────────────
  // FTS5 virtual table — content= makes it a content table backed by messages.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
    USING fts5(
      content,
      conversation_id UNINDEXED,
      content='messages',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );
  `);

  // Triggers to keep the FTS index in sync with the messages table
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_fts_ai
    AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, conversation_id)
      VALUES (new.rowid, new.content, new.conversation_id);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_ad
    AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, conversation_id)
      VALUES ('delete', old.rowid, old.content, old.conversation_id);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_au
    AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, conversation_id)
      VALUES ('delete', old.rowid, old.content, old.conversation_id);
      INSERT INTO messages_fts(rowid, content, conversation_id)
      VALUES (new.rowid, new.content, new.conversation_id);
    END;
  `);

  // ── Settings ─────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);

  // ── Prompt Library ───────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_library (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      content    TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_library_name
      ON prompt_library(name COLLATE NOCASE);
  `);

  // ── Audit Log ────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      ts              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      provider        TEXT,
      model           TEXT,
      token_input     INTEGER,
      token_output    INTEGER,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_ts
      ON audit_log(ts DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_log_conversation_id
      ON audit_log(conversation_id);
  `);

  // ── Trigger: update conversations.updated_at on new message ──────────────────
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_update_conversation_ts
    AFTER INSERT ON messages
    WHEN new.role != 'system'
    BEGIN
      UPDATE conversations
      SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = new.conversation_id;
    END;
  `);
}
