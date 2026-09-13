// Shrink a photo before it is uploaded.
//
// A phone camera produces 4000px, 8–10MB files. The feed shows them about
// 300px wide, and members read it on mobile data in Iran — one post was
// costing 9.6MB to look at. The avatar cropper already redraws through a
// canvas for exactly this reason; this is the same trick without the crop.

const MAX_EDGE = 1600;   // comfortably past any phone screen at 2x
const QUALITY  = 0.82;

export async function downscaleImage(file, maxEdge = MAX_EDGE, quality = QUALITY) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = rej;
      el.src = url;
    });

    const long = Math.max(img.naturalWidth, img.naturalHeight);
    // Already small enough, and not a PNG worth re-encoding.
    if (long <= maxEdge && file.type === 'image/jpeg') return file;

    const scale = Math.min(1, maxEdge / long);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    // If the encode somehow came out bigger, keep the original.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  } catch {
    return file;   // never block a post because the resize failed
  } finally {
    URL.revokeObjectURL(url);
  }
}
