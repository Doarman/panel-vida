// Plan completo del ciclo: el apéndice para consultar.
//
// No es la pantalla de todos los días —esa es Cultivo, que muestra el hoy—.
// Esto es para chequear el conjunto: cómo evoluciona la luz, cómo cambia la
// fertilización fase por fase, qué hitos vienen y qué reglas rigen.
//
// Se lee, no se opera. Por eso no hay ningún control.

import { leerEstado } from '../api.js';
import { subsistema, nombreDeGrupo } from '../contract.js';
import { el, seccion, error, cargando, plegable } from '../ui.js';
import { conCache } from '../cache.js';
import { auditarCultivo, auditarNomenclatura, hallazgosDeclarados } from '../auditoria.js';
import { cargarGrupos, grupoElegido, selectorDeGrupos } from '../cultivo-grupos.js';
import {
  hoyISO, fecha, fechaCorta, cuando, rango,
  faseDe, nombreDe, dosisOrdenadas, cicloDe, subconjuntosDe, volumenTexto, aguaBase,
} from '../cultivo-datos.js';

function pintarCabecera(cultivo) {
  const c = cicloDe(cultivo);
  const s = el('section', 'ciclo tarjeta');
  s.append(el('p', 'ciclo-n', 'Plan del ciclo'));
  s.append(el('h3', 'ciclo-f', c?.nombre || 'Sin ciclo activo'));

  const partes = [];
  if (c?.fecha_flip_planificada) partes.push(`Flip ${fechaCorta(c.fecha_flip_planificada)}`);
  if (c?.duracion_floracion_semanas) partes.push(`${c.duracion_floracion_semanas} semanas de flor`);
  if (c?.fecha_corte_estimada) partes.push(`corte ~${fechaCorta(c.fecha_corte_estimada)}`);
  s.append(el('p', 'ciclo-d', partes.join(' · ')));

  if (c?.fecha_corte_criterio) s.append(el('p', 'nota', c.fecha_corte_criterio));
  return s;
}

/** Cada fase en una tarjeta compacta: luz, agua y qué lleva la mezcla. */
function pintarFases(cultivo) {
  const fases = cicloDe(cultivo)?.fases || [];
  if (!fases.length) return null;

  const actual = faseDe(cultivo);
  const subs = subconjuntosDe(cultivo);
  const s = seccion('Fases');

  for (const f of fases) {
    const b = el('div', `fase ${f.tipo === 'floracion' ? 'flor' : 'veg'}`);
    if (actual && f.id === actual.id) b.classList.add('actual');

    const cab = el('div', 'fase-h');
    cab.append(el('span', 'fase-id', f.id));
    cab.append(el('span', 'fase-n', f.nombre));
    cab.append(el('span', 'fase-f', `${fechaCorta(f.fecha_inicio)}–${fechaCorta(f.fecha_fin)}`));
    b.append(cab);

    // Con subconjuntos, el PPFD de cada uno cuando difiere: la excepción de
    // las veteranas en S1-S2 tiene que verse, no quedar escondida en el grupo.
    const porSub = Object.entries(f.ppfd_por_subconjunto || {})
      .filter(([, x]) => x && typeof x.ppfd === 'number')
      .map(([id, x]) => `${subs.find((s) => s.id === id)?.nombre || id} ${x.ppfd}`);
    const ppfd = porSub.length
      ? `PPFD ${porSub.join(' / ')}`
      : `${f.ppfd ?? '—'} PPFD${f.ppfd_techo ? ` (techo ${f.ppfd_techo})` : ''}`;

    const datos = [
      ppfd,
      `EC ${rango(f.ec_objetivo)}`,
      `pH ${rango(f.ph_entrada)}`,
      `${volumenTexto(cultivo, f.volumen_por_maceta_l)}/maceta`,
      Array.isArray(f.drenaje_objetivo_pct) ? `drenaje ${rango(f.drenaje_objetivo_pct)} %` : null,
    ].filter(Boolean);
    b.append(el('p', 'fase-d', datos.join('  ·  ')));

    const { dosis } = dosisOrdenadas(cultivo, f);
    if (dosis.length) {
      b.append(
        el('p', 'fase-mix',
          dosis.map((d) => `${nombreDe(d.clave)} ${d.valor}`).join('   ·   '))
      );
    }

    // Flora Booster y lo que venga: una vez por fase, aparte de la mezcla (r14).
    for (const a of f.aplicaciones_evento || []) {
      const k = Object.keys(a || {}).find((x) => /^dosis_(ml|g)_l$/.test(x));
      if (!a?.producto || !k) continue;
      b.append(
        el('p', 'fase-ev',
          `${nombreDe(a.producto)} ${a[k]}${a.aplicacion_numero ? ` · aplicación ${a.aplicacion_numero}` : ''} · primer completo de la fase`)
      );
    }

    const a = f.ambiente;
    if (a) {
      const amb = [
        a.temp_luz_c ? `luz ${rango(a.temp_luz_c)}°` : null,
        a.temp_oscuridad_c ? `oscuridad ${rango(a.temp_oscuridad_c)}°` : null,
        a.hr_pct ? `HR ${rango(a.hr_pct)}%` : null,
        a.diferencial_c ? `Δ ${rango(a.diferencial_c)}°` : null,
      ].filter(Boolean);
      if (amb.length) b.append(el('p', 'fase-amb', amb.join('  ·  ')));
    }

    s.append(b);
  }
  return s;
}

