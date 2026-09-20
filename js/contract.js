// Única capa que conoce los nombres de campo de estado.json.
//
// El archivo lo escribe Claude en Cowork y lo lee esta app: son dos sistemas
// distintos sobre el mismo contrato. Si algún día cambia un nombre, se toca
// acá y nada más. Y todo se lee a la defensiva: ante un campo que falta, la
// app muestra "sin datos", nunca se rompe.

/**
 * Cómo se traduce el color de un evento de Calendar a un tipo de bloque.
 * Lo ideal es que viva en estado.json (así se cambia desde Cowork sin tocar
 * código); esto es el respaldo mientras ese bloque no exista.
 */
const MAPA_POR_DEFECTO = {
  7: { tipo: 'salud', etiqueta: 'No negociable' },
  11: { tipo: 'tesis', etiqueta: 'Tesis' },
  5: { tipo: 'flexible', etiqueta: 'Flexible' },
  1: { tipo: 'profesional', etiqueta: 'Profesional' },
};

export function mapaDeColores(estado) {
  const propio = estado?.calendario?.mapa_colores;
  return propio && typeof propio === 'object' ? propio : MAPA_POR_DEFECTO;
}

/** Qué hacer con un color que el mapa no contempla. estado.json puede fijarlo. */
export function claseDefecto(estado) {
  const d = estado?.calendario?.default;
  return { tipo: d?.tipo || 'otro', etiqueta: d?.etiqueta || '' };
}

/** Clasifica un evento. Los que Google crea solo desde el correo van aparte. */
export function clasificar(ev, mapa, defecto = { tipo: 'otro', etiqueta: '' }) {
  if (ev?.eventType === 'fromGmail') {
    return { tipo: 'externo', etiqueta: 'Desde Gmail' };
  }
  const m = mapa[ev?.colorId];
  return m ? { tipo: m.tipo || defecto.tipo, etiqueta: m.etiqueta || '' } : { ...defecto };
}

export function perfil(estado) {
  return {
    nombre: estado?.perfil?.nombre?.split(' ')[0] || null,
    ritmo: estado?.perfil?.ritmo || null,
  };
}

export function principio(estado) {
  return estado?.principio_rector?.enunciado || null;
}

/** Resumen de un subsistema. Devuelve null si no está o no está activo. */
export function subsistema(estado, clave) {
  const s = estado?.subsistemas?.[clave];
  if (!s || s.activo === false) return null;
  return {
    resumen: s.resumen || {},
    archivoId: s.drive_file_id || null,
    // Ruta declarada del archivo. Es el respaldo cuando el ID queda viejo.
    ruta: s.archivo_datos || null,
    // Dónde y cómo escribe la app. El contrato lo declara estado.json, así que
    // el nombre del archivo de entrada no se hardcodea acá.
    registro: s.registro || null,
    reglas: Array.isArray(s.reglas_criticas_para_el_asistente)
      ? s.reglas_criticas_para_el_asistente
      : [],
    grupos: gruposDe(s),
  };
}

/**
 * Los archivos de datos de un subsistema con ciclos en paralelo.
 *
 * `archivos_por_grupo` apareció con el segundo ciclo de cultivo: cada grupo
 * tiene su archivo. `archivo_datos` se conserva apuntando al del grupo 1, que
 * es además el canónico, el que guarda los bloques globales que los otros no
 * copian. Sin la lista nueva, un solo grupo: el archivo de siempre.
 */
function gruposDe(s) {
  const canonico = s.archivo_datos || null;
  const lista = Array.isArray(s.archivos_por_grupo)
    ? s.archivos_por_grupo.filter((g) => g?.archivo)
    : [];

  if (!lista.length) {
    return [{ grupo: null, ruta: canonico, archivoId: s.drive_file_id || null, resumen: s.resumen || {}, canonico: true }];
  }

  const hayCanonico = lista.some((g) => g.archivo === canonico);
  return lista.map((g, i) => ({
    grupo: g.grupo || null,
    ruta: g.archivo,
    archivoId: s.grupos?.[g.grupo]?.drive_file_id || null,
    resumen: s.grupos?.[g.grupo]?.resumen || {},
    canonico: hayCanonico ? g.archivo === canonico : i === 0,
  }));
}

/** "grupo-2" → "Grupo 2". */
export const nombreDeGrupo = (id) =>
  String(id || '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Alertas de todos los subsistemas, con su origen. Para "Requiere tu mirada".
 *
 * Con ciclos en paralelo, cada grupo trae las suyas en `grupos.<id>.resumen`,
 * y la etiqueta dice de cuál es: dos alertas de riego sin el grupo no se
 * distinguen.
 */
export function alertas(estado) {
  const subs = estado?.subsistemas || {};
  const salida = [];
  const sumar = (lista, origen, etiqueta) => {
    for (const a of lista || []) {
      if (typeof a === 'string' && a.trim()) salida.push({ origen, etiqueta, texto: a });
    }
  };
  for (const [clave, s] of Object.entries(subs)) {
    if (s?.activo === false) continue;
    sumar(s?.resumen?.alertas, clave, clave);
    for (const [id, g] of Object.entries(s?.grupos || {})) {
      sumar(g?.resumen?.alertas, clave, `${clave} · ${nombreDeGrupo(id).toLowerCase()}`);
    }
  }
  return salida;
}
