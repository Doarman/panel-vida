// Arranque de la app: reanuda la sesión, corre la prueba de conexión,
// resuelve el ruteo y reporta el estado del entorno.
//
// Todo error se pinta en pantalla: en el celular no hay consola, y un error
// silencioso ahí es indistinguible de "la app no hace nada".

import { iniciar, reanudar, conectar, salir, tokenVigente, venceEn } from './auth.js';
import { eventosDeHoy, correoParaMirar, leerEstado } from './api.js';

const $ = (sel) => document.querySelector(sel);

// ---------- reporte de errores ----------

function fatal(msg) {
  const el = $('#fatal');
  el.textContent = String(msg);
  el.classList.remove('oculto');
}

addEventListener('error', (e) => fatal(`Error: ${e.message}`));
addEventListener('unhandledrejection', (e) => fatal(`Error: ${e.reason?.message || e.reason}`));

// ---------- tarjetas de la pantalla Hoy ----------

const cards = {
  cargando: $('#card-cargando'),
  login: $('#card-login'),
  estado: $('#card-estado'),
};

function mostrarCard(cual) {
  for (const [k, el] of Object.entries(cards)) el.classList.toggle('oculto', k !== cual);
}

function marcar(clave, estado, detalle) {
  const li = document.querySelector(`li[data-k="${clave}"]`);
  if (!li) return;
  li.classList.remove('ok', 'mal');
  if (estado !== 'espera') li.classList.add(estado);
  li.querySelector('.ico').textContent = estado === 'ok' ? '✓' : estado === 'mal' ? '✕' : '·';
  li.querySelector('.det').textContent = detalle;
}

// ---------- prueba de conexión ----------

async function chequear(clave, fn) {
  marcar(clave, 'espera', 'consultando…');
  try {
    marcar(clave, 'ok', await fn());
  } catch (e) {
    marcar(clave, 'mal', e.message);
  }
}

async function pruebaDeConexion() {
  const btn = $('#btn-revisar');
  btn.disabled = true;

  await Promise.all([
    chequear('calendar', async () => {
      const ev = await eventosDeHoy();
      return ev.length === 1 ? '1 evento hoy' : `${ev.length} eventos hoy`;
    }),
    chequear('gmail', async () => {
      const { ids, estimado } = await correoParaMirar();
      const n = ids.length || estimado;
      return n === 1 ? '1 sin leer' : `${n} sin leer`;
    }),
    chequear('drive', async () => {
      const est = await leerEstado();
      const subs = Object.keys(est?.subsistemas || {}).length;
      return `v${est?._meta?.version ?? '?'} · ${subs} subsistemas`;
    }),
  ]);

  const min = Math.max(0, Math.round((venceEn() - Date.now()) / 60000));
  $('#sesion-info').textContent = `Sesión válida por ${min} min. Se renueva sola.`;
  btn.disabled = false;
}

// ---------- diagnóstico del entorno ----------

let promptInstalar = null;

function diagnosticar() {
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
// Si nunca llega, es que algo del manifest o del service worker no pasó.
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

// ---------- ruteo ----------

const SECTORES = {
  cultivo: ['🌱 Cultivo', 'Ciclo, fase, riego proyectado y registro. Todavía sin construir.'],
  academico: ['📕 Académico', 'Tesis, diplomatura y pipeline de formación. Todavía sin construir.'],
  laboral: ['💼 Laboral', 'Eje profesional, proyectos y hoja de ruta. Todavía sin construir.'],
};

function rutaActual() {
  const r = location.hash.replace(/^#\/?/, '');
  return SECTORES[r] ? r : 'hoy';
}

function rutear() {
  const r = rutaActual();
  const esHoy = r === 'hoy';

  $('#p-hoy').classList.toggle('oculto', !esHoy);
  $('#p-sector').classList.toggle('oculto', esHoy);

  if (!esHoy) {
    const [titulo, texto] = SECTORES[r];
    $('#sector-titulo').textContent = titulo;
    $('#sector-texto').textContent = texto;
  }

  document
    .querySelectorAll('.sector')
    .forEach((a) => a.classList.toggle('activo', a.dataset.r === r));
}

addEventListener('hashchange', rutear);

// ---------- arranque ----------

function fechaDeHoy() {
  $('#fecha').textContent = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Cordoba',
  }).format(new Date());
}

async function entrar() {
  mostrarCard('estado');
  await pruebaDeConexion();
}

async function arrancar() {
  fechaDeHoy();
  rutear();
  diagnosticar();
  mostrarCard('cargando');

  try {
    await iniciar();
  } catch (e) {
    mostrarCard('login');
    const p = $('#login-error');
    p.textContent = e.message;
    p.classList.remove('oculto', 'error');
    p.classList.add('error');
    return;
  }

  if (await reanudar()) await entrar();
  else mostrarCard('login');
}

$('#btn-conectar').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  const err = $('#login-error');
  btn.disabled = true;
  err.classList.add('oculto');
  try {
    await conectar();
    await entrar();
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('oculto');
    err.classList.add('error');
  } finally {
    btn.disabled = false;
  }
});

$('#btn-revisar').addEventListener('click', pruebaDeConexion);

$('#btn-salir').addEventListener('click', async () => {
  await salir();
  mostrarCard('login');
});

// Al volver a la app después de un rato, el token pudo vencer.
addEventListener('visibilitychange', () => {
  if (
    document.visibilityState === 'visible' &&
    !tokenVigente() &&
    !cards.estado.classList.contains('oculto')
  ) {
    pruebaDeConexion();
  }
});

arrancar();
