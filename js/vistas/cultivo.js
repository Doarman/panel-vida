// Pantalla Cultivo.
//
// Toda la información se formula como proyección, nunca como orden. El ciclo
// anterior se arruinó por operar contra el calendario en vez de contra la
// planta; una app que dice "hoy regás" repite ese error con más autoridad.
//
// Las dosis sí van completas y al frente: son el dato que se usa parado frente
// a la mezcla, y no saberlas de memoria no es una decisión, es una molestia.
//
// Con dos ciclos en paralelo, cada grupo se mira por separado: su contador, su
// mezcla y sus registros. Nada de un grupo se le presta al otro.

import { CONFIG } from '../../config.js';
import { leerEstado } from '../api.js';
import { subsistema } from '../contract.js';
import { registrar, registrarSecado, sincronizar, pendientes, subidos, usarArchivo } from '../riegos.js';
import { el, seccion, cargando, error } from '../ui.js';
import { conCache, antiguedad } from '../cache.js';
import { cargarGrupos, grupoElegido, selectorDeGrupos } from '../cultivo-grupos.js';
import {
  hoyISO, fecha, rango,
  faseDe, diaDeCiclo, nombreDe, infoProducto,
  totalMezcla, productosDeLaFase, posicionEnMezcla,
  ordenDeLaFase, aguaBase, estadoDeSecado, fechaCorta,
  recetaDe, tiposDeRiego, tipoSugerido, secadosConsolidados,
  delCiclo, delAlcance, subconjuntosDe, volumenTexto, eventosDeLaFase,
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

/** 44, 11.5, 0.5 — sin decimales de más. */
function cantidad(valor) {
  const n = Math.round(valor * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const nombreDeAlcance = (subs, id) => subs.find((s) => s.id === id)?.nombre || id;

function pintarMezcla(g, fase, tipo, sugerencia, riegos, alCambiarTipo) {
  if (!fase) return null;
  const { cultivo } = g;

  const receta = recetaDe(cultivo, fase, tipo);
  const s = seccion('Mezcla');

  // Selector de tipo. Va primero y no como detalle: la regla r13 dice que la
  // interfaz tiene que distinguir el tipo ANTES de mostrar números, porque el
  // intermedio no lleva sales y no es media dosis de nada.
  const tipos = tiposDeRiego(cultivo);
  if (tipos.length > 1) {
    const seg = el('div', 'segmento');
    for (const t of tipos) {
      const b = el('button', `seg-b${t === tipo ? ' activo' : ''}`, t);
      b.type = 'button';
      b.addEventListener('click', () => alCambiarTipo(t));
      seg.append(b);
    }
    s.append(seg);
  }

  // El porqué de la sugerencia, cuando no es simplemente lo que dice el plan.
  // Se explica la regla y se deja la eleccion: la app no decide agronomia.
  if (sugerencia.aviso) s.append(el('p', 'mezcla-aviso', sugerencia.aviso));

  // Con subconjuntos, el riego del plan puede ser solo para uno de ellos.
  const subs = subconjuntosDe(cultivo);
  const para = sugerencia.alcance && tipo === sugerencia.tipo
    ? ` · para ${nombreDeAlcance(subs, sugerencia.alcance)}`
    : '';
  s.append(el('p', 'mezcla-fase', `Fase ${fase.id} · ${fase.nombre}${para}`));

  if (!receta.declarado) {
    s.append(el('p', 'vacio', `cultivo.json no declara qué lleva un riego "${tipo}".`));
    return s;
  }

  // r17: el criterio es el drenaje, no el volumen. Va antes que los litros
  // para que se lea primero.
  const drenaje = fase.drenaje_objetivo_pct;
  const lineaDrenaje = Array.isArray(drenaje)
    ? el('p', 'mezcla-drenaje', `Hasta drenar ${rango(drenaje)} %. Los litros son la referencia para preparar.`)
    : null;

  // Aplicaciones de evento (Flora Booster): una sola por fase, en el primer
  // completo (r14). Si ya pasó, no se suma a la mezcla.
  const eventos = tipo === 'completo' ? eventosDeLaFase(cultivo, fase, riegos) : [];
  const eventosPendientes = eventos.filter((e) => !e.aplicadoEl);

  // Sin dosis: es agua, o una fórmula fija que no depende de la fase.
  if (!receta.dosis.length && !eventosPendientes.length) {
    const caja = el('div', 'sin-dosis');
    caja.append(el('p', 'sin-dosis-t', receta.formulaFija || 'Solo agua, sin aditivos.'));
    if (receta.ph) caja.append(el('p', 'sin-dosis-p', `pH de entrada ${rango(receta.ph)}`));
    s.append(caja);
    if (lineaDrenaje) s.append(lineaDrenaje);
    if (receta.nota) s.append(el('p', 'mezcla-nota', receta.nota));
    return s;
  }

  const dosis = [...receta.dosis, ...eventosPendientes].sort(
    (a, b) => posicionEnMezcla(cultivo, a.clave) - posicionEnMezcla(cultivo, b.clave)
  );
  const notas = receta.notas;
  const total = totalMezcla(cultivo, fase);

  // Punto de partida: lo que dan las macetas de esta fase. Pero el que manda es
  // el litro que prepares vos, así que se puede mover. Se recuerda por grupo:
  // las tandas de uno y otro no tienen nada que ver.
  const sugerido = total ? Math.round(((total.min + total.max) / 2) * 2) / 2 : 20;
  const claveLitros = g.legado ? 'pv.litros' : `pv.litros.${g.id}`;

  let guardado = 0;
  try {
    guardado = Number(localStorage.getItem(claveLitros));
  } catch {}
  const inicial = guardado > 0 ? guardado : sugerido;

  if (lineaDrenaje) s.append(lineaDrenaje);

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
    const cuenta = total.partes.length === 1 && !total.partes[0].id
      ? `${total.n} macetas × ${rango(total.vol)} L`
      : total.partes.map((p) => `${p.n} × ${rango(p.vol)} L`).join(' + ');
    control.append(el('p', 'litros-ref', `${cuenta}  →  ${total.litros}`));
  }
  s.append(control);

  // Cada producto muestra la cantidad total para esos litros, y la dosis
  // original al lado. Tocando la fila se abre lo que cultivo.json sabe de él.
  const ol = el('ol', 'mezcla');
  const filas = [];

  for (const d of dosis) {
    const info = infoProducto(cultivo, d.clave);
    const li = el('li', d.evento ? 'evento' : null);

    const cabecera = el('div', 'mz-h');
    const cant = el('span', 'mz-c');
    cabecera.append(el('span', 'mz-n', nombreDe(d.clave)));
    cabecera.append(cant);
    cabecera.append(el('span', 'mz-d', `${d.valor} ${d.unidad}`));
    li.append(cabecera);

    if (d.evento) {
      const cual = d.numero && d.total ? `aplicación ${d.numero} de ${d.total} · ` : '';
      li.append(el('p', 'mz-ev', `${cual}solo en el primer completo de la fase`));
    }

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
      localStorage.setItem(claveLitros, barra.value);
    } catch {}
  });
  recalcular();

  for (const e of eventos.filter((x) => x.aplicadoEl)) {
    s.append(
      el('p', 'mezcla-nota',
        `${nombreDe(e.clave)}${e.numero ? ` (aplicación ${e.numero})` : ''} ya entró en el completo del ${fechaCorta(e.aplicadoEl)}. No se repite en la fase (r14).`)
    );
  }
  for (const n of notas) s.append(el('p', 'mezcla-nota', n));
  if (receta.nota) s.append(el('p', 'mezcla-nota', receta.nota));

  // El agua ya trae EC. Sin esto, el objetivo de la fase se lee como si fuera
  // aporte de nutrientes y la mezcla termina por encima de lo buscado.
  const agua = aguaBase(cultivo);
  if (agua && receta.ec) {
    s.append(
      el('p', 'mezcla-agua', `El agua ya aporta EC ${agua.ec}. El objetivo ${rango(receta.ec)} es EC total medida en el tanque, no lo que suman los productos.`)
    );
  }

  // Solo los pasos que corresponden a esta fase: el orden completo del ciclo
  // incluye productos que hoy no van.
  const pasos = ordenDeLaFase(cultivo, dosis);
  if (pasos.length) s.append(el('p', 'pie', `Orden: ${pasos.join(' → ')}`));

  return s;
}

