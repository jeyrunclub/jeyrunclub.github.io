# Jeyrun — Salar Piri / باشگاه دو و کوهستان جیران

Persian (RTL) site for **جیران Running Club**, built with [Astro](https://astro.build) and deployed automatically to GitHub Pages.

**Live:** https://jeyrun.com

## Pages

| URL          | What                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| `/`          | Landing — hero, about, services preview, testimonials, media, gallery preview, WhatsApp CTA |
| `/coach`     | Salar Piri's page — bio, stats, race results                                 |
| `/services`  | 5 detailed service cards (private / group / online / mountain / race prep)   |
| `/races`     | Upcoming team events (Istanbul, Mahan, Damavand)                             |
| `/calendar`  | Weekly training calendar — one edit updates the whole schedule               |
| `/gallery`   | Full 44-photo gallery with pagination                                        |
| `/blog`      | 10 articles on training, marathon, ultra, nutrition, gear, tehran routes     |
| `/blog/<slug>` | Individual article pages, generated from Markdown                          |

## Editing content

- **Blog posts:** `src/content/blog/*.md` — Markdown with frontmatter (`title`, `description`, `tag`, `date`, `isoDate`, `readTime`).
- **Weekly calendar:** `src/pages/calendar.astro` — edit the `week` array.
- **Race list:** `src/pages/races.astro` — edit `upcoming` array.
- **Services:** `src/pages/services.astro` — edit `services` array.
- **Photo gallery:** `src/data/gallery.json` — add/edit `{file, title, story}` entries.
- **Salar's stats:** `src/data/stats.json` — record cards.
- **Race results (medals):** `src/data/races.json`.
- **Testimonials:** `src/pages/index.astro` — search for `testimonial-card`.
- **Nav links & branding:** `src/components/Header.astro`, `Footer.astro`.
- **Global styles / theme colors:** `src/styles/global.css` — `:root` block at the top.

## Local dev

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # produces dist/
npm run preview    # serve dist/ locally
```

## Deploy

Deploys automatically on push to `main` via `.github/workflows/deploy.yml`.

**One-time setup after first push:** In the GitHub repo → **Settings → Pages → Build and deployment → Source → "GitHub Actions"**. This tells Pages to serve the workflow's artifact instead of the branch root. After that, every push to `main` deploys within ~1 minute.

## Adding a blog post

Create `src/content/blog/my-slug.md`:

```markdown
---
title: Persian title
description: Short description for cards + SEO.
tag: تگ‌فارسی
date: ۱ مرداد ۱۴۰۵
isoDate: 2026-07-23
readTime: ۶ دقیقه
---

Markdown body here. Persian works natively.
```

Commit, push, done. Post appears on `/blog` and gets its own `/blog/my-slug` page.

## Adding photos

1. Drop the image into `public/images/gallery/`.
2. Add an entry to `src/data/gallery.json`:
   ```json
   { "file": "my-photo.jpg", "title": "عنوان", "story": "داستان کوتاه" }
   ```
3. Commit, push.

## Strava auto-refresh (planned, not wired yet)

Currently `src/data/stats.json` is hand-edited. To automate: add a GitHub Action that calls the Strava API with a refresh token, updates the JSON, commits. Ping to set this up.
