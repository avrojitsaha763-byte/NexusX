const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nexusx-ultra-secret-2026-lifeos';

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Directory Setup ───────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');
[uploadDir, publicDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

app.use('/uploads', express.static(uploadDir));
app.use(express.static(publicDir));

// ─── Database ─────────────────────────────────────────────────────────────────
const db = new sqlite3.Database(path.join(__dirname, 'nexusx.db'));
const dbRun = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function(e) { e ? rej(e) : res(this); }));
const dbGet = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const dbAll = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

// ─── Schema Init ──────────────────────────────────────────────────────────────
const initDb = async () => {
  await dbRun(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password TEXT NOT NULL,
    display_name TEXT,
    bio TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '/uploads/default-avatar.png',
    banner_url TEXT DEFAULT '',
    website TEXT DEFAULT '',
    location TEXT DEFAULT '',
    role TEXT DEFAULT 'member',
    verified INTEGER DEFAULT 0,
    pulse_score INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    post_type TEXT DEFAULT 'vibe',
    repost_of INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (repost_of) REFERENCES posts(id) ON DELETE SET NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    emoji TEXT NOT NULL DEFAULT '❤️',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    parent_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS bookmarks (
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    actor_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    post_id INTEGER,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Indexes
  await dbRun('CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions(post_id)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)');
  await dbRun('CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id)');

  console.log('✅ NexusX Database initialized');
};
initDb();

// ─── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
});
const fileFilter = (req, file, cb) => {
  if (/jpeg|jpg|png|gif|webp|avif/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files allowed'));
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Auth Middleware ───────────────────────────────────────────────────────────
const auth = (req, res, next) => {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(403).json({ error: 'Invalid or expired token' }); }
};

// ─── Post Builder Query ───────────────────────────────────────────────────────
const POST_QUERY = (extraWhere = '') => `
  SELECT p.id, p.content, p.image_url, p.post_type, p.repost_of, p.created_at,
         u.id as user_id, u.username, u.display_name, u.avatar_url, u.verified, u.pulse_score,
         (SELECT COUNT(*) FROM reactions WHERE post_id = p.id) as reactions_count,
         (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
         (SELECT emoji FROM reactions WHERE post_id = p.id AND user_id = ?) as user_reaction,
         EXISTS(SELECT 1 FROM bookmarks WHERE post_id = p.id AND user_id = ?) as is_bookmarked,
         EXISTS(SELECT 1 FROM posts rp WHERE rp.repost_of = p.id AND rp.user_id = ?) as is_reposted,
         (SELECT COUNT(*) FROM posts WHERE repost_of = p.id) as reposts_count
  FROM posts p JOIN users u ON p.user_id = u.id
  ${extraWhere}
  ORDER BY p.created_at DESC LIMIT ? OFFSET ?
`;

// ═══════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
  const { username, password, display_name } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return res.status(400).json({ error: 'Username: 3-30 chars, letters/numbers/underscores only' });
  try {
    const exists = await dbGet('SELECT id FROM users WHERE username = ?', [username.toLowerCase()]);
    if (exists) return res.status(409).json({ error: 'Username already taken' });
    const hashed = await bcrypt.hash(password, 12);
    const result = await dbRun('INSERT INTO users (username, password, display_name, pulse_score) VALUES (?, ?, ?, ?)',
      [username.toLowerCase(), hashed, display_name || username, Math.floor(Math.random() * 50) + 10]);
    res.status(201).json({ message: 'Account created! Welcome to NexusX.', userId: result.lastID });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const user = await dbGet('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name, bio: user.bio, avatar_url: user.avatar_url, banner_url: user.banner_url, website: user.website, location: user.location, verified: user.verified, pulse_score: user.pulse_score, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════════════════════════
app.get('/api/users/me', auth, async (req, res) => {
  const user = await dbGet('SELECT id, username, display_name, bio, avatar_url, banner_url, website, location, verified, pulse_score, role, created_at FROM users WHERE id = ?', [req.user.id]);
  user ? res.json(user) : res.status(404).json({ error: 'User not found' });
});

app.get('/api/users/search', auth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const users = await dbAll(`SELECT id, username, display_name, avatar_url, verified, pulse_score, EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND following_id = id) as is_following FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND id != ? LIMIT 8`, [req.user.id, `%${q}%`, `%${q}%`, req.user.id]);
  res.json(users);
});

app.get('/api/users/suggestions', auth, async (req, res) => {
  const users = await dbAll(`SELECT id, username, display_name, avatar_url, bio, verified, pulse_score FROM users WHERE id != ? AND id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?) ORDER BY pulse_score DESC LIMIT 8`, [req.user.id, req.user.id]);
  res.json(users);
});

app.get('/api/users/:id', auth, async (req, res) => {
  const tid = parseInt(req.params.id);
  const user = await dbGet('SELECT id, username, display_name, bio, avatar_url, banner_url, website, location, verified, pulse_score, role, created_at FROM users WHERE id = ?', [tid]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const [fol, fing, posts, rxn] = await Promise.all([
    dbGet('SELECT COUNT(*) as c FROM follows WHERE following_id = ?', [tid]),
    dbGet('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?', [tid]),
    dbGet("SELECT COUNT(*) as c FROM posts WHERE user_id = ? AND post_type != 'repost'", [tid]),
    dbGet('SELECT COUNT(*) as c FROM reactions r JOIN posts p ON r.post_id = p.id WHERE p.user_id = ?', [tid])
  ]);
  const is_following = !!(await dbGet('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [req.user.id, tid]));
  res.json({ profile: user, stats: { followers: fol.c, following: fing.c, posts: posts.c, reactions_received: rxn.c }, is_following });
});

app.put('/api/users/me', auth, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), async (req, res) => {
  const { display_name, bio, website, location } = req.body;
  let avatar_url, banner_url;
  if (req.files?.avatar) avatar_url = `/uploads/${req.files.avatar[0].filename}`;
  if (req.files?.banner) banner_url = `/uploads/${req.files.banner[0].filename}`;
  let sql = 'UPDATE users SET display_name = ?, bio = ?, website = ?, location = ?';
  let params = [display_name, bio, website, location];
  if (avatar_url) { sql += ', avatar_url = ?'; params.push(avatar_url); }
  if (banner_url) { sql += ', banner_url = ?'; params.push(banner_url); }
  sql += ' WHERE id = ?';  params.push(req.user.id);
  await dbRun(sql, params);
  const updated = await dbGet('SELECT id, username, display_name, bio, avatar_url, banner_url, website, location, verified, pulse_score FROM users WHERE id = ?', [req.user.id]);
  res.json({ message: 'Profile updated', user: updated });
});

app.post('/api/users/:id/follow', auth, async (req, res) => {
  const tid = parseInt(req.params.id);
  if (req.user.id === tid) return res.status(400).json({ error: 'Cannot follow yourself' });
  const target = await dbGet('SELECT id FROM users WHERE id = ?', [tid]);
  if (!target) return res.status(404).json({ error: 'User not found' });
  await dbRun('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)', [req.user.id, tid]);
  dbRun('INSERT OR IGNORE INTO notifications (user_id, actor_id, type) VALUES (?, ?, ?)', [tid, req.user.id, 'follow']).catch(() => {});
  dbRun('UPDATE users SET pulse_score = pulse_score + 2 WHERE id = ?', [tid]).catch(() => {});
  res.json({ message: 'Followed', is_following: true });
});

app.delete('/api/users/:id/follow', auth, async (req, res) => {
  const tid = parseInt(req.params.id);
  await dbRun('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [req.user.id, tid]);
  dbRun('UPDATE users SET pulse_score = MAX(0, pulse_score - 1) WHERE id = ?', [tid]).catch(() => {});
  res.json({ message: 'Unfollowed', is_following: false });
});

// ═══════════════════════════════════════════════════════════════
//  POSTS
// ═══════════════════════════════════════════════════════════════
app.get('/api/posts', auth, async (req, res) => {
  const { feed, userId, limit = 30, offset = 0 } = req.query;
  let where = '', extraParams = [];
  if (feed === 'following') { where = 'WHERE (p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?) OR p.user_id = ?)'; extraParams = [req.user.id, req.user.id]; }
  else if (feed === 'explore') { where = 'WHERE p.user_id != ?'; extraParams = [req.user.id]; }
  else if (userId) { where = 'WHERE p.user_id = ?'; extraParams = [parseInt(userId)]; }
  const sql = POST_QUERY(where);
  const posts = await dbAll(sql, [req.user.id, req.user.id, req.user.id, ...extraParams, parseInt(limit), parseInt(offset)]);
  res.json(posts);
});

app.post('/api/posts', auth, upload.single('image'), async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content cannot be empty' });
  if (content.length > 500) return res.status(400).json({ error: 'Post too long (max 500 chars)' });
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;
  const result = await dbRun('INSERT INTO posts (user_id, content, image_url, post_type) VALUES (?, ?, ?, ?)', [req.user.id, content.trim(), image_url, 'vibe']);
  dbRun('UPDATE users SET pulse_score = pulse_score + 5 WHERE id = ?', [req.user.id]).catch(() => {});
  const post = await dbGet(POST_QUERY('WHERE p.id = ?'), [req.user.id, req.user.id, req.user.id, result.lastID, 1, 0]);
  res.status(201).json(post);
});

app.post('/api/posts/:id/repost', auth, async (req, res) => {
  const postId = parseInt(req.params.id);
  const original = await dbGet('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!original) return res.status(404).json({ error: 'Post not found' });
  const existing = await dbGet('SELECT id FROM posts WHERE user_id = ? AND repost_of = ?', [req.user.id, postId]);
  if (existing) { await dbRun('DELETE FROM posts WHERE id = ?', [existing.id]); return res.json({ message: 'Repost removed', is_reposted: false }); }
  const { comment } = req.body;
  await dbRun('INSERT INTO posts (user_id, content, post_type, repost_of) VALUES (?, ?, ?, ?)', [req.user.id, comment || original.content, 'repost', postId]);
  dbRun('UPDATE users SET pulse_score = pulse_score + 3 WHERE id = ?', [original.user_id]).catch(() => {});
  res.json({ message: 'Reposted', is_reposted: true });
});

app.delete('/api/posts/:id', auth, async (req, res) => {
  const postId = parseInt(req.params.id);
  const post = await dbGet('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
  if (post.image_url?.startsWith('/uploads/')) { const p = path.join(__dirname, post.image_url); if (fs.existsSync(p)) fs.unlinkSync(p); }
  await dbRun('DELETE FROM posts WHERE id = ?', [postId]);
  dbRun('UPDATE users SET pulse_score = MAX(0, pulse_score - 3) WHERE id = ?', [req.user.id]).catch(() => {});
  res.json({ message: 'Post deleted' });
});

// ═══════════════════════════════════════════════════════════════
//  REACTIONS
// ═══════════════════════════════════════════════════════════════
const VALID_EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '🤯', '👏', '🚀'];

app.post('/api/posts/:id/react', auth, async (req, res) => {
  const postId = parseInt(req.params.id);
  const { emoji } = req.body;
  if (!VALID_EMOJIS.includes(emoji)) return res.status(400).json({ error: 'Invalid emoji' });
  const post = await dbGet('SELECT user_id FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const existing = await dbGet('SELECT emoji FROM reactions WHERE user_id = ? AND post_id = ?', [req.user.id, postId]);
  if (existing) {
    if (existing.emoji === emoji) {
      await dbRun('DELETE FROM reactions WHERE user_id = ? AND post_id = ?', [req.user.id, postId]);
      dbRun('UPDATE users SET pulse_score = MAX(0, pulse_score - 1) WHERE id = ?', [post.user_id]).catch(() => {});
      return res.json({ message: 'Reaction removed', user_reaction: null });
    }
    await dbRun('UPDATE reactions SET emoji = ?, created_at = CURRENT_TIMESTAMP WHERE user_id = ? AND post_id = ?', [emoji, req.user.id, postId]);
    return res.json({ message: 'Reaction changed', user_reaction: emoji });
  }
  await dbRun('INSERT INTO reactions (user_id, post_id, emoji) VALUES (?, ?, ?)', [req.user.id, postId, emoji]);
  dbRun('UPDATE users SET pulse_score = pulse_score + 1 WHERE id = ?', [post.user_id]).catch(() => {});
  if (post.user_id !== req.user.id) dbRun('INSERT OR IGNORE INTO notifications (user_id, actor_id, type, post_id) VALUES (?, ?, ?, ?)', [post.user_id, req.user.id, 'reaction', postId]).catch(() => {});
  res.json({ message: 'Reaction added', user_reaction: emoji });
});

app.get('/api/posts/:id/reactions', auth, async (req, res) => {
  const reactions = await dbAll(`SELECT emoji, COUNT(*) as count FROM reactions WHERE post_id = ? GROUP BY emoji ORDER BY count DESC`, [parseInt(req.params.id)]);
  res.json(reactions);
});

// ═══════════════════════════════════════════════════════════════
//  COMMENTS
// ═══════════════════════════════════════════════════════════════
app.get('/api/posts/:id/comments', auth, async (req, res) => {
  const comments = await dbAll(`SELECT c.id, c.content, c.created_at, c.parent_id, u.id as user_id, u.username, u.display_name, u.avatar_url, u.verified FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC`, [parseInt(req.params.id)]);
  res.json(comments);
});

app.post('/api/posts/:id/comments', auth, async (req, res) => {
  const postId = parseInt(req.params.id);
  const { content, parent_id } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });
  const post = await dbGet('SELECT user_id FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const result = await dbRun('INSERT INTO comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)', [postId, req.user.id, content.trim(), parent_id || null]);
  dbRun('UPDATE users SET pulse_score = pulse_score + 2 WHERE id = ?', [req.user.id]).catch(() => {});
  if (post.user_id !== req.user.id) dbRun('INSERT OR IGNORE INTO notifications (user_id, actor_id, type, post_id) VALUES (?, ?, ?, ?)', [post.user_id, req.user.id, 'comment', postId]).catch(() => {});
  const comment = await dbGet(`SELECT c.id, c.content, c.created_at, c.parent_id, u.id as user_id, u.username, u.display_name, u.avatar_url, u.verified FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?`, [result.lastID]);
  res.status(201).json(comment);
});

// ═══════════════════════════════════════════════════════════════
//  BOOKMARKS
// ═══════════════════════════════════════════════════════════════
app.post('/api/posts/:id/bookmark', auth, async (req, res) => {
  const postId = parseInt(req.params.id);
  const exists = await dbGet('SELECT 1 FROM bookmarks WHERE user_id = ? AND post_id = ?', [req.user.id, postId]);
  if (exists) { await dbRun('DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?', [req.user.id, postId]); return res.json({ message: 'Bookmark removed', is_bookmarked: false }); }
  await dbRun('INSERT INTO bookmarks (user_id, post_id) VALUES (?, ?)', [req.user.id, postId]);
  res.json({ message: 'Bookmarked', is_bookmarked: true });
});

app.get('/api/bookmarks', auth, async (req, res) => {
  const posts = await dbAll(`SELECT p.id, p.content, p.image_url, p.post_type, p.created_at, u.id as user_id, u.username, u.display_name, u.avatar_url, u.verified, (SELECT COUNT(*) FROM reactions WHERE post_id = p.id) as reactions_count, (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count, (SELECT emoji FROM reactions WHERE post_id = p.id AND user_id = ?) as user_reaction, 1 as is_bookmarked FROM bookmarks bk JOIN posts p ON bk.post_id = p.id JOIN users u ON p.user_id = u.id WHERE bk.user_id = ? ORDER BY bk.created_at DESC`, [req.user.id, req.user.id]);
  res.json(posts);
});

// ═══════════════════════════════════════════════════════════════
//  TRENDING
// ═══════════════════════════════════════════════════════════════
app.get('/api/trending', auth, async (req, res) => {
  const posts = await dbAll("SELECT content FROM posts WHERE created_at > datetime('now', '-7 days') LIMIT 500");
  const tagCounts = {};
  posts.forEach(p => { (p.content.match(/#\w+/g) || []).forEach(t => { const k = t.toLowerCase(); tagCounts[k] = (tagCounts[k] || 0) + 1; }); });
  const trending = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, count]) => ({ tag, count }));
  res.json(trending.length ? trending : [
    { tag: '#NexusX', count: 2847 }, { tag: '#LifeOS', count: 1893 },
    { tag: '#BuildInPublic', count: 1742 }, { tag: '#WebDev', count: 1611 },
    { tag: '#AI', count: 1589 }, { tag: '#Design', count: 1432 },
    { tag: '#Startup', count: 998 }, { tag: '#OpenSource', count: 876 }
  ]);
});

// ═══════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
app.get('/api/notifications', auth, async (req, res) => {
  const notifs = await dbAll(`SELECT n.id, n.type, n.post_id, n.read, n.created_at, u.id as actor_id, u.username, u.display_name, u.avatar_url, u.verified FROM notifications n JOIN users u ON n.actor_id = u.id WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 20`, [req.user.id]);
  res.json(notifs);
});

app.put('/api/notifications/read', auth, async (req, res) => {
  await dbRun('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ message: 'All notifications marked as read' });
});

// ─── Fallback SPA ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.listen(PORT, () => console.log(`\n🚀 NexusX running → http://localhost:${PORT}\n`));