// ---------- el sustrato ----------

/** Número grande, bajada y relleno de la barra para un estado de secado. */
function lecturaDeSecado(sec) {
  if (!sec) return { k: 'Sin riegos', n: '—', s: 'El contador arranca con el primero que registres.', pct: null };

  // Grupo sin secado medido: no se proyecta con las horas de otro. El número
  // grande pasa a ser lo transcurrido, que es lo único que se sabe.
  if (sec.horas == null) {
    return {
      k: 'Regado hace',
      n: `${sec.transcurridas} h`,
      s: 'Desde el último riego. Secado todavía sin medir en este grupo.',
      pct: null,
    };
  }

  const h = Math.abs(sec.restantes);
  return {
    k: sec.seco ? 'Secado' : 'Próximo riego',
    n: sec.seco ? 'Pide agua' : h < 1 ? 'Ahora' : `${h} h`,
    urge: sec.seco,
    s: `Regado hace ${sec.transcurridas} h · seca en ~${sec.horas} h`,
    pct: sec.pct,
  };
}

function barraDeSecado(pct) {
  const barra = el('div', 'barra');
  const relleno = el('i');
  barra.append(relleno);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      relleno.style.width = `${pct.toFixed(1)}%`;
    })
  );
  return barra;
}

/**
 * El estado del sustrato, que es la única pregunta que se hace todos los días.
 *
 * Se cuenta en horas y no en días: el grupo 1 seca en unas 60, que son dos
 * días y medio. En un contador de días enteros ese número no se puede decir, y
 * por eso el anterior nunca coincidía con la maceta.
 */
