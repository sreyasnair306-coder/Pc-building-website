// ─────────────────────────────────────────────────────────
//  NEON//BUILD — Express + SQLite Backend
//  Works locally AND on Railway / Render / any Node host
// ─────────────────────────────────────────────────────────
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const rateLimit  = require('express-rate-limit');
const compression = require('compression');
const db         = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Auto-seed if DB is empty ─────────────────────────────
const partCount = db.prepare('SELECT COUNT(*) as n FROM parts').get().n;
if (partCount === 0) {
  console.log('[SERVER] Empty database detected — running auto-seed...');
  require('./seed');
  console.log('[SERVER] Auto-seed complete.');
}

// ── Middleware ───────────────────────────────────────────
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true
}));

// Rate limiting — 500 req/min per IP
app.use('/api', rateLimit({
  windowMs: 60_000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests — slow down.' }
}));

// ── Health check (used by CI + hosting platforms) ────────
app.get('/health', (_req, res) => {
  const count = db.prepare('SELECT COUNT(*) as n FROM parts').get().n;
  res.json({ status: 'ok', parts: count, timestamp: new Date().toISOString() });
});

// ── WHERE clause builder ─────────────────────────────────
function buildFilter(q) {
  const cond = [], params = {};
  if (q.category)   { cond.push('category = :category');   params.category  = q.category; }
  if (q.search)     { cond.push('(LOWER(name) LIKE :s OR LOWER(brand) LIKE :s OR LOWER(specs) LIKE :s)'); params.s = `%${q.search.toLowerCase()}%`; }
  if (q.tier)       { cond.push('tier = :tier');            params.tier      = q.tier; }
  if (q.brand)      { cond.push('LOWER(brand) = :brand');   params.brand     = q.brand.toLowerCase(); }
  if (q.stock)      { cond.push('stock = :stock');          params.stock     = q.stock; }
  if (q.price_min)  { cond.push('price_usd >= :pmin');      params.pmin      = +q.price_min; }
  if (q.price_max)  { cond.push('price_usd <= :pmax');      params.pmax      = +q.price_max; }
  return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', params };
}

const SORT_MAP = { name:'name', price:'price_usd', rating:'rating', brand:'brand', created:'created_at', updated:'updated_at' };

