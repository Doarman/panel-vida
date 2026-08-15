// Bloques de lo académico: tesis, lo que cursa y el pipeline de formación.
//
// No tiene pantalla propia: se compone dentro de Rumbo junto con lo laboral.
// Igual que en el resto, nada de instrucciones: la tesis muestra su estado y
// sus bloques protegidos; no dice cuánto habría que avanzar.

import { subsistema } from '../contract.js';
import { el, seccion, badge } from '../ui.js';

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

  if (t.nota) s.append(el('p', 'nota', t.nota));
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

export function secciones(estado) {
  const sub = subsistema(estado, 'academico');
  if (!sub) return [];
  const r = sub.resumen;
  return [pintarTesis(r.tesis), pintarCursando(r.cursando), pintarPipeline(r.pipeline_formacion)].filter(
    Boolean
  );
}