function pintarRiego(sec) {
  const l = lecturaDeSecado(sec);
  const s = el('section', 'estado tarjeta');

  if (!sec) {
    s.append(el('p', 'estado-n', l.k));
    s.append(el('p', 'estado-s', l.s));
    return s;
  }

  s.append(el('p', 'estado-k', l.k));
  s.append(el('p', `estado-n${l.urge ? ' urge' : ''}`, l.n));
  if (l.pct != null) s.append(barraDeSecado(l.pct));
  s.append(el('p', 'estado-s', l.s));
  s.append(el('p', 'estado-p', '¿Cómo pesa la maceta?'));
  return s;
}

function botonSecado(sec, alAnotar) {
  const b = el('button', 'btn btn-sec', sec.yaSeco ? 'Corregir el secado' : 'Ya se secó');
  b.type = 'button';
  b.addEventListener('click', async () => {
    b.disabled = true;
    await alAnotar(Math.max(1, sec.transcurridas));
  });
  return b;
}

/**
 * Con subconjuntos, un contador por cada uno.
 *
 * Las tres veteranas y las ocho nuevas del grupo 2 comparten tanque pero no
 * cadencia: las grandes secan antes. Un solo contador se reiniciaría con el
 * riego extra de un subconjunto y le mentiría al otro.
 */
