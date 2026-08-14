// OAuth contra Google, sin backend.
//
// Límite de fondo, que no se puede esquivar del lado del cliente: Google no
// entrega refresh token a una app de navegador (sin servidor no habría dónde
// guardarlo). Solo hay access tokens de ~1 h.
//
// Y la renovación tampoco es invisible: el flujo abre un popup aunque no tenga
// nada que mostrar, y los navegadores bloquean los popups que no salen de un
// toque del usuario. O sea que un token vencido SIEMPRE cuesta un toque.
//
// De ahí las dos decisiones de acá:
//
//  - El token se guarda en localStorage, no en sessionStorage. Así sobrevive a
//    cerrar la app y volver a abrirla, que es el uso real: mientras siga vigente,
//    entrás sin tocar nada. El costo es que el token queda escrito en el disco
//    del teléfono hasta que vence. Como esta app no carga código de terceros
//    (salvo el login de Google) ni muestra contenido ajeno, la superficie para
//    robarlo es mínima; a cambio, la app deja de pedir login varias veces por día.
//
//  - Guardamos aparte si alguna vez diste consentimiento. Sin esa marca, ni
//    intentamos el pedido automático: solo serviría para que el navegador
//    bloquee un popup y ensucie el diagnóstico.

import { CONFIG } from '../config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const STORE_KEY = 'pv.token';
const GRANT_KEY = 'pv.otorgado';
const MARGEN_MS = 60_000; // se considera vencido un minuto antes, por las dudas

let tokenClient = null;
let token = null; // { access_token, expira_en }
let motivo = 'sin intentar'; // qué pasó en el último intento, para el diagnóstico

// ---------- almacenamiento ----------

function leer(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribir(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* modo privado o storage lleno: seguimos solo en memoria */
  }
}

function borrar(clave) {
  try {
    localStorage.removeItem(clave);
  } catch {}
}

function leerGuardado() {
  try {
    const raw = leer(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ---------- carga de Google Identity Services ----------

function cargarGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar el login de Google. ¿Hay conexión?'));
    document.head.appendChild(s);
  });
}

// ---------- estado público ----------

/** Token vigente, o null si no hay o está por vencer. No dispara nada. */
export function tokenVigente() {
  if (!token) token = leerGuardado();
  if (token && token.expira_en > Date.now() + MARGEN_MS) return token.access_token;
  return null;
}

export function venceEn() {
  return token ? token.expira_en : 0;
}

/** Hubo consentimiento alguna vez: entonces reconectar es un toque, no un login. */
export function yaOtorgado() {
  return leer(GRANT_KEY) === '1';
}

/** Qué pasó en el último intento. Lo muestra la tarjeta de diagnóstico. */
export function ultimoMotivo() {
  return motivo;
}

export async function iniciar() {
  await cargarGis();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: () => {}, // se reemplaza en cada pedido
  });
}

// ---------- pedido de token ----------

function pedirToken() {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error));

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
      escribir(STORE_KEY, JSON.stringify(token));
      escribir(GRANT_KEY, '1');
      resolve(token.access_token);
    };

    tokenClient.error_callback = (err) => {
      reject(new Error(err?.type || 'el flujo se interrumpió'));
    };

    try {
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Intento de arranque, sin molestar. Devuelve el token o null.
 * Deja en `motivo` qué pasó, porque en el celular no hay otra forma de saberlo.
 */
export async function reanudar() {
  const vigente = tokenVigente();
  if (vigente) {
    const min = Math.round((token.expira_en - Date.now()) / 60000);
    motivo = `token guardado, ${min} min restantes`;
    return vigente;
  }

  if (!yaOtorgado()) {
    motivo = 'nunca conectado';
    return null;
  }

  // Hubo consentimiento pero el token venció. El pedido sin gesto casi seguro
  // muere en el bloqueador de popups; lo intentamos igual y anotamos el motivo.
  try {
    const t = await pedirToken();
    motivo = 'renovado sin intervención';
    return t;
  } catch (e) {
    const m = String(e.message);
    motivo = m.includes('popup')
      ? 'token vencido; el navegador bloqueó la renovación automática'
      : `token vencido (${m})`;
    return null;
  }
}

/** Pedido explícito, disparado por un toque. Acá sí propagamos el error. */
export async function conectar() {
  const t = await pedirToken();
  motivo = 'reconectado a mano';
  return t;
}

/**
 * Renueva en cuanto toques cualquier parte de la pantalla.
 *
 * El popup que abre Google solo lo permite el navegador si hay un gesto
 * reciente del usuario. Al abrir la app no hay ninguno, y por eso el intento
 * automático se bloquea. Pero el primer toque —en una pestaña, en el scroll,
 * donde sea— alcanza: ahí sí se puede pedir el token y, como el consentimiento
 * ya está dado, se resuelve sin mostrar nada.
 *
 * O sea: en vez de pedirte que toques un botón que dice "Reanudar", usamos el
 * toque que ibas a hacer igual.
 */
let armado = false;

export function renovarAlPrimerGesto(avisar) {
  if (armado || !yaOtorgado()) return;
  armado = true;

  const quitar = () => {
    armado = false;
    removeEventListener('pointerdown', alTocar, true);
    removeEventListener('keydown', alTocar, true);
  };

  async function alTocar() {
    quitar();
    try {
      await pedirToken();
      motivo = 'renovado con el primer toque';
      avisar(true);
    } catch (e) {
      motivo = `no se pudo renovar (${e.message})`;
      avisar(false);
    }
  }

  addEventListener('pointerdown', alTocar, true);
  addEventListener('keydown', alTocar, true);
}

export async function salir() {
  const t = tokenVigente();
  token = null;
  borrar(STORE_KEY);
  borrar(GRANT_KEY);
  motivo = 'sesión cerrada';
  if (t && window.google?.accounts?.oauth2) {
    await new Promise((r) => google.accounts.oauth2.revoke(t, r));
  }
}
