// Arranque, ruteo y sesión. El contenido de cada pantalla vive en js/vistas/.
//
// Todo error se pinta en pantalla: en el celular no hay consola, y un error
// silencioso ahí es indistinguible de "la app no hace nada".

import {
  iniciar,
  reanudar,
  conectar,
  salir,
  tokenVigente,
  venceEn,
  yaOtorgado,
  ultimoMotivo,
  renovarAlPrimerGesto,
} from './auth.js';
import { render as renderHoy } from './vistas/hoy.js';
import { render as renderCultivo } from './vistas/cultivo.js';
import { render as renderRumbo } from './vistas/rumbo.js';
import { render as renderPlan } from './vistas/plan.js';

const $ = (sel) => document.querySelector(sel);
const main = $('#main');

// ---------- errores visibles ----------

function fatal(msg) {
  const el = $('#fatal');
  el.textContent = String(msg);
  el.classList.remove('oculto');
}

addEventListener('error', (e) => fatal(`Error: ${e.message}`));
addEventListener('unhandledrejection', (e) => fatal(`Error: ${e.reason?.message || e.reason}`));

// ---------- diagnóstico ----------

function marcar(clave, estado, detalle) {
  const li = document.querySelector(`li[data-k="${clave}"]`);
  if (!li) return;
  li.classList.remove('ok', 'mal');
  if (estado !== 'espera') li.classList.add(estado);
  li.querySelector('.ico').textContent = estado === 'ok' ? '✓' : estado === 'mal' ? '✕' : '·';
  li.querySelector('.det').textContent = detalle;
}

function pulso(estado) {
  $('#pulso').className = `pulso ${estado}`;
}

/** Deja armada la renovación silenciosa para el próximo toque en la pantalla. */
function armarRenovacion() {
  pulso('espera');
  renovarAlPrimerGesto((ok) => {
    marcar('sesion', ok ? 'ok' : 'mal', ultimoMotivo());
    pulso(ok ? 'ok' : 'mal');
    if (ok) rutear(); // ya hay token: se redibuja con datos frescos
  });
}

let promptInstalar = null;

function diagnosticarEntorno() {
  const standalone =
    matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  marcar('modo', standalone ? 'ok' : 'espera', standalone ? 'instalada' : 'en el navegador');

  if (!('serviceWorker' in navigator)) {
    marcar('sw', 'mal', 'no soportado');
    marcar('instalable', 'mal', 'sin service worker');
    return;
  }

  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => marcar('sw', 'ok', reg.active ? 'activo' : 'instalando…'))
    .catch((e) => marcar('sw', 'mal', e.message));

  if (standalone) marcar('instalable', 'ok', 'ya instalada');
  else marcar('instalable', 'espera', 'esperando a Chrome…');
}

// Chrome dispara esto solo si la app cumple TODOS los requisitos de instalación.
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstalar = e;
  marcar('instalable', 'ok', 'sí');
  $('#btn-instalar').classList.remove('oculto');
});

addEventListener('appinstalled', () => {
  marcar('instalable', 'ok', 'instalada');
  $('#btn-instalar').classList.add('oculto');
});

$('#btn-instalar').addEventListener('click', async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  await promptInstalar.userChoice;
  promptInstalar = null;
  $('#btn-instalar').classList.add('oculto');
});

// ---------- login ----------

/**
 * Reconectar tras un vencimiento no es lo mismo que entrar por primera vez:
 * el consentimiento ya está dado, así que es un toque y no un login.
 */
function pintarLogin() {
  const otorgado = yaOtorgado();
  $('#login-titulo').textContent = otorgado ? 'La sesión venció' : 'Sin conexión con Google';
  $('#login-texto').textContent = otorgado
    ? 'Google entrega permisos por una hora y no permite renovarlos solo a una app sin servidor. Un toque y seguís: no vuelve a pedirte permisos.'
    : 'El panel lee la agenda, el correo y los archivos de tu cuenta. No guarda nada en ningún servidor propio.';
  $('#btn-conectar').textContent = otorgado ? 'Reanudar' : 'Conectar con Google';

  main.textContent = '';
  main.append($('#card-login'));
  pulso('mal');
}

