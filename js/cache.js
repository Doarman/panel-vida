// Copia local de lo último que se leyó de Google.
//
// Sirve para dos cosas distintas que resultan ser la misma:
//   - Sin señal, la app muestra lo último conocido en vez de una pantalla vacía.
//   - Con la sesión vencida, se puede seguir mirando y registrando sin frenar
//     todo para volver a autorizar.
//
// Siempre se marca desde cuándo es el dato: información vieja sin fecha es peor
// que no tener información.

const PREFIJO = 'pv.cache.';

// Capa en memoria, además de la de disco. Sin esto, cambiar de pestaña vuelve
// a bajar estado.json de Drive —y cultivo.json son 24 KB—, así que ir y volver
// entre secciones costaba varios viajes de red en 4G.
const memoria = new Map();
const TTL = 90_000;


export function guardar(clave, datos) {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify({ ts: Date.now(), datos }));
  } catch {
    /* storage lleno o modo privado: se sigue sin caché */
  }
}

export function leer(clave) {
  try {
    const raw = localStorage.getItem(PREFIJO + clave);
    if (!raw) return null;
    const { ts, datos } = JSON.parse(raw);
    return { datos, ts };
  } catch {
    return null;
  }
}

/** "hace 3 min", "hace 2 h", "ayer". Para la marca de dato viejo. */
export function antiguedad(ts) {
  const seg = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seg < 90) return 'recién';
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const hs = Math.round(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  const d = Math.round(hs / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

/**
 * Intenta la red y cae al caché si falla.
 * Devuelve { datos, ts, fresco } — `fresco` false significa que es una copia.
 */
export async function conCache(clave, traer, { ttl = TTL } = {}) {
  const enMemoria = memoria.get(clave);
  if (enMemoria && Date.now() - enMemoria.ts < ttl) {
    return { ...enMemoria, fresco: true };
  }

  try {
    const datos = await traer();
    const entrada = { datos, ts: Date.now() };
    memoria.set(clave, entrada);
    guardar(clave, datos);
    return { ...entrada, fresco: true };
  } catch (e) {
    // Sin red o sin sesión: sirve lo último que haya, primero de memoria.
    if (enMemoria) return { ...enMemoria, fresco: false };
    const copia = leer(clave);
    if (copia) {
      memoria.set(clave, copia);
      return { ...copia, fresco: false };
    }
    throw e; // sin nada guardado: no hay qué mostrar
  }
}
