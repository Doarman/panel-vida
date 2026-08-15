// Pantalla Cultivo.
//
// Toda la información se formula como proyección, nunca como orden. El ciclo
// anterior se arruinó por operar contra el calendario en vez de contra la
// planta; una app que dice "hoy regás" repite ese error con más autoridad.
// Por eso: "Riego proyectado", los rangos de la fase van como referencia al
// lado del campo y nunca precargados, y no hay un solo checkbox.
//
// Las dosis sí van completas y al frente: son el dato que se usa parado
// frente a la mezcla, y no saberlas de memoria no es una decisión, es una
// molestia.

import { leerEstado, leerJsonDeDrive } from '../api.js';
import { subsistema } from '../contract.js';
import { registrar, sincronizar, pendientes, subidos } from '../riegos.js';
import { el, seccion, cargando, itemOmitible, pieOmitidos } from '../ui.js';
import { conCache, antiguedad } from '../cache.js';
import { estaOmitido, omitir, restaurarTodo } from '../omitidos.js';

// ---------- helpers ----------

const dosDig = (n) => String(n).padStart(2, '0');

function hoyISO(d = new Date()) {
  return `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`;
}

/** Días entre dos fechas YYYY-MM-DD, sin que la zona horaria meta ruido. */
function dias(desde, hasta) {
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

/** "hoy", "mañana", "en 4 días" — más legible que una fecha suelta. */
function cuando(iso) {
  const d = dias(hoyISO(), iso);
  if (d === null) return iso;
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}

function fecha(iso) {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? iso : fmtFecha.format(new Date(t));
}

const rango = (r) => (Array.isArray(r) && r.length === 2 ? `${r[0]}–${r[1]}` : (r ?? '—'));

// ---------- nutrición ----------

// Nombres cortos para la pantalla. El nombre comercial completo está en
// cultivo.json y no entra en el ancho de un celular. Lo que no esté acá cae
// en una versión legible de la clave, así un producto nuevo igual se muestra.
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

const nombreDe = (clave) =>
  NOMBRES[clave] || clave.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Separa el bloque `nutricion` en dosis y notas.
 * Las claves de dosis terminan en _ml_l o _g_l; el resto son aclaraciones
 * (una aplicación numerada, un producto que sale, una nota suelta).
 */
function leerNutricion(nutricion) {
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

/** Ficha del producto en cultivo.json, para poder mostrar su rol y su nota. */
function infoProducto(cultivo, clave) {
  const ps = cultivo?.productos || [];
  return (
    ps.find((p) => p.id === clave) ||
    ps.find((p) => clave.startsWith(p.id)) ||
    ps.find((p) => p.id.startsWith(clave)) ||
    null
  );
}

/** Posición del producto en el orden de mezcla, para no listarlo en cualquier orden. */
function posicionEnMezcla(cultivo, clave) {
  const orden = cultivo?.orden_de_mezcla || [];
  const token = clave.split('_')[0];
  const i = orden.findIndex((paso) => paso.toLowerCase().includes(token));
  return i === -1 ? 99 : i;
}

/** Litros totales de la tanda: cuántas macetas por cuántos litros cada una. */
function totalMezcla(cultivo, fase) {
  const grupo = (cultivo?.grupos || []).find((g) => g.id === cultivo?.ciclo_activo?.grupo);
  const n = grupo?.cantidad_plantas;
  const vol = fase?.volumen_por_maceta_l;
  if (!n || !Array.isArray(vol)) return null;
  const min = +(n * vol[0]).toFixed(1);
  const max = +(n * vol[1]).toFixed(1);
  return { n, vol, litros: min === max ? `${min} L` : `${min}–${max} L` };
}

const LITROS_CLAVE = 'pv.litros';

/** 44, 11.5, 0.5 — sin decimales de más. */
function cantidad(valor) {
  const n = Math.round(valor * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function pintarMezcla(cultivo, fase) {
  if (!fase?.nutricion) return null;

  const { dosis, notas } = leerNutricion(fase.nutricion);
  if (!dosis.length) return null;

  dosis.sort((a, b) => posicionEnMezcla(cultivo, a.clave) - posicionEnMezcla(cultivo, b.clave));

  const s = seccion(`Mezcla · fase ${fase.id}`);
  const total = totalMezcla(cultivo, fase);

  // Punto de partida: lo que dan las macetas de esta fase. Pero el que manda es
  // el litro que prepares vos, así que se puede mover.
  const sugerido = total
    ? Math.round(total.n * ((fase.volumen_por_maceta_l[0] + fase.volumen_por_maceta_l[1]) / 2) * 2) / 2
    : 20;

  const guardado = Number(localStorage.getItem(LITROS_CLAVE));
  const inicial = guardado > 0 ? guardado : sugerido;

  const control = el('div', 'litros');
  const salida = el('output', 'litros-v', `${cantidad(inicial)} L`);
  control.append(salida);

  const barra = el('input', 'litros-r');
  barra.type = 'range';
  barra.min = '1';
  barra.max = String(Math.max(40, Math.ceil(inicial * 2)));
  barra.step = '0.5';
  barra.value = String(inicial);
  barra.setAttribute('aria-label', 'Litros de mezcla');
  control.append(barra);

  if (total) {
    control.append(
      el('p', 'litros-ref', `${total.n} macetas × ${rango(total.vol)} L  →  ${total.litros}`)
    );
  }
  s.append(control);

  // Cada producto muestra la cantidad total para esos litros, y la dosis
  // original al lado como referencia. Tocando la fila se abre lo que
  // cultivo.json sabe de ese producto: para qué es y su advertencia.
  const ol = el('ol', 'mezcla');
  const filas = [];

  for (const d of dosis) {
    const info = infoProducto(cultivo, d.clave);
    const li = el('li');

    const cabecera = el('div', 'mz-h');
    const cant = el('span', 'mz-c');
    cabecera.append(el('span', 'mz-n', nombreDe(d.clave)));
    cabecera.append(cant);
    cabecera.append(el('span', 'mz-d', `${d.valor} ${d.unidad}`));
    li.append(cabecera);

    const detalle = [info?.nombre, info?.rol && `Para: ${info.rol}`, info?.nota]
      .filter(Boolean)
      .join('\n');

    if (detalle) {
      li.classList.add('abrible');
      const cuerpo = el('p', 'mz-info', detalle);
      li.append(cuerpo);
      cabecera.addEventListener('click', () => li.classList.toggle('abierta'));
    }

    ol.append(li);
    filas.push({ d, cant });
  }
  s.append(ol);

  const recalcular = () => {
    const L = Number(barra.value);
    salida.textContent = `${cantidad(L)} L`;
    barra.style.setProperty('--pct', `${((L - 1) / (Number(barra.max) - 1)) * 100}%`);
    for (const { d, cant } of filas) {
      cant.textContent = `${cantidad(d.valor * L)} ${d.unidad.split('/')[0]}`;
    }
  };

  barra.addEventListener('input', recalcular);
  barra.addEventListener('change', () => {
    try {
      localStorage.setItem(LITROS_CLAVE, barra.value);
    } catch {}
  });
  recalcular();

  for (const n of notas) s.append(el('p', 'mezcla-nota', n));

  // El orden importa de verdad: el silicio precipita si entra junto al CalMag.
  const orden = cultivo?.orden_de_mezcla || [];
  if (orden.length) s.append(el('p', 'pie', `Orden: ${orden.join(' → ')}`));

  return s;
}

// ---------- secciones ----------

function pintarCiclo(ciclo, fase, diaDeCiclo, marca) {
  const s = el('section', 'ciclo tarjeta');
  s.append(el('p', 'ciclo-n', ciclo?.nombre || 'Ciclo activo'));
  s.append(el('h3', 'ciclo-f', fase ? fase.nombre : 'Entre fases'));

  const partes = [];
  if (diaDeCiclo != null) partes.push(`Día ${diaDeCiclo} del ciclo`);
  if (fase) partes.push(`fase ${fase.id} hasta el ${fecha(fase.fecha_fin)}`);
  s.append(el('p', 'ciclo-d', partes.join(' · ')));

  if (fase) {
    // Cuatro fichas parejas. Antes era una rejilla de tres columnas y la cuarta
    // quedaba sola, con un hueco al lado.
    s.append(
      chips([
        ['EC objetivo', rango(fase.ec_objetivo)],
        ['pH entrada', rango(fase.ph_entrada)],
        ['PPFD', fase.ppfd_techo ? `${fase.ppfd} / ${fase.ppfd_techo}` : (fase.ppfd ?? '—')],
        ['Litros/maceta', rango(fase.volumen_por_maceta_l)],
      ])
    );
  }

  if (marca) s.append(el('p', 'marca', marca));
  return s;
}

/** Fichas chicas de dato: etiqueta arriba, valor grande abajo. */
function chips(items) {
  const cont = el('div', 'chips');
  for (const [k, v, u] of items) {
    if (v == null || v === '—') continue;
    const c = el('div', 'chip');
    c.append(el('span', 'chip-k', k));
    const val = el('span', 'chip-v', String(v));
    if (u) val.append(el('i', null, u));
    c.append(val);
    cont.append(c);
  }
  return cont;
}

function pintarAmbiente(fase) {
  const a = fase?.ambiente;
  if (!a) return null;

  const items = [
    ['Con luz', rango(a.temp_luz_c), '°'],
    ['Oscuridad', rango(a.temp_oscuridad_c), '°'],
    ['Humedad', rango(a.hr_pct), '%'],
    ['Diferencial', a.diferencial_c ? rango(a.diferencial_c) : null, '°'],
  ].filter(([, v]) => v != null);

  if (!items.length) return null;

  const s = seccion('Ambiente');
  s.append(chips(items));
  return s;
}

function pintarProyeccion(cultivo, resumen, ultimoRiego) {
  const s = seccion('Proyección');
  const ul = el('ul', 'proy');
  const hoy = hoyISO();

  const fila = (k, v, sub) => {
    const li = el('li');
    li.append(el('span', 'k', k));
    const val = el('span', 'v', v);
    if (sub) val.append(el('small', null, sub));
    li.append(val);
    ul.append(li);
  };

  const prox = (cultivo?.ciclo_activo?.riegos_programados || []).find((r) => r.fecha >= hoy);
  if (prox) {
    fila(
      'Riego',
      `${cuando(prox.fecha)} · ${prox.tipo}`,
      'Lo decide el peso de la maceta, no la fecha (r8).'
    );
  } else {
    fila('Riego', 'sin riegos proyectados');
  }

  fila(
    'Último riego',
    ultimoRiego ? `${fecha(ultimoRiego)} · ${cuando(ultimoRiego)}` : 'sin registro',
    ultimoRiego ? null : 'Todavía no cargaste ninguno desde acá.'
  );

  const hito = (cultivo?.ciclo_activo?.hitos || []).find(
    (h) => h.fecha >= hoy && h.estado !== 'hecho'
  );
  if (hito) fila('Próximo hito', `${cuando(hito.fecha)} · ${hito.descripcion}`);
  else if (resumen?.proximo_hito) fila('Próximo hito', resumen.proximo_hito);

  const corte = cultivo?.ciclo_activo?.fecha_corte_estimada;
  if (corte) fila('Corte estimado', fecha(corte), 'Lo define la lupa 60x, nunca el calendario (r7).');

  s.append(ul);
  return s;
}

/**
 * Lo que el plan de la fase contempla.
 *
 * Estas frases vienen en imperativo desde cultivo.json ("Instalar red entre el
 * 20 y el 22"), porque son el texto del Dossier. La app no puede reescribir tus
 * datos, pero sí puede dejar claro que está citando el plan y no dándote una
 * orden: de ahí el título y la aclaración de origen.
 */
function pintarPrevisto(fase) {
  const acciones = fase?.acciones || [];
  if (!acciones.length) return null;
  const s = seccion('Lo que el plan prevé');
  const ul = el('ul', 'mirada');
  for (const a of acciones) ul.append(el('li', null, a));
  s.append(ul);
  s.append(el('p', 'pie', `Texto del plan para la fase ${fase.id}, tal como está escrito.`));
  return s;
}

/** Pendientes con fecha límite y decisiones que esperan a Nico. */
function pintarAbiertos(cultivo, refrescar) {
  const hoy = hoyISO();

  const items = [
    ...(cultivo?.pendientes || [])
      .filter((p) => p.estado !== 'hecho')
      .sort((a, b) => String(a.fecha_limite).localeCompare(String(b.fecha_limite)))
      .map((p) => ({
        clave: `cultivo:${p.id || p.item}`,
        titulo: p.item,
        meta: [
          p.fecha_limite ? `límite ${fecha(p.fecha_limite)} · ${cuando(p.fecha_limite)}` : null,
          p.motivo,
        ]
          .filter(Boolean)
          .join(' — '),
        cerca: p.fecha_limite ? dias(hoy, p.fecha_limite) <= 21 : false,
      })),
    ...(cultivo?.decisiones_abiertas || [])
      .filter((d) => /pendiente|confirmar/i.test(d.estado || ''))
      .map((d) => ({
        clave: `cultivo:${d.id || d.tema}`,
        titulo: d.tema,
        meta: d.estado + (d.decidir_antes_de ? ` · antes del ${fecha(d.decidir_antes_de)}` : ''),
        cerca: false,
      })),
  ];

  const visibles = items.filter((i) => !estaOmitido(i.clave));
  const ocultos = items.length - visibles.length;
  if (!items.length) return null;

  const s = seccion('Requiere tu mirada');
  const ul = el('ul', 'mirada');

  for (const i of visibles) {
    const partes = [el('span', 'mirada-t', i.titulo)];
    if (i.meta) partes.push(el('small', null, i.meta));
    const li = itemOmitible(partes, () => {
      omitir(i.clave);
      refrescar();
    });
    if (i.cerca) li.classList.add('cerca');
    ul.append(li);
  }

  if (!visibles.length) s.append(el('p', 'vacio', 'Nada a la vista por hoy.'));
  else s.append(ul);

  const pie = pieOmitidos(ocultos, () => {
    restaurarTodo();
    refrescar();
  });
  if (pie) s.append(pie);

  return s;
}

function pintarReglas(cultivo) {
  const criticas = (cultivo?.reglas_no_negociables || []).filter((r) => r.criticidad === 'maxima');
  if (!criticas.length) return null;

  const s = seccion('No negociables');
  const ul = el('ul', 'reglas');
  for (const r of criticas) {
    const li = el('li');
    li.append(el('b', null, `${r.id}. `));
    li.append(document.createTextNode(r.regla));
    ul.append(li);
  }
  s.append(ul);
  return s;
}

// ---------- formulario ----------

const TIPOS = ['completo', 'intermedio', 'solo agua', 'ripening', 'flush'];

function pintarFormulario(fase, alRegistrar) {
  const s = seccion('Registrar un riego');

  const form = el('form');
  const campos = el('div', 'campos');

  const campo = (clase, etiqueta, referencia, control) => {
    const d = el('div', `campo ${clase}`);
    const l = el('label');
    l.append(document.createTextNode(etiqueta));
    if (referencia) l.append(el('span', null, `  ${referencia}`));
    l.htmlFor = control.id;
    d.append(l, control);
    campos.append(d);
  };

  const input = (id, tipo, extra = {}) => {
    const i = el('input');
    i.id = id;
    i.type = tipo;
    Object.assign(i, extra);
    return i;
  };

  const fFecha = input('r-fecha', 'date', { value: hoyISO(), required: true });
  campo('', 'Fecha', '', fFecha);

  const fTipo = el('select');
  fTipo.id = 'r-tipo';
  for (const t of TIPOS) {
    const o = el('option', null, t);
    o.value = t;
    fTipo.append(o);
  }
  campo('', 'Tipo', '', fTipo);

  // Los rangos de la fase van como referencia al lado del campo, nunca
  // precargados: vos medís y cargás lo que medís.
  const fEc = input('r-ec', 'number', { step: '0.01', inputMode: 'decimal' });
  campo('', 'EC medida', fase ? `obj. ${rango(fase.ec_objetivo)}` : '', fEc);

  const fPh = input('r-ph', 'number', { step: '0.1', inputMode: 'decimal' });
  campo('', 'pH', fase ? `obj. ${rango(fase.ph_entrada)}` : '', fPh);

  const fPpfd = input('r-ppfd', 'number', { step: '10', inputMode: 'numeric' });
  campo(
    'ancho',
    'PPFD',
    fase ? (fase.ppfd_techo ? `techo ${fase.ppfd_techo}` : `ref. ${fase.ppfd ?? '—'}`) : '',
    fPpfd
  );

  const fObs = el('textarea');
  fObs.id = 'r-obs';
  fObs.placeholder = 'Cómo pesaba la maceta, cómo se ven las hojas…';
  campo('ancho', 'Observación', '', fObs);

  const boton = el('button', 'btn', 'Registrar');
  boton.type = 'submit';

  const aviso = el('p', 'nota oculto');
  form.append(campos, boton, aviso);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    boton.disabled = true;
    aviso.classList.add('oculto');

    const num = (v) => (v === '' ? null : Number(v));
    const res = await registrar({
      fecha: fFecha.value,
      tipo: fTipo.value,
      ec: num(fEc.value),
      ph: num(fPh.value),
      ppfd: num(fPpfd.value),
      observacion: fObs.value.trim() || null,
      fase: fase?.id || null,
    });

    aviso.textContent = res.subido
      ? 'Registrado y guardado en Drive.'
      : 'Guardado en el teléfono. Sube solo en cuanto haya conexión.';
    aviso.classList.remove('oculto', 'error', 'bien');
    aviso.classList.add(res.subido ? 'bien' : 'error');

    fEc.value = fPh.value = fPpfd.value = fObs.value = '';
    boton.disabled = false;
    alRegistrar();
  });

  s.append(form);
  return s;
}

function pintarRegistros(lista, sinSubir) {
  if (!lista.length && !sinSubir.length) return null;
  const s = seccion('Últimos registros');
  const ul = el('ul', 'registros');

  const todos = [
    ...sinSubir.map((r) => ({ ...r, pendiente: true })),
    ...lista.map((r) => ({ ...r, pendiente: false })),
  ]
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .slice(0, 6);

  for (const r of todos) {
    const li = el('li');
    li.append(el('span', null, fecha(r.fecha)));
    li.append(el('span', null, r.tipo || '—'));
    if (r.ec != null) li.append(el('span', null, `EC ${r.ec}`));
    if (r.ph != null) li.append(el('span', null, `pH ${r.ph}`));
    if (r.pendiente) li.append(el('span', 'pend', 'sin subir'));
    ul.append(li);
  }

  s.append(ul);
  return s;
}

// ---------- render ----------

export async function render(main) {
  main.textContent = '';
  const aviso = cargando('Leyendo el cultivo…');
  main.append(aviso);

  let estado, cultivo, marca = null;
  try {
    const e = await conCache('estado', leerEstado);
    estado = e.datos;

    const sub = subsistema(estado, 'cultivo');
    if (!sub?.archivoId) throw new Error('estado.json no apunta a ningún archivo de cultivo');

    const c = await conCache('cultivo', () => leerJsonDeDrive(sub.archivoId));
    cultivo = c.datos;

    // Si algo salió de la copia local, hay que decirlo: un dato viejo sin
    // fecha es peor que no tener dato.
    if (!e.fresco || !c.fresco) marca = `Copia local · ${antiguedad(Math.min(e.ts, c.ts))}`;
  } catch (e) {
    aviso.remove();
    const s = seccion('🌱 Cultivo');
    s.append(el('p', 'vacio mal', e.message));
    main.append(s);
    return;
  }

  let yaSubidos = [];
  try {
    await sincronizar();
    yaSubidos = await subidos();
  } catch {
    /* sin red o sin sesión: se muestran solo los pendientes locales */
  }
  const sinSubir = pendientes();

  aviso.remove();

  const sub = subsistema(estado, 'cultivo');
  const ciclo = cultivo?.ciclo_activo;
  const hoy = hoyISO();

  const fase = (ciclo?.fases || []).find((f) => f.fecha_inicio <= hoy && hoy <= f.fecha_fin);
  const diaDeCiclo = ciclo?.fecha_inicio ? dias(ciclo.fecha_inicio, hoy) + 1 : null;

  const ultimo =
    [...sinSubir, ...yaSubidos].map((r) => r.fecha).sort().pop() ||
    sub?.resumen?.ultimo_riego ||
    null;

  const partes = [
    pintarCiclo(ciclo, fase, diaDeCiclo, marca),
    pintarMezcla(cultivo, fase),
    pintarAmbiente(fase),
    pintarProyeccion(cultivo, sub?.resumen, ultimo),
    pintarPrevisto(fase),
    pintarAbiertos(cultivo, () => render(main)),
    pintarFormulario(fase, () => render(main)),
    pintarRegistros(yaSubidos, sinSubir),
    pintarReglas(cultivo),
  ];

  for (const p of partes) if (p) main.append(p);
}