function pintarRiegos(cultivo) {
  const lista = cicloDe(cultivo)?.riegos_programados || [];
  if (!lista.length) return null;

  const subs = subconjuntosDe(cultivo);
  const hoy = hoyISO();
  const s = seccion('Riegos proyectados');
  const ul = el('ul', 'tabla');

  for (const r of lista) {
    const li = el('li');
    if (r.fecha < hoy) li.classList.add('pasado');
    li.append(el('span', 'tb-f', fechaCorta(r.fecha)));
    const para = r.alcance && r.alcance !== 'todos'
      ? ` · ${subs.find((s) => s.id === r.alcance)?.nombre || r.alcance}`
      : '';
    li.append(el('span', 'tb-t', `${r.tipo}${para}`));
    li.append(el('span', 'tb-x', r.fase));
    ul.append(li);
  }

  s.append(ul);
  s.append(el('p', 'pie', 'Son proyecciones. La frecuencia real la decide el peso de la maceta (r8).'));
  return s;
}

function pintarHitos(cultivo) {
  const lista = (cicloDe(cultivo)?.hitos || []).filter((h) => h.estado !== 'hecho');
  if (!lista.length) return null;

  const hoy = hoyISO();
  const s = seccion('Hitos');
  const ol = el('ol', 'ruta');

  for (const h of lista) {
    const li = el('li', `paso ${h.fecha < hoy ? 'lejos' : 'vivo'}`);
    li.append(el('span', 'paso-t', h.descripcion));
    li.append(el('span', 'paso-e', `${fecha(h.fecha)} · ${cuando(h.fecha)}`));
    ol.append(li);
  }

  s.append(ol);
  return s;
}

/** El bloque de sanidad es nuevo en cultivo.json y no se veía en ningún lado. */
function pintarSanidad(cultivo) {
  const san = cicloDe(cultivo)?.sanidad;
  if (!san) return null;

  const s = seccion('Sanidad');

  for (const [nombre, d] of Object.entries(san)) {
    const b = el('div', 'ficha');
    const cab = el('div', 'ficha-h');
    cab.append(el('h3', 'ficha-t', nombreDe(nombre)));
    if (d.estado) cab.append(el('span', 'badge atencion', d.estado));
    b.append(cab);

    for (const p of d.plan || []) {
      b.append(el('p', 'ficha-d', `${fechaCorta(p.fecha)} · ${p.producto}${p.via ? ` (${p.via})` : ''}`));
      if (p.nota) b.append(el('p', 'ficha-sub', p.nota));
    }

    if (d.cierre_ventana_foliar) {
      b.append(el('p', 'ficha-d', `Cierre de ventana: ${fecha(d.cierre_ventana_foliar)} · ${cuando(d.cierre_ventana_foliar)}`));
    }
    if (d.despues_del_cierre) b.append(el('p', 'ficha-sub', d.despues_del_cierre));
    if (d.respaldo) b.append(el('p', 'ficha-sub', `Respaldo: ${d.respaldo}`));

    s.append(b);
  }
  return s;
}

