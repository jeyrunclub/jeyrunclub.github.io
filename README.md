# Jeyrun — Salar Piri landing page

Persian (RTL) landing page for **Salar Piri**, coach of the **Jeyrun** running team in Tehran. Static site, deploys free on GitHub Pages.

## Deploy (GitHub Pages, ~3 minutes)

1. Create a GitHub repo — for the shortest URL, name it `<your-username>.github.io` (then the site lives at `https://<your-username>.github.io/`). Any repo name works; then it'll live at `https://<your-username>.github.io/<repo>/`.
2. Push this folder:
   ```bash
   cd /home/ptc/code/jeyrun
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin git@github.com:<your-username>/<repo>.git
   git push -u origin main
   ```
3. In the repo on github.com: **Settings → Pages → Source → Deploy from a branch → `main` / `(root)` → Save.**
4. Wait ~30s, then open the URL Pages gives you.

## What to fill in

Everything below is a placeholder in the code — search the file, replace, commit.

| What                     | Where                          | Notes                                                                                  |
| ------------------------ | ------------------------------ | -------------------------------------------------------------------------------------- |
| WhatsApp number          | `index.html` — `98XXXXXXXXXX`  | Format: country code + number, no `+` or spaces. Example: `989121234567`.              |
| Strava profile URL       | `index.html`                   | Two links: hero section + footer.                                                      |
| Instagram handles        | `index.html`                   | `salar.piri` and `jeyrun_club` are placeholders — replace with real handles.           |
| Strava stats             | `data/stats.json`              | Edit values, commit. Site updates automatically.                                       |
| Race results / medals    | `data/races.json`              | Add one entry per race. `medal` = `gold` / `silver` / `bronze` / `finish`.             |
| Hero photo of Salar      | `images/salar-hero.jpg`        | Portrait-oriented (~4:5 ratio) works best. Falls back gracefully if missing.           |
| Gallery photos           | `images/gallery/1.jpg`, `2.jpg`, … | Add photos, then edit `index.html` gallery-grid to reference them.                 |
| OG share image           | `images/og-cover.jpg`          | 1200x630px — what appears when the link is shared on WhatsApp/Telegram/Twitter.        |
| Logo                     | `images/logo.svg`              | Placeholder SVG in project colors — swap for the real Jeyrun logo when available.      |

## Adding gallery photos

Drop images into `images/gallery/`, then in `index.html` replace the `.gal-item.placeholder` blocks with:

```html
<div class="gal-item"><img src="images/gallery/1.jpg" alt="توضیح عکس" loading="lazy" /></div>
```

## Strava — how to get real stats in

Static sites can't call the Strava API from the browser (Strava needs OAuth). Two easy options:

**Manual (30 seconds when stats change):** edit `data/stats.json`, commit, done.

**Automatic (one-time 15-min setup):** a scheduled GitHub Action refreshes `data/stats.json` daily using Salar's Strava refresh token. Ping me when you're ready and I'll set this up — you'll need to:
1. Create a Strava API app at https://www.strava.com/settings/api
2. Get the refresh token via a one-time authorize URL
3. Store `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN` as repo secrets

## Custom domain (optional)

If you buy a domain (e.g. `salarpiri.ir`):
1. Add a file called `CNAME` (no extension) at repo root, containing just the domain.
2. In your DNS: create an `A` record pointing to GitHub Pages IPs (185.199.108.153, .109.153, .110.153, .111.153) and a `CNAME` record `www` → `<username>.github.io`.
3. In repo Settings → Pages, enter the domain and enable HTTPS.

## Local preview

Any static server works:
```bash
cd /home/ptc/code/jeyrun
python3 -m http.server 8000
# open http://localhost:8000
```

## SEO

- `<html lang="fa" dir="rtl">` and Persian meta description are set.
- JSON-LD `Person` schema in `<head>` — Google uses it for the knowledge panel.
- `sitemap.xml` + `robots.txt` included; update `sitemap.xml` domain if you use a custom one.
- After deploying, submit the site to [Google Search Console](https://search.google.com/search-console) to get indexed faster.
