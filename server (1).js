// IT Live — server (faqat Node o'rnatilgan modullari; Postgres uchun ixtiyoriy "pg")
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = +process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_URL = process.env.DATABASE_URL || '';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

/* ---------- Saqlash: Postgres yoki fayl ---------- */
const mem = {}; let pool = null;
async function storeInit() {
  if (DB_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: DB_URL, ssl: /localhost|127\.0\.0\.1/.test(DB_URL) ? false : { rejectUnauthorized: false } });
    pool.on('error', e => console.error('pg (e‘tiborsiz):', e.message));   // Neon uyqudan uyg‘onganda ulanish uzilsa server qulamasin
    await pool.query('create table if not exists kv(key text primary key, val text not null, ver int not null default 0)');
    for (const r of (await pool.query('select key,val,ver from kv')).rows) mem[r.key] = { ver: r.ver, data: JSON.parse(r.val) };
    console.log('Baza: Postgres');
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const f of fs.readdirSync(DATA_DIR)) if (f.endsWith('.json')) { try { mem[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch (e) { console.error('Buzuq fayl:', f); } }
    console.log('Baza: fayl (' + DATA_DIR + ') — Render bepul rejasida u o‘chib ketadi, DATABASE_URL ishlating!');
  }
}
let chain = Promise.resolve(); const retry = new Set();
function persist(key) {            // yozuvlar ketma-ket, bir-biriga xalaqit bermaydi
  const rec = mem[key], snap = JSON.stringify(rec.data), ver = rec.ver;
  chain = chain.then(async () => {
    try {
      if (pool) await pool.query('insert into kv(key,val,ver) values($1,$2,$3) on conflict(key) do update set val=$2,ver=$3', [key, snap, ver]);
      else { const f = path.join(DATA_DIR, key + '.json'); fs.writeFileSync(f + '.tmp', JSON.stringify({ ver, data: rec.data })); fs.renameSync(f + '.tmp', f); }
    } catch (e) { console.error('Saqlash xatosi (20 soniyadan keyin qayta uriniladi):', e.message); if (!retry.has(key)) { retry.add(key); setTimeout(() => { retry.delete(key); persist(key); }, 20000); } }
  });
  return chain;
}

/* ---------- Parol va sessiya ---------- */
const hashPw = (p, salt) => crypto.scryptSync(p, salt, 32).toString('hex');
function mkAuth(u, p) { const salt = crypto.randomBytes(16).toString('hex'); return { u, salt, h: hashPw(p, salt) }; }
const okPw = (a, p) => { try { return crypto.timingSafeEqual(Buffer.from(hashPw(p, a.salt), 'hex'), Buffer.from(a.h, 'hex')); } catch (e) { return false; } };
let SECRET = process.env.SESSION_SECRET || '';
function authInit() {
  if (!SECRET) { if (!mem._secret) { mem._secret = { ver: 1, data: crypto.randomBytes(32).toString('hex') }; persist('_secret'); } SECRET = mem._secret.data; }
  if (!mem.auth) { mem.auth = { ver: 1, data: mkAuth(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS || 'admin123') }; persist('auth'); if (!process.env.ADMIN_PASS) console.warn('⚠ ADMIN_PASS berilmagan: boshlang‘ich parol admin123 — darhol o‘zgartiring!'); }
}
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function mkCookie(u, secure) { const exp = Date.now() + 30 * 864e5, b = Buffer.from(JSON.stringify({ u, exp, v: mem.auth.data.h.slice(0, 12) })).toString('base64url'); return `sid=${b}.${sign(b)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${secure ? '; Secure' : ''}`; }
function who(req) {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const [b, s] = m[1].split('.'); if (!b || !s) return null;
  try { if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(sign(b)))) return null; const o = JSON.parse(Buffer.from(b, 'base64url')); return o.exp > Date.now() && o.u === mem.auth.data.u && o.v === mem.auth.data.h.slice(0, 12) ? o.u : null; } catch (e) { return null; }
}
const fails = new Map();
const locked = ip => (fails.get(ip) || { until: 0 }).until > Date.now();
function fail(ip) { const f = fails.get(ip) || { n: 0, until: 0 }; if (++f.n >= 5) { f.until = Date.now() + 15000; f.n = 0; } fails.set(ip, f); }