/**
 * Grupos que todavía no se integraron.
 *
 * Salen de estado.json y no de cultivo.json: la nomenclatura de grupos la fija
 * el índice del ecosistema, y los bloques `grupos_futuros` de los archivos
 * arrastran los nombres viejos, con los que "grupo-3" era el lote de 11.
 */
function pintarSinIntegrar(estado, grupos) {
  const nombres = estado?.subsistemas?.cultivo?.nomenclatura_de_grupos || {};
  const conArchivo = new Set(grupos.map((g) => g.id));

  const lista = Object.entries(nombres).filter(
    ([id, texto]) => /^grupo-\d+$/.test(id) && typeof texto === 'string' && !conArchivo.has(id)
  );
  if (!lista.length) return null;

  const s = seccion('Todavía sin integrar');
  for (const [id, texto] of lista) {
    const f = el('div', 'ficha');
    const cab = el('div', 'ficha-h');
    cab.append(el('h3', 'ficha-t', nombreDeGrupo(id)));
    f.append(cab);
    f.append(el('p', 'ficha-d', texto));
    s.append(f);
  }
  return s;
}

/** Lo observado en las plantas, crudo. Hoy: la veterana con amarillamiento. */
function pintarObservaciones(cultivo) {
  const lista = (cicloDe(cultivo)?.observaciones || []).filter((o) => o?.observacion);
  if (!lista.length) return null;

  const s = seccion('Observaciones');
  for (const o of lista) {
    const b = el('div', 'ficha');
    const cab = el('div', 'ficha-h');
    cab.append(el('h3', 'ficha-t', o.fecha ? fecha(o.fecha) : 'Sin fecha'));
    if (o.estado) cab.append(el('span', 'badge atencion', o.estado));
    b.append(cab);
    b.append(el('p', 'ficha-d', o.observacion));
    s.append(b);
  }
  return s;
}

/**
 * El agua de red ya trae EC.
 *
 * Vive acá y no al lado de las dosis: se lee una vez y cambia cómo se
 * interpretan todos los objetivos de EC del ciclo. Sin esto, el objetivo de
 * la fase se lee como si fuera aporte de nutrientes y la mezcla termina por
 * encima de lo buscado.
 */
function pintarAgua(cultivo) {
  const a = aguaBase(cultivo);
  if (!a) return null;

  const s = seccion('El agua de red');
  const linea = [`EC ${a.ec}`, a.ph != null ? `pH ${a.ph}` : null].filter(Boolean).join('  ·  ');
  s.append(el('p', 'fase-d', linea));
  if (a.nota) s.append(el('p', 'pie', a.nota));
  return s;
}

function pintarMezclaOrden(cultivo) {
  const orden = cultivo?.orden_de_mezcla || [];
  if (!orden.length) return null;

  const s = seccion('Orden de mezcla');
  const ol = el('ol', 'pasos');
  for (const p of orden) ol.append(el('li', null, p));
  s.append(ol);
  return s;
}

function pintarReglas(cultivo) {
  const lista = cultivo?.reglas_no_negociables || [];
  if (!lista.length) return null;

  const s = seccion('Reglas no negociables');
  const ul = el('ul', 'reglas');

  for (const r of lista) {
    const li = el('li');
    if (r.criticidad === 'maxima') li.classList.add('critica');
    li.append(el('b', null, `${r.id}. `));
    li.append(document.createTextNode(r.regla));
    if (r.origen) li.append(el('small', null, r.origen));
    ul.append(li);
  }

  s.append(ul);
  return s;
}

function pintarEstimados(cultivo) {
  const lista = cultivo?.datos_estimados || [];
  if (!lista.length) return null;

  const s = seccion('Datos estimados, no medidos');
  const ul = el('ul', 'reglas');
  for (const d of lista) {
    const li = el('li');
    li.append(el('b', null, `${d.dato}: `));
    li.append(document.createTextNode(d.valor ? `${d.valor} — ${d.estado}` : d.estado));
    ul.append(li);
  }
  s.append(ul);
  s.append(el('p', 'pie', 'Lo que figura acá no está medido. Conviene no operar como si lo estuviera.'));
  return s;
}

