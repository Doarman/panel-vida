// Registro de riegos: lo único que esta app escribe.
//
// Nunca toca cultivo.json. Escribe append-only en un archivo propio, creado por
// la app con el scope drive.file, y Claude (Cowork) lo consolida después en
// ciclo_activo.riegos_ejecutados durante el repaso semanal.
//
// Por qué así y no modificando cultivo.json directamente:
//   - Son 24 KB con dos escritores (Cowork y esta app). Bajar, modificar y
//     volver a subir el archivo entero desde el celular es la forma más fácil
//     de pisar cambios o de dejarlo truncado si se corta la conexión.
//   - Agregar a un archivo propio no puede corromper la base pase lo que pase.
//
// Todo riego se guarda PRIMERO en el teléfono y recién después se sube. Si no
// hay señal, el dato no se pierde: queda pendiente y sube en el próximo intento.

import {
  buscarArchivoPropio, buscarCarpeta, crearJsonPropio, reemplazarJsonPropio, leerJsonDeDrive,
} from './api.js';
import { hoyISO } from './cultivo-datos.js';

// Dónde escribe la app. El contrato lo declara estado.json en
// subsistemas.cultivo.registro.archivo_entrada_app; esto es solo el valor por
// defecto para cuando todavía no se leyó el estado.
let ARCHIVO = 'riegos_registrados.json';
let CARPETA = 'Cultivo';

/** Toma la ruta declarada en estado.json. Ej: /Asistente Nico/Cultivo/x.json */
export function usarArchivo(ruta) {
  if (!ruta) return;
  const partes = String(ruta).split('/').filter(Boolean);
  const nombre = partes.pop();
  if (!nombre) return;
  ARCHIVO = nombre;
  CARPETA = partes.pop() || null;
}

const PENDIENTES = 'pv.riegos.pendientes';
// El ID cacheado se guarda por nombre de archivo: si el contrato cambia el
// nombre, no se hereda el ID del archivo anterior.
const claveId = () => `pv.riegos.fileId.${ARCHIVO}`;

// Función y no constante: devuelve un objeto nuevo cada vez, así nadie puede
// terminar empujando riegos dentro del molde por una copia superficial.
const esqueleto = () => ({
  _meta: {
    descripcion:
      'Riegos registrados desde la PWA Panel de Vida. Append-only. Para consolidar en ciclo_activo.riegos_ejecutados de cultivo.json.',
    escribe: 'Panel de Vida (app movil)',
    consolida: 'Claude (Cowork)',
    version: 1,
  },
  riegos: [],
});

// ---------- cola local ----------

function leerPendientes() {
  try {
    return JSON.parse(localStorage.getItem(PENDIENTES) || '[]');
  } catch {
    return [];
  }
}

function guardarPendientes(lista) {
  try {
    localStorage.setItem(PENDIENTES, JSON.stringify(lista));
  } catch {}
}

export function pendientes() {
  return leerPendientes();
}

// ---------- archivo en Drive ----------

async function idDelArchivo(forzarBusqueda = false) {
  if (!forzarBusqueda) {
    const cacheado = localStorage.getItem(claveId());
    if (cacheado) return cacheado;
  }

  let id = await buscarArchivoPropio(ARCHIVO);

  if (!id) {
    // Se intenta crearlo en la carpeta que declara el contrato. Si el scope no
    // alcanza para esa carpeta, cae en la raíz y se encuentra igual: todo se
    // resuelve por nombre.
    let carpetaId = null;
    if (CARPETA) {
      try {
        carpetaId = await buscarCarpeta(CARPETA);
      } catch {}
    }
    id = await crearJsonPropio(ARCHIVO, esqueleto(), carpetaId);
  }

  try {
    localStorage.setItem(claveId(), id);
  } catch {}
  return id;
}

const NO_EXISTE = /404|not found|no encontr/i;

