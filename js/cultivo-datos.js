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

// ---------- ciclo ----------

/**
 * El ciclo que se muestra, venga del esquema que venga.
 *
 * cultivo.json guarda un solo ciclo en `ciclo_activo`. cultivo_grupo2.json ya
 * usa el esquema al que el propio cultivo.json dice que conviene migrar: un
 * array `ciclos` y un puntero `ciclo_activo_id`. Conviven los dos, y todo lo
 * que lee fases, riegos o hitos pasa por acá para no tener que saberlo.
 */
export function cicloDe(cultivo) {
  if (!cultivo) return null;
  if (cultivo.ciclo_activo && typeof cultivo.ciclo_activo === 'object') return cultivo.ciclo_activo;
  const ciclos = Array.isArray(cultivo.ciclos) ? cultivo.ciclos : [];
  return (
    ciclos.find((c) => c?.id === cultivo.ciclo_activo_id) ||
    (ciclos.length === 1 ? ciclos[0] : null)
  );
}

// Los bloques que cultivo_grupo2.json no copia a propósito: viven una sola vez,
// en cultivo.json. Es el respaldo por si el archivo no los declara en
// `referencias.bloques_no_copiados`.
const BLOQUES_GLOBALES = [
  'sitio', 'productos', 'orden_de_mezcla', 'tipos_de_riego', 'modelo_de_nutricion',
  'reglas_no_negociables', 'registro_crudo', 'regimen_riego_acelerado',
  'alertas_ambientales', 'linea_base', 'pendientes',
];

/**
 * El archivo de un grupo, completado con los bloques globales del canónico.
 *
 * No se copian para no tener dos versiones que "cambian juntas": las
 * correcciones de v1.2.0 se perdieron tres veces así. Lo que el archivo propio
 * sí declara manda siempre; el canónico solo llena lo que falta.
 *
 * Las luminarias son la excepción: el archivo del grupo puede traer
 * correcciones (el pico real medido por Nico) mientras el canónico no las
 * incorpore, y esas pisan la ficha.
 */
export function unirConCanonico(propio, canonico) {
  if (!propio || !canonico || propio === canonico) return propio;

  const declarados = propio?.referencias?.bloques_no_copiados;
  const bloques = Array.isArray(declarados) && declarados.length ? declarados : BLOQUES_GLOBALES;

  const unido = { ...propio };
  for (const k of bloques) {
    if (unido[k] == null && canonico[k] != null) unido[k] = canonico[k];
  }

  const base = Array.isArray(propio.luminarias) ? propio.luminarias : canonico.luminarias || [];
  const correcciones = propio.luminarias_correcciones || {};
  const esLuminaria = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const vistas = new Set();
  unido.luminarias = base.map((l) => {
    vistas.add(l?.id);
    return esLuminaria(correcciones[l?.id]) ? { ...l, ...correcciones[l.id] } : l;
  });
  for (const [id, l] of Object.entries(correcciones)) {
    if (esLuminaria(l) && !vistas.has(id)) unido.luminarias.push({ id, ...l });
  }

  return unido;
}

/**
 * Los registros que pertenecen a un ciclo.
 *
 * Los que no dicen `ciclo` son de antes de que hubiera dos, y estado.json los
 * asigna todos al grupo 1. No se infiere por fecha: dos ciclos en paralelo se
 * superponen en el calendario y la fecha no dice de cuál es un riego.
 */
export function delCiclo(registros = [], ciclo, { legado = false } = {}) {
  const ids = [ciclo?.id, ciclo?.grupo].filter(Boolean);
  return registros.filter((r) => (r?.ciclo ? ids.includes(r.ciclo) : legado));
}

/**
 * Lo que toca a un subconjunto: lo suyo y lo que fue para todos.
 * Sin subconjunto elegido, todo.
 */
export function delAlcance(registros = [], alcance = null) {
  if (!alcance) return registros;
  return registros.filter((r) => !r?.alcance || r.alcance === 'todos' || r.alcance === alcance);
}

