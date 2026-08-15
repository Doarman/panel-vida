// Genera los íconos de la PWA sin dependencias externas.
// Node trae zlib, así que el PNG lo escribimos a mano: IHDR + IDAT + IEND.
// Se dibuja con supersampling 4x para que los bordes queden suaves.
//
//   node tools/make-icons.mjs
//
// Ícono "Amanecer": disco de sol saliendo detrás de dos filas de panel. Solo
// círculo y pastilla, para que sobreviva a 48 px y al recorte de cualquier
// launcher. Las medidas van en fracciones del lado, así que escala solo.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'icons');

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

// ---------- color ----------

const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];

const mezclar = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Interpola una lista de paradas [pos, color]. */
function gradiente(paradas, t) {
  t = clamp01(t);
  for (let i = 0; i < paradas.length - 1; i++) {
    const [p0, c0] = paradas[i];
    const [p1, c1] = paradas[i + 1];
    if (t <= p1) return mezclar(c0, c1, p1 === p0 ? 0 : (t - p0) / (p1 - p0));
  }
  return paradas.at(-1)[1];
}

/**
 * Posición sobre la línea de un linear-gradient de CSS.
 * En CSS 0deg apunta hacia arriba y 90deg hacia la derecha; en coordenadas de
 * imagen (y hacia abajo) esa dirección es (sin A, cos A).
 */
function ejeLineal(x, y, grados) {
  const a = (grados * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = Math.cos(a);
  const largo = Math.abs(dx) + Math.abs(dy);
  return 0.5 + ((x - 0.5) * dx + (y - 0.5) * dy) / largo;
}

// ---------- el dibujo ----------

const FONDO = [
  [0.0, hex('#8CC6F0')],
  [0.4, hex('#CDE6F8')],
  [0.7, hex('#F2F7FB')],
  [1.0, hex('#FFF2D9')],
];

const SOL = [
  [0, hex('#FFD873')],
  [1, hex('#F2A31F')],
];

const HALO = hex('#FFBE4A');
const TINTA = hex('#14212D');
const PLANO = hex('#DCE4EC');

/** Distancia a un segmento horizontal de extremos redondeados. */
function pastilla(x, y, x0, x1, cy, r) {
  const px = Math.max(x0, Math.min(x1, x));
  return Math.hypot(x - px, y - cy) - r;
}

/**
 * Color en un punto normalizado 0..1.
 * `inset` encoge el dibujo hacia el centro (zona segura de los maskable).
 * `round` redondea las esquinas del fondo. `mono` lo resuelve en una sola tinta.
 */
function shade(x, y, { inset = 1, round = 0, mono = false } = {}) {
  let alpha = 1;

  if (round > 0) {
    // esquinas redondeadas vía SDF de rectángulo
    const dx = Math.abs(x - 0.5) - (0.5 - round);
    const dy = Math.abs(y - 0.5) - (0.5 - round);
    const fuera = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    if (fuera + Math.min(Math.max(dx, dy), 0) - round > 0) alpha = 0;
  }

  let rgb = mono ? PLANO : gradiente(FONDO, ejeLineal(x, y, 168));

  // coordenadas del dibujo, encogidas hacia el centro
  const u = (x - 0.5) / inset + 0.5;
  const v = (y - 0.5) / inset + 0.5;

  // halo del sol
  if (!mono) {
    const dHalo = Math.hypot(u - 0.5, v - 0.61);
    const g = clamp01(1 - dHalo / 0.331);
    if (g > 0) rgb = mezclar(rgb, HALO, g * g * 0.5);
  }

  // sol
  const dSol = Math.hypot(u - 0.5, v - 0.55);
  if (dSol < 0.21) {
    rgb = mono ? TINTA : gradiente(SOL, (v - 0.34) / 0.42);
  }

  // dos filas de panel, la de abajo más corta y más tenue
  if (pastilla(u, v, 0.13, 0.87, 0.69, 0.04) < 0) rgb = mono ? TINTA : [255, 255, 255];
  if (pastilla(u, v, 0.13, 0.57, 0.83, 0.04) < 0) {
    rgb = mezclar(rgb, mono ? TINTA : [255, 255, 255], mono ? 0.55 : 0.62);
  }

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
          const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, opts);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const i = (y * size + x) * 4;
      // premultiplicado -> recto, para no oscurecer el borde
      buf[i] = a > 0 ? Math.round(r / a) : 0;
      buf[i + 1] = a > 0 ? Math.round(g / a) : 0;
      buf[i + 2] = a > 0 ? Math.round(b / a) : 0;
      buf[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return buf;
}

mkdirSync(OUT, { recursive: true });

const jobs = [
  // Comunes: squircle de radio 23% del lado, dibujo casi a sangre.
  { file: 'icon-192.png', size: 192, opts: { inset: 0.96, round: 0.23 } },
  { file: 'icon-512.png', size: 512, opts: { inset: 0.96, round: 0.23 } },
  { file: 'favicon-64.png', size: 64, opts: { inset: 0.96, round: 0.23 } },
  // Maskable: fondo cuadrado a sangre, dibujo dentro del círculo seguro del 80%.
  { file: 'icon-maskable-512.png', size: 512, opts: { inset: 0.72, round: 0 } },
  // Monocromo: las tres formas en una sola tinta.
  { file: 'icon-mono-512.png', size: 512, opts: { inset: 0.96, round: 0.23, mono: true } },
];

for (const { file, size, opts } of jobs) {
  writeFileSync(join(OUT, file), encodePng(size, render(size, opts)));
  console.log(`  ✓ icons/${file}  (${size}×${size})`);
}
