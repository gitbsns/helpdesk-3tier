// HelpDesk - Tier 2 (application/API tier).
// Ye sirf API hai. Web page Tier 1 (Nginx) dikhata hai, data Tier 3 (PostgreSQL) mein hai.
//
// Roles aur permissions:
//   user  -> ticket bana sakta hai, sirf apne tickets dekh sakta hai
//   agent -> sab tickets dekh sakta hai, ticket ka status badal sakta hai
//   admin -> agent ka sab kuch + ticket delete + users ke roles badalna

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET environment variable is required');
  process.exit(1);
}

// DB ki settings environment variables se aati hain, code mein nahi.
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'helpdesk',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'helpdesk',
});

const ROLES = ['user', 'agent', 'admin'];
const STATUSES = ['open', 'in_progress', 'closed'];

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb', inflate: false }));

const wrap = (fn) => (req, res, next) =>
  fn(req, res, next).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

// Authentication: "aap kaun ho?"
// Token se sirf user ki id leti hai, role DATABASE se taza padhti hai.
// Is liye admin kisi ka role badle ya user delete kare to asar foran hota hai,
// purane token ke 2 ghante khatam hone ka intezar nahi karna padta.
const auth = wrap(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const { rows } = await pool.query('SELECT id, username, role FROM users WHERE id=$1', [payload.id]);
  if (!rows[0]) return res.status(401).json({ error: 'User no longer exists' });
  req.user = rows[0];
  next();
});

// Authorization: "aap ko ijazat hai?"
const requireRole = (...allowed) => (req, res, next) =>
  allowed.includes(req.user.role)
    ? next()
    : res.status(403).json({ error: 'Forbidden: requires ' + allowed.join(' or ') });

// ---------- health (Kubernetes probes) ----------
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/ready', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ready' });
}));

// ---------- auth ----------
app.post('/api/register', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || username.length < 3 || username.length > 30)
    return res.status(400).json({ error: 'Username must be 3-30 characters' });
  if (typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const hash = await bcrypt.hash(password, 10);
  try {
    // Register karne wala hamesha 'user' banta hai. Role sirf admin badal sakta hai.
    await pool.query('INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)',
      [username, hash, 'user']);
    res.status(201).json({ message: 'Registered' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    throw e;
  }
}));

app.post('/api/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [String(username || '')]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash)))
    return res.status(401).json({ error: 'Wrong username or password' });
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, username: user.username, role: user.role });
}));

// ---------- tickets ----------
const TICKET_SELECT = `SELECT t.id, t.title, t.description, t.status, t.created_at,
  u.username AS created_by FROM tickets t JOIN users u ON u.id = t.created_by`;

app.get('/api/tickets', auth, wrap(async (req, res) => {
  const isStaff = req.user.role === 'agent' || req.user.role === 'admin';
  const { rows } = isStaff
    ? await pool.query(`${TICKET_SELECT} ORDER BY t.id DESC`)
    : await pool.query(`${TICKET_SELECT} WHERE t.created_by=$1 ORDER BY t.id DESC`, [req.user.id]);
  res.json(rows);
}));

app.post('/api/tickets', auth, wrap(async (req, res) => {
  const title = String((req.body || {}).title || '').trim();
  const description = String((req.body || {}).description || '').trim();
  if (!title || title.length > 200) return res.status(400).json({ error: 'Title required (max 200 chars)' });
  if (description.length > 2000) return res.status(400).json({ error: 'Description too long (max 2000 chars)' });
  const { rows } = await pool.query(
    'INSERT INTO tickets (title, description, created_by) VALUES ($1,$2,$3) RETURNING id, title, status',
    [title, description, req.user.id]);
  res.status(201).json(rows[0]);
}));

app.patch('/api/tickets/:id/status', auth, requireRole('agent', 'admin'), wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Status must be one of ' + STATUSES.join(', ') });
  const { rowCount } = await pool.query('UPDATE tickets SET status=$1 WHERE id=$2', [status, req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ message: 'Status updated' });
}));

app.delete('/api/tickets/:id', auth, requireRole('admin'), wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM tickets WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ message: 'Ticket deleted' });
}));

// ---------- admin: users ----------
app.get('/api/users', auth, requireRole('admin'), wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, role FROM users ORDER BY id');
  res.json(rows);
}));

app.patch('/api/users/:id/role', auth, requireRole('admin'), wrap(async (req, res) => {
  const { role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Role must be one of ' + ROLES.join(', ') });
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' });
  const { rowCount } = await pool.query('UPDATE users SET role=$1 WHERE id=$2', [role, req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'Role updated' });
}));

// ---------- startup: DB ka intezar, tables banao, admin seed karo ----------
async function initDb(retries = 20) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','agent','admin'))
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      const exists = await pool.query("SELECT 1 FROM users WHERE username='admin'");
      if (!exists.rowCount && process.env.ADMIN_PASSWORD) {
        const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
        await pool.query("INSERT INTO users (username,password_hash,role) VALUES ('admin',$1,'admin')", [hash]);
        console.log('Admin user created');
      }
      console.log('Database ready');
      return;
    } catch (e) {
      console.log(`Waiting for database (${i}/${retries}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Database unreachable');
}

initDb()
  .then(() => app.listen(PORT, () => console.log(`HelpDesk API running on port ${PORT}`)))
  .catch((e) => { console.error(e); process.exit(1); });
