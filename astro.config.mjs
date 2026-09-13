// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://jeyrun.com',
  integrations: [
    sitemap({ filter: (page) => !page.includes('/app') }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  // The nav links opt in with data-astro-prefetch. They ask for "viewport":
  // the bar holding them is on screen the whole time, so all four destinations
  // are fetched while the member is reading the page they are already on, and
  // a tap then has nothing left to wait for. "tap" started the fetch on press,
  // which is better than nothing and still a wait. Four documents of about 7KB
  // is a cheap thing to spend to make the app feel instant.
  prefetch: { defaultStrategy: 'tap' },

  // Astro's HTML minifier collapses the newline between an inline element and
  // the word after it to nothing, so "<strong>ITRA</strong>\n با" shipped as
  // "ITRAبا". Costs ~3KB gzipped across the whole site to keep the spaces.
  compressHTML: false,
  trailingSlash: 'never',
});
