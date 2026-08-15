// Avisos ocultados por hoy.
//
// No es "hecho" ni un checkbox: es "ya lo vi, no me lo muestres más hoy".
// La diferencia importa. Marcar algo como cumplido sería el sistema auditando
// tu conducta; ocultarlo es vos decidiendo qué mirar. Por eso se borra solo a
// la medianoche: nada queda tachado para siempre, y si sigue abierto mañana
// vuelve a aparecer.

const CLAVE = 'pv.omitidos';

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function leer() {
  try {
    const j = JSON.parse(localStorage.getItem(CLAVE) || '{}');
    return j.fecha === hoy() && Array.isArray(j.textos) ? j.textos : [];
  } catch {
    return [];
  }
}

function guardar(textos) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ fecha: hoy(), textos }));
  } catch {}
}

export function estaOmitido(texto) {
  return leer().includes(texto);
}

export function omitir(texto) {
  const actual = leer();
  if (!actual.includes(texto)) guardar([...actual, texto]);
}

export function restaurarTodo() {
  guardar([]);
}

