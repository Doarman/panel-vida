// Llamadas a las APIs de Google. Capa fina: arma la URL, agrega el token,
// traduce los errores a algo legible. Nada de lógica de negocio acá.

import { CONFIG } from '../config.js';
import { tokenVigente, reanudar } from './auth.js';

async function pedir(url, { raw = false, metodo = 'GET', cuerpo = null, tipo = null } = {}) {
  let token = tokenVigente() || (await reanudar());
  if (!token) throw new Error('Sin sesión');

  const armar = (t) => {
    const cab = { Authorization: `Bearer ${t}` };
    if (tipo) cab['Content-Type'] = tipo;
    return { method: metodo, headers: cab, body: cuerpo };
  };

  let resp = await fetch(url, armar(token));

  // 401 = el token murió antes de lo previsto. Un reintento silencioso y listo.
  if (resp.status === 401) {
    token = await reanudar();
    if (!token) throw new Error('Sin sesión');
    resp = await fetch(url, armar(token));
  }

  if (!resp.ok) {
    let detalle = `HTTP ${resp.status}`;
    try {
      const j = await resp.json();
      if (j?.error?.message) detalle = j.error.message;
    } catch {}
    throw new Error(detalle);
  }

  return raw ? resp.text() : resp.json();
}

/** Límites del día de hoy en hora local del dispositivo. */
function limitesDelDia(d = new Date()) {
  const desde = new Date(d);
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(desde);
  hasta.setDate(hasta.getDate() + 1);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

/**
 * Eventos de hoy. singleEvents=true es obligatorio: sin eso las series
 * recurrentes vuelven como una sola regla y no como las instancias del día.
 */
export async function eventosDeHoy() {
  const { desde, hasta } = limitesDelDia();
  const u = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      CONFIG.CALENDAR_ID
    )}/events`
  );
  u.search = new URLSearchParams({
    timeMin: desde,
    timeMax: hasta,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
    timeZone: CONFIG.TZ,
  });
  const j = await pedir(u);
  return j.items || [];
}

// El triage pesado lo hace Gmail, no nosotros: sus propias categorías sacan
// promociones, redes y foros antes de que nada viaje por la red del celular.
const CONSULTA =
  'is:unread newer_than:7d -category:promotions -category:social -category:forums -in:chats';

const TOPE = 8; // cuántos traemos con remitente y asunto

/**
 * Correo que puede requerir tu mirada. Devuelve los primeros con detalle y
 * cuántos quedaron sin mostrar.
 *
 * messages.list solo devuelve IDs, así que el detalle cuesta una llamada por
 * mensaje. Por eso el tope: en 4G, treinta llamadas son una pantalla que tarda.
 */
export async function correoParaMirar() {
  const u = new URL('https://www.googleapis.com/gmail/v1/users/me/messages');
  u.search = new URLSearchParams({ q: CONSULTA, maxResults: '25' });
  const lista = await pedir(u);

  const ids = lista.messages || [];
  const total = ids.length;

  const detalles = await Promise.all(
    ids.slice(0, TOPE).map(async ({ id }) => {
      const d = new URL(`https://www.googleapis.com/gmail/v1/users/me/messages/${id}`);
      d.search = new URLSearchParams([
        ['format', 'metadata'],
        ['metadataHeaders', 'From'],
        ['metadataHeaders', 'Subject'],
        ['metadataHeaders', 'List-Unsubscribe'],
      ]);
      const m = await pedir(d);
      const h = {};
      for (const { name, value } of m.payload?.headers || []) h[name.toLowerCase()] = value;

      return {
        id,
        de: nombreDeRemitente(h.from || ''),
        asunto: h.subject || '(sin asunto)',
        // Un encabezado para desuscribirse es la firma casi perfecta de un
        // envío masivo: newsletters y notificaciones automáticas lo llevan,
        // una persona escribiéndote no.
        masivo: Boolean(h['list-unsubscribe']),
      };
    })
  );

  return { mensajes: detalles, total, ocultos: Math.max(0, total - detalles.length) };
}

/** "Nico Quiroga <nico@x.com>" -> "Nico Quiroga". Si no hay nombre, el usuario. */
function nombreDeRemitente(from) {
  const conNombre = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (conNombre) return conNombre[1].trim();
  const soloMail = from.match(/([^@<\s]+)@/);
  return soloMail ? soloMail[1] : from.trim() || 'Desconocido';
}

/** Baja un archivo de Drive por ID y lo parsea como JSON. */
export async function leerJsonDeDrive(fileId) {
  const u = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  u.search = new URLSearchParams({ alt: 'media' });
  const txt = await pedir(u, { raw: true });
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error('El archivo no es JSON válido');
  }
}

export function leerEstado() {
  return leerJsonDeDrive(CONFIG.ESTADO_FILE_ID);
}

// ---------- escritura en Drive ----------
//
// Todo lo de acá abajo usa el scope drive.file, que solo alcanza archivos que
// creó esta app. Por diseño no puede tocar cultivo.json, estado.json ni nada
// más de tu Drive, ni siquiera por un bug.

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const SUBIDA = 'https://www.googleapis.com/upload/drive/v3/files';

/** Busca un archivo creado por esta app. Devuelve el ID o null. */
export async function buscarArchivoPropio(nombre) {
  const u = new URL(DRIVE);
  u.search = new URLSearchParams({
    q: `name = '${nombre.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: '5',
  });
  const j = await pedir(u);
  return j.files?.[0]?.id || null;
}

/** Crea un JSON nuevo. Queda en la raíz del Drive: la app no puede elegir
 *  carpeta ajena con este scope, y no hace falta — estado.json lo referencia
 *  por ID, no por ubicación. */
export async function crearJsonPropio(nombre, datos) {
  const limite = 'lim' + Math.random().toString(36).slice(2);
  const cuerpo =
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: nombre, mimeType: 'application/json' }) +
    `\r\n--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(datos, null, 2) +
    `\r\n--${limite}--`;

  const u = new URL(SUBIDA);
  u.search = new URLSearchParams({ uploadType: 'multipart', fields: 'id' });
  const j = await pedir(u, {
    metodo: 'POST',
    cuerpo,
    tipo: `multipart/related; boundary=${limite}`,
  });
  return j.id;
}

export async function reemplazarJsonPropio(fileId, datos) {
  const u = new URL(`${SUBIDA}/${fileId}`);
  u.search = new URLSearchParams({ uploadType: 'media', fields: 'id' });
  await pedir(u, {
    metodo: 'PATCH',
    cuerpo: JSON.stringify(datos, null, 2),
    tipo: 'application/json; charset=UTF-8',
  });
}
