const express = require('express');
const Database = require('better-sqlite3');
const { nanoid } = require('nanoid');
const path = require('path');

const app = express();
const PORT = 3456;

// Database setup
const db = new Database(path.join(__dirname, 'urls.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    clicks INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Prepared statements
const insertUrl = db.prepare('INSERT INTO urls (slug, original_url) VALUES (?, ?)');
const findBySlug = db.prepare('SELECT * FROM urls WHERE slug = ?');
const incrementClicks = db.prepare('UPDATE urls SET clicks = clicks + 1 WHERE slug = ?');
const getAllUrls = db.prepare('SELECT * FROM urls ORDER BY created_at DESC');
const deleteBySlug = db.prepare('DELETE FROM urls WHERE slug = ?');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Create short URL
app.post('/api/shorten', (req, res) => {
  let { url, slug } = req.body;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  // Add https:// if no protocol
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Use custom slug or generate one
  slug = slug ? slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '') : nanoid(7);

  if (!slug) return res.status(400).json({ error: 'Invalid custom slug' });
  if (slug.length > 50) return res.status(400).json({ error: 'Slug too long (max 50 chars)' });

  // Check if slug exists
  if (findBySlug.get(slug)) {
    return res.status(409).json({ error: 'That custom URL is already taken' });
  }

  try {
    insertUrl.run(slug, url);
    const entry = findBySlug.get(slug);
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create short URL' });
  }
});

// API: List all URLs
app.get('/api/urls', (req, res) => {
  const urls = getAllUrls.all();
  res.json(urls);
});

// API: Delete a URL
app.delete('/api/urls/:slug', (req, res) => {
  const result = deleteBySlug.run(req.params.slug);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// Redirect handler (must be last)
app.get('/:slug', (req, res) => {
  const entry = findBySlug.get(req.params.slug);
  if (!entry) return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
  incrementClicks.run(req.params.slug);
  res.redirect(301, entry.original_url);
});

app.listen(PORT, () => {
  console.log(`URL Shortener running at http://localhost:${PORT}`);
});
