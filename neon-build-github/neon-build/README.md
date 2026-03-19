# 🌐 NEON//BUILD — GitHub Deployment Guide

## What's inside this project

```
neon-build/
├── .github/
│   └── workflows/
│       └── deploy.yml      ← GitHub Actions CI/CD (auto-deploys on push)
├── public/
│   ├── index.html          ← Cyberpunk picker frontend (talks to live API)
│   └── admin.html          ← Admin panel (add/edit/delete/bulk prices)
├── server.js               ← Express REST API (10 endpoints)
├── database.js             ← SQLite schema + smart path (local & cloud)
├── seed.js                 ← Seeds 160+ components (safe to re-run)
├── package.json
├── railway.toml            ← Railway deploy config
├── render.yaml             ← Render deploy config
├── Procfile                ← Heroku/Render fallback
└── .gitignore              ← Excludes node_modules + .db file
```

---

## ⚡ STEP 1 — Push to GitHub

### First time setup:
```bash
# 1. Create a new repo on github.com (name it "neon-build")
#    → Click "New repository" → Don't add README → Click "Create"

# 2. Open terminal in your neon-build folder, then run:
git init
git add .
git commit -m "🚀 Initial commit — NEON//BUILD"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/neon-build.git
git push -u origin main
```

### Future updates (after editing):
```bash
git add .
git commit -m "update: changed prices / added parts"
git push
```
**GitHub Actions will automatically run your CI tests on every push.**

---

## 🚂 OPTION A — Deploy on Railway (Recommended — Free tier available)

Railway is the easiest cloud host for Node.js with persistent storage.

### Steps:
1. Go to **https://railway.app** → Sign up with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `neon-build` repo
4. Railway auto-detects Node.js and runs `npm install && node seed.js` then `npm start`
5. Click **"Generate Domain"** → your app is live at `https://neon-build-xxx.up.railway.app`

### Enable GitHub Actions auto-deploy:
1. In Railway → Settings → Tokens → **"Create Token"** → copy it
2. In GitHub → your repo → **Settings → Secrets → Actions → New secret**
   - Name: `RAILWAY_TOKEN`
   - Value: paste the token
3. Now every `git push` to `main` auto-deploys to Railway ✅

### Persistent database on Railway:
Railway provides a persistent volume. Add it:
1. Railway → your project → **"New Volume"**
2. Mount path: `/data`
3. The app automatically saves `neon-build.db` to `/data/` on cloud 🎯

---

## 🎨 OPTION B — Deploy on Render (Free tier — spins down after inactivity)

### Steps:
1. Go to **https://render.com** → Sign up with GitHub
2. **"New Web Service"** → Connect your `neon-build` repo
3. Settings:
   - **Build Command:** `npm install && node seed.js`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. Add a **Disk** (for persistent SQLite):
   - Name: `neon-db`
   - Mount Path: `/data`
   - Size: 1 GB (free)
5. Click **"Create Web Service"**

### Enable auto-deploy via GitHub Actions:
1. Render → your service → **Settings → Deploy Hook** → copy the URL
2. GitHub → repo → **Settings → Secrets → Actions → New secret**
   - Name: `RENDER_DEPLOY_HOOK`
   - Value: paste the URL
3. Every push to `main` now triggers Render deploy ✅

---

## 💻 OPTION C — Run locally (your own PC/server)

```bash
# Requirements: Node.js 18+ (download from nodejs.org)

# Install
npm install

# Seed database (first time only)
node seed.js

# Start server
npm start

# Open in browser
# http://localhost:3000        ← Picker
# http://localhost:3000/admin  ← Admin panel
```

### Keep it running 24/7 with PM2:
```bash
npm install -g pm2
pm2 start server.js --name neon-build
pm2 startup          # makes it start on system reboot
pm2 save
pm2 logs neon-build  # view live logs
```

---

## 🔌 API Reference

Your live API at `https://your-domain.com/api/`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/parts` | GET | List parts — supports `?category=gpu&search=nvidia&sort=price&order=desc&limit=50&offset=0&tier=ultra&price_min=200&price_max=800` |
| `/api/parts/:id` | GET | Single part |
| `/api/parts` | POST | Add new part |
| `/api/parts/:id` | PUT | Update part |
| `/api/parts/:id` | DELETE | Delete part |
| `/api/parts/:id/price` | PATCH | Quick price update |
| `/api/parts/bulk-price` | POST | Bulk update prices |
| `/api/categories` | GET | All categories + counts |
| `/api/brands` | GET | All brands |
| `/api/stats` | GET | Dashboard stats |
| `/api/search?q=query` | GET | Full-text search |
| `/health` | GET | Health check |

### Example: Add a part via curl
```bash
curl -X POST https://your-domain.com/api/parts \
  -H "Content-Type: application/json" \
  -d '{
    "category": "gpu",
    "brand": "NVIDIA",
    "name": "RTX 5090 Ti",
    "price_usd": 2499,
    "tier": "ultra",
    "rating": 5,
    "watt": 600,
    "stock": "low",
    "specs": {"VRAM": "32GB GDDR7", "TDP": "600W"},
    "retailer_amazon": "https://amazon.com/s?k=RTX+5090+Ti"
  }'
```

### Example: Bulk price update
```bash
curl -X POST https://your-domain.com/api/parts/bulk-price \
  -H "Content-Type: application/json" \
  -d '{"updates": [{"id": 1, "price_usd": 629}, {"id": 21, "price_usd": 1899}]}'
```

---

## 💱 Update Currency Exchange Rates

Edit `public/index.html` — find the `CURR` object:
```js
const CURR = {
  USD: { sym:'$', rate:1 },
  INR: { sym:'₹', rate:84.5 },   // ← Update this number
  EUR: { sym:'€', rate:0.92 },
  GBP: { sym:'£', rate:0.79 },
  JPY: { sym:'¥', rate:149.5 },
};
```

---

## 🔄 Re-seed the database

The seed is **idempotent** — it skips if data already exists.
To force a full re-seed:
```bash
# On local:
rm neon-build.db
node seed.js

# On Railway/Render:
# Delete the volume → redeploy → it auto-seeds fresh
```

---

## 📦 Requirements
- Node.js 18+  (https://nodejs.org)
- npm 8+
- ~80MB disk for node_modules
- ~5MB disk for SQLite database
