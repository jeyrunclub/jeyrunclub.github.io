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
  // Astro's HTML minifier collapses the newline between an inline element and
  // the word after it to nothing, so "<strong>ITRA</strong>\n با" shipped as
  // "ITRAبا". Costs ~3KB gzipped across the whole site to keep the spaces.
  compressHTML: false,
  trailingSlash: 'never',
});
