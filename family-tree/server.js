const express = require('express');
const { Pool } = require('pg');
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

if (!process.env.DATABASE_URL) {
  console.error('\n❌  DATABASE_URL environment variable is not set.\n    Create a free PostgreSQL database on Render and link it to this service.\n');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS persons (
      id           SERIAL PRIMARY KEY,
      first_name   TEXT NOT NULL,
      last_name    TEXT NOT NULL,
      birth_year   INTEGER,
      death_year   INTEGER,
      gender       TEXT CHECK(gender IN ('male','female','unknown')) DEFAULT 'unknown',
      father_id    INTEGER REFERENCES persons(id) ON DELETE SET NULL,
      mother_id    INTEGER REFERENCES persons(id) ON DELETE SET NULL,
      notes        TEXT,
      status       TEXT CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
      submitted_by TEXT,
      submitted_at TIMESTAMP DEFAULT NOW(),
      admin_notes  TEXT
    )
  `);
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { jwt.verify(auth.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
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

app.get('/api/family', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, first_name, last_name, birth_year, death_year, gender, father_id, mother_id, notes
      FROM persons WHERE status = 'approved'
      ORDER BY birth_year ASC NULLS LAST, last_name, first_name
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/family', async (req, res) => {
  const { first_name, last_name, birth_year, death_year, gender,
          father_id, mother_id, notes, submitted_by,
          new_father_name, new_mother_name } = req.body || {};

  if (!first_name?.trim() || !last_name?.trim())
    return res.status(400).json({ error: 'First name and last name are required' });
  if (death_year && birth_year && death_year < birth_year)
    return res.status(400).json({ error: 'Death year cannot be before birth year' });

  try {
    async function insertNamedParent(fullName, g) {
      const parts = fullName.trim().split(/\s+/);
      const { rows } = await pool.query(
        `INSERT INTO persons (first_name, last_name, gender, status, submitted_by)
         VALUES ($1,$2,$3,'pending',$4) RETURNING id`,
        [parts[0], parts.slice(1).join(' ') || '?', g, submitted_by?.trim() || null]
      );
      return rows[0].id;
    }

    let fid = father_id || null;
    let mid = mother_id || null;
    if (new_father_name?.trim() && !father_id) fid = await insertNamedParent(new_father_name, 'male');
    if (new_mother_name?.trim() && !mother_id) mid = await insertNamedParent(new_mother_name, 'female');

    const { rows } = await pool.query(`
      INSERT INTO persons (first_name, last_name, birth_year, death_year, gender, father_id, mother_id, notes, submitted_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
    `, [first_name.trim(), last_name.trim(), birth_year||null, death_year||null,
        gender||'unknown', fid, mid, notes?.trim()||null, submitted_by?.trim()||null]);

    res.json({ id: rows[0].id, status: 'pending' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin routes ──────────────────────────────────────────────────────────────

app.post('/api/admin/members', requireAdmin, async (req, res) => {
  const { first_name, last_name, birth_year, death_year, gender, father_id, mother_id, notes, status } = req.body || {};
  if (!first_name?.trim()) return res.status(400).json({ error: 'First name required' });
  try {
    const { rows } = await pool.query(`
      INSERT INTO persons (first_name, last_name, birth_year, death_year, gender, father_id, mother_id, notes, status, submitted_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'admin') RETURNING id
    `, [first_name.trim(), last_name?.trim()||'?', birth_year||null, death_year||null,
        gender||'unknown', father_id||null, mother_id||null, notes?.trim()||null, status||'approved']);
    res.json({ id: rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/pending', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, f.first_name||' '||f.last_name AS father_name, m.first_name||' '||m.last_name AS mother_name
      FROM persons p
      LEFT JOIN persons f ON p.father_id = f.id
      LEFT JOIN persons m ON p.mother_id = m.id
      WHERE p.status = 'pending' ORDER BY p.submitted_at DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/members', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, f.first_name||' '||f.last_name AS father_name, m.first_name||' '||m.last_name AS mother_name
      FROM persons p
      LEFT JOIN persons f ON p.father_id = f.id
      LEFT JOIN persons m ON p.mother_id = m.id
      ORDER BY p.status DESC, p.submitted_at DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='approved') AS approved,
        COUNT(*) FILTER (WHERE status='pending')  AS pending,
        COUNT(*) FILTER (WHERE status='rejected') AS rejected
      FROM persons
    `);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/admin/members/:id', requireAdmin, async (req, res) => {
  const { status, admin_notes } = req.body || {};
  if (!['approved','rejected'].includes(status))
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  try {
    await pool.query(`UPDATE persons SET status=$1, admin_notes=$2 WHERE id=$3`,
      [status, admin_notes?.trim()||null, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/members/:id', requireAdmin, async (req, res) => {
  const { first_name, last_name, birth_year, death_year, gender, father_id, mother_id, notes } = req.body || {};
  try {
    await pool.query(`
      UPDATE persons SET first_name=$1, last_name=$2, birth_year=$3, death_year=$4,
      gender=$5, father_id=$6, mother_id=$7, notes=$8 WHERE id=$9
    `, [first_name?.trim(), last_name?.trim(), birth_year||null, death_year||null,
        gender||'unknown', father_id||null, mother_id||null, notes?.trim()||null, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/members/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query(`UPDATE persons SET father_id=NULL WHERE father_id=$1`, [id]);
    await pool.query(`UPDATE persons SET mother_id=NULL WHERE mother_id=$1`, [id]);
    await pool.query(`DELETE FROM persons WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
initDB()
  .then(() => app.listen(PORT, () => {
    console.log(`\n🌳 Family Tree running at http://localhost:${PORT}`);
    console.log(`🔑 Admin: http://localhost:${PORT}/admin.html`);
    console.log(`🔐 Password: ${ADMIN_PASSWORD}\n`);
  }))
  .catch(err => { console.error('DB init failed:', err.message); process.exit(1); });
