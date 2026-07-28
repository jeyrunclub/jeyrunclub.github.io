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
  trailingSlash: 'never',
});
