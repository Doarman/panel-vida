// Pantalla Hoy: el día y lo que pide mirada.
//
// Cada sección se dibuja por su cuenta: si Gmail falla, la agenda igual se ve.
// Todo el texto entra por textContent, nunca por innerHTML: los asuntos de
// correo son texto ajeno y no tienen por qué poder inyectar nada.

import { CONFIG } from '../../config.js';
import { eventosDeHoy, correoParaMirar, leerEstado } from '../api.js';
import { mapaDeColores, clasificar, alertas } from '../contract.js';
import { el, seccion, error as pintarError, cargando, itemOmitible, pieOmitidos } from '../ui.js';
import { conCache, antiguedad } from '../cache.js';
import { estaOmitido, omitir, restaurarTodo } from '../omitidos.js';

// ---------- helpers de tiempo ----------

const fmtHora = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: CONFIG.TZ,
});

const hora = (iso) => fmtHora.format(new Date(iso));

/** Un evento normalizado: los de todo el día no traen hora. */
function normalizar(ev) {
  const todoElDia = Boolean(ev.start?.date);
  const inicio = new Date(ev.start?.dateTime || `${ev.start?.date}T00:00:00`);
  const fin = new Date(ev.end?.dateTime || `${ev.end?.date}T00:00:00`);
  return { ev, todoElDia, inicio, fin };
}

function estadoTemporal({ inicio, fin }, ahora) {
  if (ahora >= fin) return 'pasado';
  if (ahora >= inicio) return 'actual';
  return 'futuro';
}

// ---------- secciones ----------

function pintarAhora(items, ahora) {
  const actual = items.find((i) => estadoTemporal(i, ahora) === 'actual' && !i.todoElDia);
  const siguiente = items.find((i) => estadoTemporal(i, ahora) === 'futuro' && !i.todoElDia);
  const foco = actual || siguiente;

  if (!foco) return null;

  const s = el('section', `ahora t-${foco.clase.tipo}`);
  s.append(el('p', 'ahora-et', actual ? 'Ahora' : 'Lo que sigue'));
  s.append(el('h2', 'ahora-t', foco.ev.summary || 'Sin título'));

  const meta = [`${hora(foco.inicio)} – ${hora(foco.fin)}`];
  if (foco.clase.etiqueta) meta.push(foco.clase.etiqueta);
  s.append(el('p', 'ahora-m', meta.join(' · ')));

  if (actual) {
    const total = foco.fin - foco.inicio;
    const pct = total > 0 ? Math.min(100, Math.max(0, ((ahora - foco.inicio) / total) * 100)) : 0;
    const barra = el('div', 'barra');
    const relleno = el('i');
    barra.append(relleno);
    s.append(barra);
    // El ancho se aplica después del primer cuadro; si no, el navegador no ve
    // un cambio y la transición de CSS no llega a dispararse.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      relleno.style.width = `${pct.toFixed(1)}%`;
    }));
  }

  return s;
}

function pintarAgenda(items, ahora) {
  const s = seccion('El día');

  if (!items.length) {
    s.append(el('p', 'vacio', 'No hay bloques en el calendario para hoy.'));
    return s;
  }

  const lista = el('ol', 'linea');

  for (const it of items) {
    const cuando = estadoTemporal(it, ahora);
    const li = el('li', `ev t-${it.clase.tipo} ${cuando}`);

    li.append(el('time', 'ev-h', it.todoElDia ? '—' : hora(it.inicio)));

    const cuerpo = el('div', 'ev-c');
    cuerpo.append(el('p', 'ev-t', it.ev.summary || 'Sin título'));

    const meta = [];
    if (!it.todoElDia) meta.push(`hasta ${hora(it.fin)}`);
    else meta.push('todo el día');
    if (it.clase.etiqueta) meta.push(it.clase.etiqueta);
    cuerpo.append(el('p', 'ev-m', meta.join(' · ')));

    li.append(cuerpo);
    lista.append(li);
  }

  s.append(lista);
  return s;
}

