// Plan completo del ciclo: el apéndice para consultar.
//
// No es la pantalla de todos los días —esa es Cultivo, que muestra el hoy—.
// Esto es para chequear el conjunto: cómo evoluciona la luz, cómo cambia la
// fertilización fase por fase, qué hitos vienen y qué reglas rigen.
//
// Se lee, no se opera. Por eso no hay ningún control.

import { leerEstado, leerArchivoDeSubsistema } from '../api.js';
import { subsistema } from '../contract.js';
import { el, seccion, error, cargando } from '../ui.js';
import { conCache } from '../cache.js';
import {
  hoyISO, fecha, fechaCorta, cuando, rango,
  faseDe, nombreDe, dosisOrdenadas,
} from '../cultivo-datos.js';

function pintarCabecera(cultivo) {
  const c = cultivo?.ciclo_activo;
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
  const fases = cultivo?.ciclo_activo?.fases || [];
  if (!fases.length) return null;

  const actual = faseDe(cultivo);
  const s = seccion('Fases');

  for (const f of fases) {
    const b = el('div', `fase ${f.tipo === 'floracion' ? 'flor' : 'veg'}`);
    if (actual && f.id === actual.id) b.classList.add('actual');

    const cab = el('div', 'fase-h');
    cab.append(el('span', 'fase-id', f.id));
    cab.append(el('span', 'fase-n', f.nombre));
    cab.append(el('span', 'fase-f', `${fechaCorta(f.fecha_inicio)}–${fechaCorta(f.fecha_fin)}`));
    b.append(cab);

    const datos = [
      `${f.ppfd ?? '—'} PPFD${f.ppfd_techo ? ` (techo ${f.ppfd_techo})` : ''}`,
      `EC ${rango(f.ec_objetivo)}`,
      `pH ${rango(f.ph_entrada)}`,
      `${rango(f.volumen_por_maceta_l)} L/maceta`,
    ];
    b.append(el('p', 'fase-d', datos.join('  ·  ')));

    const { dosis } = dosisOrdenadas(cultivo, f);
    if (dosis.length) {
      b.append(
        el('p', 'fase-mix',
          dosis.map((d) => `${nombreDe(d.clave)} ${d.valor}`).join('   ·   '))
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
  const lista = cultivo?.ciclo_activo?.riegos_programados || [];
  if (!lista.length) return null;

  const hoy = hoyISO();
  const s = seccion('Riegos proyectados');
  const ul = el('ul', 'tabla');

  for (const r of lista) {
    const li = el('li');
    if (r.fecha < hoy) li.classList.add('pasado');
    li.append(el('span', 'tb-f', fechaCorta(r.fecha)));
    li.append(el('span', 'tb-t', r.tipo));
    li.append(el('span', 'tb-x', r.fase));
    ul.append(li);
  }

  s.append(ul);
  s.append(el('p', 'pie', 'Son proyecciones. La frecuencia real la decide el peso de la maceta (r8).'));
  return s;
}

function pintarHitos(cultivo) {
  const lista = (cultivo?.ciclo_activo?.hitos || []).filter((h) => h.estado !== 'hecho');
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
  const san = cultivo?.ciclo_activo?.sanidad;
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

export async function render(main) {
  main.textContent = '';
  const aviso = cargando('Leyendo el plan…');
  main.append(aviso);

  let cultivo;
  try {
    const estado = (await conCache('estado', leerEstado)).datos;
    const sub = subsistema(estado, 'cultivo');
    if (!sub?.archivoId && !sub?.ruta) {
      throw new Error('estado.json no apunta a ningún archivo de cultivo');
    }
    const c = await conCache('cultivo', () => leerArchivoDeSubsistema(sub));
    cultivo = c.datos.datos; // conCache envuelve; leerArchivoDeSubsistema también
  } catch (e) {
    aviso.remove();
    main.append(error('Plan', e));
    return;
  }

  aviso.remove();

  const volver = el('a', 'boton-enlace', '← Volver a Cultivo');
  volver.href = '#/cultivo';

  const partes = [
    pintarCabecera(cultivo),
    pintarFases(cultivo),
    pintarRiegos(cultivo),
    pintarHitos(cultivo),
    pintarSanidad(cultivo),
    pintarMezclaOrden(cultivo),
    pintarReglas(cultivo),
    pintarEstimados(cultivo),
    volver,
  ];

  for (const p of partes) if (p) main.append(p);
}
