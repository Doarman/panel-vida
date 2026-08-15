// Pantalla Cultivo.
//
// Toda la información se formula como proyección, nunca como orden. El ciclo
// anterior se arruinó por operar contra el calendario en vez de contra la
// planta; una app que dice "hoy regás" repite ese error con más autoridad.
//
// Las dosis sí van completas y al frente: son el dato que se usa parado frente
// a la mezcla, y no saberlas de memoria no es una decisión, es una molestia.

import { leerEstado, leerArchivoDeSubsistema } from '../api.js';
import { subsistema } from '../contract.js';
import { registrar, sincronizar, pendientes, subidos } from '../riegos.js';
import { el, seccion, cargando, itemOmitible, pieOmitidos } from '../ui.js';
import { conCache, antiguedad } from '../cache.js';
import { estaOmitido, omitir, restaurarTodo } from '../omitidos.js';
import {
  hoyISO, dias, fecha, cuando, rango,
  faseDe, diaDeCiclo, nombreDe, infoProducto,
  dosisOrdenadas, totalMezcla, productosDeLaFase,
} from '../cultivo-datos.js';

// ---------- fichas de dato ----------

function chips(items) {
  const cont = el('div', 'chips');
  for (const [k, v, u] of items) {
    if (v == null || v === '—') continue;
    const c = el('div', 'chip');
    c.append(el('span', 'chip-k', k));
    const val = el('span', 'chip-v', String(v));
    if (u) val.append(el('i', null, u));
    c.append(val);
    cont.append(c);
  }
  return cont;
}

function pintarCiclo(ciclo, fase, dia, marca) {
  const s = el('section', 'ciclo tarjeta');
  s.append(el('p', 'ciclo-n', ciclo?.nombre || 'Ciclo activo'));
  s.append(el('h3', 'ciclo-f', fase ? fase.nombre : 'Entre fases'));

  const partes = [];
  if (dia != null) partes.push(`Día ${dia} del ciclo`);
  if (fase) partes.push(`fase ${fase.id} hasta el ${fecha(fase.fecha_fin)}`);
  s.append(el('p', 'ciclo-d', partes.join(' · ')));

  if (fase) {
    s.append(
      chips([
        ['EC objetivo', rango(fase.ec_objetivo)],
        ['pH entrada', rango(fase.ph_entrada)],
        ['PPFD', fase.ppfd_techo ? `${fase.ppfd} / ${fase.ppfd_techo}` : (fase.ppfd ?? '—')],
        ['Litros/maceta', rango(fase.volumen_por_maceta_l)],
      ])
    );
  }

  if (marca) s.append(el('p', 'marca', marca));
  return s;
}

function pintarAmbiente(fase) {
  const a = fase?.ambiente;
  if (!a) return null;

  const items = [
    ['Con luz', rango(a.temp_luz_c), '°'],
    ['Oscuridad', rango(a.temp_oscuridad_c), '°'],
    ['Humedad', rango(a.hr_pct), '%'],
    ['Diferencial', a.diferencial_c ? rango(a.diferencial_c) : null, '°'],
  ].filter(([, v]) => v != null);

  if (!items.length) return null;
  const s = seccion('Ambiente');
  s.append(chips(items));
  return s;
}

// ---------- mezcla ----------

const LITROS_CLAVE = 'pv.litros';

