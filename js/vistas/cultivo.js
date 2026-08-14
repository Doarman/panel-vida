// Pantalla Cultivo.
//
// Toda la información se formula como proyección, nunca como orden. El ciclo
// anterior se arruinó por operar contra el calendario en vez de contra la
// planta; una app que dice "hoy regás" repite ese error con más autoridad.
// Por eso: "Riego proyectado", los rangos de la fase van como referencia al
// lado del campo y nunca precargados, y no hay un solo checkbox.

import { leerEstado, leerJsonDeDrive } from '../api.js';
import { subsistema, alertas } from '../contract.js';
import { registrar, sincronizar, pendientes, subidos } from '../riegos.js';

// ---------- helpers ----------

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
}

function seccion(titulo) {
  const s = el('section', 'bloque');
  s.append(el('h2', 'titulo', titulo));
  return s;
}

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

/** "hoy", "mañana", "en 4 días", "hace 2 días" — más legible que una fecha. */
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

const rango = (r) => (Array.isArray(r) && r.length === 2 ? `${r[0]}–${r[1]}` : r ?? '—');

// ---------- secciones ----------

function pintarCiclo(ciclo, fase, diaDeCiclo) {
  const s = el('section', 'ciclo bloque');
  s.append(el('p', 'ciclo-n', ciclo?.nombre || 'Ciclo activo'));
  s.append(el('h3', 'ciclo-f', fase ? fase.nombre : 'Entre fases'));

  const partes = [];
  if (diaDeCiclo != null) partes.push(`Día ${diaDeCiclo} del ciclo`);
  if (fase) partes.push(`fase ${fase.id} hasta el ${fecha(fase.fecha_fin)}`);
  s.append(el('p', 'ciclo-d', partes.join(' · ')));

  if (fase) {
    const dl = el('dl', 'params');
    const campos = [
      ['EC objetivo', rango(fase.ec_objetivo)],
      ['pH entrada', rango(fase.ph_entrada)],
      ['PPFD', fase.ppfd_techo ? `${fase.ppfd} · techo ${fase.ppfd_techo}` : (fase.ppfd ?? '—')],
      ['Litros/maceta', rango(fase.volumen_por_maceta_l)],
    ];
    for (const [k, v] of campos) {
      const d = el('div', 'param');
      d.append(el('dt', null, k), el('dd', null, String(v)));
      dl.append(d);
    }
    s.append(dl);
  }

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

function pintarMirada(lista) {
  if (!lista.length) return null;
  const s = seccion('Requiere tu mirada');
  const ul = el('ul', 'mirada');
  for (const a of lista) ul.append(el('li', null, a.texto ?? a));
  s.append(ul);
  return s;
}

function pintarReglas(cultivo) {
  const criticas = (cultivo?.reglas_no_negociables || []).filter(
    (r) => r.criticidad === 'maxima'
  );
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
  const fEc = input('r-ec', 'number', { step: '0.01', inputMode: 'decimal', placeholder: '' });
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
    const riego = {
      fecha: fFecha.value,
      tipo: fTipo.value,
      ec: num(fEc.value),
      ph: num(fPh.value),
      ppfd: num(fPpfd.value),
      observacion: fObs.value.trim() || null,
      fase: fase?.id || null,
    };

    const res = await registrar(riego);

    aviso.textContent = res.subido
      ? 'Registrado y guardado en Drive.'
      : `Guardado en el teléfono. Sube solo cuando haya conexión (${res.error}).`;
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
  const cargando = el('p', 'cargando', 'Leyendo el cultivo…');
  main.append(cargando);

  let estado, cultivo;
  try {
    estado = await leerEstado();
    const sub = subsistema(estado, 'cultivo');
    if (!sub?.archivoId) throw new Error('estado.json no apunta a ningún archivo de cultivo');
    cultivo = await leerJsonDeDrive(sub.archivoId);
  } catch (e) {
    cargando.remove();
    const s = seccion('🌱 Cultivo');
    s.append(el('p', 'vacio mal', e.message));
    main.append(s);
    return;
  }

  // Lo que ya subimos y lo que quedó en el teléfono sin conexión.
  let yaSubidos = [];
  try {
    await sincronizar();
    yaSubidos = await subidos();
  } catch {
    /* sin red: se muestran solo los pendientes locales */
  }
  const sinSubir = pendientes();

  cargando.remove();

  const sub = subsistema(estado, 'cultivo');
  const ciclo = cultivo?.ciclo_activo;
  const hoy = hoyISO();

  const fase = (ciclo?.fases || []).find((f) => f.fecha_inicio <= hoy && hoy <= f.fecha_fin);
  const diaDeCiclo = ciclo?.fecha_inicio ? dias(ciclo.fecha_inicio, hoy) + 1 : null;

  const ultimo =
    [...sinSubir, ...yaSubidos].map((r) => r.fecha).sort().pop() ||
    sub?.resumen?.ultimo_riego ||
    null;

  main.append(pintarCiclo(ciclo, fase, diaDeCiclo));
  main.append(pintarProyeccion(cultivo, sub?.resumen, ultimo));

  const mirada = pintarMirada(alertas(estado).filter((a) => a.origen === 'cultivo'));
  if (mirada) main.append(mirada);

  main.append(pintarFormulario(fase, () => render(main)));

  const regs = pintarRegistros(yaSubidos, sinSubir);
  if (regs) main.append(regs);

  const reglas = pintarReglas(cultivo);
  if (reglas) main.append(reglas);
}
