// Pruebas del auditor que corre dentro de la app.
//
// Cada caso reproduce una regresión real de cultivo.json v1.7.0, que se
// regeneró desde una base anterior y perdió tres correcciones ya hechas.
// Cowork las encontró a mano en el repaso del lunes; la idea es que la próxima
// vez aparezcan en el teléfono el mismo día.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { auditarCultivo, hallazgosDeclarados } from '../js/auditoria.js';

const HOY = '2026-08-24';
const buscar = (items, re) => items.find((i) => re.test(i.texto));

const sano = {
  ciclo_activo: {
    fases: [
      { id: 'S8', fecha_inicio: '2026-10-12', fecha_fin: '2026-10-18', ppfd: 850, acciones: [] },
      { id: 'S9', fecha_inicio: '2026-10-19', fecha_fin: '2026-10-21', ppfd: 0, acciones: [] },
    ],
    riegos_programados: [{ fecha: '2026-10-20', tipo: 'flush', fase: 'S9' }],
    hitos: [{ fecha: '2026-10-21', descripcion: 'Corte', estado: 'pendiente' }],
  },
  reglas_no_negociables: [],
  decisiones_abiertas: [],
};

test('un archivo coherente no genera ruido', () => {
  assert.deepEqual(auditarCultivo(sano, HOY), []);
});

// --- regresión 1: el hueco de octubre volvió ---

test('detecta los días que ninguna fase cubre', () => {
  const roto = structuredClone(sano);
  roto.ciclo_activo.fases[1].fecha_inicio = '2026-10-21'; // deja 19 y 20 afuera
  const h = buscar(auditarCultivo(roto, HOY), /quedan días sin fase/);
  assert.ok(h, 'el hueco tiene que salir');
  assert.match(h.texto, /S8.*S9/);
});

test('detecta un riego asignado a una fase que no lo contiene', () => {
  const roto = structuredClone(sano);
  roto.ciclo_activo.riegos_programados[0].fase = 'S8'; // el 20/10 no cae en S8
  assert.ok(buscar(auditarCultivo(roto, HOY), /figura en la fase S8/));
});

test('un riego que declara una fase inexistente no pasa desapercibido', () => {
  const roto = structuredClone(sano);
  roto.ciclo_activo.riegos_programados[0].fase = 'S12';
  assert.ok(buscar(auditarCultivo(roto, HOY), /no existe/));
});

// --- regresión 2: S3 volvió a 675 contra una acción que dice 650 ---
// Es la que más pesa: es la incoherencia atada al fallo que arruinó el ciclo
// anterior, subir el PPFD sobre raíz inmadura.

test('detecta que la fase y su propia acción dicen PPFD distintos', () => {
  const roto = structuredClone(sano);
  roto.ciclo_activo.fases[0].ppfd = 675;
  roto.ciclo_activo.fases[0].acciones = ['Subir a 650 PPFD solo si el sustrato seca en 24-36h'];
  const h = buscar(auditarCultivo(roto, HOY), /PPFD/);
  assert.ok(h);
  assert.match(h.texto, /675.*650|650.*675/);
});

// --- regresión 3: r10 volvió a decir "desde S4" ---

test('detecta una regla que fija un valor antes o después de donde lo aplica el plan', () => {
  const roto = structuredClone(sano);
  roto.ciclo_activo.fases[0].id = 'S2';
  roto.ciclo_activo.fases[0].nutricion = { calmag_ml_l: 2.5 };
  roto.reglas_no_negociables = [
    { id: 'r10', regla: 'CalMag preventivo: 2.5 desde S4 y 3 desde S5 sin esperar sintomas' },
  ];
  const h = buscar(auditarCultivo(roto, HOY), /regla r10/);
  assert.ok(h);
  assert.match(h.texto, /desde S4.*aplica en S2/);
});

// --- la colisión de ids que hizo desaparecer una decisión abierta ---

test('detecta un id repetido, que tapa una decisión abierta con otra', () => {
  const roto = structuredClone(sano);
  roto.decisiones_abiertas = [
    { id: 'd4', tema: 'Flush del 19/10 durante la oscuridad' },
    { id: 'd4', tema: 'Luminaria de floracion del Grupo 2' },
  ];
  assert.ok(buscar(auditarCultivo(roto, HOY), /id d4 está repetido/));
});

// --- hitos con fecha pasada que siguen abiertos ---

test('pregunta por los hitos cuya fecha pasó y siguen pendientes', () => {
  const roto = structuredClone(sano);
  roto.ciclo_activo.hitos = [
    { fecha: '2026-08-18', descripcion: 'Pasar esquejes', estado: 'pendiente' },
    { fecha: '2026-08-22', descripcion: 'Red instalada', estado: 'pendiente' },
    { fecha: '2026-10-21', descripcion: 'Corte', estado: 'pendiente' },
  ];
  const h = buscar(auditarCultivo(roto, HOY), /siguen marcados pendiente/);
  assert.ok(h);
  assert.match(h.texto, /^2 hitos/);
});

test('no reclama por un hito futuro', () => {
  assert.equal(buscar(auditarCultivo(sano, HOY), /pendiente/), undefined);
});

// --- la luz: lo que el plan pide contra lo que el panel da ---
//
// Es el hallazgo g2-a1, que se encontró comparando dos archivos a mano: el
// plan del grupo 1 pedía 1000 y 1150 PPFD sobre un panel de ~800. Cada número
// es razonable leído solo; la contradicción está entre dos bloques lejanos.

