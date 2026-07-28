// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://jeyrun.com',
  integrations: [
    sitemap({ filter: (page) => !page.includes('/app') }),
  ],
  trailingSlash: 'never',
});
