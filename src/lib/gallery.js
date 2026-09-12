// The gallery, joined to its actual image files.
//
// The photos live in src/assets/ rather than public/ so that astro:assets can
// process them: from public/ they were shipped as the original 200–700KB JPEGs
// with no responsive sizes and no modern format. Importing them gives each one
// as ImageMetadata — width, height and all — which is also what lets <Image>
// reserve the right space and stop the grid jumping as photos load.

import gallery from '../data/gallery.json';

// Eager, because the page needs every entry at build time.
const files = import.meta.glob('../assets/gallery/*.{jpg,jpeg,png,webp,JPG,JPEG}', {
  eager: true,
  import: 'default',
});

const byName = Object.fromEntries(
  Object.entries(files).map(([path, mod]) => [path.split('/').pop(), mod]),
);

// Let the photograph choose its own tile. A Damavand ascent wants to be tall,
// a start line wants to be wide — cropping everything to one rectangle threw
// that away and made 72 photos look like 72 of the same photo.
function shapeOf(image) {
  const r = image.width / image.height;
  if (r >= 1.25) return 'wide';
  if (r <= 0.8) return 'tall';
  return 'square';
}

export const photos = gallery.photos.map((p, i) => {
  const image = byName[p.file];
  if (!image) {
    // Loud at build time rather than a silent hole in the grid.
    console.warn(`[gallery] no file in src/assets/gallery for "${p.file}"`);
  }
  return { ...p, id: i + 1, image, shape: image ? shapeOf(image) : 'square' };
}).filter((p) => p.image);

// These are grainy outdoor photographs — mountains, foliage, gravel — and they
// barely respond to quality: the same frame is 543KB at q68 and 597KB at q76.
// Width is the lever that actually moves the number, so each set is cut to what
// the layout really displays rather than to the largest the source allows.

// Grid thumbnails occupy ~290 CSS px in a 4/3 box. 360 covers 1x, 720 covers 2x.
export const THUMB_WIDTHS = [360, 720];
export const THUMB_QUALITY = 62;

// A photo page shows the image at most 860 CSS px wide.
export const FULL_WIDTHS = [640, 1100];
export const FULL_QUALITY = 72;

// Social cards are rendered small by every network; 900px is ample.
export const CARD_WIDTH = 900;
export const CARD_QUALITY = 68;

export const GRID_SIZES = '(max-width: 640px) 92vw, (max-width: 1100px) 45vw, 290px';
