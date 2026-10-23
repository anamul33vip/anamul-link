require("dotenv").config();

const express = require("express");
const session = require("express-session");
const { DatabaseSync } = require("node:sqlite");
const Database = DatabaseSync;
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");

fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "public", "uploads"), { recursive: true });
const db = new Database(path.join(__dirname, "data", "app.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  api_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  target_url TEXT NOT NULL,
  title TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL,
  clicked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  referrer TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  FOREIGN KEY(link_id) REFERENCES links(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  image_url TEXT DEFAULT '',
  destination_url TEXT DEFAULT '',
  body TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);
try {
  const cols = db.prepare("PRAGMA table_info(ads)").all();
  if (!cols.some(c => c.name === "step_number")) db.exec("ALTER TABLE ads ADD COLUMN step_number INTEGER");
} catch {}

const getSetting = db.prepare("SELECT value FROM settings WHERE key=?");
const setSetting = db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
if (!getSetting.get("site_name")) setSetting.run("site_name", "AS ANAMUL");
if (!getSetting.get("ad_enabled")) setSetting.run("ad_enabled", "true");
if (!getSetting.get("continue_seconds")) setSetting.run("continue_seconds", "5");
if (db.prepare("SELECT COUNT(*) AS n FROM ads").get().n === 0) {
  db.prepare("INSERT INTO ads(title,image_url,destination_url,body) VALUES(?,?,?,?)").run("AS ANAMUL Telegram", "", "https://t.me/asanamulcoding", "Join AS ANAMUL on Telegram for new APK updates and support.");
  db.prepare("INSERT INTO ads(title,image_url,destination_url,body) VALUES(?,?,?,?)").run("AS ANAMUL YouTube", "", "https://www.youtube.com/@Anamul_Islamic_Echo", "Subscribe to AS ANAMUL on YouTube for new videos and updates.");
}

const adminEmail = String(process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || "");
if (!db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail)) {
  if (adminPassword.length >= 12) {
    db.prepare("INSERT INTO users(email,password_hash,role,api_key) VALUES(?,?,?,?)")
      .run(adminEmail, bcrypt.hashSync(adminPassword, 12), "admin", crypto.randomBytes(24).toString("hex"));
    console.log(`Admin account initialized: ${adminEmail}`);
  } else {
    console.warn("Admin not initialized: set ADMIN_PASSWORD to at least 12 characters in .env, then restart.");
  }
}

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
      frameSrc: ["'self'", "https:"]
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.json({ limit: "20kb" }));

app.use(session({
  // Termux edition: memory session store (no native sqlite module). Sessions end on restart; links/users stay in data/app.db.
  secret: process.env.SESSION_SECRET || "development-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: String(process.env.COOKIE_SECURE).toLowerCase() === "true",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });
const redirectLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false });

app.use(express.static(path.join(__dirname, "public")));

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function safeUrl(raw) {
  try {
    const u = new URL(String(raw));
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch { return null; }
}
function randomCode(length = 7) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}
function makeCode() {
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    if (!db.prepare("SELECT id FROM links WHERE code=?").get(code)) return code;
  }
  throw new Error("Could not allocate a unique short code");
}
function userFromReq(req) {
  if (!req.session.userId) return null;
  return db.prepare("SELECT id,email,role,api_key,created_at FROM users WHERE id=?").get(req.session.userId) || null;
}
function requireAuth(req, res, next) {
  if (!userFromReq(req)) return res.status(401).json({ error: "Please sign in first." });
  next();
}
function requireAdmin(req, res, next) {
  const user = userFromReq(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  next();
}
function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  return req.session.csrfToken;
}
function csrfCheck(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const token = req.get("x-csrf-token") || req.body?._csrf;
  if (!token || token !== req.session.csrfToken) return res.status(403).json({ error: "Security token expired. Refresh and try again." });
  next();
}
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/public/") || req.path.startsWith("/auth/")) return next();
  csrfCheck(req, res, next);
});

