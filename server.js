const express = require('express');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./tracker.db');

db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, name TEXT, vendor TEXT, clicks_ordered INTEGER, cost REAL, optin_url TEXT, bridge_url TEXT, created_at TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS clicks (id TEXT PRIMARY KEY, campaign_id TEXT, stage TEXT, ip TEXT, user_agent TEXT, clicked_at TEXT, is_unique INTEGER DEFAULT 0)');
});

// Track a click and redirect
app.get('/t/:campaignId/:stage', (req, res) => {
  const { campaignId, stage } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.ip;
  const userAgent = req.headers['user-agent'] || '';
  const now = new Date().toISOString();

  db.get('SELECT id FROM clicks WHERE campaign_id=? AND stage=? AND ip=?', [campaignId, stage, ip], (err, row) => {
    const isUnique = row ? 0 : 1;
    db.run('INSERT INTO clicks VALUES (?,?,?,?,?,?,?)', [uuidv4(), campaignId, stage, ip, userAgent, now, isUnique]);
  });

  db.get('SELECT * FROM campaigns WHERE id=?', [campaignId], (err, camp) => {
    if (!camp) return res.send('Campaign not found');
    const dests = { optin: camp.optin_url, bridge: camp.bridge_url };
    res.redirect(dests[stage] || camp.optin_url || 'https://example.com');
  });
});

// Create a campaign
app.post('/api/campaigns', (req, res) => {
  const { id, name, vendor, clicks_ordered, cost, optin_url, bridge_url } = req.body;
  db.run(
    'INSERT INTO campaigns VALUES (?,?,?,?,?,?,?,?)',
    [id, name, vendor, clicks_ordered, cost, optin_url, bridge_url, new Date().toISOString()],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true, id });
    }
  );
});

// Get campaign stats
app.get('/api/stats/:campaignId', (req, res) => {
  db.all(
    'SELECT stage, COUNT(*) as total, SUM(is_unique) as unique_clicks FROM clicks WHERE campaign_id=? GROUP BY stage',
    [req.params.campaignId],
    (err, rows) => res.json(rows || [])
  );
});

// List all campaigns
app.get('/api/campaigns', (req, res) => {
  db.all('SELECT * FROM campaigns ORDER BY created_at DESC', [], (err, rows) => res.json(rows || []));
});

app.listen(PORT, () => console.log('Solo Ad Tracker running on port ' + PORT));
