// Pantalla Cultivo.
//
// Toda la información se formula como proyección, nunca como orden. El ciclo
// anterior se arruinó por operar contra el calendario en vez de contra la
// planta; una app que dice "hoy regás" repite ese error con más autoridad.
//
// Las dosis sí van completas y al frente: son el dato que se usa parado frente
// a la mezcla, y no saberlas de memoria no es una decisión, es una molestia.

import { CONFIG } from '../../config.js';
import { leerEstado, leerArchivoDeSubsistema } from '../api.js';
import { subsistema } from '../contract.js';
import { registrar, registrarSecado, sincronizar, pendientes, subidos, usarArchivo } from '../riegos.js';
import { el, seccion, cargando, error, itemOmitible, pieOmitidos } from '../ui.js';
import { conCache, antiguedad } from '../cache.js';
import { estaOmitido, omitir, restaurarTodo } from '../omitidos.js';
import { auditarCultivo, hallazgosDeclarados } from '../auditoria.js';
import {
  hoyISO, dias, fecha, cuando, rango,
  faseDe, diaDeCiclo, nombreDe, infoProducto,
  dosisOrdenadas, totalMezcla, productosDeLaFase,
  ordenDeLaFase, aguaBase, estadoDeSecado, fechaCorta, sumarDias,
  recetaDe, tiposDeRiego, tipoSugerido, secadosConsolidados,
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

const LITROS_CLAVE = 'pv.litros';

/** 44, 11.5, 0.5 — sin decimales de más. */
function cantidad(valor) {
  const n = Math.round(valor * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function pintarMezcla(cultivo, fase, tipo, aviso, alCambiarTipo) {
  if (!fase) return null;

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
  if (aviso) s.append(el('p', 'mezcla-aviso', aviso));

  s.append(el('p', 'mezcla-fase', `Fase ${fase.id} · ${fase.nombre}`));

  if (!receta.declarado) {
    s.append(el('p', 'vacio', `cultivo.json no declara qué lleva un riego "${tipo}".`));
    return s;
  }

  // Sin dosis: es agua, o una fórmula fija que no depende de la fase.
  if (!receta.dosis.length) {
    const caja = el('div', 'sin-dosis');
    caja.append(el('p', 'sin-dosis-t', receta.formulaFija || 'Solo agua, sin aditivos.'));
    if (receta.ph) caja.append(el('p', 'sin-dosis-p', `pH de entrada ${rango(receta.ph)}`));
    s.append(caja);
    if (receta.nota) s.append(el('p', 'mezcla-nota', receta.nota));
    return s;
  }

  const dosis = receta.dosis;
  const notas = receta.notas;
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

// ---------- proyección ----------

/**
 * El riego, contado desde el último que registraste y no desde el calendario.
 *
 * Una fecha del plan dice cuándo estaba previsto regar. Eso no responde la
 * pregunta real, que es si el sustrato se secó. El ciclo de secado medido de
 * este grupo sí se acerca: dice cuántos días suele tardar. Con eso la app
 * puede decir en qué día vas y devolver la pregunta, que es todo lo que
 * legítimamente puede hacer (r8).
 */
/** El control para anotar un secado, con los días editables y el ancla visible. */
/**
 * El estado del sustrato, que es la única pregunta que se hace todos los días.
 *
 * Se cuenta en horas y no en días: este sustrato seca en unas 60, que son dos
 * días y medio. En un contador de días enteros ese número no se puede decir, y
 * por eso el anterior nunca coincidía con la maceta.
 */
function pintarRiego(cultivo, ultimoRiego, secados, faseId, alAnotar) {
  const sec = estadoDeSecado(cultivo, ultimoRiego, {
    secados,
    faseId,
    puente: CONFIG.SECADO_HORAS,
  });

  const s = el('section', 'estado tarjeta');

  if (!sec) {
    s.append(el('p', 'estado-n', 'Sin riegos'));
    s.append(el('p', 'estado-s', 'El contador arranca con el primero que registres.'));
    return s;
  }

  const h = Math.abs(sec.restantes);
  const grande = sec.seco ? 'Pide agua' : h < 1 ? 'Ahora' : `${h} h`;

  s.append(el('p', 'estado-k', sec.seco ? 'Secado' : 'Próximo riego'));
  s.append(el('p', `estado-n${sec.seco ? ' urge' : ''}`, grande));

  const barra = el('div', 'barra');
  const relleno = el('i');
  barra.append(relleno);
  s.append(barra);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      relleno.style.width = `${sec.pct.toFixed(1)}%`;
    })
  );

  s.append(
    el('p', 'estado-s',
      `Regado hace ${sec.transcurridas} h · seca en ~${sec.horas} h`)
  );

  s.append(el('p', 'estado-p', '¿Cómo pesa la maceta?'));
  return s;
}

/**
 * Las dos acciones del día, juntas y grandes.
 * Registrar un riego reinicia el contador; anotar el secado corrige cuánto
 * tarda de verdad. Nada más se hace desde acá todos los días.
 */
function pintarAcciones(ultimoRiego, sec, faseId, alRegistrar, alAnotar) {
  const cont = el('div', 'acciones-p');

  const regar = el('button', 'btn', 'Registré un riego');
  regar.type = 'button';
  regar.addEventListener('click', alRegistrar);
  cont.append(regar);

  if (ultimoRiego && sec) {
    const seco = el('button', 'btn btn-sec', sec.yaSeco ? 'Corregir el secado' : 'Ya se secó');
    seco.type = 'button';
    seco.addEventListener('click', async () => {
      seco.disabled = true;
      await alAnotar({
        desde: ultimoRiego,
        fecha: hoyISO(),
        horas: Math.max(1, sec.transcurridas),
        fase: faseId,
      });
    });
    cont.append(seco);
  }

  return cont;
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

  // step="any" a propósito: con un paso fijo, el navegador rechaza los valores
  // que no caen en su grilla, y la app terminaría aceptando solo lo que espera
  // en vez de lo que mediste. Relevar datos crudos significa que el número que
  // entra es el tuyo, aunque se salga del plan.
  const fEc = input('r-ec', 'number', { step: 'any', inputMode: 'decimal' });
  campo(campos, '', 'EC medida', fase ? `obj. ${rango(fase.ec_objetivo)}` : '', fEc);

  const fPh = input('r-ph', 'number', { step: 'any', inputMode: 'decimal' });
  campo(campos, '', 'pH', fase ? `obj. ${rango(fase.ph_entrada)}` : '', fPh);

  const fLitros = input('r-litros', 'number', { step: 'any', inputMode: 'decimal' });
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

/** Una sección que se abre solo si la necesitás. */
function plegable(titulo, contenido, clase = '') {
  if (!contenido) return null;
  const d = el('details', `plegable ${clase}`);
  d.append(el('summary', null, titulo));
  d.append(contenido);
  return d;
}

// ---------- render ----------

// Tipo de riego elegido a mano. Vive fuera del render para sobrevivir a un
// redibujado, pero atado al contexto en que se eligio: si cambia la fase o
// entra un riego nuevo, la eleccion caduca y vuelve a mandar la sugerencia.
// Antes quedaba pegada para siempre y tapaba lo que el plan proyectaba.
let eleccion = null;

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
    cultivo = c.datos;

    if (!e.fresco || !c.fresco) marca = `Copia local · ${antiguedad(Math.min(e.ts, c.ts))}`;
  } catch (e) {
    aviso.remove();
    const s = seccion('🌱 Cultivo');
    s.append(el('p', 'vacio mal', e.message));
    main.append(s);
    return;
  }

  // Dónde escribir lo define el contrato, no el código.
  const subRegistro = subsistema(estado, 'cultivo')?.registro;
  usarArchivo(subRegistro?.archivo_entrada_app);

  let enDrive = { riegos: [], secados: [] };
  try {
    await sincronizar();
    enDrive = await subidos();
  } catch {
    /* sin red o sin sesión: se muestran solo los pendientes locales */
  }
  const sinSubir = pendientes('riegos');
  const yaSubidos = enDrive.riegos;
  const observaciones = [
    ...secadosConsolidados(cultivo),
    ...enDrive.secados,
    ...pendientes('secados'),
  ];

  aviso.remove();

  const sub = subsistema(estado, 'cultivo');
  const ciclo = cultivo?.ciclo_activo;
  const fase = faseDe(cultivo);

  // Los riegos históricos pueden venir con fecha null a propósito (hubo riego,
  // pero no se registró la fecha). Esos no sirven para "último riego".
  const ultimo =
    [...sinSubir, ...yaSubidos]
      .map((r) => r.fecha)
      .filter(Boolean)
      .sort()
      .pop() ||
    sub?.resumen?.ultimo_riego ||
    null;

  // La sugerencia mira el plan y las reglas del archivo. La eleccion a mano
  // solo vale mientras no cambie la fase ni entre un riego nuevo.
  const registrados = [...sinSubir, ...yaSubidos];
  const sugerencia = tipoSugerido(cultivo, registrados, fase);
  const contexto = `${fase?.id || '-'}|${ultimo || '-'}`;
  if (eleccion && eleccion.para !== contexto) eleccion = null;
  const tipo = eleccion?.tipo || sugerencia.tipo;

  const irAlPlan = el('a', 'boton-enlace', 'Ver el plan completo del ciclo →');
  irAlPlan.href = '#/plan';

  // Cada sección se arma por separado y aislada.
  //
  // Antes se construían todas dentro de un array literal: si una sola tiraba un
  // error, la expresión entera moría y la pantalla quedaba en blanco. Pasó de
  // verdad, y el síntoma —Cultivo vacío— no decía nada sobre la causa. Ahora,
  // si una sección falla, se dibuja el error en su lugar y el resto sigue.
  // Cuatro cosas, no doce.
  //
  // La pantalla tenia doce secciones y cada una explicaba su propia razon de
  // ser. Eso convirtio a Cultivo en un documento que hay que leer, y dejo de
  // usarse. Lo que se mira todos los dias es una sola pregunta —si toca agua— y
  // lo que sigue es prepararla. Todo lo demas es consulta, y la consulta vive
  // en el plan.
  const sec = estadoDeSecado(cultivo, ultimo, {
    secados: observaciones,
    faseId: fase?.id,
    puente: CONFIG.SECADO_HORAS,
  });

  const abrirRegistro = () => {
    const d = main.querySelector('.registro-d');
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const secciones = [
    ['contexto', () => {
      const partes = [fase ? `${fase.nombre}` : 'Entre fases'];
      const d = diaDeCiclo(cultivo);
      if (d != null) partes.push(`día ${d}`);
      const p = el('p', 'contexto', partes.join(' · '));
      if (marca) p.append(el('span', 'marca', ` ${marca}`));
      return p;
    }],

    ['estado', () => pintarRiego(cultivo, ultimo, observaciones, fase?.id)],

    ['acciones', () => pintarAcciones(ultimo, sec, fase?.id, abrirRegistro, async (obs) => {
      await registrarSecado(obs);
      render(main);
    })],

    ['mezcla', () => pintarMezcla(cultivo, fase, tipo, sugerencia.aviso, (t) => {
      eleccion = { tipo: t, para: contexto };
      render(main);
    })],

    ['registro', () => plegable('Registrar el riego', pintarFormulario(cultivo, fase, () => render(main)), 'registro-d')],
    ['ambiente', () => plegable('Ambiente de la fase', pintarAmbiente(fase))],
    ['registros', () => plegable('Últimos registros', pintarRegistros(yaSubidos, sinSubir))],
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