/** 44, 11.5, 0.5 — sin decimales de más. */
function cantidad(valor) {
  const n = Math.round(valor * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function pintarMezcla(cultivo, fase) {
  if (!fase?.nutricion) return null;

  const { dosis, notas } = dosisOrdenadas(cultivo, fase);
  if (!dosis.length) return null;

  const s = seccion(`Mezcla · fase ${fase.id}`);
  const total = totalMezcla(cultivo, fase);

  // Punto de partida: lo que dan las macetas de esta fase. Pero el que manda es
  // el litro que prepares vos, así que se puede mover.
  const sugerido = total
    ? Math.round(total.n * ((fase.volumen_por_maceta_l[0] + fase.volumen_por_maceta_l[1]) / 2) * 2) / 2
    : 20;

  const guardado = Number(localStorage.getItem(LITROS_CLAVE));
  const inicial = guardado > 0 ? guardado : sugerido;

  const control = el('div', 'litros');
  const salida = el('output', 'litros-v', `${cantidad(inicial)} L`);
  control.append(salida);

  const barra = el('input', 'litros-r');
  barra.type = 'range';
  barra.min = '1';
  barra.max = String(Math.max(40, Math.ceil(inicial * 2)));
  barra.step = '0.5';
  barra.value = String(inicial);
  barra.setAttribute('aria-label', 'Litros de mezcla');
  control.append(barra);

  if (total) {
    control.append(
      el('p', 'litros-ref', `${total.n} macetas × ${rango(total.vol)} L  →  ${total.litros}`)
    );
  }
  s.append(control);

  // Cada producto muestra la cantidad total para esos litros, y la dosis
  // original al lado. Tocando la fila se abre lo que cultivo.json sabe de él.
  const ol = el('ol', 'mezcla');
  const filas = [];

  for (const d of dosis) {
    const info = infoProducto(cultivo, d.clave);
    const li = el('li');

    const cabecera = el('div', 'mz-h');
    const cant = el('span', 'mz-c');
    cabecera.append(el('span', 'mz-n', nombreDe(d.clave)));
    cabecera.append(cant);
    cabecera.append(el('span', 'mz-d', `${d.valor} ${d.unidad}`));
    li.append(cabecera);

    const detalle = [info?.nombre, info?.rol && `Para: ${info.rol}`, info?.nota]
      .filter(Boolean)
      .join('\n');

    if (detalle) {
      li.classList.add('abrible');
      li.append(el('p', 'mz-info', detalle));
      cabecera.addEventListener('click', () => li.classList.toggle('abierta'));
    }

    ol.append(li);
    filas.push({ d, cant });
  }
  s.append(ol);

  const recalcular = () => {
    const L = Number(barra.value);
    salida.textContent = `${cantidad(L)} L`;
    barra.style.setProperty('--pct', `${((L - 1) / (Number(barra.max) - 1)) * 100}%`);
    for (const { d, cant } of filas) {
      cant.textContent = `${cantidad(d.valor * L)} ${d.unidad.split('/')[0]}`;
    }
  };

  barra.addEventListener('input', recalcular);
  barra.addEventListener('change', () => {
    try {
      localStorage.setItem(LITROS_CLAVE, barra.value);
    } catch {}
  });
  recalcular();

  for (const n of notas) s.append(el('p', 'mezcla-nota', n));

  const orden = cultivo?.orden_de_mezcla || [];
  if (orden.length) s.append(el('p', 'pie', `Orden: ${orden.join(' → ')}`));

  return s;
}

// ---------- proyección ----------

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
    fila('Riego', `${cuando(prox.fecha)} · ${prox.tipo}`,
      'Lo decide el peso de la maceta, no la fecha (r8).');
  } else {
    fila('Riego', 'sin riegos proyectados');
  }

  fila('Último riego',
    ultimoRiego ? `${fecha(ultimoRiego)} · ${cuando(ultimoRiego)}` : 'sin registro',
    ultimoRiego ? null : 'Todavía no cargaste ninguno desde acá.');

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

/**
 * Lo que el plan de la fase contempla.
 *
 * Estas frases vienen en imperativo desde cultivo.json, porque son el texto del
 * Dossier. La app no puede reescribir tus datos, pero sí dejar claro que cita
 * el plan en vez de darte una orden.
 */
function pintarPrevisto(fase) {
  const acciones = fase?.acciones || [];
  if (!acciones.length) return null;
  const s = seccion('Lo que el plan prevé');
  const ul = el('ul', 'mirada');
  for (const a of acciones) ul.append(el('li', null, a));
  s.append(ul);
  s.append(el('p', 'pie', `Texto del plan para la fase ${fase.id}, tal como está escrito.`));
  return s;
}

function pintarAbiertos(cultivo, refrescar) {
  const hoy = hoyISO();

  const items = [
    ...(cultivo?.pendientes || [])
      .filter((p) => p.estado !== 'hecho')
      .sort((a, b) => String(a.fecha_limite).localeCompare(String(b.fecha_limite)))
      .map((p) => ({
        clave: `cultivo:${p.id || p.item}`,
        titulo: p.item,
        meta: [
          p.fecha_limite ? `límite ${fecha(p.fecha_limite)} · ${cuando(p.fecha_limite)}` : null,
          p.motivo,
        ].filter(Boolean).join(' — '),
        cerca: p.fecha_limite ? dias(hoy, p.fecha_limite) <= 21 : false,
      })),
    ...(cultivo?.decisiones_abiertas || [])
      .filter((d) => /pendiente|confirmar/i.test(d.estado || ''))
      .map((d) => ({
        clave: `cultivo:${d.id || d.tema}`,
        titulo: d.tema,
        meta: d.estado + (d.decidir_antes_de ? ` · antes del ${fecha(d.decidir_antes_de)}` : ''),
        cerca: false,
      })),
  ];

  const visibles = items.filter((i) => !estaOmitido(i.clave));
  const ocultos = items.length - visibles.length;
  if (!items.length) return null;

  const s = seccion('Requiere tu mirada');
  const ul = el('ul', 'mirada');

  for (const i of visibles) {
    const partes = [el('span', 'mirada-t', i.titulo)];
    if (i.meta) partes.push(el('small', null, i.meta));
    const li = itemOmitible(partes, () => {
      omitir(i.clave);
      refrescar();
    });
    if (i.cerca) li.classList.add('cerca');
    ul.append(li);
  }

  if (!visibles.length) s.append(el('p', 'vacio', 'Nada a la vista por hoy.'));
  else s.append(ul);

  const pie = pieOmitidos(ocultos, () => {
    restaurarTodo();
    refrescar();
  });
  if (pie) s.append(pie);

  return s;
}

// ---------- formulario ----------

// Los tipos son los que declara cultivo.json en registro_crudo.esquema.
const TIPOS = ['completo', 'intermedio', 'agua', 'ripening', 'flush'];

function pintarFormulario(cultivo, fase, alRegistrar) {
  const s = seccion('Registrar un riego');

  const form = el('form');
  const campos = el('div', 'campos');

  const campo = (contenedor, clase, etiqueta, referencia, control) => {
    const d = el('div', `campo ${clase}`);
    const l = el('label');
    l.append(document.createTextNode(etiqueta));
    if (referencia) l.append(el('span', null, `  ${referencia}`));
    l.htmlFor = control.id;
    d.append(l, control);
    contenedor.append(d);
  };

  const input = (id, tipo, extra = {}) => {
    const i = el('input');
    i.id = id;
    i.type = tipo;
    Object.assign(i, extra);
    return i;
  };

  const fFecha = input('r-fecha', 'date', { value: hoyISO(), required: true });
  campo(campos, '', 'Fecha', '', fFecha);

  const fTipo = el('select');
  fTipo.id = 'r-tipo';
  for (const t of TIPOS) {
    const o = el('option', null, t);
    o.value = t;
    fTipo.append(o);
  }
  campo(campos, '', 'Tipo', '', fTipo);

  // Los rangos de la fase van como referencia al lado del campo, nunca
  // precargados: vos medís y cargás lo que medís.
  const fEc = input('r-ec', 'number', { step: '0.01', inputMode: 'decimal' });
  campo(campos, '', 'EC medida', fase ? `obj. ${rango(fase.ec_objetivo)}` : '', fEc);

  const fPh = input('r-ph', 'number', { step: '0.1', inputMode: 'decimal' });
  campo(campos, '', 'pH', fase ? `obj. ${rango(fase.ph_entrada)}` : '', fPh);

  const fLitros = input('r-litros', 'number', { step: '0.5', inputMode: 'decimal' });
  campo(campos, 'ancho', 'Litros por maceta',
    fase ? `plan ${rango(fase.volumen_por_maceta_l)}` : '', fLitros);

  const fObs = el('textarea');
  fObs.id = 'r-obs';
  fObs.placeholder = 'Cómo pesaba la maceta, cómo se ven las hojas…';
  campo(campos, 'ancho', 'Observación', '', fObs);

  form.append(campos);

  // Lo que casi nunca vas a tener a mano queda plegado: PPFD y las temperaturas
  // necesitan instrumental que todavía es pendiente (p2, termómetro min/máx).
  const extra = el('details', 'mas');
  extra.append(el('summary', null, 'Más datos'));
  const campos2 = el('div', 'campos');

  const fPpfd = input('r-ppfd', 'number', { step: '10', inputMode: 'numeric' });
  campo(campos2, 'ancho', 'PPFD',
    fase ? (fase.ppfd_techo ? `techo ${fase.ppfd_techo}` : `ref. ${fase.ppfd ?? '—'}`) : '', fPpfd);

  const fTmin = input('r-tmin', 'number', { step: '0.5', inputMode: 'decimal' });
  campo(campos2, '', 'Temp mínima', fase ? `${rango(fase.ambiente?.temp_oscuridad_c)}°` : '', fTmin);

  const fTmax = input('r-tmax', 'number', { step: '0.5', inputMode: 'decimal' });
  campo(campos2, '', 'Temp máxima', fase ? `${rango(fase.ambiente?.temp_luz_c)}°` : '', fTmax);

  extra.append(campos2);
  form.append(extra);

  const boton = el('button', 'btn', 'Registrar');
  boton.type = 'submit';
  const aviso = el('p', 'nota oculto');
  form.append(boton, aviso);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    boton.disabled = true;
    aviso.classList.add('oculto');

    const num = (v) => (v === '' ? null : Number(v));

    // Nombres de campo según cultivo.json → registro_crudo.esquema.
    const res = await registrar({
      fecha: fFecha.value,
      fase: fase?.id || null,
      tipo: fTipo.value,
      ec_medida: num(fEc.value),
      ph_medido: num(fPh.value),
      litros_por_maceta: num(fLitros.value),
      ppfd: num(fPpfd.value),
      temp_min_c: num(fTmin.value),
      temp_max_c: num(fTmax.value),
      observacion: fObs.value.trim() || null,
      productos_aplicados: productosDeLaFase(cultivo, fase, fTipo.value),
    });

    aviso.textContent = res.subido
      ? 'Registrado y guardado en Drive.'
      : 'Guardado en el teléfono. Sube solo en cuanto haya conexión.';
    aviso.classList.remove('oculto', 'error', 'bien');
    aviso.classList.add(res.subido ? 'bien' : 'error');

    for (const f of [fEc, fPh, fLitros, fPpfd, fTmin, fTmax, fObs]) f.value = '';
    boton.disabled = false;
    alRegistrar();
  });

  s.append(form);

  // Las reglas de carga que declara cultivo.json, a la vista y no solo en el
  // código: si viven únicamente adentro, se cumplen por casualidad.
  const reglas = el('ul', 'reglas-carga');
  for (const r of [
    'Lo que no mediste, dejalo vacío. Se guarda como "sin dato", nunca estimado.',
    'La observación va cruda: describí lo que ves, no lo que suponés. Interpretar viene después y con más datos.',
    'Los registros no se editan. Si hay una corrección, se carga una entrada nueva.',
  ]) {
    reglas.append(el('li', null, r));
  }
  s.append(reglas);

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
    if (r.ec_medida != null) li.append(el('span', null, `EC ${r.ec_medida}`));
    if (r.ph_medido != null) li.append(el('span', null, `pH ${r.ph_medido}`));
    if (r.pendiente) li.append(el('span', 'pend', 'sin subir'));
    ul.append(li);
  }

  s.append(ul);
  return s;
}

