// Bloques de lo laboral: eje profesional, proyectos activos y hoja de ruta.
//
// No tiene pantalla propia: se compone dentro de Rumbo junto con lo académico.

import { subsistema } from '../contract.js';
import { el, seccion, badge } from '../ui.js';

function pintarEje(objetivo) {
  if (!objetivo) return null;
  const s = el('section', 'ciclo tarjeta');
  s.append(el('p', 'ciclo-n', 'Eje profesional'));
  s.append(el('h3', 'ciclo-f', objetivo));
  return s;
}

function pintarProyectos(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const s = seccion('Proyectos');

  for (const p of lista) {
    const f = el('div', 'ficha');

    const cab = el('div', 'ficha-h');
    cab.append(el('h3', 'ficha-t', p.nombre || 'Sin nombre'));
    if (p.estado) cab.append(badge(p.estado));
    f.append(cab);

    if (p.rol) f.append(el('p', 'ficha-et', p.rol));
    if (p.descripcion) f.append(el('p', 'ficha-d', p.descripcion));

    s.append(f);
  }
  return s;
}

/** La hoja de ruta es una secuencia: se dibuja como recorrido, no como lista. */
function pintarRuta(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const s = seccion('Hoja de ruta');
  const ol = el('ol', 'ruta');

  for (const h of lista) {
    const t = String(h.estado || '').toLowerCase();
    let tono = 'neutro';
    if (/activo|en curso/.test(t)) tono = 'vivo';
    else if (/evaluando|pendiente/.test(t)) tono = 'atencion';
    else if (/aplazado|diferido|futuro/.test(t)) tono = 'lejos';

    const li = el('li', `paso ${tono}`);
    li.append(el('span', 'paso-t', h.hito || 'Sin nombre'));
    if (h.estado) li.append(el('span', 'paso-e', h.estado));
    ol.append(li);
  }

  s.append(ol);
  return s;
}

export function secciones(estado) {
  const sub = subsistema(estado, 'laboral');
  if (!sub) return [];
  const r = sub.resumen;
  return [pintarEje(r.objetivo), pintarProyectos(r.proyectos), pintarRuta(r.hoja_de_ruta)].filter(
    Boolean
  );
}