app.get("/api/public/config", (req, res) => {
  res.json({
    siteName: getSetting.get("site_name")?.value || "AS ANAMUL",
    adEnabled: getSetting.get("ad_enabled")?.value !== "false",
    continueSeconds: Math.max(0, Math.min(30, Number(getSetting.get("continue_seconds")?.value || 5))),
    user: userFromReq(req) ? { email: userFromReq(req).email, role: userFromReq(req).role } : null,
    csrfToken: csrfToken(req)
  });
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 10 || password.length > 72) return res.status(400).json({ error: "Password must be 10–72 characters." });
  if (db.prepare("SELECT id FROM users WHERE email=?").get(email)) return res.status(409).json({ error: "An account with that email already exists." });
  const hash = await bcrypt.hash(password, 12);
  const key = crypto.randomBytes(24).toString("hex");
  const result = db.prepare("INSERT INTO users(email,password_hash,api_key) VALUES(?,?,?)").run(email, hash, key);
  req.session.userId = Number(result.lastInsertRowid);
  csrfToken(req);
  res.json({ ok: true, message: "Account created." });
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Email or password is incorrect." });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start session." });
    req.session.userId = user.id;
    csrfToken(req);
    res.json({ ok: true, message: "Signed in." });
  });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = userFromReq(req);
  const links = db.prepare(`
    SELECT l.id,l.code,l.target_url,l.title,l.active,l.created_at,COUNT(c.id) AS clicks
    FROM links l LEFT JOIN clicks c ON c.link_id=l.id
    WHERE l.user_id=? GROUP BY l.id ORDER BY l.id DESC
  `).all(user.id);
  const totalClicks = db.prepare("SELECT COUNT(*) AS n FROM clicks c JOIN links l ON l.id=c.link_id WHERE l.user_id=?").get(user.id).n;
  res.json({ user, links: links.map(l => ({ ...l, short_url: `${BASE_URL}/${l.code}` })), totalClicks });
});

app.post("/api/links", requireAuth, (req, res) => {
  const user = userFromReq(req);
  const target = safeUrl(req.body.url);
  if (!target) return res.status(400).json({ error: "Enter a valid http:// or https:// URL." });
  const title = String(req.body.title || "").trim().slice(0, 100);
  let code = String(req.body.customCode || "").trim();
  if (code) {
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(code)) return res.status(400).json({ error: "Custom code must be 3–32 letters, numbers, _ or -." });
    if (["api", "admin", "dashboard", "login", "register", "assets"].includes(code.toLowerCase())) return res.status(400).json({ error: "That code is reserved." });
    if (db.prepare("SELECT id FROM links WHERE code=?").get(code)) return res.status(409).json({ error: "That custom code is already taken." });
  } else code = makeCode();
  db.prepare("INSERT INTO links(user_id,code,target_url,title) VALUES(?,?,?,?)").run(user.id, code, target, title);
  res.json({ ok: true, code, short_url: `${BASE_URL}/${code}` });
});

app.delete("/api/links/:id", requireAuth, (req, res) => {
  const user = userFromReq(req);
  const link = db.prepare("SELECT id FROM links WHERE id=? AND user_id=?").get(Number(req.params.id), user.id);
  if (!link) return res.status(404).json({ error: "Link not found." });
  db.prepare("DELETE FROM links WHERE id=?").run(link.id);
  res.json({ ok: true });
});

app.post("/api/links/:id/toggle", requireAuth, (req, res) => {
  const user = userFromReq(req);
  const link = db.prepare("SELECT id,active FROM links WHERE id=? AND user_id=?").get(Number(req.params.id), user.id);
  if (!link) return res.status(404).json({ error: "Link not found." });
  db.prepare("UPDATE links SET active=? WHERE id=?").run(link.active ? 0 : 1, link.id);
  res.json({ ok: true });
});

app.get("/api/analytics", requireAuth, (req, res) => {
  const user = userFromReq(req);
  const rows = db.prepare(`
    SELECT date(c.clicked_at) AS day, COUNT(*) AS clicks
    FROM clicks c JOIN links l ON l.id=c.link_id
    WHERE l.user_id=? AND c.clicked_at >= datetime('now','-6 days')
    GROUP BY date(c.clicked_at) ORDER BY day
  `).all(user.id);
  res.json({ days: rows });
});