/* ---------- Ma'lumotni birlashtirish (ikki qurilma bir vaqtda yozsa yo'qolmasin) ---------- */
function union(a, b, key, better) { const m = new Map(); [...(a || []), ...(b || [])].forEach(x => { const k = key(x), o = m.get(k); m.set(k, o ? better(o, x) : x); }); return [...m.values()]; }
const closed = (o, x) => (x.back || x.bdate) && !(o.back || o.bdate) ? x : o.back || o.bdate ? o : x;
function merge(key, cur, inc) {
  if (key === 'nb') {
    const r = { ...inc };
    r.loans = union(cur.loans, inc.loans, l => [l.id, l.date, l.t, l.person].join('|'), closed);
    r.hist = union(cur.hist, inc.hist, h => [h.id, h.d, h.t, h.ev].join('|'), (o) => o);
    r.repairs = union(cur.repairs, inc.repairs, x => [x.id, x.sent, x.issue].join('|'), (o, x) => (x.back && !o.back ? x : o));
    r.persons = union(cur.persons, inc.persons, p => p.name.toLowerCase(), (o, x) => x);
    r.reports = union(cur.reports, inc.reports, x => x.date, (o, x) => x);
    return r;
  }
  const r = { ...inc };
  r.books = union(cur.books, inc.books, b => b.code, (o, x) => x);
  r.loans = union(cur.loans, inc.loans, l => [l.code, l.date, l.t, l.person].join('|'), closed);
  return r;
}
const KEYS = { nb: d => d && Array.isArray(d.laptops), lib: d => d && Array.isArray(d.books) && Array.isArray(d.loans) };

/* ---------- Kunlik zaxira (oxirgi 14 kun, har soatda yangilanadi) ---------- */
let lastSnap = '';
function snapDaily() {
  if (!mem.nb) return;
  const sig = mem.nb.ver + '|' + (mem.lib ? mem.lib.ver : 0), d = new Date().toISOString().slice(0, 10);
  const b = mem.bak ? mem.bak.data : {};
  if (sig === lastSnap && b[d]) return;
  lastSnap = sig; b[d] = { nb: mem.nb.data, lib: mem.lib ? mem.lib.data : null };
  Object.keys(b).sort().slice(0, -14).forEach(k => delete b[k]);
  mem.bak = { ver: (mem.bak ? mem.bak.ver : 0) + 1, data: b }; persist('bak');
}

/* ---------- Ochiq katalog (loginsiz). O'quvchi ismlari HECH QACHON chiqmaydi ---------- */
let pub = { key: '', t: 0, body: '' };
const pubHits = new Map(); setInterval(() => pubHits.clear(), 60000).unref();
function pubBooks() {
  const L = mem.lib ? mem.lib.data : { books: [], loans: [] };
  const key = (mem.lib ? mem.lib.ver : 0) + '|' + (process.env.LIB_NAME || '');
  if (pub.key === key && Date.now() - pub.t < 15000) return pub.body;
  const open = new Map(); (L.loans || []).forEach(l => { if (!l.bdate) open.set(l.code, l); });
  const books = (L.books || []).map(b => { const o = open.get(b.code); return { c: b.code, t: b.title || '', a: b.author || '', cat: b.cat || '', y: b.year || '', l: b.lang || '', s: b.shelf || '', d: b.desc || '', n: b.note || '', added: b.added || '', st: o ? 'out' : 'free', since: o ? o.date || '' : '', due: o && o.due ? o.due : '' }; });
  const out = books.filter(b => b.st === 'out').length;
  pub = { key, t: Date.now(), body: JSON.stringify({ name: process.env.LIB_NAME || 'IT Live Kutubxonasi', total: books.length, free: books.length - out, out, cats: [...new Set(books.map(b => b.cat).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uz')), books }) };
  return pub.body;
}

/* ---------- Statik fayllar: fayl `public` ichiga ham, repo ildiziga ham tushsa — yangisi (build raqami kattasi) tanlanadi ---------- */
const ROOT_OK = new Set(['index.html', 'kitoblar.html', 'sw.js', 'manifest.webmanifest', 'kitoblar.webmanifest']);
const isFile = f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } };
const buildOf = f => { try { const m = /build:(\d+)/.exec(fs.readFileSync(f, 'utf8').slice(0, 400)); return m ? +m[1] : 0; } catch (e) { return -1; } };
const resolved = new Map();
function resolveStatic(rel) {
  if (resolved.has(rel)) return resolved.get(rel);
  const name = rel.replace(/^\//, ''), c = [], a = path.normalize(path.join(PUB, rel));
  if (a.startsWith(PUB + path.sep) && isFile(a)) c.push(a);
  if (ROOT_OK.has(name) && isFile(path.join(__dirname, name))) c.push(path.join(__dirname, name));
  let r = c[0] || null;
  if (c.length === 2 && /\.(html|js)$/.test(name) && buildOf(c[1]) > buildOf(c[0])) r = c[1];
  resolved.set(rel, r); return r;
}

/* ---------- HTTP ---------- */
const send = (res, code, obj, hdr) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...hdr }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => { let n = 0, c = []; req.on('data', d => { n += d.length; if (n > 8e6) { no(new Error('big')); req.destroy(); } else c.push(d); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(c).toString() || '{}')); } catch (e) { no(e); } }); });