// Hoy es un vistazo, no el detalle: se muestran unas pocas y el resto vive en
// la sección de cada subsistema. Repetir la lista entera en las dos pantallas
// era decir dos veces lo mismo.
const TOPE_MIRADA = 3;

function pintarMirada(lista, refrescar) {
  if (!lista.length) return null;

  const visibles = lista.filter((a) => !estaOmitido(`${a.origen}:${a.texto}`));
  const ocultos = lista.length - visibles.length;

  const s = seccion('Requiere tu mirada');
  const ul = el('ul', 'mirada');

  for (const a of visibles.slice(0, TOPE_MIRADA)) {
    ul.append(
      itemOmitible([el('span', 'orig', a.origen), el('span', 'mirada-t', a.texto)], () => {
        omitir(`${a.origen}:${a.texto}`);
        refrescar();
      })
    );
  }

  if (!visibles.length) s.append(el('p', 'vacio', 'Nada a la vista por hoy.'));
  else s.append(ul);

  const resto = visibles.length - TOPE_MIRADA;
  if (resto > 0) {
    const a = el('a', 'enlace', `${resto} más en ${visibles[TOPE_MIRADA].origen} →`);
    a.href = `#/${visibles[TOPE_MIRADA].origen}`;
    s.append(a);
  }

  const pie = pieOmitidos(ocultos, () => {
    restaurarTodo();
    refrescar();
  });
  if (pie) s.append(pie);

  return s;
}

function pintarCorreo({ mensajes, ocultos }) {
  const s = seccion('Correo');

  if (!mensajes.length) {
    s.append(el('p', 'vacio', 'Nada sin leer en los últimos días.'));
    return s;
  }

  const ul = el('ul', 'correo');
  for (const m of mensajes) {
    const li = el('li', m.masivo ? 'masivo' : '');
    const fila = el('div', 'correo-h');
    fila.append(el('span', 'de', m.de));
    if (m.masivo) fila.append(el('span', 'tag', 'envío masivo'));
    li.append(fila);
    li.append(el('p', 'asunto', m.asunto));
    ul.append(li);
  }
  s.append(ul);

  if (ocultos > 0) {
    s.append(el('p', 'pie', `${ocultos} más sin leer.`));
  }
  return s;
}

// ---------- render ----------

export async function render(main) {
  main.textContent = '';
  const aviso = cargando('Leyendo tu día…');
  main.append(aviso);

  const ahora = new Date();

  // Las tres fuentes en paralelo y tolerando fallas por separado: que Gmail se
  // caiga no tiene por qué llevarse puesta la agenda. Cada una cae a su copia
  // local si la red o la sesión no responden.
  const [evRes, mailRes, estRes] = await Promise.allSettled([
    conCache('eventos', eventosDeHoy),
    conCache('correo', correoParaMirar),
    conCache('estado', leerEstado),
  ]);

  aviso.remove();

  // Si algo salió de la copia local hay que decirlo: un dato viejo sin fecha
  // es peor que no tener dato.
  const viejos = [evRes, mailRes, estRes]
    .filter((r) => r.status === 'fulfilled' && !r.value.fresco)
    .map((r) => r.value.ts);
  if (viejos.length) {
    main.append(el('p', 'marca suelta', `Copia local · ${antiguedad(Math.min(...viejos))}`));
  }

  const estado = estRes.status === 'fulfilled' ? estRes.value.datos : null;
  const mapa = mapaDeColores(estado);

  if (evRes.status === 'fulfilled') {
    const items = evRes.value.datos
      .map(normalizar)
      .map((i) => ({ ...i, clase: clasificar(i.ev, mapa) }))
      .sort((a, b) => a.inicio - b.inicio);

    const foco = pintarAhora(items, ahora);
    if (foco) main.append(foco);
    main.append(pintarAgenda(items, ahora));
  } else {
    main.append(pintarError('El día', evRes.reason));
  }

  if (estado) {
    const m = pintarMirada(alertas(estado), () => render(main));
    if (m) main.append(m);
  }

  main.append(
    mailRes.status === 'fulfilled'
      ? pintarCorreo(mailRes.value.datos)
      : pintarError('Correo', mailRes.reason)
  );
}
