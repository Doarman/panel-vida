// Pantalla Hoy: la semana, el bloque en curso y lo que pide mirada.
//
// Muestra siete días y no solo hoy porque el calendario lo escribe Claude con
// anticipación: ver lo que viene sirve más que confirmar que hoy está vacío.
//
// Cada sección se dibuja por su cuenta: si Gmail falla, la agenda igual se ve.
// Todo el texto entra por textContent, nunca por innerHTML: los asuntos de
// correo son texto ajeno y no tienen por qué poder inyectar nada.

import { CONFIG } from '../../config.js';
import { eventosDeLaSemana, correoParaMirar, leerEstado } from '../api.js';
import { mapaDeColores, claseDefecto, clasificar, alertas } from '../contract.js';
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

const dosDig = (n) => String(n).padStart(2, '0');
const claveDia = (d) => `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`;

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

// ---------- tira de la semana ----------

const LETRAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function pintarSemana(porDia, elegido, alElegir) {
  const cont = el('nav', 'semana');
  cont.setAttribute('aria-label', 'Días de la semana');
  const hoy = claveDia(new Date());

  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const clave = claveDia(d);
    const items = porDia.get(clave) || [];

    const b = el('button', 'dia');
    b.type = 'button';
    if (clave === hoy) b.classList.add('hoy');
    if (clave === elegido) b.classList.add('elegido');

    b.append(el('span', 'dia-l', LETRAS[d.getDay()]));
    b.append(el('span', 'dia-n', String(d.getDate())));

    // Un punto por bloque, con el color de su tipo: se ve la carga del día
    // sin leer nada.
    const pts = el('span', 'dia-pts');
    for (const it of items.slice(0, 4)) {
      pts.append(el('i', `t-${it.clase.tipo}`));
    }
    b.append(pts);

    b.addEventListener('click', () => alElegir(clave));
    cont.append(b);
  }

  return cont;
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
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        relleno.style.width = `${pct.toFixed(1)}%`;
      })
    );
  }

  return s;
}

function pintarAgenda(items, ahora, esHoy) {
  const s = seccion(esHoy ? 'El día' : 'Ese día');

  if (!items.length) {
    s.append(el('p', 'vacio', 'No hay bloques en el calendario.'));
    return s;
  }

  const lista = el('ol', 'linea');

  for (const it of items) {
    const cuando = esHoy ? estadoTemporal(it, ahora) : 'futuro';
    const li = el('li', `ev t-${it.clase.tipo} ${cuando}`);

    li.append(el('time', 'ev-h', it.todoElDia ? '—' : hora(it.inicio)));

    const cuerpo = el('div', 'ev-c');
    cuerpo.append(el('p', 'ev-t', it.ev.summary || 'Sin título'));

    const meta = [it.todoElDia ? 'todo el día' : `hasta ${hora(it.fin)}`];
    if (it.clase.etiqueta) meta.push(it.clase.etiqueta);
    cuerpo.append(el('p', 'ev-m', meta.join(' · ')));

    li.append(cuerpo);
    lista.append(li);
  }

  s.append(lista);
  return s;
}

// Hoy es un vistazo, no el detalle: se muestran unas pocas y el resto vive en
// la sección de cada subsistema.
const TOPE_MIRADA = 3;

// Los subsistemas de estado.json no son uno a uno con las pestañas: lo
// académico y lo laboral comparten la pantalla Rumbo.
const RUTA_DE = { cultivo: 'cultivo', academico: 'rumbo', laboral: 'rumbo' };