function pintarRiegoPorSubconjunto(subs, estados, alAnotar) {
  const s = el('section', 'estado tarjeta estado-multi');
  const cols = el('div', 'estado-cols');

  for (const sub of subs) {
    const sec = estados[sub.id];
    const l = lecturaDeSecado(sec);
    const c = el('div', 'estado-col');
    c.append(el('p', 'estado-k', `${sub.nombre || sub.id}${sub.cantidad_plantas ? ` · ${sub.cantidad_plantas}` : ''}`));
    c.append(el('p', `estado-n${l.urge ? ' urge' : ''}`, l.n));
    if (l.pct != null) c.append(barraDeSecado(l.pct));
    c.append(el('p', 'estado-s', sec ? l.s : 'Sin riegos todavía.'));
    if (sec) c.append(botonSecado(sec, (horas) => alAnotar(sub.id, sec, horas)));
    cols.append(c);
  }

  s.append(cols);
  s.append(el('p', 'estado-p', '¿Cómo pesa la maceta?'));
  return s;
}

/**
 * Las acciones del día, juntas y grandes.
 * Registrar un riego reinicia el contador; anotar el secado corrige cuánto
 * tarda de verdad. Con subconjuntos, el secado se anota en cada columna.
 */
function pintarAcciones(sec, alRegistrar, alAnotar) {
  const cont = el('div', 'acciones-p');

  const regar = el('button', 'btn', 'Registré un riego');
  regar.type = 'button';
  regar.addEventListener('click', alRegistrar);
  cont.append(regar);

  if (sec && alAnotar) cont.append(botonSecado(sec, alAnotar));
  return cont;
}

// ---------- formulario ----------

// Los tipos son los que declara cultivo.json en registro_crudo.esquema.
const TIPOS = ['completo', 'intermedio', 'agua', 'ripening', 'flush'];