// ---------- fases ----------

export function faseDe(cultivo, iso = hoyISO()) {
  return (cicloDe(cultivo)?.fases || []).find(
    (f) => f.fecha_inicio <= iso && iso <= f.fecha_fin
  );
}

/** El día 1 de flor: el flip real si ya se anotó, si no el de la primera fase de flor. */
export function inicioDeFlor(cultivo) {
  const c = cicloDe(cultivo);
  return (
    c?.fecha_flip_real ||
    (c?.fases || []).find((f) => f.tipo === 'floracion')?.fecha_inicio ||
    null
  );
}

/**
 * Día de ciclo, empezando en 1.
 *
 * En vegetativo se cuenta desde el trasplante; desde el flip se reinicia y
 * cuenta días de flor. Lo dicen los dos archivos en su nota de día de ciclo, y
 * así lo informa el brief: "día 27 de floración", no "día 49".
 */
export function diaDeCiclo(cultivo, iso = hoyISO()) {
  const c = cicloDe(cultivo);
  const flip = inicioDeFlor(cultivo);
  const enFlor = faseDe(cultivo, iso)?.tipo === 'floracion' && flip && flip <= iso;
  const inicio = enFlor ? flip : c?.fecha_inicio;
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

export function grupoActivo(cultivo) {
  return (cultivo?.grupos || []).find((g) => g.id === cicloDe(cultivo)?.grupo) || null;
}

/** Los subconjuntos del grupo (A veteranas, B nuevas…). Vacío si no tiene. */
export function subconjuntosDe(cultivo) {
  const s = grupoActivo(cultivo)?.subconjuntos;
  return Array.isArray(s) ? s.filter((x) => x?.id) : [];
}

/** La luminaria del grupo, con las correcciones ya aplicadas si las hubo. */
export function luminariaDe(cultivo) {
  const id = grupoActivo(cultivo)?.luminaria;
  return (cultivo?.luminarias || []).find((l) => l?.id === id) || null;
}

/**
 * Volumen por maceta, legible. Puede venir como rango para todo el grupo o
 * por subconjunto, porque tres plantas grandes y ocho chicas en la misma
 * maceta no toman lo mismo.
 */
export function volumenTexto(cultivo, vol) {
  if (Array.isArray(vol)) return `${rango(vol)} L`;
  if (!vol || typeof vol !== 'object') return '—';
  const partes = subconjuntosDe(cultivo)
    .filter((s) => Array.isArray(vol[s.id]))
    .map((s) => `${s.nombre || s.id} ${rango(vol[s.id])}`);
  return partes.length ? `${partes.join(' · ')} L` : '—';
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
/**
 * Cuánto tarda en secar, según lo observado.
 *
 * Cada observación se ancla al riego que la disparó (`desde`), así que si Nico
 * corrige una anotación queda la última de ese riego y no las dos: append-only
 * en el archivo, pero corregible en pantalla.
 *
 * Se prefiere lo medido en la misma fase cuando alcanza, porque una planta en
 * floración toma mucho más que en vegetativo y mezclarlas daría un promedio que
 * no describe ninguna de las dos.
 */
/**
 * Cuánto tarda en secar, EN HORAS.
 *
 * El archivo lo traía en días enteros, y ahí estaba el problema real: el
 * sustrato de este cultivo seca en unas 60 horas, que son dos días y medio.
 * En un contador de días enteros eso no se puede decir, así que el número
 * nunca coincidía con la maceta y el contador dejó de servir.
 *
 * Orden de precedencia, del dato más propio al más prestado:
 *   1. lo que Nico midió, en esta fase
 *   2. lo que declara el archivo en horas
 *   3. el puente de config, mientras el archivo no lo declare
 *   4. el rango en días del archivo, convertido
 */
export function secadoObservado(secados = [], faseId = null) {
  const porRiego = new Map();
  for (const s of secados) {
    const horas = s?.horas ?? (typeof s?.dias === 'number' ? s.dias * 24 : null);
    if (!s?.desde || horas == null) continue;
    porRiego.set(s.desde, { ...s, horas }); // el último de cada riego gana
  }

  const todos = [...porRiego.values()].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  if (!todos.length) return null;

  const deLaFase = faseId ? todos.filter((s) => s.fase === faseId) : [];
  const usados = deLaFase.length ? deLaFase : todos;
  const recientes = usados.slice(-4);
  const valores = recientes.map((s) => s.horas);

  return {
    horas: Math.round(valores.reduce((a, b) => a + b, 0) / valores.length),
    min: Math.min(...valores),
    max: Math.max(...valores),
    n: recientes.length,
    mismaFase: deLaFase.length > 0,
    ultimo: todos.at(-1),
  };
}

/**
 * `ciclo_secado_horas` puede venir de dos formas y las dos son válidas.
 *
 * Hoy es un escalar (60), puesto a mano. Cuando Cowork consolide tres
 * mediciones pasa a ser un rango [min, max]. Si la app aceptara solo el
 * escalar no se rompería: ignoraría la medición consolidada en silencio y
 * seguiría proyectando con el puente, que es peor que romperse.
 */
function normalizarHoras(v) {
  if (typeof v === 'number' && v > 0) return { horas: v, min: v, max: v };
  if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && n > 0)) {
    const [min, max] = [Math.min(...v), Math.max(...v)];
    return { horas: Math.round((min + max) / 2), min, max };
  }
  return null;
}