/**
 * Contradicciones del archivo consigo mismo.
 *
 * Vive en el plan y no en la pantalla de todos los días: es consulta sobre el
 * archivo, no una pregunta del sustrato. Existe porque el archivo se regenera
 * desde bases anteriores y las correcciones se pierden; ya pasó tres veces.
 */
function pintarAuditoria(cultivo, estado) {
  const items = [
    ...hallazgosDeclarados(estado),
    ...auditarNomenclatura(estado, cultivo),
    ...auditarCultivo(cultivo, hoyISO()),
  ];
  if (!items.length) return null;

  const s = seccion('El archivo se contradice');
  const ul = el('ul', 'mirada');
  for (const i of items) ul.append(el('li', 'mirada-t', i.texto));
  s.append(ul);
  s.append(el('p', 'pie', 'Son incoherencias del archivo, no del cultivo.'));
  return s;
}

/**
 * Cada apartado, plegado y con cuántos trae.
 *
 * El plan entero son nueve mil píxeles de scroll: leerlo de corrido no lo hace
 * nadie y buscar algo adentro es peor. Plegado se vuelve un índice —se ve todo
 * lo que hay de una— y se abre solo lo que se fue a buscar. El título sale del
 * propio apartado, así no hay dos nombres para lo mismo.
 */
function plegarApartado(nodo, cuantos = null) {
  if (!nodo) return null;
  const t = nodo.querySelector(':scope > .titulo');
  const titulo = t?.textContent || 'Ver';
  t?.remove();
  return plegable(cuantos ? `${titulo} · ${cuantos}` : titulo, nodo, 'apartado');
}

export async function render(main) {
  main.textContent = '';
  const aviso = cargando('Leyendo el plan…');
  main.append(aviso);

  let grupos, estadoLeido = null;
  try {
    estadoLeido = (await conCache('estado', leerEstado)).datos;
    grupos = await cargarGrupos(subsistema(estadoLeido, 'cultivo'));
  } catch (e) {
    aviso.remove();
    main.append(error('Plan', e));
    return;
  }

  aviso.remove();

  // El mismo grupo que se estaba mirando en Cultivo: el plan es su apéndice.
  const g = grupoElegido(grupos);
  const selector = selectorDeGrupos(grupos, g, () => render(main));
  if (selector) main.append(selector);

  const volver = el('a', 'boton-enlace', '← Volver a Cultivo');
  volver.href = '#/cultivo';

  if (!g.cultivo) {
    main.append(error(g.etiqueta, g.error || new Error('No se pudo leer el archivo de este grupo.')));
    main.append(volver);
    return;
  }

  const { cultivo } = g;
  const ciclo = cicloDe(cultivo);
  const cuantos = (x) => (Array.isArray(x) && x.length ? x.length : null);

  // El ciclo y lo que se contradice quedan abiertos: son las dos cosas que se
  // vienen a ver sin buscarlas. El resto es consulta y se abre a pedido.
  const secciones = [
    { armar: () => pintarCabecera(cultivo), fijo: true },
    { armar: () => pintarAuditoria(cultivo, estadoLeido), fijo: true },
    { armar: () => pintarObservaciones(cultivo), n: cuantos(ciclo?.observaciones) },
    { armar: () => pintarFases(cultivo), n: cuantos(ciclo?.fases) },
    { armar: () => pintarRiegos(cultivo), n: cuantos(ciclo?.riegos_programados) },
    { armar: () => pintarHitos(cultivo), n: cuantos((ciclo?.hitos || []).filter((h) => h.estado !== 'hecho')) },
    { armar: () => pintarSanidad(cultivo) },
    { armar: () => pintarSinIntegrar(estadoLeido, grupos) },
    { armar: () => pintarAgua(cultivo) },
    { armar: () => pintarMezclaOrden(cultivo) },
    { armar: () => pintarReglas(cultivo), n: cuantos(cultivo?.reglas_no_negociables) },
    { armar: () => pintarEstimados(cultivo), n: cuantos(cultivo?.datos_estimados) },
  ];

  // Igual que en Cultivo: una sección que falla no se lleva puesta la pantalla.
  for (const { armar, fijo, n } of secciones) {
    try {
      const nodo = armar();
      if (nodo) main.append(fijo ? nodo : plegarApartado(nodo, n));
    } catch (e) {
      main.append(error('Plan', e));
    }
  }
  main.append(volver);
}
