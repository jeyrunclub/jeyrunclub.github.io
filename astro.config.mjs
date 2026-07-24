// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://jeyrunclub.github.io',
  integrations: [sitemap()],
  trailingSlash: 'never',
});