/**
 * Las horas de secado vigentes, y de dónde salieron.
 *
 * Con `alcance`, lo que el archivo declare para ese subconjunto le gana a lo
 * del grupo: las veteranas y las nuevas del grupo 2 no secan igual.
 */
export function horasDeSecado(cultivo, { secados = [], faseId = null, puente = null, alcance = null } = {}) {
  const medido = secadoObservado(secados, faseId);
  if (medido) {
    return {
      horas: medido.horas, min: medido.min, max: medido.max,
      origen: 'medido', n: medido.n, mismaFase: medido.mismaFase,
    };
  }

  const g = grupoActivo(cultivo);
  const sub = alcance ? subconjuntosDe(cultivo).find((s) => s.id === alcance) : null;
  const declarado = normalizarHoras(sub?.ciclo_secado_horas) || normalizarHoras(g?.ciclo_secado_horas);
  if (declarado) return { ...declarado, origen: 'archivo', n: 0 };
  const p = normalizarHoras(puente);
  if (p) return { ...p, origen: 'puente', n: 0 };

  // Cuando el archivo ya declara horas marca los días como obsoletos. Si aun
  // así solo quedaran los días, no se usan: 4-5 días fue justo el número que
  // nunca coincidió con la maceta.
  const d = g?._ciclo_secado_dias_obsoleto ? null : g?.ciclo_secado_dias;
  if (Array.isArray(d) && d.length === 2) {
    return { horas: Math.round(((d[0] + d[1]) / 2) * 24), min: d[0] * 24, max: d[1] * 24, origen: 'dias', n: 0 };
  }
  return null;
}

/**
 * Dónde está parado el secado, contado en horas.
 *
 * `ultimoRiego` puede traer hora; si es solo una fecha se asume el mediodía,
 * que reparte el error en doce horas para cada lado en vez de acumularlo.
 */
