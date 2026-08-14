// Arranque de la app: reanuda la sesión, corre la prueba de conexión
// y cablea los botones. Por ahora el shell no tiene secciones: primero
// validamos que instale y que la sesión aguante.

import { iniciar, reanudar, conectar, salir, tokenVigente, venceEn } from './auth.js';
import { eventosDeHoy, correoParaMirar, leerEstado } from './api.js';

const $ = (sel) => document.querySelector(sel);

const vistas = {
  cargando: $('#card-cargando'),
  login: $('#card-login'),
  estado: $('#card-estado'),
};

function mostrar(cual) {
  for (const [k, el] of Object.entries(vistas)) el.classList.toggle('oculto', k !== cual);
}

function fechaDeHoy() {
  const f = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Cordoba',
  }).format(new Date());
  $('#fecha').textContent = f;
}

function marcar(clave, estado, detalle) {
  const li = document.querySelector(`.chequeos li[data-k="${clave}"]`);
  li.classList.remove('ok', 'mal');
  if (estado !== 'espera') li.classList.add(estado);
  li.querySelector('.ico').textContent =
    estado === 'ok' ? '✓' : estado === 'mal' ? '✕' : '·';
  li.querySelector('.det').textContent = detalle;
}

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

  // En paralelo: son tres servicios distintos, no hay razón para encadenarlos.
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

async function entrar() {
  mostrar('estado');
  await pruebaDeConexion();
}

async function arrancar() {
  fechaDeHoy();
  mostrar('cargando');

  try {
    await iniciar();
  } catch (e) {
    mostrar('login');
    const p = $('#login-error');
    p.textContent = e.message;
    p.classList.remove('oculto');
    p.classList.add('error');
    return;
  }

  if (await reanudar()) await entrar();
  else mostrar('login');
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
  mostrar('login');
});

// Al volver a la app después de un rato, el token pudo vencer.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !tokenVigente() && !vistas.estado.classList.contains('oculto')) {
    pruebaDeConexion();
  }
});

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

arrancar();
