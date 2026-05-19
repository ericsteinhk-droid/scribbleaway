const express = require('express');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'family-tree-jwt-secret-change-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'famille2024';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'family.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS persons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    birth_year  INTEGER,
    death_year  INTEGER,
    gender      TEXT CHECK(gender IN ('male','female','unknown')) DEFAULT 'unknown',
    father_id   INTEGER REFERENCES persons(id) ON DELETE SET NULL,
    mother_id   INTEGER REFERENCES persons(id) ON DELETE SET NULL,
    notes       TEXT,
    status      TEXT CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
    submitted_by TEXT,
    submitted_at TEXT DEFAULT (datetime('now')),
    admin_notes TEXT
  );
`);

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Public routes ─────────────────────────────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || !bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

app.get('/api/family', (req, res) => {
  const members = db.prepare(`
    SELECT id, first_name, last_name, birth_year, death_year, gender, father_id, mother_id, notes
    FROM persons WHERE status = 'approved'
    ORDER BY birth_year ASC NULLS LAST, last_name, first_name
  `).all();
  res.json(members);
});

app.post('/api/family', (req, res) => {
  const { first_name, last_name, birth_year, death_year, gender, father_id, mother_id, notes, submitted_by } = req.body || {};
  if (!first_name?.trim() || !last_name?.trim()) {
    return res.status(400).json({ error: 'First name and last name are required' });
  }
  if (death_year && birth_year && death_year < birth_year) {
    return res.status(400).json({ error: 'Death year cannot be before birth year' });
  }
  const result = db.prepare(`
    INSERT INTO persons (first_name, last_name, birth_year, death_year, gender, father_id, mother_id, notes, submitted_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    first_name.trim(), last_name.trim(),
    birth_year || null, death_year || null,
    gender || 'unknown',
    father_id || null, mother_id || null,
    notes?.trim() || null,
    submitted_by?.trim() || null
  );
  res.json({ id: result.lastInsertRowid, status: 'pending' });
});

// ── Admin routes ──────────────────────────────────────────────────────────────

app.get('/api/admin/pending', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*,
      f.first_name || ' ' || f.last_name AS father_name,
      m.first_name || ' ' || m.last_name AS mother_name
    FROM persons p
    LEFT JOIN persons f ON p.father_id = f.id
    LEFT JOIN persons m ON p.mother_id = m.id
    WHERE p.status = 'pending'
    ORDER BY p.submitted_at DESC
  `).all();
  res.json(rows);
});

app.get('/api/admin/members', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*,
      f.first_name || ' ' || f.last_name AS father_name,
      m.first_name || ' ' || m.last_name AS mother_name
    FROM persons p
    LEFT JOIN persons f ON p.father_id = f.id
    LEFT JOIN persons m ON p.mother_id = m.id
    ORDER BY p.status DESC, p.submitted_at DESC
  `).all();
  res.json(rows);
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) FILTER (WHERE status='approved') AS approved,
      COUNT(*) FILTER (WHERE status='pending')  AS pending,
      COUNT(*) FILTER (WHERE status='rejected') AS rejected
    FROM persons
  `).get();
  res.json(stats);
});

app.patch('/api/admin/members/:id', requireAdmin, (req, res) => {
  const { status, admin_notes } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  }
  db.prepare(`UPDATE persons SET status=?, admin_notes=? WHERE id=?`)
    .run(status, admin_notes?.trim() || null, req.params.id);
  res.json({ success: true });
});

app.put('/api/admin/members/:id', requireAdmin, (req, res) => {
  const { first_name, last_name, birth_year, death_year, gender, father_id, mother_id, notes } = req.body || {};
  db.prepare(`
    UPDATE persons SET first_name=?, last_name=?, birth_year=?, death_year=?,
    gender=?, father_id=?, mother_id=?, notes=? WHERE id=?
  `).run(
    first_name?.trim(), last_name?.trim(),
    birth_year || null, death_year || null,
    gender || 'unknown', father_id || null, mother_id || null,
    notes?.trim() || null, req.params.id
  );
  res.json({ success: true });
});

app.delete('/api/admin/members/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  // Clear parent references before deleting
  db.prepare(`UPDATE persons SET father_id=NULL WHERE father_id=?`).run(id);
  db.prepare(`UPDATE persons SET mother_id=NULL WHERE mother_id=?`).run(id);
  db.prepare(`DELETE FROM persons WHERE id=?`).run(id);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`\n🌳 Family Tree app running at http://localhost:${PORT}`);
  console.log(`🔑 Admin panel: http://localhost:${PORT}/admin.html`);
  console.log(`🔐 Admin password: ${ADMIN_PASSWORD}\n`);
});
