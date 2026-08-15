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

/** Clasifica un evento. Los que Google crea solo desde el correo van aparte. */
export function clasificar(ev, mapa) {
  if (ev?.eventType === 'fromGmail') {
    return { tipo: 'externo', etiqueta: 'Desde Gmail' };
  }
  const m = mapa[ev?.colorId];
  return m ? { tipo: m.tipo || 'otro', etiqueta: m.etiqueta || '' } : { tipo: 'otro', etiqueta: '' };
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
    reglas: Array.isArray(s.reglas_criticas_para_el_asistente)
      ? s.reglas_criticas_para_el_asistente
      : [],
  };
}

/** Alertas de todos los subsistemas, con su origen. Para "Requiere tu mirada". */
export function alertas(estado) {
  const subs = estado?.subsistemas || {};
  const salida = [];
  for (const [clave, s] of Object.entries(subs)) {
    if (s?.activo === false) continue;
    for (const a of s?.resumen?.alertas || []) {
      if (typeof a === 'string' && a.trim()) salida.push({ origen: clave, texto: a });
    }
  }
  return salida;
}
