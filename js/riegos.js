// Registro de riegos: lo único que esta app escribe.
//
// Nunca toca cultivo.json. Escribe append-only en un archivo propio, creado por
// la app con el scope drive.file, y Claude (Cowork) lo consolida después en
// ciclo_activo.riegos_ejecutados durante el repaso semanal.
//
// Por qué así y no modificando cultivo.json directamente:
//   - Son 24 KB con dos escritores (Cowork y esta app). Bajar, modificar y
//     volver a subir el archivo entero desde el celular es la forma más fácil
//     de pisar cambios o de dejarlo truncado si se corta la conexión.
//   - Agregar a un archivo propio no puede corromper la base pase lo que pase.
//
// Todo riego se guarda PRIMERO en el teléfono y recién después se sube. Si no
// hay señal, el dato no se pierde: queda pendiente y sube en el próximo intento.

import { buscarArchivoPropio, crearJsonPropio, reemplazarJsonPropio, leerJsonDeDrive } from './api.js';

const ARCHIVO = 'panel-vida-riegos.json';
const PENDIENTES = 'pv.riegos.pendientes';
const CACHE_ID = 'pv.riegos.fileId';

const ESQUELETO = {
  _meta: {
    descripcion:
      'Riegos registrados desde la PWA Panel de Vida. Append-only. Para consolidar en ciclo_activo.riegos_ejecutados de cultivo.json.',
    escribe: 'Panel de Vida (app movil)',
    consolida: 'Claude (Cowork)',
    version: 1,
  },
  riegos: [],
};

// ---------- cola local ----------

function leerPendientes() {
  try {
    return JSON.parse(localStorage.getItem(PENDIENTES) || '[]');
  } catch {
    return [];
  }
}

function guardarPendientes(lista) {
  try {
    localStorage.setItem(PENDIENTES, JSON.stringify(lista));
  } catch {}
}

export function pendientes() {
  return leerPendientes();
}

// ---------- archivo en Drive ----------

async function idDelArchivo() {
  const cacheado = localStorage.getItem(CACHE_ID);
  if (cacheado) return cacheado;

  let id = await buscarArchivoPropio(ARCHIVO);
  if (!id) id = await crearJsonPropio(ARCHIVO, ESQUELETO);

  try {
    localStorage.setItem(CACHE_ID, id);
  } catch {}
  return id;
}

/** Lo ya subido. Devuelve [] si el archivo todavía no existe. */
export async function subidos() {
  const id = localStorage.getItem(CACHE_ID) || (await buscarArchivoPropio(ARCHIVO));
  if (!id) return [];
  const j = await leerJsonDeDrive(id);
  return Array.isArray(j?.riegos) ? j.riegos : [];
}

/**
 * Sube los pendientes. Relee el archivo antes de escribir, así no pisa lo que
 * haya entrado desde otro lado, y solo limpia la cola local cuando Drive
 * confirmó la escritura.
 */
export async function sincronizar() {
  const cola = leerPendientes();
  if (!cola.length) return { subidos: 0 };

  const id = await idDelArchivo();

  let actual;
  try {
    actual = await leerJsonDeDrive(id);
  } catch {
    actual = { ...ESQUELETO };
  }
  if (!Array.isArray(actual.riegos)) actual.riegos = [];

  const yaEstan = new Set(actual.riegos.map((r) => r.id));
  const nuevos = cola.filter((r) => !yaEstan.has(r.id));

  actual.riegos.push(...nuevos);
  actual.riegos.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  actual._meta = { ...ESQUELETO._meta, actualizado: new Date().toISOString() };

  await reemplazarJsonPropio(id, actual);

  guardarPendientes([]); // recién ahora, con la escritura confirmada
  return { subidos: nuevos.length };
}

/** Guarda el riego en el teléfono y trata de subirlo. Nunca lo pierde. */
export async function registrar(riego) {
  const entrada = {
    id: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    registrado_en: new Date().toISOString(),
    ...riego,
  };

  guardarPendientes([...leerPendientes(), entrada]);

  try {
    await sincronizar();
    return { entrada, subido: true };
  } catch (e) {
    return { entrada, subido: false, error: e.message };
  }
}