export function estadoDeSecado(cultivo, ultimoRiego, opciones = {}) {
  const { secados = [], faseId = null, puente = null, alcance = null, ahora = Date.now() } = opciones;
  if (!ultimoRiego) return null;

  const desde = Date.parse(ultimoRiego.includes('T') ? ultimoRiego : `${ultimoRiego}T12:00:00`);
  if (Number.isNaN(desde)) return null;

  const transcurridas = Math.max(0, Math.round((ahora - desde) / 3600000));
  const yaSeco = secados.find((s) => s?.desde === ultimoRiego) || null;

  // Sin secado conocido no se proyecta: se dice cuánto pasó y nada más. Es el
  // caso de un grupo nuevo, que no hereda las horas de otro (distinta maceta,
  // porte y luz). Anotar el primer secado es lo que lo vuelve dato.
  const base = horasDeSecado(cultivo, { secados, faseId, puente, alcance });
  if (!base) {
    return {
      horas: null, min: null, max: null, origen: null, n: 0,
      transcurridas, restantes: null, seco: false, pct: null, yaSeco,
    };
  }

  const restantes = base.horas - transcurridas;

  return {
    ...base,
    transcurridas,
    restantes,
    seco: restantes <= 0,
    pct: Math.max(0, Math.min(100, (transcurridas / base.horas) * 100)),
    // La observación de ESTE secado, si ya la anotó.
    yaSeco,
  };
}

/** Aporte de EC del agua antes de agregar nada. Cambia cómo se lee el objetivo. */
export function aguaBase(cultivo) {
  const a = cultivo?.sitio?.agua;
  if (!a || a.ec_ms_cm == null) return null;
  return { ec: a.ec_ms_cm, nota: a.nota_critica || null, ph: a.ph_origen ?? null };
}

/**
 * Litros totales de la tanda: cuántas macetas por cuántos litros cada una.
 *
 * Con subconjuntos, cada uno con su volumen: un solo tanque, dos tamaños de
 * planta. Es referencia para preparar, no criterio de riego: lo que cuenta es
 * llegar al drenaje objetivo.
 */
export function totalMezcla(cultivo, fase) {
  const grupo = grupoActivo(cultivo);
  const vol = fase?.volumen_por_maceta_l;
  if (!grupo || !vol) return null;

  let partes;
  if (Array.isArray(vol)) {
    if (!grupo.cantidad_plantas || vol.length !== 2) return null;
    partes = [{ id: null, nombre: null, n: grupo.cantidad_plantas, vol }];
  } else {
    partes = subconjuntosDe(cultivo)
      .filter((s) => Array.isArray(vol[s.id]) && s.cantidad_plantas)
      .map((s) => ({ id: s.id, nombre: s.nombre || s.id, n: s.cantidad_plantas, vol: vol[s.id] }));
    if (!partes.length) return null;
  }

  const suma = (i) => +partes.reduce((a, p) => a + p.n * p.vol[i], 0).toFixed(1);
  const min = suma(0);
  const max = suma(1);
  return {
    n: partes.reduce((a, p) => a + p.n, 0),
    vol: Array.isArray(vol) ? vol : null,
    partes,
    min,
    max,
    litros: min === max ? `${min} L` : `${min}–${max} L`,
  };
}

/**
 * Las aplicaciones de evento de la fase (hoy, Flora Booster), y si ya pasaron.
 *
 * Regla r14: no son concentración de la solución sino una aplicación única, en
 * el PRIMER completo de la fase. Si se leyeran como una dosis más, con secado
 * de 60 horas entrarían dos o tres por fase y las cuatro del ciclo serían
 * siete u ocho. Por eso viven fuera de `nutricion`, y si ya pasaron se decide
 * contra los riegos registrados, no contra el calendario.
 */
export function eventosDeLaFase(cultivo, fase, riegos = []) {
  const lista = Array.isArray(fase?.aplicaciones_evento) ? fase.aplicaciones_evento : [];
  if (!lista.length) return [];

  const primerCompleto =
    riegos
      .filter((r) => r?.fase === fase.id && r.tipo === 'completo' && r.fecha)
      .map((r) => r.fecha)
      .sort()[0] || null;

  const delCicloEntero = (cicloDe(cultivo)?.fases || []).flatMap((f) => f.aplicaciones_evento || []);

  const salida = [];
  for (const a of lista) {
    const k = Object.keys(a || {}).find((x) => /^dosis_(ml|g)_l$/.test(x));
    if (!a?.producto || !k || typeof a[k] !== 'number') continue;
    salida.push({
      clave: a.producto,
      valor: a[k],
      unidad: `${k.split('_')[1]}/L`,
      evento: true,
      numero: a.aplicacion_numero ?? null,
      total: delCicloEntero.filter((x) => x?.producto === a.producto).length,
      aplicadoEl: primerCompleto,
    });
  }
  return salida;
}

