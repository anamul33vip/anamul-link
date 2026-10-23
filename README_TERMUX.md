# AS ANAMUL URL Shortener - Termux edition v5 (8 step slots, phone upload, RGB, Render-ready)

Termux changes vs the original:
- `better-sqlite3` replaced by Node's built-in `node:sqlite` (Node 20+; Termux Node 26 works). No native build, no distutils error.
- `connect-sqlite3` session store removed; sessions use express-session's memory store.
  Consequence: you must sign in again after every restart, but users/links/clicks stay in `data/app.db`.

## What is new in v5 - 8 separate step slots + phone upload
Admin panel now has 8 separate step slots (Step 1 ... Step 8):
- Each slot holds ONE ad. Adding a new ad for a step replaces the old ad in that slot.
- If a step has no specific ad, it falls back to a general (Any step) ad, rotating step by step.
- Seeded own ads on first run (AS ANAMUL Telegram + YouTube) are general ads, NOT paying network ads.

Phone upload (Admin only):
- In Admin > Add advertisement, choose a file from your phone (image or video, max 50 MB) OR paste an image/video/YouTube URL.
- If you choose a file, it is uploaded first to the server and its URL (`/uploads/...`) becomes the ad media.
- Pic: .jpg/.png/.gif/.webp -> big image. Video file: .mp4/.webm/.mov -> video player. YouTube link: watch/shorts -> embedded player.
- "Learn more URL" is separate and opens when the button is pressed.
- WARNING for Render free: uploaded files live on the server's disk, which is ephemeral on free. An upload can disappear on restart/redeploy. For permanent ads on Render, use a URL ad (image/video hosted elsewhere) instead of an upload.

## RGB premium look
Animated RGB gradient on brand, buttons, titles and step bar, plus glowing cards on homepage and the 8-step page. 8 steps, 20 seconds per step, click counted only once (step 1).

## Why do short links say localhost?
A short link is BASE_URL + code, and BASE_URL comes from `.env` (currently `http://localhost:3000` on Termux).
"localhost" is the ADDRESS, not the site name - the header already says AS ANAMUL.
Just typing another name into BASE_URL does NOT make it public. To get `https://asanamul-link.onrender.com/...` links,
host on Render, set BASE_URL in Render to that Render URL, and restart. Changing BASE_URL on Termux alone to a Render name will BREAK links.

## About ads - read this honestly
No code can pull paying ads from the internet automatically. Paying ads need an ad-network account, approval, and their script.
Many networks ban ads on redirect pages. Check the network's written policy first.

## Termux run (new install)
```
unzip AS_ANAMUL_URL_Shortener_Termux_v5.zip -d ~/urlshort-termux-v5
cp ~/urlshort-termux-v4/.env ~/urlshort-termux-v5/.env
cd ~/urlshort-termux-v5
npm install
npm start
```
Open http://localhost:3000
To keep old links too, stop the old server first (Ctrl+C, NOT Ctrl+Z), then before npm start:
```
cp -r ~/urlshort-termux-v4/data ~/urlshort-termux-v5/data
```

## Render free (public name for everyone)
Render free: no card, public URL like https://asanamul-link.onrender.com, free HTTPS and custom domains.
Limits: sleeps after 15 minutes idle (about 1 minute to wake), and free has no persistent disk, so SQLite data and uploads can reset on restart.
Steps (needs a GitHub repo + a Render account):
1. Put these files in a GitHub repo (do NOT push `.env`, `data/`, `node_modules/`, or `public/uploads/` - they are already in `.gitignore` except uploads, which you must not push).
2. In Render, create a Web Service from that repo, plan = free, build = `npm install`, start = `npm start`. `render.yaml` is included.
3. In Render env vars, set SESSION_SECRET (long random), ADMIN_EMAIL, ADMIN_PASSWORD (12+ chars), and BASE_URL to your real Render URL, then restart.
4. If `asanamul-link` is taken, try `asanamul-links`, `asanamul-short`, or `asanamul-url`.