/**
 * Corre una operación contra el archivo, y si el ID guardado ya no sirve,
 * lo busca de nuevo y reintenta.
 *
 * Sin esto, el ID quedaba cacheado para siempre: si el archivo se borraba, se
 * mandaba a la papelera, o Cowork lo reemplazaba por uno nuevo en vez de
 * vaciarlo, la app seguía escribiendo contra un ID muerto y TODOS los
 * registros fallaban sin forma de recuperarse.
 */
async function conArchivo(accion) {
  try {
    return await accion(await idDelArchivo());
  } catch (e) {
    if (!NO_EXISTE.test(e.message)) throw e;
    try {
      localStorage.removeItem(claveId());
    } catch {}
    return accion(await idDelArchivo(true));
  }
}

/** Lo ya subido. Devuelve [] si el archivo todavía no existe. */
export async function subidos() {
  const id = localStorage.getItem(claveId());
  if (!id) return [];
  try {
    const j = await leerJsonDeDrive(id);
    return Array.isArray(j?.riegos) ? j.riegos : [];
  } catch (e) {
    if (!NO_EXISTE.test(e.message)) throw e;
    try {
      localStorage.removeItem(claveId());
    } catch {}
    return [];
  }
}

/**
 * Sube los pendientes. Relee el archivo antes de escribir, así no pisa lo que
 * haya entrado desde otro lado, y solo limpia la cola local cuando Drive
 * confirmó la escritura.
 */
export async function sincronizar() {
  const cola = leerPendientes();
  if (!cola.length) return { subidos: 0 };

  const nuevos = await conArchivo(async (id) => {
    // Se lee siempre antes de escribir, y si la lectura falla se corta acá.
    //
    // Antes, ante un error que no fuera "no existe" (red cortada a mitad, un
    // 500 de Google, la sesión vencida), se armaba una base vacía y se escribía
    // encima: eso habría borrado todos los riegos ya subidos. Perder un intento
    // de subida no cuesta nada —los pendientes quedan en el teléfono y se
    // reintenta—, pero pisar el historial no se puede deshacer.
    //
    // El caso "no existe" lo resuelve conArchivo: busca o crea el archivo, que
    // nace con el esqueleto, y reintenta.
    const actual = await leerJsonDeDrive(id);
    if (!Array.isArray(actual.riegos)) actual.riegos = [];

    const yaEstan = new Set(actual.riegos.map((r) => r.id));
    const pendientesReales = cola.filter((r) => !yaEstan.has(r.id));
    if (!pendientesReales.length) return [];

    actual.riegos.push(...pendientesReales);
    actual.riegos.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

    // Se conserva lo que haya escrito Cowork en _meta; solo se pisa la fecha.
    actual._meta = {
      ...esqueleto()._meta,
      ...(actual._meta || {}),
      actualizado: new Date().toISOString(),
    };

    await reemplazarJsonPropio(id, actual);
    return pendientesReales;
  });

  guardarPendientes([]); // recién ahora, con la escritura confirmada
  return { subidos: nuevos.length };
}

/**
 * Guarda el riego en el teléfono y trata de subirlo. Nunca lo pierde.
 *
 * El formato del registro lo define cultivo.json en registro_crudo.esquema:
 * id con formato r-YYYY-MM-DD y fecha de carga en registrado_el. Se le agrega
 * un sufijo corto al id porque el formato documentado se repite si hay dos
 * riegos el mismo día, y la deduplicación al consolidar se hace por id.
 */
export async function registrar(riego) {
  const sufijo = Math.random().toString(36).slice(2, 6);
  const entrada = {
    id: `r-${riego.fecha}-${sufijo}`,
    registrado_el: hoyISO(),
    ...riego,
  };

  guardarPendientes([...leerPendientes(), entrada]);

  try {
    await sincronizar();
    return { entrada, subido: true };
  } catch (e) {
    return { entrada, subido: false, error: e.message };
  }
}
