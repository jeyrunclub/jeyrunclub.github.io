// Jeyrun / Salar Piri — small progressive-enhancement script.
// Loads stats.json and races.json to populate the Strava & races sections.

const toFa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

// Mobile nav toggle
const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.site-nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  nav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    })
  );
}

// Populate Strava stats
fetch('data/stats.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => {
    if (!data || !Array.isArray(data.cards)) return;
    const grid = document.getElementById('stat-grid');
    if (!grid) return;
    grid.innerHTML = data.cards
      .map(
        (c) => `
        <div class="stat-card">
          <span class="stat-value">${c.value}</span>
          <span class="stat-label">${c.label}</span>
        </div>`
      )
      .join('');
  })
  .catch(() => {});

// Populate gallery
fetch('data/gallery.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => {
    if (!data || !Array.isArray(data.photos)) return;
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    grid.innerHTML = data.photos
      .map(
        (p) => `
        <figure class="gal-item">
          <img src="images/gallery/${p.file}" alt="${p.title || ''}" loading="lazy" />
          <figcaption>
            ${p.title ? `<strong>${p.title}</strong>` : ''}
            ${p.story ? `<span>${p.story}</span>` : ''}
          </figcaption>
        </figure>`
      )
      .join('');
  })
  .catch(() => {});

// Populate races list
fetch('data/races.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => {
    if (!data || !Array.isArray(data.races)) return;
    const list = document.getElementById('race-list');
    if (!list) return;
    list.innerHTML = data.races
      .map((r) => {
        const medalClass =
          r.medal === 'gold'
            ? ''
            : r.medal === 'silver'
            ? 'silver'
            : r.medal === 'bronze'
            ? 'bronze'
            : 'finish';
        const icon =
          r.medal === 'gold'
            ? '🥇'
            : r.medal === 'silver'
            ? '🥈'
            : r.medal === 'bronze'
            ? '🥉'
            : '✓';
        return `
          <div class="race-card">
            <div class="race-medal ${medalClass}">${icon}</div>
            <div class="race-info">
              <h3>${r.name}</h3>
              <p>${r.year || ''}${r.location ? ' · ' + r.location : ''}</p>
              ${r.time ? `<p class="race-time">${r.time}</p>` : ''}
              ${r.note ? `<p>${r.note}</p>` : ''}
            </div>
          </div>`;
      })
      .join('');
  })
  .catch(() => {});
