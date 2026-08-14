// Genera los íconos de la PWA sin dependencias externas.
// Node trae zlib, así que el PNG lo escribimos a mano: IHDR + IDAT + IEND.
// Se dibuja con supersampling 4x para que los bordes queden suaves.
//
//   node tools/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'icons');

// ---------- paleta (la misma que css/app.css) ----------
const BG = [0x0f, 0x17, 0x14];
const SUN = [0xe8, 0xb5, 0x63];
const HORIZON = [0x3b, 0x52, 0x47];

// ---------- PNG mínimo ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  // 10,11,12 = compresión / filtro / entrelazado, todos 0

  // Cada scanline lleva un byte de filtro al principio (0 = sin filtro).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const dst = y * (size * 4 + 1);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- dibujo ----------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// Distancia a un segmento horizontal de extremos redondeados.
function capsule(x, y, x0, x1, cy, r) {
  const px = Math.max(x0, Math.min(x1, x));
  return Math.hypot(x - px, y - cy) - r;
}

// Devuelve [r,g,b,a] para un punto en coordenadas normalizadas 0..1.
// `inset` encoge el dibujo hacia el centro (zona segura de los íconos maskable).
// `round` aplica esquinas redondeadas al fondo (íconos comunes).
function shade(x, y, { inset, round }) {
  // fondo
  let rgb = BG;
  let alpha = 1;

  if (round > 0) {
    // esquinas redondeadas vía SDF de rectángulo
    const dx = Math.abs(x - 0.5) - (0.5 - round);
    const dy = Math.abs(y - 0.5) - (0.5 - round);
    const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    const d = outside + Math.min(Math.max(dx, dy), 0) - round;
    if (d > 0) alpha = 0;
  }

  // coordenadas del dibujo, encogidas hacia el centro
  const u = (x - 0.5) / inset + 0.5;
  const v = (y - 0.5) / inset + 0.5;

  // halo tenue del sol
  const dSun = Math.hypot(u - 0.5, v - 0.42);
  const glow = clamp01(1 - (dSun - 0.18) / 0.22);
  if (glow > 0) rgb = mix(rgb, SUN, glow * glow * 0.16);

  // horizonte
  const dLine = capsule(u, v, 0.2, 0.8, 0.66, 0.022);
  if (dLine < 0) rgb = HORIZON;

  // sol
  if (dSun < 0.18) rgb = SUN;

  return [rgb[0], rgb[1], rgb[2], alpha];
}

function render(size, opts) {
  const SS = 4; // supersampling
  const buf = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) / size;
          const py = (y + (sy + 0.5) / SS) / size;
          const c = shade(px, py, opts);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      // premultiplicado -> recto, para no oscurecer el borde
      buf[i] = a > 0 ? Math.round(r / a) : 0;
      buf[i + 1] = a > 0 ? Math.round(g / a) : 0;
      buf[i + 2] = a > 0 ? Math.round(b / a) : 0;
      buf[i + 3] = Math.round((a / n) * 255);
    }
  }
  return buf;
}

mkdirSync(OUT, { recursive: true });

const jobs = [
  // Íconos comunes: esquinas redondeadas, dibujo casi a sangre.
  { file: 'icon-192.png', size: 192, opts: { inset: 0.92, round: 0.22 } },
  { file: 'icon-512.png', size: 512, opts: { inset: 0.92, round: 0.22 } },
  // Maskable: fondo cuadrado a sangre y dibujo dentro de la zona segura,
  // porque Android le aplica su propia máscara (círculo, squircle, etc.).
  { file: 'icon-maskable-512.png', size: 512, opts: { inset: 0.62, round: 0 } },
  // Favicon para la pestaña del navegador.
  { file: 'favicon-64.png', size: 64, opts: { inset: 0.92, round: 0.22 } },
];

for (const { file, size, opts } of jobs) {
  writeFileSync(join(OUT, file), encodePng(size, render(size, opts)));
  console.log(`  ✓ icons/${file}  (${size}×${size})`);
}
