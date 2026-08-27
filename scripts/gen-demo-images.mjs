/**
 * Generates placeholder imagery for the demo profile: a profile picture and a
 * set of tiles for the dashboard's "Memories" grid.
 *
 *   npm run dev:capture     # app must be running with a CDP port
 *   npm run gen:images
 *
 * These are abstract mesh gradients, not photographs. They exist so the grid
 * and the header read as designed rather than broken while the screenshot set
 * is being built. Real photographs are markedly better for a journaling app and
 * are a one-flag swap:
 *
 *   npm run seed:demo -- --reset --photos ./my-photos --avatar ./me.jpg
 *
 * Rendering goes through the running renderer's canvas over CDP rather than an
 * image library, so this needs no new dependency and no native build.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { attach } from "./lib/cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(here, "demo-data", "generated");
const PHOTOS_DIR = path.join(OUT_DIR, "memories");

/** Warm/cool pairs that sit comfortably against the app's dark surfaces. */
const PALETTES = [
  ["#2d3f52", "#5c7a94", "#c9a227"],
  ["#3a2f4a", "#7a5c8e", "#d4a5a5"],
  ["#1f3b34", "#4e7a68", "#c2d4a7"],
  ["#4a3328", "#96634a", "#e0b088"],
  ["#22303f", "#48697f", "#a8c4d4"],
  ["#3d2b3a", "#6d4a63", "#c99db4"],
  ["#2a3a2c", "#587050", "#b6c98c"],
  ["#402d2d", "#8a5a52", "#dba98c"],
  ["#26344a", "#54688e", "#b0b8dc"],
  ["#33302a", "#6e6552", "#cfc39a"],
  ["#1e3340", "#3f6a72", "#9fd0c4"],
  ["#3a2a34", "#75505f", "#d0a0a0"],
];

/**
 * Draws a mesh gradient with soft grain. Runs inside the renderer, so it has a
 * real 2D context; the canvas is never attached to the DOM, so nothing the user
 * sees is disturbed.
 */
const drawScript = (w, h, palette, seed) => `(() => {
  const c = document.createElement('canvas');
  c.width = ${w}; c.height = ${h};
  const g = c.getContext('2d');
  const palette = ${JSON.stringify(palette)};

  // Deterministic PRNG so re-running produces identical images and the
  // screenshot set stays stable across takes.
  let s = ${seed};
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  g.fillStyle = palette[0];
  g.fillRect(0, 0, c.width, c.height);

  // Overlapping radial gradients read as a mesh gradient rather than a flat
  // wash. Composited normally at partial alpha, NOT with 'lighter': additive
  // blending stacks toward pure white wherever the blobs overlap, which turns
  // every tile into an overexposed light leak instead of an image.
  for (let i = 0; i < 5; i++) {
    const x = (0.12 + rand() * 0.76) * c.width;
    const y = (0.12 + rand() * 0.76) * c.height;
    const r = (0.3 + rand() * 0.4) * Math.max(c.width, c.height);
    const colour = palette[1 + Math.floor(rand() * (palette.length - 1))];
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, colour + 'b0');
    grad.addColorStop(0.5, colour + '50');
    grad.addColorStop(1, colour + '00');
    g.globalAlpha = 0.62;
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
  }
  g.globalAlpha = 1;

  // Darken the midtones back down so the tiles sit against the page instead of
  // glowing off it.
  g.fillStyle = 'rgba(12,10,14,0.3)';
  g.fillRect(0, 0, c.width, c.height);

  // Vignette, so tiles have depth against a dark page.
  g.globalCompositeOperation = 'source-over';
  const vig = g.createRadialGradient(
    c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.25,
    c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.78
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vig;
  g.fillRect(0, 0, c.width, c.height);

  // Fine grain breaks up the banding that flat gradients show on dark screens.
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 13;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  // JPEG, not PNG. These are photographic-style gradients, so PNG buys nothing
  // and costs ~10x the bytes - and media:getImage hands them to the renderer as
  // base64 data URLs, where the size difference decides whether the Memories
  // grid paints before the screenshot or not.
  return c.toDataURL('image/jpeg', 0.82);
})()`;

/** Circular avatar with the persona's initial. */
const avatarScript = (initial, palette) => `(() => {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const palette = ${JSON.stringify(palette)};

  g.save();
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.clip();

  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, palette[1]);
  grad.addColorStop(1, palette[0]);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  const glow = g.createRadialGradient(size * 0.32, size * 0.28, 0, size * 0.32, size * 0.28, size * 0.7);
  glow.addColorStop(0, palette[2] + '66');
  glow.addColorStop(1, palette[2] + '00');
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);

  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.font = '600 ' + Math.round(size * 0.42) + 'px Inter, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(${JSON.stringify(initial)}, size / 2, size / 2 + size * 0.02);
  g.restore();

  return c.toDataURL('image/png');
})()`;

const writeDataUrl = (dataUrl, dest) => {
  const base64 = dataUrl.split(",")[1];
  fs.writeFileSync(dest, Buffer.from(base64, "base64"));
  return fs.statSync(dest).size;
};

async function run() {
  const initial = (process.argv[2] ?? "M").slice(0, 1).toUpperCase();

  fs.mkdirSync(PHOTOS_DIR, { recursive: true });

  const cdp = await attach(process.env.MS_REMOTE_DEBUG ?? "9222");
  console.log(`Attached to ${cdp.title}`);

  const avatarPath = path.join(OUT_DIR, "avatar.png");
  const avatarUrl = await cdp.evaluate(avatarScript(initial, PALETTES[0]));
  console.log(
    `  avatar.png            ${(writeDataUrl(avatarUrl, avatarPath) / 1024).toFixed(0)} KB`
  );

  // Mixed aspect ratios: the masonry assigns random heights, so same-shaped
  // tiles get letterboxed and the grid looks mechanical.
  const sizes = [
    [1200, 900], [900, 1200], [1200, 1200], [1400, 900],
    [900, 1400], [1200, 800], [1000, 1300], [1300, 1000],
    [1100, 1100], [1200, 1500], [1500, 1000], [1000, 1000],
  ];

  for (let i = 0; i < sizes.length; i++) {
    const [w, h] = sizes[i];
    const dest = path.join(PHOTOS_DIR, `memory-${String(i + 1).padStart(2, "0")}.jpg`);
    const url = await cdp.evaluate(
      drawScript(w, h, PALETTES[i % PALETTES.length], 1000 + i * 7919)
    );
    console.log(
      `  ${path.basename(dest).padEnd(22)}${(writeDataUrl(url, dest) / 1024).toFixed(0)} KB  ${w}x${h}`
    );
  }

  cdp.close();

  console.log(`\nGenerated into ${OUT_DIR}`);
  console.log("Attach them with:");
  console.log(
    `  npm run seed:demo -- --reset --photos "${PHOTOS_DIR}" --avatar "${avatarPath}"`
  );
}

run().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