app.get("/api/api-key", requireAuth, (req, res) => {
  const user = userFromReq(req);
  res.json({ api_key: user.api_key });
});
app.post("/api/api-key/rotate", requireAuth, (req, res) => {
  const user = userFromReq(req);
  const key = crypto.randomBytes(24).toString("hex");
  db.prepare("UPDATE users SET api_key=? WHERE id=?").run(key, user.id);
  res.json({ api_key: key });
});

// Token-authenticated API for programmatic link creation.
app.post("/api/v1/shorten", apiLimiter, async (req, res) => {
  const key = String(req.get("x-api-key") || req.body.api_key || "");
  if (!key) return res.status(401).json({ error: "Supply your API key in X-API-Key." });
  const user = db.prepare("SELECT id FROM users WHERE api_key=?").get(key);
  if (!user) return res.status(401).json({ error: "Invalid API key." });
  const target = safeUrl(req.body.url);
  if (!target) return res.status(400).json({ error: "Valid http:// or https:// url is required." });
  const code = makeCode();
  db.prepare("INSERT INTO links(user_id,code,target_url,title) VALUES(?,?,?,?)").run(user.id, code, target, String(req.body.title || "").slice(0, 100));
  res.status(201).json({ short_url: `${BASE_URL}/${code}`, code });
});

app.get("/api/admin/overview", requireAuth, requireAdmin, (req, res) => {
  res.json({
    users: db.prepare("SELECT COUNT(*) n FROM users").get().n,
    links: db.prepare("SELECT COUNT(*) n FROM links").get().n,
    clicks: db.prepare("SELECT COUNT(*) n FROM clicks").get().n,
    ads: db.prepare("SELECT COUNT(*) n FROM ads").get().n,
    adEnabled: getSetting.get("ad_enabled")?.value !== "false",
    continueSeconds: Number(getSetting.get("continue_seconds")?.value || 5)
  });
});
app.get("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT id,email,role,created_at FROM users ORDER BY id DESC LIMIT 200").all());
});
app.get("/api/admin/ads", requireAuth, requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM ads ORDER BY id DESC").all());
});
app.post("/api/admin/ads", requireAuth, requireAdmin, (req, res) => {
  const title = String(req.body.title || "").trim().slice(0, 120);
  const rawImage = String(req.body.image_url || "");
  const image = rawImage ? (/^\/uploads\/[A-Za-z0-9._-]+$/.test(rawImage) ? rawImage : safeUrl(rawImage)) : "";
  const destination = req.body.destination_url ? safeUrl(req.body.destination_url) : "";
  const body = String(req.body.body || "").slice(0, 500);
  let stepNum = Number(req.body.step_number);
  if (!Number.isInteger(stepNum) || stepNum < 1 || stepNum > 8) stepNum = null;
  if (!title) return res.status(400).json({ error: "Ad title is required." });
  if (req.body.image_url && !image) return res.status(400).json({ error: "Media URL must be http(s)." });
  if (req.body.destination_url && !destination) return res.status(400).json({ error: "Destination URL must be http(s)." });
  // One ad per step slot: a new ad for Step N replaces the old ad in that slot.
  if (stepNum) db.prepare("DELETE FROM ads WHERE step_number=?").run(stepNum);
  const info = db.prepare("INSERT INTO ads(title,image_url,destination_url,body,step_number) VALUES(?,?,?,?,?)").run(title, image || "", destination || "", body, stepNum);
  res.status(201).json({ ok: true, id: info.lastInsertRowid, step_number: stepNum });
});

