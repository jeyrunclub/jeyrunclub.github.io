// The data the photo pages hand to the browser so that stepping from one frame
// to the next changes the photograph and nothing else.
//
// The first attempt used Astro's client router. It did avoid a full reload,
// but it swaps the whole document — header, nav, footer and all — so every
// click flashed the entire page and read exactly like a refresh. Swapping only
// the <img>, the caption and the two links is both smaller and smoother, and
// it does not depend on the browser supporting view transitions at all.
//
// Built once per language per build: this module is a singleton, so the 72
// getImage() calls happen on the first photo page rendered and every other
// page reuses the result.

import { getImage } from 'astro:assets';
import { ordered, FULL_WIDTHS, FULL_QUALITY } from './gallery.js';

const cache = {};

export async function viewerData(lang = 'fa') {
  if (cache[lang]) return cache[lang];
  cache[lang] = await Promise.all(
    ordered.map(async (p) => {
      const [small, large] = await Promise.all(
        FULL_WIDTHS.map((w) =>
          getImage({ src: p.image, width: w, format: 'webp', quality: FULL_QUALITY }),
        ),
      );
      const title = (lang === 'en' ? p.title_en || p.title : p.title) || '';
      const story = (lang === 'en' ? p.story_en || p.story : p.story) || '';
      // Short keys: this array ships inline on every photo page.
      return {
        i: p.id,
        t: title,
        s: story,
        u: large.src,
        r: `${small.src} ${FULL_WIDTHS[0]}w, ${large.src} ${FULL_WIDTHS[1]}w`,
      };
    }),
  );
  return cache[lang];
}