$('#btn-conectar').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  const err = $('#login-error');
  btn.disabled = true;
  err.classList.add('oculto');
  try {
    await conectar();
    marcar('sesion', 'ok', ultimoMotivo());
    location.hash = '#/hoy';
    await rutear();
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('oculto');
    err.classList.add('error');
    marcar('sesion', 'mal', e.message);
  } finally {
    btn.disabled = false;
  }
});

$('#btn-salir').addEventListener('click', async () => {
  await salir();
  marcar('sesion', 'espera', ultimoMotivo());
  pintarLogin();
});

$('#btn-volver').addEventListener('click', () => {
  location.hash = '#/hoy';
});

// ---------- ruteo ----------

const SECTORES = {
  cultivo: renderCultivo,
  rumbo: renderRumbo,
};

// Pantallas que no tienen pestaña propia: se llega a ellas desde adentro.
// Cada una declara bajo qué pestaña queda marcada.
const INTERNAS = { diagnostico: 'hoy', plan: 'cultivo' };

function rutaActual() {
  const r = location.hash.replace(/^#\/?/, '');
  // `in` y no SECTORES[r]: un sector con vista propia vale null y sería falsy.
  if (r in SECTORES || r in INTERNAS) return r;
  return 'hoy';
}

function marcarPestana(r) {
  const activa = r in SECTORES ? r : INTERNAS[r] || 'hoy';
  document
    .querySelectorAll('.sector')
    .forEach((a) => a.classList.toggle('activo', a.dataset.r === activa));
}

async function rutear() {
  const r = rutaActual();
  marcarPestana(r);
  // Cada sección tiene su color; el CSS lo toma de acá. Además de dar vida,
  // te dice dónde estás antes de leer nada. Una pantalla interna hereda el
  // color de la pestaña a la que pertenece: el plan sigue siendo cultivo.
  document.body.dataset.seccion = r in SECTORES ? r : INTERNAS[r] || 'hoy';
  scrollTo(0, 0);

  if (r === 'diagnostico') {
    const min = Math.max(0, Math.round((venceEn() - Date.now()) / 60000));
    $('#sesion-info').textContent = tokenVigente()
      ? `Sesión válida por ${min} min. Después, un toque para reanudar.`
      : 'Sin sesión activa.';
    main.textContent = '';
    main.append($('#card-diag'));
    return;
  }

  // Con la sesión vencida no frenamos todo: si alguna vez diste permiso, se
  // dibuja con la copia local y el token se renueva con tu primer toque.
  // La pantalla de login queda solo para la primera vez.
  if (!tokenVigente()) {
    if (!yaOtorgado()) return pintarLogin();
    armarRenovacion();
  }

  if (r === 'plan') return renderPlan(main);
  if (SECTORES[r]) return SECTORES[r](main);

  await renderHoy(main);
}

addEventListener('hashchange', rutear);

$('#fecha').addEventListener('click', () => {
  location.hash = location.hash === '#/diagnostico' ? '#/hoy' : '#/diagnostico';
});

// ---------- arranque ----------

function fechaDeHoy() {
  const f = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Cordoba',
  }).format(new Date());
  // En castellano solo va en mayúscula la primera letra: "Viernes, 14 de agosto".
  $('#fecha').textContent = f.charAt(0).toUpperCase() + f.slice(1);
}

async function arrancar() {
  fechaDeHoy();
  diagnosticarEntorno();

  try {
    await iniciar();
  } catch (e) {
    marcar('sesion', 'mal', e.message);
    pintarLogin();
    const p = $('#login-error');
    p.textContent = e.message;
    p.classList.remove('oculto');
    p.classList.add('error');
    return;
  }

  const ok = await reanudar();
  marcar('sesion', ok ? 'ok' : 'mal', ultimoMotivo());
  pulso(ok ? 'ok' : 'mal');

  await rutear();
}

// Al volver a la app después de un rato el token pudo vencer. No interrumpimos:
// se arma la renovación para el próximo toque y la vista sigue con la copia local.
addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (tokenVigente() || !yaOtorgado()) return;
  marcar('sesion', 'espera', 'token vencido, se renueva al tocar');
  armarRenovacion();
});

arrancar();
