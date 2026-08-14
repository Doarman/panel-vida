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