function pintarMirada(lista, refrescar) {
  if (!lista.length) return null;

  const clave = (a) => `${a.origen}:${a.texto}`;
  const visibles = lista.filter((a) => !estaOmitido(clave(a)));

  const s = seccion('Requiere tu mirada');
  const ul = el('ul', 'mirada');

  const pie = pieOmitidos(
    () => lista.filter((a) => estaOmitido(clave(a))).length,
    () => {
      restaurarTodo();
      refrescar();
    }
  );

  const vacio = el('p', 'vacio oculto', 'Nada a la vista por hoy.');

  for (const a of visibles.slice(0, TOPE_MIRADA)) {
    ul.append(
      itemOmitible([el('span', 'orig', a.etiqueta || a.origen), el('span', 'mirada-t', a.texto)], (contenedor) => {
        omitir(clave(a));
        pie.actualizar();
        vacio.classList.toggle('oculto', Boolean(contenedor?.children.length));
      })
    );
  }

  if (!visibles.length) vacio.classList.remove('oculto');
  s.append(ul, vacio);

  const resto = visibles.length - TOPE_MIRADA;
  if (resto > 0) {
    const origen = visibles[TOPE_MIRADA].origen;
    const a = el('a', 'enlace', `${resto} más en ${origen} →`);
    a.href = `#/${RUTA_DE[origen] || 'hoy'}`;
    s.append(a);
  }

  s.append(pie.nodo);
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

  if (ocultos > 0) s.append(el('p', 'pie', `${ocultos} más sin leer.`));
  return s;
}

// ---------- render ----------

// Qué día está elegido en la tira. Vive fuera del render para que no se pierda
// al redibujar por ocultar un aviso.
let diaElegido = null;

export async function render(main) {
  main.textContent = '';
  const aviso = cargando('Leyendo tu semana…');
  main.append(aviso);

  const ahora = new Date();
  const hoy = claveDia(ahora);

  // Las tres fuentes en paralelo y tolerando fallas por separado: que Gmail se
  // caiga no tiene por qué llevarse puesta la agenda. Cada una cae a su copia
  // local si la red o la sesión no responden.
  const [evRes, mailRes, estRes] = await Promise.allSettled([
    conCache('eventos', () => eventosDeLaSemana(7)),
    conCache('correo', correoParaMirar),
    conCache('estado', leerEstado),
  ]);

  aviso.remove();

  const viejos = [evRes, mailRes, estRes]
    .filter((r) => r.status === 'fulfilled' && !r.value.fresco)
    .map((r) => r.value.ts);
  if (viejos.length) {
    main.append(el('p', 'marca suelta', `Copia local · ${antiguedad(Math.min(...viejos))}`));
  }

  const estado = estRes.status === 'fulfilled' ? estRes.value.datos : null;
  const mapa = mapaDeColores(estado);
  const defecto = claseDefecto(estado);

  if (evRes.status === 'fulfilled') {
    const items = evRes.value.datos
      .map(normalizar)
      .map((i) => ({ ...i, clase: clasificar(i.ev, mapa, defecto) }))
      .sort((a, b) => a.inicio - b.inicio);

    const porDia = new Map();
    for (const it of items) {
      const k = claveDia(it.inicio);
      if (!porDia.has(k)) porDia.set(k, []);
      porDia.get(k).push(it);
    }

    // Un día vacío también se puede elegir; lo que no vale es un día fuera de
    // la ventana (pasa si la app quedó abierta de un día para el otro).
    const ventana = new Set();
    for (let i = 0; i < 7; i++) {
      const d = new Date(ahora);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      ventana.add(claveDia(d));
    }
    if (!diaElegido || !ventana.has(diaElegido)) diaElegido = hoy;

    const zona = el('div');

    const dibujarDia = () => {
      zona.textContent = '';
      const delDia = porDia.get(diaElegido) || [];
      const esHoy = diaElegido === hoy;
      if (esHoy) {
        const foco = pintarAhora(delDia, ahora);
        if (foco) zona.append(foco);
      }
      zona.append(pintarAgenda(delDia, ahora, esHoy));
    };

    main.append(
      pintarSemana(porDia, diaElegido, (clave) => {
        diaElegido = clave;
        render(main);
      })
    );
    dibujarDia();
    main.append(zona);
  } else {
    main.append(pintarError('La semana', evRes.reason));
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