function pintarFormulario(g, fase, riegos, sugerencia, alRegistrar) {
  const { cultivo } = g;
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

  const opciones = (id, pares, elegido) => {
    const sel = el('select');
    sel.id = id;
    for (const [valor, texto] of pares) {
      const o = el('option', null, texto);
      o.value = valor;
      if (valor === elegido) o.selected = true;
      sel.append(o);
    }
    return sel;
  };

  const fFecha = input('r-fecha', 'date', { value: hoyISO(), required: true });
  campo(campos, '', 'Fecha', '', fFecha);

  const fTipo = opciones('r-tipo', TIPOS.map((t) => [t, t]), TIPOS[0]);
  campo(campos, '', 'Tipo', '', fTipo);

  // A quién se regó. Sin esto no se puede auditar el completo semanal por
  // subconjunto (r16) ni saber qué contador reiniciar.
  const subs = subconjuntosDe(cultivo);
  let fAlcance = null;
  if (subs.length) {
    fAlcance = opciones(
      'r-alcance',
      [['todos', 'Todas'], ...subs.map((x) => [x.id, `${x.nombre || x.id}${x.cantidad_plantas ? ` (${x.cantidad_plantas})` : ''}`])],
      sugerencia.alcance || 'todos'
    );
    campo(campos, 'ancho', 'Plantas regadas', '', fAlcance);
  }

  // step="any" a propósito: con un paso fijo, el navegador rechaza los valores
  // que no caen en su grilla, y la app terminaría aceptando solo lo que espera
  // en vez de lo que mediste. Relevar datos crudos significa que el número que
  // entra es el tuyo, aunque se salga del plan.
  const fEc = input('r-ec', 'number', { step: 'any', inputMode: 'decimal' });
  campo(campos, '', 'EC medida', fase ? `obj. ${rango(fase.ec_objetivo)}` : '', fEc);

  const fPh = input('r-ph', 'number', { step: 'any', inputMode: 'decimal' });
  campo(campos, '', 'pH', fase ? `obj. ${rango(fase.ph_entrada)}` : '', fPh);

  const fLitros = input('r-litros', 'number', { step: 'any', inputMode: 'decimal' });
  campo(campos, '', 'Litros por maceta',
    fase ? `plan ${volumenTexto(cultivo, fase.volumen_por_maceta_l)}` : '', fLitros);

  // r17: un riego que no llega a drenar concentra sales en vez de lavarlas.
  // "Sin dato" es una respuesta válida: lo que no se miró no se inventa.
  const fDrenaje = opciones('r-drenaje', [['', 'sin dato'], ['si', 'sí'], ['no', 'no']], '');
  campo(campos, '', 'Drenó',
    Array.isArray(fase?.drenaje_objetivo_pct) ? `obj. ${rango(fase.drenaje_objetivo_pct)} %` : '', fDrenaje);

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

  const fPpfd = input('r-ppfd', 'number', { step: 'any', inputMode: 'decimal' });
  campo(campos2, 'ancho', 'PPFD',
    fase ? (fase.ppfd_techo ? `techo ${fase.ppfd_techo}` : `ref. ${fase.ppfd ?? '—'}`) : '', fPpfd);

  const fTmin = input('r-tmin', 'number', { step: 'any', inputMode: 'decimal' });
  campo(campos2, '', 'Temp mínima', fase ? `${rango(fase.ambiente?.temp_oscuridad_c)}°` : '', fTmin);

  const fTmax = input('r-tmax', 'number', { step: 'any', inputMode: 'decimal' });
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

    // Nombres de campo según cultivo.json → registro_crudo.esquema, más las
    // extensiones que pidió el grupo 2: ciclo, alcance y drenaje.
    const res = await registrar({
      fecha: fFecha.value,
      ciclo: g.ciclo?.id || null,
      grupo: g.id,
      fase: fase?.id || null,
      tipo: fTipo.value,
      alcance: fAlcance ? fAlcance.value : 'todos',
      ec_medida: num(fEc.value),
      ph_medido: num(fPh.value),
      litros_por_maceta: num(fLitros.value),
      drenaje: fDrenaje.value || null,
      ppfd: num(fPpfd.value),
      temp_min_c: num(fTmin.value),
      temp_max_c: num(fTmax.value),
      observacion: fObs.value.trim() || null,
      productos_aplicados: productosDeLaFase(cultivo, fase, fTipo.value, riegos),
    });

    aviso.textContent = res.subido
      ? 'Registrado y guardado en Drive.'
      : 'Guardado en el teléfono. Sube solo en cuanto haya conexión.';
    aviso.classList.remove('oculto', 'error', 'bien');
    aviso.classList.add(res.subido ? 'bien' : 'error');

    for (const f of [fEc, fPh, fLitros, fPpfd, fTmin, fTmax, fObs]) f.value = '';
    fDrenaje.value = '';
    boton.disabled = false;
    alRegistrar();
  });

  s.append(form);

  // Las reglas de carga que declara cultivo.json, a la vista y no solo en el
  // código: si viven únicamente adentro, se cumplen por casualidad.
  const reglas = el('ul', 'reglas-carga');
  for (const r of [
    'Los campos aceptan el valor que hayas medido, aunque se salga del plan. Lo que se guarda es tu medición, no lo esperado.',
    'Lo que no mediste, dejalo vacío. Se guarda como "sin dato", nunca estimado.',
    'La observación va cruda: describí lo que ves, no lo que suponés. Interpretar viene después y con más datos.',
    'Los registros no se editan. Si hay una corrección, se carga una entrada nueva.',
  ]) {
    reglas.append(el('li', null, r));
  }
  s.append(reglas);

  return s;
}

function pintarRegistros(riegos, subs) {
  if (!riegos.length) return null;
  const s = seccion('Últimos registros');
  const ul = el('ul', 'registros');

  const todos = riegos
    .filter((r) => r.fecha)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .slice(0, 6);
  if (!todos.length) return null;

  for (const r of todos) {
    const li = el('li');
    li.append(el('span', null, fecha(r.fecha)));
    li.append(el('span', null, r.tipo || '—'));
    if (r.alcance && r.alcance !== 'todos') li.append(el('span', null, nombreDeAlcance(subs, r.alcance)));
    if (r.ec_medida != null) li.append(el('span', null, `EC ${r.ec_medida}`));
    if (r.ph_medido != null) li.append(el('span', null, `pH ${r.ph_medido}`));
    if (r.drenaje) li.append(el('span', null, r.drenaje === 'si' ? 'drenó' : 'sin drenaje'));
    if (r.pendiente) li.append(el('span', 'pend', 'sin subir'));
    ul.append(li);
  }

  s.append(ul);
  return s;
}

