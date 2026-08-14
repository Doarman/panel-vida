// OAuth contra Google, sin backend.
//
// Usamos el "token model" de Google Identity Services: devuelve un access token
// por popup y NO entrega refresh token (sin servidor no habría dónde guardarlo).
// El token dura ~1h; para renovarlo se pide de nuevo con prompt:'' y GIS lo
// resuelve sin UI mientras tu sesión de Google siga viva en el navegador.
//
// El token vive en memoria + sessionStorage. Nunca en localStorage: sessionStorage
// muere al cerrar la app, y esa es justamente la prueba de que la renovación
// silenciosa funciona en un arranque en frío.

import { CONFIG } from '../config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const STORE_KEY = 'pv.token';
const MARGEN_MS = 60_000; // se considera vencido un minuto antes, por las dudas

let tokenClient = null;
let token = null; // { access_token, expira_en }

function cargarGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () =>
      reject(new Error('No se pudo cargar el login de Google. ¿Hay conexión?'));
    document.head.appendChild(s);
  });
}

function leerGuardado() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function guardar(t) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(t));
  } catch {
    /* modo privado o storage lleno: seguimos solo en memoria */
  }
}

function olvidar() {
  token = null;
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {}
}

/** Token vigente, o null si no hay o está por vencer. No dispara nada. */
export function tokenVigente() {
  if (!token) token = leerGuardado();
  if (token && token.expira_en > Date.now() + MARGEN_MS) return token.access_token;
  return null;
}

export function venceEn() {
  return token ? token.expira_en : 0;
}

export async function iniciar() {
  await cargarGis();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: () => {}, // se reemplaza en cada pedido
  });
}

/**
 * Pide un token. Con prompt:'' GIS no muestra nada si ya diste consentimiento
 * y tu sesión sigue activa; si hace falta interacción, abre el popup — por eso
 * el pedido interactivo tiene que salir de un click del usuario.
 */
function pedirToken() {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) {
        return reject(new Error(resp.error_description || resp.error));
      }
      // La pantalla de consentimiento permite destildar permisos de a uno.
      // Si falta alguno, la app arrancaría rota de un modo difícil de diagnosticar.
      const faltan = CONFIG.SCOPES.split(' ').filter(
        (s) => !google.accounts.oauth2.hasGrantedAnyScope(resp, s)
      );
      if (faltan.length) {
        return reject(
          new Error(
            'Faltan permisos: ' +
              faltan.map((s) => s.split('/auth/')[1]).join(', ') +
              '. Hay que aceptarlos todos para que el panel lea los tres orígenes.'
          )
        );
      }
      token = {
        access_token: resp.access_token,
        expira_en: Date.now() + (Number(resp.expires_in) || 3600) * 1000,
      };
      guardar(token);
      resolve(token.access_token);
    };

    tokenClient.error_callback = (err) => {
      reject(new Error(err?.type || 'El flujo de autorización se interrumpió.'));
    };

    try {
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      reject(e);
    }
  });
}

/** Intento silencioso al arrancar. Devuelve el token o null, sin tirar error. */
export async function reanudar() {
  const vigente = tokenVigente();
  if (vigente) return vigente;
  try {
    return await pedirToken();
  } catch {
    return null;
  }
}

/** Pedido explícito, disparado por un click. Acá sí propagamos el error. */
export async function conectar() {
  return pedirToken();
}

export async function salir() {
  const t = tokenVigente();
  olvidar();
  if (t && window.google?.accounts?.oauth2) {
    await new Promise((r) => google.accounts.oauth2.revoke(t, r));
  }
}