// Phone file upload for ads: image or video only, admin only, max 50 MB.
// Files are saved under public/uploads/ and served at /uploads/<name>.
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, "public", "uploads"),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mov"].includes(ext) ? ext : ".bin";
      cb(null, crypto.randomBytes(12).toString("hex") + safeExt);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) cb(null, true);
    else cb(null, false);
  }
});
app.post("/api/admin/upload", requireAuth, requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Only image or video files are allowed (max 50 MB)." });
  res.json({ ok: true, url: `/uploads/${req.file.filename}` });
});
app.post("/api/admin/ads/:id/toggle", requireAuth, requireAdmin, (req, res) => {
  const ad = db.prepare("SELECT id,active FROM ads WHERE id=?").get(Number(req.params.id));
  if (!ad) return res.status(404).json({ error: "Ad not found." });
  db.prepare("UPDATE ads SET active=? WHERE id=?").run(ad.active ? 0 : 1, ad.id);
  res.json({ ok: true });
});
app.delete("/api/admin/ads/:id", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM ads WHERE id=?").run(Number(req.params.id));
  res.json({ ok: true });
});
app.post("/api/admin/settings", requireAuth, requireAdmin, (req, res) => {
  const enabled = req.body.ad_enabled === true || req.body.ad_enabled === "true" ? "true" : "false";
  const seconds = Math.max(0, Math.min(30, Number(req.body.continue_seconds || 5)));
  setSetting.run("ad_enabled", enabled);
  setSetting.run("continue_seconds", String(seconds));
  res.json({ ok: true });
});


