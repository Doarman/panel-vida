// Los grupos de cultivo, cada uno con su archivo.
//
// Con dos ciclos en paralelo, estado.json declara un archivo por grupo en
// `archivos_por_grupo`. Los dos no comparten esquema ni contenido: el del grupo
// 2 no copia los bloques globales (productos, orden de mezcla, tipos de riego,
// reglas) y los toma de cultivo.json, que es el canónico. Por eso se leen
// todos y se completan acá, antes de que ninguna pantalla los toque.
//
// Cada grupo se muestra por separado, nunca mezclado: tienen distinto panel,
// distinta fase y distinto secado.

import { leerArchivoDeSubsistema } from './api.js';
import { conCache } from './cache.js';
import { nombreDeGrupo } from './contract.js';
import { el } from './ui.js';
import { unirConCanonico, cicloDe, faseDe, luminariaDe } from './cultivo-datos.js';

const CLAVE = 'pv.grupo';

/**
 * Lee el archivo de cada grupo. Si uno falla, los demás se muestran igual: el
 * error queda en ese grupo y no tapa la pantalla entera.
 */
export async function cargarGrupos(sub) {
  const lista = (sub?.grupos || []).filter((g) => g.ruta || g.archivoId);
  if (!lista.length) throw new Error('estado.json no apunta a ningún archivo de cultivo');

  const leidos = await Promise.all(
    lista.map(async (g) => {
      const nombre = String(g.ruta || '').split('/').pop() || g.archivoId;
      // El canónico conserva la clave de siempre, así la copia local que ya
      // estaba en el teléfono sigue sirviendo sin red.
      const clave = g.canonico ? 'cultivo' : `cultivo:${nombre}`;
      try {
        const r = await conCache(clave, () => leerArchivoDeSubsistema(g));
        return { ...g, datos: r.datos, ts: r.ts, fresco: r.fresco };
      } catch (error) {
        return { ...g, error };
      }
    })
  );

  const canonico = leidos.find((g) => g.canonico && g.datos) || null;

  return leidos.map((g) => {
    const cultivo = g.datos ? unirConCanonico(g.datos, canonico?.datos) : null;
    const ciclo = cicloDe(cultivo);
    const id = g.grupo || ciclo?.grupo || 'grupo';
    return {
      id,
      etiqueta: nombreDeGrupo(id),
      cultivo,
      ciclo,
      // Los registros sin campo `ciclo` son de antes del segundo grupo y
      // pertenecen al del archivo canónico.
      legado: Boolean(g.canonico),
      resumen: g.resumen || {},
      error: g.error || null,
      ts: g.ts ?? null,
      fresco: g.fresco ?? true,
    };
  });
}

/** El grupo que se estaba mirando, o el primero. */
export function grupoElegido(grupos) {
  let id = null;
  try {
    id = localStorage.getItem(CLAVE);
  } catch {}
  return grupos.find((g) => g.id === id) || grupos[0];
}

function recordar(id) {
  try {
    localStorage.setItem(CLAVE, id);
  } catch {}
}

/** Debajo del nombre: la fase de hoy y el panel. Lo que distingue a un grupo del otro. */
function subtitulo(g) {
  if (g.error || !g.cultivo) return 'sin leer';
  const lum = luminariaDe(g.cultivo)?.nombre?.split(' ')[0];
  return [faseDe(g.cultivo)?.id, lum].filter(Boolean).join(' · ');
}

/** Pestañas de grupo. Con uno solo no se dibuja nada. */
export function selectorDeGrupos(grupos, actual, alElegir) {
  if (grupos.length < 2) return null;

  const nav = el('div', 'grupos-sel');
  nav.setAttribute('role', 'tablist');

  for (const g of grupos) {
    const activo = g === actual;
    const b = el('button', `grupo-b${activo ? ' activo' : ''}`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(activo));
    b.append(el('span', 'grupo-n', g.etiqueta));
    const sub = subtitulo(g);
    if (sub) b.append(el('span', 'grupo-s', sub));
    b.addEventListener('click', () => {
      if (activo) return;
      recordar(g.id);
      alElegir(g);
    });
    nav.append(b);
  }
  return nav;
}