/** Una sección que se abre solo si la necesitás. */
function plegable(titulo, contenido, clase = '') {
  if (!contenido) return null;
  const d = el('details', `plegable ${clase}`);
  d.append(el('summary', null, titulo));
  d.append(contenido);
  return d;
}

/** Sin duplicados por id: lo consolidado por Cowork puede repetir lo que subió la app. */
function unicos(lista) {
  const vistos = new Set();
  return lista.filter((r) => {
    if (!r?.id) return true;
    if (vistos.has(r.id)) return false;
    vistos.add(r.id);
    return true;
  });
}

// ---------- render ----------

// Tipo de riego elegido a mano. Vive fuera del render para sobrevivir a un
// redibujado, pero atado al contexto en que se eligio: si cambia el grupo, la
// fase o entra un riego nuevo, la eleccion caduca y vuelve a mandar la
// sugerencia. Antes quedaba pegada para siempre y tapaba lo que el plan
// proyectaba.
let eleccion = null;

export async function render(main) {
  main.textContent = '';
  const aviso = cargando('Leyendo el cultivo…');
  main.append(aviso);

  let estado, grupos, estadoFresco, estadoTs;
  try {
    const e = await conCache('estado', leerEstado);
    estado = e.datos;
    estadoFresco = e.fresco;
    estadoTs = e.ts;
    grupos = await cargarGrupos(subsistema(estado, 'cultivo'));
  } catch (e) {
    aviso.remove();
    const s = seccion('🌱 Cultivo');
    s.append(el('p', 'vacio mal', e.message));
    main.append(s);
    return;
  }

  // Dónde escribir lo define el contrato, no el código.
  usarArchivo(subsistema(estado, 'cultivo')?.registro?.archivo_entrada_app);

  let enDrive = { riegos: [], secados: [] };
  try {
    await sincronizar();
    enDrive = await subidos();
  } catch {
    /* sin red o sin sesión: se muestran solo los pendientes locales */
  }

  aviso.remove();

  const g = grupoElegido(grupos);
  const selector = selectorDeGrupos(grupos, g, () => render(main));
  if (selector) main.append(selector);

  if (!g.cultivo) {
    const s = seccion(g.etiqueta);
    s.append(el('p', 'vacio mal', g.error?.message || 'No se pudo leer el archivo de este grupo.'));
    main.append(s);
    return;
  }

  const { cultivo } = g;
  const marca = !estadoFresco || !g.fresco
    ? `Copia local · ${antiguedad(Math.min(estadoTs, g.ts ?? estadoTs))}`
    : null;

  // Solo lo de este ciclo. Los registros de antes del segundo grupo no dicen
  // ciclo y son del grupo 1.
  const soloEste = (lista) => delCiclo(lista, g.ciclo, { legado: g.legado });
  const riegos = unicos([
    ...soloEste(pendientes('riegos')).map((r) => ({ ...r, pendiente: true })),
    ...soloEste(enDrive.riegos),
    ...(g.ciclo?.riegos_ejecutados || []),
  ]);
  const observaciones = [
    ...secadosConsolidados(cultivo),
    ...soloEste([...enDrive.secados, ...pendientes('secados')]),
  ];

  const fase = faseDe(cultivo);
  const subs = subconjuntosDe(cultivo);
  const puente = CONFIG.SECADO_HORAS?.[g.id] ?? null;

  // Los riegos históricos pueden venir con fecha null a propósito (hubo riego,
  // pero no se registró la fecha). Esos no sirven para "último riego".
  const ultimoDe = (alcance = null) =>
    delAlcance(riegos, alcance).map((r) => r.fecha).filter(Boolean).sort().pop() || null;

  const declarado = /^\d{4}-\d{2}-\d{2}/.test(g.resumen?.ultimo_riego || '') ? g.resumen.ultimo_riego : null;
  const ultimo = ultimoDe() || (subs.length ? null : declarado);

  // La sugerencia mira el plan y las reglas del archivo. La eleccion a mano
  // solo vale mientras no cambie el grupo, la fase ni entre un riego nuevo.
  const sugerencia = tipoSugerido(cultivo, riegos, fase);
  const contexto = `${g.id}|${fase?.id || '-'}|${ultimo || '-'}`;
  if (eleccion && eleccion.para !== contexto) eleccion = null;
  const tipo = eleccion?.tipo || sugerencia.tipo;

  const secadoDe = (alcance, ancla) =>
    estadoDeSecado(cultivo, ancla, {
      secados: delAlcance(observaciones, alcance),
      faseId: fase?.id,
      puente,
      alcance,
    });

  const anotar = async (alcance, desde, horas) => {
    await registrarSecado({
      desde,
      fecha: hoyISO(),
      horas,
      fase: fase?.id || null,
      ciclo: g.ciclo?.id || null,
      grupo: g.id,
      alcance: alcance || 'todos',
    });
    render(main);
  };

  const sec = subs.length ? null : secadoDe(null, ultimo);

  const abrirRegistro = () => {
    const d = main.querySelector('.registro-d');
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const irAlPlan = el('a', 'boton-enlace', 'Ver el plan completo del ciclo →');
  irAlPlan.href = '#/plan';

  // Cada sección se arma por separado y aislada: si una falla, se dibuja el
  // error en su lugar y el resto sigue. Antes, una sola excepción dejaba la
  // pantalla en blanco sin decir por qué.
  //
  // Cuatro cosas, no doce. Lo que se mira todos los días es una sola pregunta
  // —si toca agua— y lo que sigue es prepararla. El resto es consulta y vive
  // en el plan.
  const secciones = [
    ['contexto', () => {
      const partes = [fase ? `${fase.nombre}` : 'Entre fases'];
      const d = diaDeCiclo(cultivo);
      if (d != null) partes.push(`día ${d}${fase?.tipo === 'floracion' ? ' de flor' : ''}`);
      const p = el('p', 'contexto', partes.join(' · '));
      if (marca) p.append(el('span', 'marca', ` ${marca}`));
      return p;
    }],

    ['estado', () => {
      if (!subs.length) return pintarRiego(sec);
      const estados = Object.fromEntries(subs.map((x) => [x.id, secadoDe(x.id, ultimoDe(x.id))]));
      return pintarRiegoPorSubconjunto(subs, estados, (alcance, s, horas) =>
        anotar(alcance, ultimoDe(alcance), horas)
      );
    }],

    ['acciones', () =>
      pintarAcciones(sec, abrirRegistro, ultimo && sec ? (horas) => anotar(null, ultimo, horas) : null)],

    ['mezcla', () => pintarMezcla(g, fase, tipo, sugerencia, riegos, (t) => {
      eleccion = { tipo: t, para: contexto };
      render(main);
    })],

    ['registro', () => plegable('Registrar el riego',
      pintarFormulario(g, fase, riegos, sugerencia, () => render(main)), 'registro-d')],
    ['ambiente', () => plegable('Ambiente de la fase', pintarAmbiente(fase))],
    ['registros', () => plegable('Últimos registros', pintarRegistros(riegos, subs))],
  ];

  for (const [nombre, armar] of secciones) {
    try {
      const nodo = armar();
      if (nodo) main.append(nodo);
    } catch (e) {
      main.append(error(nombre, e));
    }
  }

  main.append(irAlPlan);
}
