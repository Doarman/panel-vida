// Barrido de control de calidad del panel.
//
// No reemplaza probar la app: no abre un navegador ni toca la red. Lo que hace
// es revisar todo lo que se puede afirmar leyendo el proyecto, incluido un
// control que no viene en ninguna herramienta genérica: que la interfaz no
// hable en imperativo.
//
//   node tools/qa.mjs

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const fallas = [];
const avisos = [];
const notas = [];

const falla = (area, m) => fallas.push(`${area}: ${m}`);
const aviso = (area, m) => avisos.push(`${area}: ${m}`);
const nota = (m) => notas.push(m);

const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');

function archivosJs(dir = 'js', acc = []) {
  for (const n of readdirSync(join(RAIZ, dir))) {
    const rel = `${dir}/${n}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) archivosJs(rel, acc);
    else if (n.endsWith('.js')) acc.push(rel);
  }
  return acc;
}

const JS = [...archivosJs(), 'config.js', 'sw.js'];
const HTML = leer('index.html');
const CSS = leer('css/app.css');

// ─── 1. Imports y exports ──────────────────────────────────────────────────

function exportados(src) {
  const s = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([\w$]+)/g)) s.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g))
    for (const p of m[1].split(',')) s.add(p.trim().split(/\s+as\s+/).pop().trim());
  return s;
}

for (const f of JS) {
  const src = leer(f);
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)) {
    const destino = resolve(RAIZ, dirname(f), m[2]);
    if (!existsSync(destino)) {
      falla('módulos', `${f} importa ${m[2]}, que no existe`);
      continue;
    }
    const disponibles = exportados(readFileSync(destino, 'utf8'));
    for (let n of m[1].split(',')) {
      n = n.trim().split(/\s+as\s+/)[0].trim();
      if (n && !disponibles.has(n)) falla('módulos', `${f} importa ${n}, que ${m[2]} no exporta`);
    }
  }
}

// Exports que nadie usa: código muerto que envejece mal.
for (const f of JS) {
  const src = leer(f);
  for (const n of exportados(src)) {
    const usadoAfuera = JS.some((o) => o !== f && new RegExp(`\\b${n}\\b`).test(leer(o)));
    const usadoAdentro = [...src.matchAll(new RegExp(`\\b${n}\\b`, 'g'))].length > 1;
    if (!usadoAfuera && !usadoAdentro) aviso('módulos', `${f} exporta ${n} y no lo usa nadie`);
  }
}

// ─── 2. Variables de CSS ───────────────────────────────────────────────────

// Sin anclar a principio de línea: varios tokens comparten renglón.
const definidas = new Set([...CSS.matchAll(/(--[\w-]+)\s*:\s*[^;)]/g)].map((m) => m[1]));
const usadas = new Set([...CSS.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));

for (const v of usadas) {
  // var(--x, respaldo) con respaldo es legítimo aunque --x no se defina siempre
  const conRespaldo = new RegExp(`var\\(\\s*${v}\\s*,`).test(CSS);
  if (!definidas.has(v) && !conRespaldo) falla('css', `se usa ${v} y nunca se define`);
}

for (const v of definidas) {
  if (!usadas.has(v)) aviso('css', `${v} se define y no se usa`);
}

// Penumbra tiene que redefinir todo lo que cambia de valor entre modos.
const bloqueDia = CSS.slice(CSS.indexOf(':root'), CSS.indexOf('[data-modo="penumbra"]'));
const bloquePen = CSS.slice(CSS.indexOf('[data-modo="penumbra"]'), CSS.indexOf('* { box-sizing'));
const colorDia = [...bloqueDia.matchAll(/(--pv-[\w-]+)\s*:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]);
for (const v of colorDia) {
  if (!bloquePen.includes(v + ':')) falla('css', `${v} tiene color en día y no se redefine en penumbra`);
}

// ─── 3. Clases: usadas contra definidas ────────────────────────────────────

const enCss = new Set([...CSS.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const enUso = new Set();

for (const m of HTML.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) enUso.add(c);
for (const f of JS) {
  const src = leer(f);
  for (const m of src.matchAll(/el\(\s*'[\w-]+'\s*,\s*'([^']*)'/g))
    for (const c of m[1].split(/\s+/)) if (c) enUso.add(c);
  for (const m of src.matchAll(/classList\.(?:add|toggle|remove)\('([\w-]+)'/g)) enUso.add(m[1]);
  for (const m of src.matchAll(/className\s*=\s*`([^`$]*)`/g))
    for (const c of m[1].split(/\s+/)) if (c) enUso.add(c);
}

for (const c of enUso) {
  if (!enCss.has(c) && !/^(oculto|activo|ok|mal|espera)$/.test(c)) {
    aviso('css', `la clase .${c} se usa y no está definida`);
  }
}

// ─── 4. Contraste de la paleta ─────────────────────────────────────────────

const canal = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luz = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => canal(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

function tokens(bloque) {
  const o = {};
  for (const m of bloque.matchAll(/(--pv-[\w-]+)\s*:\s*(#[0-9a-f]{6})/gi)) o[m[1]] = m[2];
  return o;
}

const PARES = [
  ['--pv-tinta', '--pv-sup', 7, 'títulos y datos'],
  ['--pv-tinta2', '--pv-sup', 4.5, 'cuerpo'],
  ['--pv-tinta3', '--pv-sup', 4.0, 'micro y rótulos'],
  ['--pv-tinta3', '--pv-fondo', 4.0, 'micro sobre el fondo'],
  ['--pv-cielo', '--pv-cielo-s', 3.0, 'acento Hoy sobre su suave'],
  ['--pv-sol', '--pv-sol-s', 3.0, 'acento Cultivo sobre su suave'],
  ['--pv-rumbo', '--pv-rumbo-s', 3.0, 'acento Rumbo sobre su suave'],
  ['--pv-brote', '--pv-brote-s', 3.0, 'progreso sobre su suave'],
];

for (const [modo, bloque] of [['día', bloqueDia], ['penumbra', bloquePen]]) {
  const t = tokens(bloque);
  for (const [fg, bg, min, que] of PARES) {
    if (!t[fg] || !t[bg]) continue;
    const r = ratio(t[fg], t[bg]);
    if (r < min) falla('contraste', `${modo} · ${que}: ${r.toFixed(2)}:1, mínimo ${min}:1`);
    else nota(`contraste ${modo} · ${que}: ${r.toFixed(2)}:1`);
  }
}

// ─── 5. Voz: la interfaz no da órdenes ─────────────────────────────────────
//
// El control propio de este proyecto. Un ciclo de cultivo se arruinó por operar
// contra el calendario, así que una frase en imperativo no es un detalle de
// redacción: es el error que el sistema existe para no repetir.

const PROHIBIDO = [
  [/\btenés que\b/i, 'obliga'],
  [/\bdebés\b/i, 'obliga'],
  [/\bhacé\b/i, 'imperativo'],
  [/\bregá\b/i, 'imperativo'],
  [/\bpesá\b/i, 'imperativo'],
  [/\bponé\b/i, 'imperativo'],
  [/\bandá\b/i, 'imperativo'],
  [/\bfijate\b/i, 'imperativo'],
  [/\btarea[s]? pendiente/i, 'puntúa cumplimiento'],
  [/\bvencido\b/i, 'puntúa cumplimiento'],
  [/\bcompletad[oa]s?\b/i, 'puntúa cumplimiento'],
  [/\bracha\b/i, 'puntúa cumplimiento'],
  [/\d+\s+de\s+\d+\s+(hechas|completadas)/i, 'puntúa cumplimiento'],
];

// Strings de interfaz: literales de JS y texto del HTML. Los datos que vienen
// de los archivos de Nico no se auditan acá: esos los escribe él.
// Solo strings de una línea: los multilínea que atrapa la expresión son
// fragmentos de código, no copy, y ensuciaban el informe con falsos positivos.
const esCopy = (t) => !t.includes('\n') && /[a-záéíóúñ]{3}\s/i.test(t);

const textos = [];
for (const f of JS) {
  const src = leer(f);
  for (const m of src.matchAll(/'([^'\\\n]{12,})'/g)) if (esCopy(m[1])) textos.push([f, m[1]]);
  for (const m of src.matchAll(/`([^`$\\\n]{12,})`/g)) if (esCopy(m[1])) textos.push([f, m[1]]);
}
for (const m of HTML.matchAll(/>([^<>{]{12,})</g)) {
  const t = m[1].trim();
  if (esCopy(t)) textos.push(['index.html', t]);
}

for (const [donde, t] of textos) {
  if (/^[\w./-]+$/.test(t) || t.startsWith('http')) continue; // rutas y URLs
  // "vencido" hablando del token es la sesión, no la conducta de Nico.
  if (/token vencido|se considera vencido/i.test(t)) continue;
  for (const [re, por] of PROHIBIDO) {
    if (re.test(t)) aviso('voz', `${donde} — ${por}: "${t.slice(0, 72)}"`);
  }
}

// ─── 6. Instalabilidad ─────────────────────────────────────────────────────

const man = JSON.parse(leer('manifest.webmanifest'));
if (!man.name || !man.short_name) falla('pwa', 'el manifest necesita name y short_name');
if (man.display !== 'standalone') falla('pwa', `display es "${man.display}", debería ser standalone`);
if (!man.start_url) falla('pwa', 'falta start_url');

const tam = (man.icons || []).map((i) => i.sizes);
for (const req of ['192x192', '512x512']) {
  if (!tam.includes(req)) falla('pwa', `falta un ícono de ${req}`);
}
if (!(man.icons || []).some((i) => i.purpose === 'maskable')) {
  falla('pwa', 'falta un ícono maskable: Android lo recorta mal sin él');
}
for (const i of man.icons || []) {
  if (!existsSync(join(RAIZ, i.src))) falla('pwa', `el manifest declara ${i.src} y no existe`);
}

const themeHtml = HTML.match(/name="theme-color"\s+content="([^"]+)"/)?.[1];
if (themeHtml && man.theme_color && themeHtml.toLowerCase() !== man.theme_color.toLowerCase()) {
  aviso('pwa', `theme-color del HTML (${themeHtml}) y del manifest (${man.theme_color}) no coinciden`);
}

// ─── 7. Service worker ─────────────────────────────────────────────────────

const SW = leer('sw.js');
const version = SW.match(/const VERSION = '([^']+)'/)?.[1];
if (!version) falla('sw', 'no se encuentra la versión del caché');

for (const m of SW.matchAll(/'\.\/([^']+)'/g)) {
  if (m[1] && !existsSync(join(RAIZ, m[1]))) falla('sw', `precachea ${m[1]}, que no existe`);
}
for (const f of JS) {
  if (f === 'sw.js') continue;
  if (!SW.includes(`./${f}`)) aviso('sw', `${f} no está en la lista de precarga: no va a estar offline`);
}
if (/googleapis/.test(SW.split('fetch')[1] || '')) {
  falla('sw', 'el service worker podría estar cacheando llamadas a Google');
}

// ─── informe ───────────────────────────────────────────────────────────────

const l = console.log;
l(`\n  Panel de Vida · barrido de QA`);
l(`  ${JS.length} módulos · ${definidas.size} tokens de color · ${textos.length} textos de interfaz\n`);

if (fallas.length) {
  l('  FALLAS\n');
  for (const f of fallas) l(`    ✕ ${f}`);
  l('');
}

if (avisos.length) {
  l('  PARA MIRAR\n');
  for (const a of avisos) l(`    · ${a}`);
  l('');
}

if (!fallas.length && !avisos.length) l('  Sin observaciones.\n');

l('  CONTRASTE MEDIDO\n');
for (const n of notas) l(`    ${n}`);
l('');

process.exit(fallas.length ? 1 : 0);