/**
 * Ids de producto que entran en un riego de esta fase.
 * cultivo.json pide `productos_aplicados` en cada registro; se deduce de la
 * fase en vez de hacerte tildarlos uno por uno.
 */
export function productosDeLaFase(cultivo, fase, tipo, riegos = []) {
  const { dosis } = recetaDe(cultivo, fase, tipo);
  // El evento entra solo si este completo es el primero de la fase.
  const eventos = tipo === 'completo'
    ? eventosDeLaFase(cultivo, fase, riegos).filter((e) => !e.aplicadoEl)
    : [];
  return [...dosis, ...eventos].map((d) => infoProducto(cultivo, d.clave)?.id).filter(Boolean);
}

/**
 * Observaciones de secado que Cowork ya consolidó dentro de cultivo.json.
 *
 * La app escribe en su buzón y Cowork las pasa a cultivo.json y vacía el buzón.
 * Si la app leyera solo el buzón, cada consolidación le borraría la memoria y
 * volvería a proyectar con el rango estimado. Se leen de las dos ubicaciones
 * posibles porque el nombre exacto lo define Cowork, no esta app.
 */
export function secadosConsolidados(cultivo) {
  const c =
    cicloDe(cultivo)?.secados_medidos ??
    grupoActivo(cultivo)?.secados_medidos ??
    cultivo?.secados_medidos;
  return Array.isArray(c) ? c : [];
}

/**
 * Qué tipo de riego proponer, y por qué.
 *
 * El plan manda, salvo cuando choca con una regla del propio archivo. El caso
 * real: el sustrato secó antes de lo previsto, entra un riego extra en la
 * semana, y r11 dice que ese extra no puede ser un segundo fertirriego
 * completo. Sin esto, la app ofrecía las dosis del completo dos veces seguidas.
 *
 * El alcance de r11 lo fija el archivo —"en floracion activa"— y no se amplía
 * por cuenta propia: en vegetativo se avisa, pero decide Nico. Inventarle
 * alcance a una regla agronómica no es tarea de una interfaz.
 */
export function tipoSugerido(cultivo, riegos = [], fase = null, hoy = hoyISO()) {
  const prox = (cicloDe(cultivo)?.riegos_programados || []).find((r) => r.fecha >= hoy);
  const delPlan = prox?.tipo || 'completo';
  // Con subconjuntos, el próximo riego del plan puede ser solo para uno.
  const alcance = prox?.alcance && prox.alcance !== 'todos' ? prox.alcance : null;

  if (delPlan !== 'completo') return { tipo: delPlan, motivo: 'plan', aviso: null, alcance };

  const ultimoCompleto = riegos
    .filter((r) => r?.tipo === 'completo' && r.fecha)
    .map((r) => r.fecha)
    .sort()
    .pop();

  const transcurridos = ultimoCompleto ? dias(ultimoCompleto, hoy) : null;
  if (transcurridos == null || transcurridos >= 7 || transcurridos < 0) {
    return { tipo: delPlan, motivo: 'plan', aviso: null, alcance };
  }

  const enFloracion = fase?.tipo === 'floracion';
  const texto =
    `Hubo un fertirriego completo hace ${transcurridos} ${transcurridos === 1 ? 'día' : 'días'}. ` +
    (enFloracion
      ? 'La regla r11 no admite un segundo completo en la misma semana de floración.'
      : 'La regla r11 pide un solo completo por semana en floración activa; en vegetativo no la fija el archivo.');

  return { tipo: enFloracion ? 'intermedio' : delPlan, motivo: 'r11', aviso: texto, alcance };
}