function isVideoUrl(url) { return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(String(url || "")); }
function youtubeId(url) {
  try {
    const u = new URL(String(url || ""));
    if (u.hostname === "youtu.be") return u.pathname.replace("/", "") || null;
    if (u.hostname.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(embed|shorts)\/([^/?#]+)/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}
function adMediaHtml(ad) {
  if (!ad.image_url) return "";
  const url = escapeHtml(ad.image_url);
  const yt = youtubeId(ad.image_url);
  if (yt) return `<iframe class="ad-video" src="https://www.youtube.com/embed/${escapeHtml(yt)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  if (isVideoUrl(ad.image_url)) return `<video class="ad-video" src="${url}" controls autoplay muted loop playsinline></video>`;
  return `<img class="ad-image" src="${url}" alt="${escapeHtml(ad.title)}">`;
}

app.get("/go/:code", redirectLimiter, (req, res) => {
  const link = db.prepare("SELECT * FROM links WHERE code=? AND active=1").get(String(req.params.code));
  if (!link) return res.status(404).sendFile(path.join(__dirname, "public", "not-found.html"));
  const TOTAL_STEPS = 8;
  let step = Number(req.query.step || 1);
  if (!Number.isInteger(step) || step < 1) step = 1;
  if (step > TOTAL_STEPS) step = TOTAL_STEPS;
  // Count the visit only once, on step 1, so 8 steps do not inflate clicks.
  if (step === 1) {
    db.prepare("INSERT INTO clicks(link_id,referrer,user_agent) VALUES(?,?,?)")
      .run(link.id, String(req.get("referer") || "").slice(0, 500), String(req.get("user-agent") || "").slice(0, 500));
  }
  const adEnabled = getSetting.get("ad_enabled")?.value !== "false";
  const stepAd = adEnabled ? db.prepare("SELECT * FROM ads WHERE active=1 AND step_number=? ORDER BY id LIMIT 1").get(step) : null;
  const generalAds = adEnabled ? db.prepare("SELECT * FROM ads WHERE active=1 AND step_number IS NULL ORDER BY id").all() : [];
  const ad = stepAd || (generalAds.length ? generalAds[(step - 1) % generalAds.length] : null);
  const seconds = 20;
  const networkScriptUrl = String(process.env.AD_NETWORK_SCRIPT_URL || "");
  const isFinal = step === TOTAL_STEPS;
  const nextUrl = isFinal ? `/out/${encodeURIComponent(link.code)}` : `/go/${encodeURIComponent(link.code)}?step=${step + 1}`;
  const nextLabel = isFinal ? "Continue to destination ↗" : `Next → Step ${step + 1} of ${TOTAL_STEPS}`;
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><title>Step ${step} of ${TOTAL_STEPS} • AS ANAMUL</title><link rel="stylesheet" href="/style.css"><style>.step-wrap{width:min(100%,680px)}.step-pill{display:inline-block;padding:8px 16px;border-radius:999px;background:linear-gradient(100deg,#56e9f4,#a78bfa 58%,#f783da,#56e9f4);background-size:300% 300%;animation:rgbShift 6s ease infinite;color:#111329;font-weight:800;letter-spacing:.08em;font-size:13px}.step-bar{height:12px;border-radius:999px;background:#1a2340;overflow:hidden;margin:18px 0 6px}.step-bar>div{height:100%;width:${pct}%;background:linear-gradient(90deg,#56e9f4,#a78bfa,#f783da,#56e9f4);background-size:300% 300%;animation:rgbShift 4s ease infinite}.step-count{text-align:center;color:#9ba6c3;font-size:12px;letter-spacing:.12em}.big-ad{min-height:290px;animation:rgbGlow 5s ease-in-out infinite alternate}.big-ad .ad-image{max-height:320px}.big-ad .ad-placeholder{min-height:240px;font-size:20px}.premium-title{background:linear-gradient(90deg,#56e9f4,#a78bfa,#f783da,#56e9f4);background-size:300% 300%;animation:rgbShift 6s ease infinite;-webkit-background-clip:text;background-clip:text;color:transparent}</style></head><body class="ad-body"><main class="ad-wrap step-wrap"><div class="brand"><span class="brand-mark">AS</span><span>AS ANAMUL<span class="muted"> LINK</span></span></div><div class="ad-card"><p class="eyebrow">AS ANAMUL • PREMIUM LINK</p><div><span class="step-pill">STEP ${step} / ${TOTAL_STEPS}</span></div><div class="step-bar"><div></div></div><p class="step-count">${pct}% COMPLETE</p><h1 class="premium-title">You're almost there</h1><p class="muted">This is step ${step} of ${TOTAL_STEPS}. After step ${TOTAL_STEPS} you will reach the destination you requested.</p>
${ad ? `<section class="own-ad big-ad"><span class="ad-label">Advertisement • Sponsored</span>${adMediaHtml(ad)}<h2>${escapeHtml(ad.title)}</h2><p>${escapeHtml(ad.body)}</p>${ad.destination_url ? `<a class="secondary-button" href="${escapeHtml(ad.destination_url)}" target="_blank" rel="noopener noreferrer sponsored">Learn more</a>` : ""}</section>` : `<section class="network-slot big-ad"><span class="ad-label">Advertisement • Sponsored</span><div class="ad-placeholder">AD SPACE<br><small>Add your own ad in Admin &gt; Ads, or set an approved ad-network script (AD_NETWORK_SCRIPT_URL). No paying ad appears automatically without a network account and approval.</small></div></section>`}
${networkScriptUrl && networkScriptUrl.toLowerCase().startsWith("https://") ? `<script async src="${escapeHtml(networkScriptUrl)}"></script>` : ""}
<div class="continue-area"><p id="countdown" class="muted">Next available in ${seconds}s</p><button id="continueBtn" class="primary-button" disabled>${nextLabel}</button><p class="tiny muted">This button does not open an ad. ${isFinal ? "It opens the destination you requested." : "It takes you to the next step."}</p></div></div><footer>AS ANAMUL · Link services</footer></main><script>let n=${seconds};const b=document.getElementById('continueBtn');const t=document.getElementById('countdown');const timer=setInterval(()=>{n--;if(n<=0){clearInterval(timer);b.disabled=false;t.textContent='You can continue now'}else{t.textContent='Next available in '+n+'s'}},1000);b.addEventListener('click',()=>{b.disabled=true;location.href='${nextUrl}'})</script></body></html>`);
});

app.get("/out/:code", redirectLimiter, (req, res) => {
  const link = db.prepare("SELECT target_url FROM links WHERE code=? AND active=1").get(String(req.params.code));
  if (!link) return res.status(404).sendFile(path.join(__dirname, "public", "not-found.html"));
  res.redirect(302, link.target_url);
});

app.get("/:code", redirectLimiter, (req, res, next) => {
  const reserved = ["api", "admin", "dashboard", "login", "register", "style.css", "app.js", "not-found.html", "favicon.ico", "go", "out"];
  if (reserved.includes(req.params.code.toLowerCase())) return next();
  const link = db.prepare("SELECT code FROM links WHERE code=? AND active=1").get(String(req.params.code));
  if (!link) return next();
  res.redirect(302, `/go/${encodeURIComponent(link.code)}`);
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`AS ANAMUL URL Shortener running at ${BASE_URL}`);
});
