// Pantalla Académico: tesis, lo que está cursando y el pipeline de formación.
//
// Igual que en el resto: nada de instrucciones. La tesis muestra su estado y
// sus bloques protegidos; no dice cuánto habría que avanzar.

import { leerEstado } from '../api.js';
import { subsistema } from '../contract.js';
import { el, seccion, error, cargando, badge } from '../ui.js';
import { conCache } from '../cache.js';

function pintarTesis(t) {
  if (!t) return null;
  const s = el('section', 'ciclo tarjeta');
  s.append(el('p', 'ciclo-n', 'Tesis'));
  s.append(el('h3', 'ciclo-f', t.estado || 'Sin estado'));

  const meta = [];
  if (t.deadline) meta.push(`Entrega: ${t.deadline}`);
  if (t.avance_pct != null) meta.push(`${t.avance_pct}% de avance`);
  if (!meta.length) meta.push('Sin fecha de entrega definida');
  s.append(el('p', 'ciclo-d', meta.join(' · ')));

  if (t.nota) {
    const n = el('p', 'nota', t.nota);
    s.append(n);
  }
  return s;
}

function pintarCursando(c) {
  if (!c) return null;
  const s = seccion('Cursando');
  const f = el('div', 'ficha');

  const cab = el('div', 'ficha-h');
  cab.append(el('h3', 'ficha-t', c.nombre || 'Sin nombre'));
  if (c.estado) cab.append(badge(c.estado));
  f.append(cab);

  if (c.cursada) f.append(el('p', 'ficha-d', `Cursada: ${c.cursada}`));
  s.append(f);
  return s;
}

function pintarPipeline(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const s = seccion('Pipeline de formación');

  for (const it of lista) {
    const f = el('div', 'ficha');

    const cab = el('div', 'ficha-h');
    cab.append(el('h3', 'ficha-t', it.nombre || 'Sin nombre'));
    if (it.estado) cab.append(badge(it.estado));
    f.append(cab);

    if (it.area) f.append(el('p', 'ficha-et', it.area));

    const detalles = [it.institucion, it.modalidad].filter(Boolean);
    if (detalles.length) f.append(el('p', 'ficha-d', detalles.join(' · ')));
    if (it.costo) f.append(el('p', 'ficha-d', `Costo: ${it.costo}`));

    s.append(f);
  }
  return s;
}

export async function render(main) {
  main.textContent = '';
  main.append(cargando('Leyendo lo académico…'));

  let estado;
  try {
    estado = (await conCache('estado', leerEstado)).datos;
  } catch (e) {
    main.textContent = '';
    main.append(error('📕 Académico', e));
    return;
  }

  main.textContent = '';
  const sub = subsistema(estado, 'academico');

  if (!sub) {
    const s = seccion('📕 Académico');
    s.append(el('p', 'vacio', 'El subsistema no está activo en estado.json.'));
    main.append(s);
    return;
  }

  const r = sub.resumen;
  for (const parte of [pintarTesis(r.tesis), pintarCursando(r.cursando), pintarPipeline(r.pipeline_formacion)]) {
    if (parte) main.append(parte);
  }
}
