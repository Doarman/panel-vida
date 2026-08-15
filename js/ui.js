// Piezas de interfaz compartidas por las vistas.
//
// Todo el texto entra por textContent, nunca por innerHTML: buena parte de lo
// que se muestra viene de archivos que escribe otro sistema, y no tiene por
// qué poder inyectar nada.

export function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
}

export function seccion(titulo) {
  const s = el('section', 'bloque');
  if (titulo) s.append(el('h2', 'titulo', titulo));
  return s;
}

export function error(titulo, e) {
  const s = seccion(titulo);
  s.append(el('p', 'vacio mal', e?.message || String(e)));
  return s;
}

export function cargando(texto) {
  return el('p', 'cargando', texto);
}

/**
 * Etiqueta de estado. Los estados los escribe Cowork en texto libre, así que
 * se clasifican por lo que contienen y cualquier valor desconocido cae en
 * neutro en vez de romper.
 */
export function badge(estado) {
  const t = String(estado || '').toLowerCase();
  let tono = 'neutro';
  if (/activo|en curso|cursando/.test(t)) tono = 'vivo';
  else if (/evaluando|pendiente|a confirmar/.test(t)) tono = 'atencion';
  else if (/aplazado|diferido|futuro|a definir/.test(t)) tono = 'lejos';
  const b = el('span', `badge ${tono}`, estado);
  return b;
}

/**
 * Item de una lista que se puede ocultar por hoy.
 *
 * El botón dice "ocultar", no "listo": la app no audita si lo hiciste.
 *
 * Se quita del DOM solo, sin redibujar la pantalla. Antes disparaba un
 * re-render completo: la vista volvía a pedir los datos, saltaba al principio y
 * perdías dónde estabas, todo para sacar una línea.
 */
export function itemOmitible(contenido, alOcultar) {
  const li = el('li', 'omitible');
  const cuerpo = el('div', 'omitible-c');
  for (const n of [].concat(contenido)) cuerpo.append(n);

  const x = el('button', 'ocultar', '×');
  x.type = 'button';
  x.title = 'Ocultar por hoy';
  x.setAttribute('aria-label', 'Ocultar por hoy');

  const quitar = () => {
    if (li.classList.contains('yendose')) return;
    li.classList.add('yendose');
    setTimeout(() => {
      const lista = li.parentElement;
      li.remove();
      alOcultar(lista);
    }, 180);
  };

  x.addEventListener('click', quitar);
  li.append(cuerpo, x);
  return li;
}

/**
 * Pie para volver a mostrar lo ocultado.
 * Se actualiza solo; no hace falta redibujar la sección para que el número
 * cambie. Restaurar sí redibuja, porque los items tienen que volver.
 */
export function pieOmitidos(contar, alRestaurar) {
  const b = el('button', 'enlace comoBoton');
  b.type = 'button';
  b.addEventListener('click', alRestaurar);

  const actualizar = () => {
    const n = contar();
    b.textContent = `${n} oculto${n === 1 ? '' : 's'} hoy · mostrar`;
    b.classList.toggle('oculto', n === 0);
  };

  actualizar();
  return { nodo: b, actualizar };
}

/** Fila etiqueta/valor, con un subtexto opcional. */
export function fila(lista, k, v, sub) {
  const li = el('li');
  li.append(el('span', 'k', k));
  const val = el('span', 'v', v);
  if (sub) val.append(el('small', null, sub));
  li.append(val);
  lista.append(li);
  return li;
}