async function api(req, res, url) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '';
  const secure = (req.headers['x-forwarded-proto'] || '') === 'https';
  const p = url.pathname;
  if (p === '/api/public/books' && req.method === 'GET') {
    const n = (pubHits.get(ip) || 0) + 1; pubHits.set(ip, n);
    if (n > 120) return send(res, 429, { error: 'Juda ko‘p so‘rov' });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=15' }); return res.end(pubBooks());
  }
  if (p === '/api/login' && req.method === 'POST') {
    if (locked(ip)) return send(res, 429, { error: 'Ko‘p urinish. 15 soniya kuting' });
    const b = await body(req), a = mem.auth.data;
    if (String(b.u || '').trim() === a.u && okPw(a, String(b.p || ''))) { fails.delete(ip); return send(res, 200, { ok: 1, u: a.u, t: Date.now() }, { 'Set-Cookie': mkCookie(a.u, secure) }); }
    fail(ip); return send(res, 401, { error: 'Login yoki parol noto‘g‘ri' });
  }
  if (p === '/api/logout' && req.method === 'POST') return send(res, 200, { ok: 1 }, { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0' });
  const u = who(req);
  if (p === '/api/me') return u ? send(res, 200, { u, t: Date.now() }) : send(res, 401, { error: 'login' });
  if (!u) return send(res, 401, { error: 'login' });
  if (p === '/api/password' && req.method === 'POST') {
    const b = await body(req), a = mem.auth.data;
    if (!okPw(a, String(b.cur || ''))) return send(res, 403, { error: 'Joriy parol noto‘g‘ri' });
    const nu = String(b.u || '').trim(), np = String(b.p || '');
    if (nu.length < 3) return send(res, 400, { error: 'Login kamida 3 belgi' });
    if (np && np.length < 6) return send(res, 400, { error: 'Parol kamida 6 belgi' });
    mem.auth = { ver: mem.auth.ver + 1, data: np ? mkAuth(nu, np) : { ...a, u: nu } }; await persist('auth');
    return send(res, 200, { ok: 1 }, { 'Set-Cookie': mkCookie(nu, secure) });
  }
  if (p === '/api/backups') return send(res, 200, { days: Object.keys(mem.bak ? mem.bak.data : {}).sort() });
  if (p === '/api/backup') {
    const d = url.searchParams.get('d'), k = url.searchParams.get('k'), x = mem.bak && mem.bak.data[d];
    if (!x || !['nb', 'lib'].includes(k) || !x[k]) return send(res, 404, { error: 'topilmadi' });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${k === 'nb' ? 'noutbuk' : 'kutubxona'}-zaxira-${d}.json"`, 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(x[k]));
  }
  const m = /^\/api\/data\/(nb|lib)$/.exec(p);
  if (m) {
    const key = m[1], cur = mem[key];
    if (req.method === 'GET') {
      const since = +url.searchParams.get('since');
      if (!cur) return send(res, 200, { ver: 0, data: null, t: Date.now() });
      return send(res, 200, since === cur.ver ? { ver: cur.ver, same: 1, t: Date.now() } : { ver: cur.ver, data: cur.data, t: Date.now() });
    }
    if (req.method === 'PUT') {
      const b = await body(req); if (!KEYS[key](b.data)) return send(res, 400, { error: 'Noto‘g‘ri ma’lumot' });
      delete b.data.auth;
      const merged = cur && +b.base !== cur.ver ? merge(key, cur.data, b.data) : b.data;
      mem[key] = { ver: (cur ? cur.ver : 0) + 1, data: merged }; await persist(key);
      return send(res, 200, { ver: mem[key].ver, data: merged, merged: !!(cur && +b.base !== cur.ver), t: Date.now() });
    }
  }
  send(res, 404, { error: 'topilmadi' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const rel = url.pathname === '/' ? '/index.html' : url.pathname === '/kitoblar' ? '/kitoblar.html' : decodeURIComponent(url.pathname);
    const f = resolveStatic(rel);
    if (!f) { res.writeHead(404); return res.end('Topilmadi'); }
    const ext = path.extname(f);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' || f.endsWith('sw.js') ? 'no-cache' : 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(self)' });
    fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e.message); if (!res.headersSent) send(res, 500, { error: 'Server xatosi' }); }
});
storeInit().then(() => { authInit(); setTimeout(snapDaily, 5000); setInterval(snapDaily, 3600e3); server.listen(PORT, () => console.log('IT Live: http://localhost:' + PORT)); }).catch(e => { console.error('Boshlanmadi:', e); process.exit(1); });
