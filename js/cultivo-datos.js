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

/** Dosis de un bloque de nutrición, ya ordenadas como se preparan. */
export function dosisDe(cultivo, nutricion) {
  const { dosis, notas } = leerNutricion(nutricion);
  dosis.sort((a, b) => posicionEnMezcla(cultivo, a.clave) - posicionEnMezcla(cultivo, b.clave));
  return { dosis, notas };
}

/** Dosis del fertirriego completo de una fase. */
export function dosisOrdenadas(cultivo, fase) {
  return dosisDe(cultivo, fase?.nutricion);
}

// ---------- tipos de riego ----------

const ORDEN_TIPOS = ['completo', 'intermedio', 'agua', 'ripening', 'flush'];

/** Los tipos que declara el archivo, en un orden estable para la pantalla. */
export function tiposDeRiego(cultivo) {
  const t = cultivo?.tipos_de_riego;
  if (!t) return [];
  const claves = Object.keys(t);
  return [...claves].sort((a, b) => {
    const ia = ORDEN_TIPOS.indexOf(a);
    const ib = ORDEN_TIPOS.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/**
 * La receta de un tipo de riego en una fase dada.
 *
 * Existe por la regla r13: el intermedio NO es una fracción del completo, es
 * una fórmula propia y fija que no aporta sales. Si la app mostrara media
 * dosis, encadenar riegos seguiría acumulando sales y la alternancia de r2 y
 * r11 perdería el sentido. Por eso qué bloque leer lo decide `tipos_de_riego`
 * del archivo, y no una cuenta de la app.
 */
export function recetaDe(cultivo, fase, tipo = 'completo') {
  const def = cultivo?.tipos_de_riego?.[tipo] || null;

  // Sin declaración, solo el completo tiene un origen evidente.
  const usa = def ? def.usa : tipo === 'completo' ? 'fase.nutricion' : null;

  let nutricion = null;
  if (usa === 'fase.nutricion_intermedio') nutricion = fase?.nutricion_intermedio;
  else if (usa) nutricion = fase?.nutricion; // cubre "fase.nutricion" y "fase.nutricion de S8"

  const { dosis, notas } = nutricion ? dosisDe(cultivo, nutricion) : { dosis: [], notas: [] };

  const esIntermedio = usa === 'fase.nutricion_intermedio';

  return {
    tipo,
    dosis,
    notas,
    aportaSales: def ? def.aporta_sales !== false : true,
    formulaFija: def?.formula_fija || null,
    nota: def?.nota || (esIntermedio ? fase?.nutricion_intermedio_nota : null) || null,
    ec: esIntermedio ? (fase?.ec_objetivo_intermedio ?? null) : (fase?.ec_objetivo ?? null),
    ph: esIntermedio ? (fase?.ph_entrada_intermedio ?? null) : (fase?.ph_entrada ?? null),
    // Sin declaración no se inventa una receta: mejor decir que no se sabe.
    declarado: Boolean(def) || tipo === 'completo',
  };
}

/**
 * El orden de mezcla, recortado a los productos que SÍ entran en esta fase.
 *
 * `orden_de_mezcla` es la secuencia de todo el ciclo: incluye PK Booster y
 * Flora Booster, que en vegetativo no van. Mostrarla entera al lado de la
 * receta del día se lee como si fueran parte de la mezcla de hoy, que es
 * justo lo que no tiene que pasar.
 *
 * Se conservan siempre el primer paso (el agua) y el último (medir EC y pH),
 * porque no son productos sino el principio y el final del procedimiento.
 */
export function ordenDeLaFase(cultivo, dosis) {
  const orden = cultivo?.orden_de_mezcla || [];
  if (!orden.length) return [];

  const tokens = dosis.map((d) => d.clave.split('_')[0]);

  return orden.filter((paso, i) => {
    if (i === 0 || i === orden.length - 1) return true;
    const p = paso.toLowerCase();
    return tokens.some((t) => p.includes(t));
  });
}

export function sumarDias(iso, n) {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

export function grupoActivo(cultivo) {
  return (cultivo?.grupos || []).find((g) => g.id === cultivo?.ciclo_activo?.grupo) || null;
}

/**
 * Dónde está parado el secado del sustrato.
 *
 * El ancla es el último riego REGISTRADO, no el calendario. Esa es la
 * diferencia que importa: una fecha del plan dice cuándo estaba previsto
 * regar; esto dice cuántos días lleva secándose de verdad, contra el ciclo de
 * secado medido de este grupo.
 *
 * Sigue siendo una proyección. El secado real depende de la maceta, del clima
 * y de la planta, y por eso lo único que la app puede hacer es decir en qué
 * día vas y devolver la pregunta.
 */
export function estadoDeSecado(cultivo, ultimaFecha, hoy = hoyISO()) {
  const secado = grupoActivo(cultivo)?.ciclo_secado_dias;
  if (!ultimaFecha || !Array.isArray(secado) || secado.length !== 2) return null;

  const [min, max] = secado;
  const transcurridos = dias(ultimaFecha, hoy);
  if (transcurridos == null || transcurridos < 0) return null;

  return {
    transcurridos,
    min,
    max,
    abre: sumarDias(ultimaFecha, min),
    cierra: sumarDias(ultimaFecha, max),
    pct: Math.max(0, Math.min(100, (transcurridos / max) * 100)),
    fase: transcurridos < min ? 'antes' : transcurridos <= max ? 'ventana' : 'pasado',
  };
}

/** Aporte de EC del agua antes de agregar nada. Cambia cómo se lee el objetivo. */
export function aguaBase(cultivo) {
  const a = cultivo?.sitio?.agua;
  if (!a || a.ec_ms_cm == null) return null;
  return { ec: a.ec_ms_cm, nota: a.nota_critica || null, ph: a.ph_origen ?? null };
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
  const { dosis } = recetaDe(cultivo, fase, tipo);
  return dosis.map((d) => infoProducto(cultivo, d.clave)?.id).filter(Boolean);
}
