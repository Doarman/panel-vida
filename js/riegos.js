// Registro de riegos: lo único que esta app escribe.
//
// Nunca toca cultivo.json. Escribe append-only en un archivo propio, creado por
// la app con el scope drive.file, y Claude (Cowork) lo consolida después en
// los riegos_ejecutados de cada ciclo durante el repaso semanal.
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
// Dos listas en el mismo archivo, las dos append-only. Los secados van acá y no
// en un archivo aparte para que Cowork consolide en un solo movimiento.
const LISTAS = ['riegos', 'secados'];

const esqueleto = () => ({
  _meta: {
    descripcion:
      'Registros de la PWA Panel de Vida. Append-only. Cada entrada trae "ciclo" (id del ciclo) y "grupo"; las que no lo traen son del grupo-1. "riegos" se consolida en riegos_ejecutados del ciclo que corresponda; "secados" son observaciones de cuando el sustrato llego a seco, en HORAS, para medir ciclo_secado_horas de ese grupo.',
    escribe: 'Panel de Vida (app movil)',
    consolida: 'Claude (Cowork)',
    version: 2,
  },
  riegos: [],
  secados: [],
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

/** Lo que todavía no subió. Con `lista`, solo lo de esa lista. */
export function pendientes(lista = null) {
  const todo = leerPendientes();
  return lista ? todo.filter((e) => e._lista === lista) : todo;
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

const VACIO = { riegos: [], secados: [] };

/**
 * Lo ya subido, por lista. Devuelve listas vacías si el archivo no existe.
 *
 * Si no hay ID cacheado se busca por nombre, pero NO se crea el archivo: una
 * lectura no debe tener efectos. Sin esta búsqueda, en un teléfono nuevo el
 * historial se veía vacío hasta que registraras algo, porque el ID solo se
 * guarda al escribir.
 */
export async function subidos() {
  let id = localStorage.getItem(claveId());

  if (!id) {
    try {
      id = await buscarArchivoPropio(ARCHIVO);
    } catch {
      return { ...VACIO };
    }
    if (!id) return { ...VACIO };
    try {
      localStorage.setItem(claveId(), id);
    } catch {}
  }

  try {
    const j = await leerJsonDeDrive(id);
    return Object.fromEntries(LISTAS.map((l) => [l, Array.isArray(j?.[l]) ? j[l] : []]));
  } catch (e) {
    if (!NO_EXISTE.test(e.message)) throw e;
    try {
      localStorage.removeItem(claveId());
    } catch {}
    return { ...VACIO };
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

    const pendientesReales = [];
    for (const lista of LISTAS) {
      if (!Array.isArray(actual[lista])) actual[lista] = [];

      const yaEstan = new Set(actual[lista].map((r) => r.id));
      // `_lista` es del transporte, no del registro: no viaja al archivo.
      const nuevos = cola
        .filter((e) => (e._lista || 'riegos') === lista && !yaEstan.has(e.id))
        .map(({ _lista, ...datos }) => datos);
      if (!nuevos.length) continue;

      actual[lista].push(...nuevos);
      actual[lista].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
      pendientesReales.push(...nuevos);
    }
    if (!pendientesReales.length) return [];

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
  return encolar('riegos', `r-${riego.fecha}`, riego);
}

/**
 * Anota que el sustrato llegó a seco.
 *
 * Es el dato que convierte `ciclo_secado_dias` de estimación en medición. No
 * es una tarea que se cumple ni un aviso que se descarta: es una observación
 * que Nico hizo levantando la maceta, y la única fuente de verdad sobre cuánto
 * tarda de verdad en secar este grupo, en esta fase, con este clima.
 *
 * `desde` es la fecha del riego que arrancó ese secado: sin ese ancla, el
 * número de horas no se puede recalcular ni auditar después.
 *
 * Los campos van nombrados uno por uno a propósito, pero eso tiene un costo:
 * cuando la unidad pasó de días a horas, `horas` no estaba en la lista y se
 * descartaba en silencio. Cada anotación subía sin el dato que la justifica.
 * Ahora pasa todo lo que llega, y `ciclo`/`alcance` dicen a qué grupo y a qué
 * subconjunto pertenece.
 */
export async function registrarSecado({ fecha, ...datos }) {
  return encolar('secados', `s-${fecha}`, { fecha, ...datos });
}

/** Guarda en el teléfono primero y recién después intenta subir. */
async function encolar(lista, prefijoId, datos) {
  const sufijo = Math.random().toString(36).slice(2, 6);
  const entrada = {
    _lista: lista,
    id: `${prefijoId}-${sufijo}`,
    registrado_el: hoyISO(),
    ...datos,
  };

  guardarPendientes([...leerPendientes(), entrada]);

  try {
    await sincronizar();
    return { entrada, subido: true };
  } catch (e) {
    return { entrada, subido: false, error: e.message };
  }
}
