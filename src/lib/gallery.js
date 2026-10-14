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

// The homepage strip, chosen by hand: group shots with the whole club in them.
// The gallery's own order is roughly chronological and its first eight are
// mostly landscape and single-runner frames, which made the homepage read as a
// scenery page rather than a club page.
const HOME_FILES = [
  'new-img_6699.jpg',   // the road, whole squad
  'group-c.jpg',        // under the plane trees
  'team-group.jpg',     // the group class
  'new-img_8227.jpg',   // the brick gate, arms up
  'new-img_9688.jpg',   // under the willows
  'new-img_8052.jpg',   // autumn, before Istanbul
  'new-img_4122.jpg',   // the big willow
  'new-img_3294.jpg',   // the car park, everyone gathering
];

export const featured = HOME_FILES
  .map((f) => photos.find((p) => p.file === f))
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Display order: the club before the scenery.
//
// gallery.json is roughly chronological, which opened the gallery on mountains
// and single runners. What persuades someone to join is seeing a crowd of
// people who turn up together, so the frames with the group in them come
// first, strongest first, and everything else keeps its existing order behind
// them.
//
// This changes only what the gallery renders and the order you step through on
// a photo page. It deliberately does NOT reorder `photos`: ids come from that
// array's position and they are in the URLs, so shuffling it would break every
// /photo/N link that already exists.
const GROUP_FILES = [
  'new-img_7752.jpg',   // the largest team frame there is
  'team-group.jpg',     // the group class, everybody
  'new-img_6699.jpg',   // the road, whole squad
  'group-b.jpg',        // camp day, Damavand behind
  'group-c.jpg',        // under the plane trees
  'new-img_8227.jpg',   // the brick gate, arms up
  'new-img_9688.jpg',   // under the willows, autumn
  'new-img_4122.jpg',   // the big willow
  'new-img_3918.jpg',   // Damavand over the team
  'new-img_2334.jpg',   // the park, a sunny morning
  'new-img_8760.jpg',   // the red brick wall
  'new-img_8052.jpg',   // autumn, before Istanbul
  'team-trees.jpg',     // 6 AM, before the start
  'new-img_3294.jpg',   // the car park, gathering
  'new-img_5841.jpg',   // Chitgar forest
  'new-img_6986.jpg',   // the summit, arms round each other
  'moment-a.jpg',       // warm-up lunges, the whole line
  'new-img_3232.jpg',   // under the planes
  'new-img_5813.jpg',   // winter training on snow
  'new-img_0400.jpg',   // cold morning, wrapped up
  'new-img_2988.jpg',   // watermelon after the mountain
  'new-img_6975.jpg',   // six in full kit at altitude
  'new-img_2412.jpg',   // the cone session
  'new-img_9223.jpg',   // on the stadium grass
];

const groupFirst = GROUP_FILES
  .map((f) => photos.find((p) => p.file === f))
  .filter(Boolean);

const groupSet = new Set(groupFirst.map((p) => p.file));

/** Every photo, the group shots first. What the gallery and prev/next use. */
export const ordered = [...groupFirst, ...photos.filter((p) => !groupSet.has(p.file))];

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

/**
 * One photograph by its file name, for pages that want a specific frame rather
 * than the whole set — a service card, a section band. Returns the gallery
 * entry (image metadata, id, title, story), so the caller can also link it
 * back to its own photo page.
 *
 * Loud at build time on a typo, for the same reason the gallery itself is:
 * a silent undefined here is an <Image> that throws halfway down a page.
 */
export function byFile(file) {
  const p = photos.find((x) => x.file === file);
  if (!p) throw new Error(`[gallery] byFile: no photo named "${file}"`);
  return p;
}

// Service and section cards show a photo about half a card wide — 520 CSS px at
// the widest, less on a phone where the card is one column.
export const CARD_WIDTHS = [520, 1040];
export const CARD_SIZES = '(max-width: 900px) 92vw, 420px';

// A full-bleed band is as wide as the viewport but only ~320px tall, so it is
// cropped hard; it never needs the full source width.
export const BAND_WIDTHS = [900, 1500, 2000];
export const BAND_QUALITY = 66;