// ---------- render ----------

export async function render(main) {
  main.textContent = '';
  const aviso = cargando('Leyendo el cultivo…');
  main.append(aviso);

  let estado, cultivo, marca = null;
  try {
    const e = await conCache('estado', leerEstado);
    estado = e.datos;

    const sub = subsistema(estado, 'cultivo');
    if (!sub?.archivoId && !sub?.ruta) {
      throw new Error('estado.json no apunta a ningún archivo de cultivo');
    }

    const c = await conCache('cultivo', () => leerArchivoDeSubsistema(sub));
    const { datos: contenido, puntero_viejo } = c.datos;
    cultivo = contenido;

    if (!e.fresco || !c.fresco) marca = `Copia local · ${antiguedad(Math.min(e.ts, c.ts))}`;
    else if (puntero_viejo) {
      marca = 'El drive_file_id de estado.json apunta a un archivo borrado. Se encontró cultivo.json por nombre; conviene corregir el puntero.';
    }
  } catch (e) {
    aviso.remove();
    const s = seccion('🌱 Cultivo');
    s.append(el('p', 'vacio mal', e.message));
    main.append(s);
    return;
  }

  let yaSubidos = [];
  try {
    await sincronizar();
    yaSubidos = await subidos();
  } catch {
    /* sin red o sin sesión: se muestran solo los pendientes locales */
  }
  const sinSubir = pendientes();

  aviso.remove();

  const sub = subsistema(estado, 'cultivo');
  const ciclo = cultivo?.ciclo_activo;
  const fase = faseDe(cultivo);

  const ultimo =
    [...sinSubir, ...yaSubidos].map((r) => r.fecha).sort().pop() ||
    sub?.resumen?.ultimo_riego ||
    null;

  const irAlPlan = el('a', 'boton-enlace', 'Ver el plan completo del ciclo →');
  irAlPlan.href = '#/plan';

  const partes = [
    pintarCiclo(ciclo, fase, diaDeCiclo(cultivo), marca),
    pintarMezcla(cultivo, fase),
    pintarAmbiente(fase),
    pintarProyeccion(cultivo, sub?.resumen, ultimo),
    pintarPrevisto(fase),
    pintarAbiertos(cultivo, () => render(main)),
    pintarFormulario(cultivo, fase, () => render(main)),
    pintarRegistros(yaSubidos, sinSubir),
    irAlPlan,
  ];

  for (const p of partes) if (p) main.append(p);
}