const conPanel = (fases, luminaria) => ({
  luminarias: [{ id: 'sf', nombre: 'SilverFox 480 EVO', ppfd_pico: 800, ...luminaria }],
  grupos: [{ id: 'grupo-1', luminaria: 'sf' }],
  ciclo_activo: { grupo: 'grupo-1', fases, riegos_programados: [], hitos: [] },
  reglas_no_negociables: [],
});

test('detecta las fases que piden mas PPFD del que entrega el panel', () => {
  const roto = conPanel([
    { id: 'S4', tipo: 'floracion', fecha_inicio: '2026-09-14', fecha_fin: '2026-09-20', ppfd: 1000, ppfd_techo: 1200 },
    { id: 'S5', tipo: 'floracion', fecha_inicio: '2026-09-21', fecha_fin: '2026-09-27', ppfd: 1150, ppfd_techo: 1200 },
  ]);
  const h = buscar(auditarCultivo(roto, HOY), /entrega ~800 de pico/);
  assert.ok(h, 'el plan inalcanzable tiene que salir');
  assert.match(h.texto, /S4 y S5 piden hasta 1150/);
});

test('un plan dentro del panel no genera ruido', () => {
  const sanoLuz = conPanel([
    { id: 'S4', tipo: 'floracion', fecha_inicio: '2026-09-14', fecha_fin: '2026-09-20', ppfd: 700, ppfd_techo: 800 },
  ]);
  assert.deepEqual(auditarCultivo(sanoLuz, HOY), []);
});

test('detecta el PPFD nominal por encima del techo de la propia fase', () => {
  const roto = conPanel([
    { id: 'S3', tipo: 'floracion', fecha_inicio: '2026-09-07', fecha_fin: '2026-09-13', ppfd: 675, ppfd_techo: 650 },
  ]);
  assert.ok(buscar(auditarCultivo(roto, HOY), /S3 declara 675 PPFD con techo 650/));
});

test('un techo null en floracion es un techo sin declarar, no la ausencia de techo', () => {
  const roto = conPanel([
    { id: 'S3', tipo: 'floracion', fecha_inicio: '2026-09-07', fecha_fin: '2026-09-13', ppfd: 675, ppfd_techo: null },
    { id: 'S4', tipo: 'floracion', fecha_inicio: '2026-09-14', fecha_fin: '2026-09-20', ppfd: 700, ppfd_techo: null },
  ]);
  const h = buscar(auditarCultivo(roto, HOY), /techo de PPFD/);
  assert.ok(h);
  assert.match(h.texto, /S3 y S4 son de floración y no declaran/);

  // En vegetativo no se reclama: el techo nace de r1, que es de floración.
  const veg = conPanel([
    { id: 'V1', tipo: 'vegetativo', fecha_inicio: '2026-08-14', fecha_fin: '2026-08-17', ppfd: 360, ppfd_techo: null },
  ]);
  assert.equal(buscar(auditarCultivo(veg, HOY), /techo de PPFD/), undefined);
});

test('la excepcion declarada por subconjunto no se marca como incoherencia', () => {
  // Las 3 veteranas van a 700 con techo propio de 700 mientras la fase, para
  // el resto, sigue en 500. Está decidido y escrito: no es una contradicción.
  const conExcepcion = conPanel([
    {
      id: 'S1', tipo: 'floracion', fecha_inicio: '2026-09-23', fecha_fin: '2026-09-29',
      ppfd: 500, ppfd_techo: 500,
      ppfd_por_subconjunto: {
        A: { ppfd: 700, ppfd_techo: 700 },
        B: { ppfd: 500, ppfd_techo: 500 },
      },
    },
  ]);
  assert.deepEqual(auditarCultivo(conExcepcion, HOY), []);

  // Pero si el subconjunto se pasa de SU techo, sí.
  const pasado = structuredClone(conExcepcion);
  pasado.ciclo_activo.fases[0].ppfd_por_subconjunto.A.ppfd = 900;
  assert.ok(buscar(auditarCultivo(pasado, HOY), /S1 \(subconjunto A\) declara 900 PPFD con techo 700/));
});

test('con r15 en el archivo, el hallazgo la cita', () => {
  const roto = conPanel([
    { id: 'S3', tipo: 'floracion', fecha_inicio: '2026-09-07', fecha_fin: '2026-09-13', ppfd: 675, ppfd_techo: null },
  ]);
  roto.reglas_no_negociables = [{ id: 'r15', regla: 'El PPFD nominal no puede superar su techo' }];
  assert.match(buscar(auditarCultivo(roto, HOY), /techo de PPFD/).texto, /\(r15\)\.$/);
});

// --- lo que Cowork deja anotado ---

test('los hallazgos que deja Cowork en estado.json se muestran', () => {
  const estado = {
    hallazgos_de_auditoria_abiertos: [
      { id: 'h1', hallazgo: 'Se perdieron las tres correcciones de la v1.2.0' },
      'El rastro de auditoria a9, a10 y a11 ya no esta',
    ],
  };
  const h = hallazgosDeclarados(estado);
  assert.equal(h.length, 2);
  assert.match(h[0].texto, /tres correcciones/);
});

test('sin hallazgos declarados no se inventa nada', () => {
  assert.deepEqual(hallazgosDeclarados({}), []);
  assert.deepEqual(hallazgosDeclarados({ hallazgos_de_auditoria_abiertos: 'texto suelto' }), []);
});

test('un archivo vacio no rompe el auditor', () => {
  assert.deepEqual(auditarCultivo(null, HOY), []);
  assert.deepEqual(auditarCultivo({}, HOY), []);
});
