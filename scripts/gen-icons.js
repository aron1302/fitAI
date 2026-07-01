// Generates the PWA / mobile icon set from the FitAI brand mark (a rounded
// gradient tile with an "F"), with no native image dependencies — it rasterises
// directly with the pure-JS `pngjs` encoder, 4x supersampled for smooth edges.
//
// Outputs to client/public/ (copied verbatim into dist/ by Vite at build time):
//   icons/icon-192.png        maskable:no   PWA manifest (any)
//   icons/icon-512.png        maskable:no   PWA manifest (any)
//   icons/maskable-512.png    maskable:yes  PWA manifest (maskable, full-bleed)
//   apple-touch-icon.png      180x180       iOS home-screen (opaque, full-bleed)
//
// The crisp vector source (client/public/icon.svg) is hand-authored alongside
// this and used as the favicon. Re-run with: npm run gen:icons
//
// Brand colours mirror the in-app logo (index.css): a 135deg green->cyan
// gradient with a dark-green letter.

import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "client", "public");
const ICONS = path.join(PUBLIC, "icons");

const GREEN = [74, 222, 128]; // --accent  #4ade80
const CYAN = [34, 211, 238]; // --accent-2 #22d3ee
const DARK = [6, 33, 15]; // letter colour #06210f
const SS = 4; // supersampling factor

const lerp = (a, b, t) => a + (b - a) * t;

// Is (x,y) inside an "F" whose bounding box is (fx,fy,fw,fh)?
function inF(x, y, fx, fy, fw, fh) {
  const stem = x >= fx && x <= fx + fw * 0.24 && y >= fy && y <= fy + fh;
  const top = x >= fx && x <= fx + fw && y >= fy && y <= fy + fh * 0.22;
  const mid =
    x >= fx && x <= fx + fw * 0.72 && y >= fy + fh * 0.4 && y <= fy + fh * 0.6;
  return stem || top || mid;
}

// Render one icon at `size` px. `rounded` clips to a rounded square with
// transparent corners; otherwise the tile is full-bleed and opaque (for
// maskable + iOS, which apply their own masking). `content` is the fraction of
// the tile the letter occupies.
function render(size, { rounded, content }) {
  const S = size * SS;
  const R = S * 0.22; // corner radius
  const fw = S * content * 0.8;
  const fh = S * content;
  const fx = (S - fw) / 2;
  const fy = (S - fh) / 2;
  const big = Buffer.alloc(S * S * 4);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // Rounded-corner mask (full-res; supersampling smooths the edge).
      let inside = true;
      if (rounded) {
        const cx = x < R ? R : x > S - R ? S - R : x;
        const cy = y < R ? R : y > S - R ? S - R : y;
        inside = (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
      }
      if (!inside) {
        big[i + 3] = 0; // transparent outside the rounded tile
        continue;
      }
      if (inF(x, y, fx, fy, fw, fh)) {
        big[i] = DARK[0];
        big[i + 1] = DARK[1];
        big[i + 2] = DARK[2];
      } else {
        const t = (x + y) / (2 * (S - 1)); // 135deg diagonal
        big[i] = lerp(GREEN[0], CYAN[0], t);
        big[i + 1] = lerp(GREEN[1], CYAN[1], t);
        big[i + 2] = lerp(GREEN[2], CYAN[2], t);
      }
      big[i + 3] = 255;
    }
  }

  // Box-downsample SS*SS -> 1 for anti-aliasing.
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const j = ((y * SS + dy) * S + (x * SS + dx)) * 4;
          const al = big[j + 3];
          r += big[j] * al;
          g += big[j + 1] * al;
          b += big[j + 2] * al;
          a += al;
        }
      }
      const o = (y * size + x) * 4;
      // Premultiplied average so transparent edge pixels don't darken.
      png.data[o] = a ? r / a : 0;
      png.data[o + 1] = a ? g / a : 0;
      png.data[o + 2] = a ? b / a : 0;
      png.data[o + 3] = a / (SS * SS);
    }
  }
  return PNG.sync.write(png);
}

fs.mkdirSync(ICONS, { recursive: true });
const write = (p, buf) => {
  fs.writeFileSync(p, buf);
  console.log(`  wrote ${path.relative(path.join(__dirname, ".."), p)} (${buf.length} bytes)`);
};

write(path.join(ICONS, "icon-192.png"), render(192, { rounded: true, content: 0.62 }));
write(path.join(ICONS, "icon-512.png"), render(512, { rounded: true, content: 0.62 }));
write(path.join(ICONS, "maskable-512.png"), render(512, { rounded: false, content: 0.5 }));
write(path.join(PUBLIC, "apple-touch-icon.png"), render(180, { rounded: false, content: 0.6 }));
console.log("Icons generated.");
