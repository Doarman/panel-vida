// Lectura de cultivo.json: fechas, nutrición y productos.
//
// Vive aparte de las vistas porque lo usan dos: la pantalla de Cultivo y el
// plan completo. Acá no se dibuja nada.

// ---------- fechas ----------

const dosDig = (n) => String(n).padStart(2, '0');

export function hoyISO(d = new Date()) {
  return `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`;
}

/** Días entre dos fechas YYYY-MM-DD, sin que la zona horaria meta ruido. */
export function dias(desde, hasta) {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

const fmtFecha = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const fmtCorta = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export function fecha(iso) {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? iso : fmtFecha.format(new Date(t));
}

export function fechaCorta(iso) {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? iso : fmtCorta.format(new Date(t));
}

/** "hoy", "mañana", "en 4 días" — más legible que una fecha suelta. */
export function cuando(iso) {
  const d = dias(hoyISO(), iso);
  if (d === null) return iso;
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}

export const rango = (r) => (Array.isArray(r) && r.length === 2 ? `${r[0]}–${r[1]}` : (r ?? '—'));

// ---------- fases ----------

export function faseDe(cultivo, iso = hoyISO()) {
  return (cultivo?.ciclo_activo?.fases || []).find(
    (f) => f.fecha_inicio <= iso && iso <= f.fecha_fin
  );
}

export function diaDeCiclo(cultivo, iso = hoyISO()) {
  const inicio = cultivo?.ciclo_activo?.fecha_inicio;
  if (!inicio) return null;
  const d = dias(inicio, iso);
  return d == null ? null : d + 1;
}

// ---------- nutrición ----------

// Nombres cortos para pantalla. El nombre comercial completo está en
// cultivo.json y no entra en el ancho de un celular. Lo que no esté acá cae en
// una versión legible de la clave, así un producto nuevo igual se muestra.
const NOMBRES = {
  rhino_skin: 'Rhino Skin',
  calmag: 'CalMag',
  grow: 'Grow',
  hybrids: 'Hybrids',
  pure_zym: 'Pure Zym',
  vitamax: 'Vitamax',
  flora_booster: 'Flora Booster',
  pk_booster: 'PK Booster',
  trico_mas: 'Trico+',
};

export const nombreDe = (clave) =>
  NOMBRES[clave] || clave.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Separa el bloque `nutricion` en dosis y notas.
 * Las claves de dosis terminan en _ml_l o _g_l; el resto son aclaraciones
 * (una aplicación numerada, un producto que sale, una nota suelta).
 */
export function leerNutricion(nutricion) {
  const dosis = [];
  const notas = [];

  for (const [k, v] of Object.entries(nutricion || {})) {
    const m = k.match(/^(.+?)_(ml|g)_l$/);

    if (m && typeof v === 'number') {
      dosis.push({ clave: m[1], valor: v, unidad: `${m[2]}/L` });
    } else if (m && v === null) {
      notas.push(`${nombreDe(m[1])}: no entra en esta fase`);
    } else if (k.endsWith('_aplicacion') && typeof v === 'number') {
      notas.push(`${nombreDe(k.replace(/_aplicacion$/, ''))}: aplicación ${v}`);
    } else if (typeof v === 'string') {
      notas.push(`${nombreDe(k)}: ${v}`);
    }
  }

  return { dosis, notas };
}

/** Ficha del producto en cultivo.json, para su rol y su advertencia. */
export function infoProducto(cultivo, clave) {
  const ps = cultivo?.productos || [];
  return (
    ps.find((p) => p.id === clave) ||
    ps.find((p) => clave.startsWith(p.id)) ||
    ps.find((p) => p.id.startsWith(clave)) ||
    null
  );
}

/** Posición en el orden de mezcla, para no listar los productos al azar. */
export function posicionEnMezcla(cultivo, clave) {
  const orden = cultivo?.orden_de_mezcla || [];
  const token = clave.split('_')[0];
  const i = orden.findIndex((paso) => paso.toLowerCase().includes(token));
  return i === -1 ? 99 : i;
}

/** Dosis de una fase, ya ordenadas como se preparan. */
export function dosisOrdenadas(cultivo, fase) {
  const { dosis, notas } = leerNutricion(fase?.nutricion);
  dosis.sort((a, b) => posicionEnMezcla(cultivo, a.clave) - posicionEnMezcla(cultivo, b.clave));
  return { dosis, notas };
}

/** Litros totales de la tanda: cuántas macetas por cuántos litros cada una. */
export function totalMezcla(cultivo, fase) {
  const grupo = (cultivo?.grupos || []).find((g) => g.id === cultivo?.ciclo_activo?.grupo);
  const n = grupo?.cantidad_plantas;
  const vol = fase?.volumen_por_maceta_l;
  if (!n || !Array.isArray(vol)) return null;
  const min = +(n * vol[0]).toFixed(1);
  const max = +(n * vol[1]).toFixed(1);
  return { n, vol, litros: min === max ? `${min} L` : `${min}–${max} L` };
}

/**
 * Ids de producto que entran en un riego de esta fase.
 * cultivo.json pide `productos_aplicados` en cada registro; se deduce de la
 * fase en vez de hacerte tildarlos uno por uno.
 */
export function productosDeLaFase(cultivo, fase, tipo) {
  if (tipo === 'agua' || tipo === 'flush') return [];
  const { dosis } = leerNutricion(fase?.nutricion);
  return dosis.map((d) => infoProducto(cultivo, d.clave)?.id).filter(Boolean);
}