// ── GET /api/parts ────────────────────────────────────────
app.get('/api/parts', (req, res) => {
  try {
    const { where, params } = buildFilter(req.query);
    const sort   = SORT_MAP[req.query.sort] || 'name';
    const order  = req.query.order === 'desc' ? 'DESC' : 'ASC';
    const limit  = Math.min(+req.query.limit  || 50, 200);
    const offset = +req.query.offset || 0;

    const total = db.prepare(`SELECT COUNT(*) as n FROM parts ${where}`).get(params).n;
    const data  = db.prepare(`SELECT * FROM parts ${where} ORDER BY ${sort} ${order} LIMIT ${limit} OFFSET ${offset}`).all(params)
                    .map(p => ({ ...p, specs: JSON.parse(p.specs || '{}') }));

    res.json({ success: true, total, limit, offset, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── GET /api/parts/:id ────────────────────────────────────
app.get('/api/parts/:id', (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: { ...p, specs: JSON.parse(p.specs || '{}') } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST /api/parts ───────────────────────────────────────
app.post('/api/parts', (req, res) => {
  try {
    const { category, brand, name, price_usd, rating, tier, watt, stock,
            img, specs, perf_gaming, perf_workstation, perf_streaming,
            retailer_amazon, retailer_newegg, retailer_bhphoto } = req.body;
    if (!category || !brand || !name || !price_usd)
      return res.status(400).json({ success: false, error: 'category, brand, name, price_usd required' });

    const r = db.prepare(`
      INSERT INTO parts (category,brand,name,price_usd,rating,tier,watt,stock,img,specs,
        perf_gaming,perf_workstation,perf_streaming,retailer_amazon,retailer_newegg,retailer_bhphoto,
        created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    `).run(category,brand,name,+price_usd,rating||3,tier||'mid',watt||0,stock||'in',
           img||'',JSON.stringify(specs||{}),perf_gaming||0,perf_workstation||0,perf_streaming||0,
           retailer_amazon||'',retailer_newegg||'',retailer_bhphoto||'');

    const created = db.prepare('SELECT * FROM parts WHERE id=?').get(r.lastInsertRowid);
    res.status(201).json({ success: true, data: { ...created, specs: JSON.parse(created.specs) } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── PUT /api/parts/:id ────────────────────────────────────
app.put('/api/parts/:id', (req, res) => {
  try {
    if (!db.prepare('SELECT id FROM parts WHERE id=?').get(req.params.id))
      return res.status(404).json({ success: false, error: 'Not found' });

    const fields = ['category','brand','name','price_usd','rating','tier','watt','stock',
                    'img','specs','perf_gaming','perf_workstation','perf_streaming',
                    'retailer_amazon','retailer_newegg','retailer_bhphoto'];
    const sets = [], vals = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { sets.push(`${f}=?`); vals.push(f==='specs'?JSON.stringify(req.body[f]):req.body[f]); } });
    if (!sets.length) return res.status(400).json({ success: false, error: 'No fields to update' });
    sets.push("updated_at=datetime('now')");
    vals.push(req.params.id);
    db.prepare(`UPDATE parts SET ${sets.join(',')} WHERE id=?`).run(...vals);
    const updated = db.prepare('SELECT * FROM parts WHERE id=?').get(req.params.id);
    res.json({ success: true, data: { ...updated, specs: JSON.parse(updated.specs) } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── DELETE /api/parts/:id ─────────────────────────────────
app.delete('/api/parts/:id', (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM parts WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'Not found' });
    db.prepare('DELETE FROM parts WHERE id=?').run(req.params.id);
    res.json({ success: true, message: `Deleted: ${p.name}` });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── PATCH /api/parts/:id/price ────────────────────────────
app.patch('/api/parts/:id/price', (req, res) => {
  try {
    const { price_usd } = req.body;
    if (!price_usd) return res.status(400).json({ success: false, error: 'price_usd required' });
    const r = db.prepare("UPDATE parts SET price_usd=?,updated_at=datetime('now') WHERE id=?").run(+price_usd, req.params.id);
    if (!r.changes) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, price_usd: +price_usd });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST /api/parts/bulk-price ────────────────────────────
app.post('/api/parts/bulk-price', (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ success: false, error: 'updates array required' });
    const stmt = db.prepare("UPDATE parts SET price_usd=?,updated_at=datetime('now') WHERE id=?");
    db.transaction(items => items.forEach(({ id, price_usd }) => stmt.run(+price_usd, id)))(updates);
    res.json({ success: true, updated: updates.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── GET /api/categories ───────────────────────────────────
app.get('/api/categories', (_req, res) => {
  try {
    res.json({ success: true, data: db.prepare('SELECT category, COUNT(*) as count FROM parts GROUP BY category ORDER BY count DESC').all() });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── GET /api/brands ───────────────────────────────────────
app.get('/api/brands', (req, res) => {
  try {
    const where = req.query.category ? 'WHERE category=?' : '';
    const args  = req.query.category ? [req.query.category] : [];
    res.json({ success: true, data: db.prepare(`SELECT brand, COUNT(*) as count FROM parts ${where} GROUP BY brand ORDER BY count DESC`).all(...args) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── GET /api/stats ────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
  try {
    res.json({ success: true, data: {
      total:       db.prepare('SELECT COUNT(*) as n FROM parts').get().n,
      totalValue:  db.prepare('SELECT SUM(price_usd) as s FROM parts').get().s || 0,
      avgPrice:    db.prepare('SELECT AVG(price_usd) as a FROM parts').get().a || 0,
      byCat:       db.prepare('SELECT category, COUNT(*) as n FROM parts GROUP BY category').all(),
      byTier:      db.prepare('SELECT tier, COUNT(*) as n FROM parts GROUP BY tier').all(),
      byStock:     db.prepare('SELECT stock, COUNT(*) as n FROM parts GROUP BY stock').all(),
      recentlyUpd: db.prepare('SELECT id,brand,name,price_usd,updated_at FROM parts ORDER BY updated_at DESC LIMIT 10').all(),
    }});
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── GET /api/search ───────────────────────────────────────
app.get('/api/search', (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.length < 2) return res.json({ success: true, data: [] });
    const like = `%${q.toLowerCase()}%`;
    const data = db.prepare('SELECT * FROM parts WHERE LOWER(name) LIKE ? OR LOWER(brand) LIKE ? OR LOWER(specs) LIKE ? ORDER BY rating DESC LIMIT 20')
                   .all(like, like, like)
                   .map(p => ({ ...p, specs: JSON.parse(p.specs || '{}') }));
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── SPA catch-all ─────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ success: false, error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n ╔════════════════════════════════════════╗');
  console.log(` ║   NEON//BUILD  —  port ${PORT}           ║`);
  console.log(` ║   http://localhost:${PORT}               ║`);
  console.log(` ║   Admin → /admin                       ║`);
  console.log(` ║   API   → /api/parts                   ║`);
  console.log(' ╚════════════════════════════════════════╝\n');
});
