// Servidor estático para desarrollo. Cero dependencias: solo módulos de Node.
// El puerto tiene que ser el 8080 porque es el origen que autorizamos en Google Cloud.
//
//   node tools/serve.mjs

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8080;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  try {
    // normalize + el prefijo ROOT evitan que un ../../ se escape del proyecto
    const pedido = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let ruta = normalize(join(ROOT, pedido));
    if (!ruta.startsWith(ROOT)) throw Object.assign(new Error(), { code: 'ENOENT' });

    if ((await stat(ruta)).isDirectory()) ruta = join(ruta, 'index.html');

    const cuerpo = await readFile(ruta);
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(ruta)] || 'application/octet-stream',
      // Sin caché en dev: el service worker ya complica bastante el diagnóstico.
      'Cache-Control': 'no-store',
    });
    res.end(cuerpo);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
    res.end(e.code === 'ENOENT' ? 'No encontrado' : 'Error');
  }
}).listen(PORT, () => {
  console.log(`\n  Panel de Vida  →  http://localhost:${PORT}\n`);
});
