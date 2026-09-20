// Dos ciclos en paralelo, en dos archivos con esquemas distintos.
//
// El grupo 1 vive en cultivo.json con un `ciclo_activo` único; el grupo 2 en
// cultivo_grupo2.json, con `ciclos[]` y un puntero, y sin copiar los bloques
// globales. La app tiene que leer los dos sin convertir uno en el otro, y
// sobre todo sin prestarle a un grupo los datos del otro: distinta maceta,
// distinto porte, distinta luz.
//
// El fixture reproduce la forma real de los dos archivos, recortada.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cicloDe, unirConCanonico, delCiclo, delAlcance, faseDe, diaDeCiclo,
  grupoActivo, subconjuntosDe, luminariaDe, volumenTexto, totalMezcla,
  eventosDeLaFase, productosDeLaFase, estadoDeSecado, secadosConsolidados,
  tipoSugerido,
} from '../js/cultivo-datos.js';
import { subsistema, alertas, nombreDeGrupo } from '../js/contract.js';
import { auditarNomenclatura, hallazgosDeclarados } from '../js/auditoria.js';

// ---------- fixtures ----------

const INTERMEDIO = { pure_zym_ml_l: 1, vitamax_ml_l: 0.5 };

/** cultivo.json: esquema v1, con los bloques globales. */
const canonico = {
  _meta: { version: '1.9.0' },
  sitio: { agua: { ec_ms_cm: 0.225 } },
  luminarias: [
    { id: 'silverfox', nombre: 'SilverFox 480 EVO', ppfd_pico: 800, asignada_a: 'grupo-1' },
    { id: 'dhp', nombre: 'DHP 2+R DydeLED', ppfd_pico: 1400, asignada_a: null },
  ],
  grupos: [
    {
      id: 'grupo-1', cantidad_plantas: 8, luminaria: 'silverfox',
      ciclo_secado_horas: 60, ciclo_secado_dias: [4, 5], _ciclo_secado_dias_obsoleto: true,
    },
    // La nomenclatura vieja que cultivo.json todavía arrastra.
    { id: 'grupo-2', cantidad_plantas: 3, notas: 'NO MODELADO EN ESTE ARCHIVO.' },
  ],
  ciclo_activo: {
    id: 'ciclo-ago2026-g1', grupo: 'grupo-1',
    fecha_inicio: '2026-08-02', fecha_flip_real: '2026-08-24',
    fases: [
      {
        id: 'V1', tipo: 'vegetativo', fecha_inicio: '2026-08-14', fecha_fin: '2026-08-17',
        nutricion: { calmag_ml_l: 2, pure_zym_ml_l: 1 }, volumen_por_maceta_l: [2.5, 3],
        ppfd: 360, ppfd_techo: null, nutricion_intermedio: INTERMEDIO,
      },
      {
        id: 'S4', tipo: 'floracion', fecha_inicio: '2026-09-14', fecha_fin: '2026-09-20',
        nutricion: { calmag_ml_l: 2.5, hybrids_g_l: 0.8, pure_zym_ml_l: 1 },
        volumen_por_maceta_l: [4, 4], ppfd: 700, ppfd_techo: 800,
        nutricion_intermedio: INTERMEDIO,
        aplicaciones_evento: [
          { producto: 'flora_booster', aplicacion_numero: 2, dosis_ml_l: 3, cuando: 'UNA sola vez en la fase.' },
        ],
      },
      {
        id: 'S5', tipo: 'floracion', fecha_inicio: '2026-09-21', fecha_fin: '2026-09-27',
        nutricion: { calmag_ml_l: 3 }, volumen_por_maceta_l: [4, 4], ppfd: 700, ppfd_techo: 800,
        aplicaciones_evento: [{ producto: 'flora_booster', aplicacion_numero: 3, dosis_ml_l: 4 }],
      },
    ],
    riegos_programados: [{ fecha: '2026-09-20', tipo: 'completo', fase: 'S4' }],
    riegos_ejecutados: [],
  },
  productos: [
    { id: 'calmag', nombre: 'Sensi CalMag Xtra', unidad: 'ml/L' },
    { id: 'hybrids', nombre: 'Powder Feeding Hybrids', unidad: 'g/L' },
    { id: 'pure_zym', nombre: 'Pure Zym', unidad: 'ml/L' },
    { id: 'vitamax', nombre: 'Vitamax Pro', unidad: 'ml/L' },
    { id: 'flora_booster', nombre: 'Flora Booster (Namaste)', unidad: 'ml/L' },
  ],
  orden_de_mezcla: ['Agua', 'CalMag', 'Grow o Hybrids', 'Flora Booster', 'Pure Zym', 'Vitamax'],
  tipos_de_riego: {
    completo: { usa: 'fase.nutricion', aporta_sales: true },
    intermedio: { usa: 'fase.nutricion_intermedio', aporta_sales: false },
    agua: { usa: null, aporta_sales: false },
  },
  reglas_no_negociables: [{ id: 'r14', regla: 'Flora Booster es aplicacion de evento' }],
  grupos_futuros: [{ id: 'grupo-3', cantidad_plantas: 11, luminaria_prevista: 'dhp' }],
};

/** cultivo_grupo2.json: esquema v2, sin bloques globales. */
const propio = {
  _meta: { version: '1.1.0' },
  referencias: {
    bloques_no_copiados: [
      'sitio', 'productos', 'orden_de_mezcla', 'tipos_de_riego',
      'reglas_no_negociables', 'pendientes',
    ],
  },
  luminarias_correcciones: {
    nota: 'Override local mientras el canonico no lo incorpore.',
    dhp: { id: 'dhp', nombre: 'DHP 2+R DydeLED', ppfd_pico: 1400, asignada_a: 'grupo-2' },
  },
  grupos: [
    {
      id: 'grupo-2', nombre: 'Grupo 2 DHP', cantidad_plantas: 11, luminaria: 'dhp',
      ciclo_secado_horas: null,
      secados_medidos: [],
      subconjuntos: [
        { id: 'A', nombre: 'Veteranas', cantidad_plantas: 3, regimen_riego_acelerado: true },
        { id: 'B', nombre: 'Nuevas', cantidad_plantas: 8, regimen_riego_acelerado: false },
      ],
    },
  ],
  ciclos: [
    {
      id: 'ciclo-sep2026-g2', grupo: 'grupo-2',
      fecha_inicio: '2026-09-02', fecha_flip_planificada: '2026-09-23', fecha_flip_real: null,
      fases: [
        {
          id: 'V-PRE', tipo: 'vegetativo', fecha_inicio: '2026-09-19', fecha_fin: '2026-09-22',
          nutricion: { calmag_ml_l: 2, hybrids_g_l: 0.5, pure_zym_ml_l: 1 },
          volumen_por_maceta_l: { A: [2.5, 3], B: [1.5, 2], nota: 'Referencia de arranque.' },
          drenaje_objetivo_pct: [10, 20], ppfd: 400, ppfd_techo: null,
          nutricion_intermedio: INTERMEDIO,
        },
        {
          id: 'S1', tipo: 'floracion', fecha_inicio: '2026-09-23', fecha_fin: '2026-09-29',
          nutricion: { calmag_ml_l: 2, hybrids_g_l: 0.5, pure_zym_ml_l: 1 },
          volumen_por_maceta_l: { A: [2.5, 3], B: [1.5, 2] },
          drenaje_objetivo_pct: [10, 20], ppfd: 500, ppfd_techo: 500,
          ppfd_por_subconjunto: {
            A: { ppfd: 700, ppfd_techo: 700, origen: 'excepcion vigente a r1' },
            B: { ppfd: 500, ppfd_techo: 500, origen: 'r1' },
          },
          nutricion_intermedio: INTERMEDIO,
        },
      ],
      riegos_programados: [
        { fecha: '2026-09-20', tipo: 'completo', fase: 'V-PRE', alcance: 'todos' },
        { fecha: '2026-09-28', tipo: 'agua', fase: 'S1', alcance: 'A' },
      ],
      riegos_ejecutados: [],
    },
  ],
  ciclo_activo_id: 'ciclo-sep2026-g2',
};

const g2 = unirConCanonico(propio, canonico);
const HOY = '2026-09-19';
const faseG2 = (id) => cicloDe(g2).fases.find((f) => f.id === id);
const faseG1 = (id) => canonico.ciclo_activo.fases.find((f) => f.id === id);

// ---------- los dos esquemas ----------

test('el ciclo se resuelve igual venga de ciclo_activo o de ciclos[]', () => {
  assert.equal(cicloDe(canonico).id, 'ciclo-ago2026-g1');
  assert.equal(cicloDe(propio).id, 'ciclo-sep2026-g2');
});

test('con ciclos[] y sin puntero, uno solo se resuelve igual; varios no se adivinan', () => {
  const { ciclo_activo_id, ...sinPuntero } = propio;
  assert.equal(cicloDe(sinPuntero).id, 'ciclo-sep2026-g2');

  const dos = { ...sinPuntero, ciclos: [...propio.ciclos, { id: 'otro', fases: [] }] };
  assert.equal(cicloDe(dos), null);
});

test('la fase y el plan del grupo 2 salen de su propio archivo', () => {
  assert.equal(faseDe(g2, HOY).id, 'V-PRE');
  assert.equal(faseDe(canonico, HOY).id, 'S4');
});

// ---------- bloques globales ----------

test('el archivo del grupo 2 toma del canonico los bloques que no copia', () => {
  assert.equal(g2.orden_de_mezcla.length, canonico.orden_de_mezcla.length);
  assert.equal(g2.productos.length, canonico.productos.length);
  assert.ok(g2.tipos_de_riego.intermedio);
  assert.equal(g2.sitio.agua.ec_ms_cm, 0.225);
});

test('lo propio del grupo manda sobre el canonico', () => {
  // grupos y ciclos no son bloques globales: no se heredan nunca.
  assert.equal(g2.grupos.length, 1);
  assert.equal(g2.grupos[0].id, 'grupo-2');
  assert.equal(grupoActivo(g2).cantidad_plantas, 11);
});

test('la correccion de luminaria del archivo pisa la ficha del canonico', () => {
  assert.equal(luminariaDe(g2).ppfd_pico, 1400);
  assert.equal(luminariaDe(g2).asignada_a, 'grupo-2');
  // La nota de texto del bloque de correcciones no es una luminaria.
  assert.ok(!g2.luminarias.some((l) => l.id === 'nota'));
  // Y el canonico queda intacto.
  assert.equal(luminariaDe(canonico).ppfd_pico, 800);
});

test('unir sin canonico no rompe ni inventa bloques', () => {
  const solo = unirConCanonico(propio, null);
  assert.equal(solo.productos, undefined);
  assert.equal(cicloDe(solo).id, 'ciclo-sep2026-g2');
});

// ---------- registros por ciclo ----------

const REG = [
  { id: 'r1', fecha: '2026-08-26', tipo: 'completo' },
  { id: 'r2', fecha: '2026-09-18', tipo: 'completo', ciclo: 'ciclo-ago2026-g1' },
  { id: 'r3', fecha: '2026-09-18', tipo: 'completo', ciclo: 'ciclo-sep2026-g2', alcance: 'todos' },
  { id: 'r4', fecha: '2026-09-19', tipo: 'agua', ciclo: 'ciclo-sep2026-g2', alcance: 'A' },
];

test('los registros sin ciclo son del grupo 1, no del que tenga la fecha mas cerca', () => {
  const g1 = delCiclo(REG, cicloDe(canonico), { legado: true }).map((r) => r.id);
  assert.deepEqual(g1, ['r1', 'r2']);

  const dos = delCiclo(REG, cicloDe(g2), { legado: false }).map((r) => r.id);
  assert.deepEqual(dos, ['r3', 'r4']);
});

test('un subconjunto ve lo suyo y lo que fue para todos', () => {
  const deG2 = delCiclo(REG, cicloDe(g2));
  assert.deepEqual(delAlcance(deG2, 'A').map((r) => r.id), ['r3', 'r4']);
  assert.deepEqual(delAlcance(deG2, 'B').map((r) => r.id), ['r3']);
});

// ---------- secado ----------

const AHORA = Date.parse('2026-09-19T12:00:00');

test('el grupo 2 no hereda las 60 horas del grupo 1', () => {
  const e = estadoDeSecado(g2, '2026-09-17', { faseId: 'V-PRE', ahora: AHORA });
  assert.equal(e.horas, null);
  assert.equal(e.transcurridas, 48);
  assert.equal(e.seco, false);
});

test('el puente de config es por grupo: el del grupo 1 no toca al grupo 2', () => {
  const puente = { 'grupo-1': 60 };
  assert.equal(estadoDeSecado(g2, '2026-09-17', { puente: puente['grupo-2'] ?? null, ahora: AHORA }).horas, null);
  assert.equal(estadoDeSecado(canonico, '2026-09-17', { puente: puente['grupo-1'], ahora: AHORA }).origen, 'archivo');
});

test('los dias obsoletos no se usan aunque queden en el archivo', () => {
  const sinHoras = {
    ...canonico,
    grupos: [{ ...canonico.grupos[0], ciclo_secado_horas: null }, canonico.grupos[1]],
  };
  assert.equal(estadoDeSecado(sinHoras, '2026-09-17', { ahora: AHORA }).horas, null);
});

test('lo que declara un subconjunto le gana a lo del grupo', () => {
  const medido = structuredClone(g2);
  medido.grupos[0].ciclo_secado_horas = 90;
  medido.grupos[0].subconjuntos[0].ciclo_secado_horas = 48;

  assert.equal(estadoDeSecado(medido, '2026-09-17', { alcance: 'A', ahora: AHORA }).horas, 48);
  assert.equal(estadoDeSecado(medido, '2026-09-17', { alcance: 'B', ahora: AHORA }).horas, 90);
});

test('el secado consolidado del grupo 2 sale de su grupo, no del ciclo', () => {
  const conMedidas = structuredClone(g2);
  conMedidas.grupos[0].secados_medidos = [{ desde: '2026-09-10', fecha: '2026-09-12', horas: 50, fase: 'V-PRE' }];
  assert.equal(secadosConsolidados(conMedidas).length, 1);
  assert.deepEqual(secadosConsolidados(g2), []);
});

// ---------- volumen y tanda ----------

test('el volumen por subconjunto se lee con el nombre de cada uno', () => {
  assert.equal(volumenTexto(g2, faseG2('V-PRE').volumen_por_maceta_l), 'Veteranas 2.5–3 · Nuevas 1.5–2 L');
  assert.equal(volumenTexto(canonico, faseG1('V1').volumen_por_maceta_l), '2.5–3 L');
});

test('la tanda suma cada subconjunto con su volumen', () => {
  const t = totalMezcla(g2, faseG2('V-PRE'));
  assert.equal(t.n, 11);
  assert.deepEqual([t.min, t.max], [19.5, 25]); // 3×2.5–3 + 8×1.5–2
  assert.equal(t.litros, '19.5–25 L');
  assert.deepEqual(t.partes.map((p) => p.nombre), ['Veteranas', 'Nuevas']);
});

test('sin volumen para ningun subconjunto no se inventa una tanda', () => {
  const corte = { ...faseG2('V-PRE'), volumen_por_maceta_l: { A: null, B: null, nota: 'No se riega.' } };
  assert.equal(totalMezcla(g2, corte), null);
});

// ---------- aplicaciones de evento (r14) ----------

test('Flora Booster no es una dosis mas: es una aplicacion de la fase', () => {
  const [ev] = eventosDeLaFase(canonico, faseG1('S4'), []);
  assert.equal(ev.clave, 'flora_booster');
  assert.equal(ev.valor, 3);
  assert.equal(ev.unidad, 'ml/L');
  assert.equal(ev.numero, 2);
  assert.equal(ev.total, 2); // las que declara este fixture en todo el ciclo
  assert.equal(ev.aplicadoEl, null);
});

test('si ya hubo un completo en la fase, la aplicacion ya paso y no se repite', () => {
  const riegos = [
    { fecha: '2026-09-16', fase: 'S4', tipo: 'intermedio' },
    { fecha: '2026-09-17', fase: 'S4', tipo: 'completo' },
    { fecha: '2026-09-19', fase: 'S4', tipo: 'completo' },
  ];
  const [ev] = eventosDeLaFase(canonico, faseG1('S4'), riegos);
  assert.equal(ev.aplicadoEl, '2026-09-17'); // el primero, no el ultimo

  assert.ok(productosDeLaFase(canonico, faseG1('S4'), 'completo', []).includes('flora_booster'));
  assert.ok(!productosDeLaFase(canonico, faseG1('S4'), 'completo', riegos).includes('flora_booster'));
  assert.ok(!productosDeLaFase(canonico, faseG1('S4'), 'intermedio', []).includes('flora_booster'));
});

test('una fase sin aplicaciones de evento no devuelve ninguna', () => {
  assert.deepEqual(eventosDeLaFase(canonico, faseG1('V1'), []), []);
  assert.deepEqual(eventosDeLaFase(g2, faseG2('V-PRE'), []), []);
});

// ---------- dia de ciclo ----------

test('en vegetativo el dia se cuenta desde el trasplante', () => {
  assert.equal(diaDeCiclo(g2, HOY), 18); // 2026-09-02 = dia 1
});

test('en floracion el dia se cuenta desde el flip, no desde el trasplante', () => {
  assert.equal(diaDeCiclo(canonico, HOY), 27); // flip real 2026-08-24 = dia 1
});

test('sin flip real anotado, manda el arranque de la primera fase de flor', () => {
  const sinFlip = structuredClone(canonico);
  delete sinFlip.ciclo_activo.fecha_flip_real;
  assert.equal(diaDeCiclo(sinFlip, '2026-09-14'), 1); // S4 es la primera fase de flor del fixture
});

// ---------- sugerencia con subconjuntos ----------

test('la sugerencia dice si el riego del plan es para un subconjunto', () => {
  const s = tipoSugerido(g2, [], faseG2('V-PRE'), '2026-09-19');
  assert.equal(s.tipo, 'completo');
  assert.equal(s.alcance, null);

  const soloA = tipoSugerido(g2, [], faseG2('S1'), '2026-09-24');
  assert.equal(soloA.alcance, 'A');
});

// ---------- contrato con estado.json ----------

const estado = {
  subsistemas: {
    cultivo: {
      activo: true,
      archivo_datos: '/Asistente Nico/Cultivo/cultivo.json',
      archivos_por_grupo: [
        { grupo: 'grupo-1', archivo: '/Asistente Nico/Cultivo/cultivo.json' },
        { grupo: 'grupo-2', archivo: '/Asistente Nico/Cultivo/cultivo_grupo2.json' },
      ],
      nomenclatura_de_grupos: {
        'grupo-1': '8 plantas bajo SilverFox.',
        'grupo-2': '11 plantas bajo DHP 2+R: 3 veteranas + 8 nuevas.',
        'grupo-3': '3 plantas que quedan en carpa.',
      },
      grupos: {
        'grupo-1': { drive_file_id: 'ID1', resumen: { fase_actual: 'S4', alertas: ['Entra S5 el 21'] } },
        'grupo-2': { drive_file_id: 'ID2', resumen: { fase_actual: 'V-PRE', alertas: ['Primera foliar hoy'] } },
      },
      registro: { archivo_entrada_app: '/Asistente Nico/Cultivo/riegos_registrados.json' },
      hallazgos_de_auditoria_abiertos: { nota: 'Regresiones abiertas.', items: ['S3 con techo null'] },
    },
  },
};

test('cada grupo trae su archivo, y el canonico queda marcado', () => {
  const sub = subsistema(estado, 'cultivo');
  assert.deepEqual(sub.grupos.map((g) => g.grupo), ['grupo-1', 'grupo-2']);
  assert.deepEqual(sub.grupos.map((g) => g.canonico), [true, false]);
  assert.equal(sub.grupos[1].ruta, '/Asistente Nico/Cultivo/cultivo_grupo2.json');
  assert.equal(sub.grupos[1].archivoId, 'ID2');
  assert.equal(sub.grupos[0].resumen.fase_actual, 'S4');
});

test('sin archivos_por_grupo se sigue leyendo un solo archivo', () => {
  const viejo = { subsistemas: { cultivo: { archivo_datos: '/x/cultivo.json', drive_file_id: 'ID', resumen: { fase_actual: 'S4' } } } };
  const sub = subsistema(viejo, 'cultivo');
  assert.equal(sub.grupos.length, 1);
  assert.equal(sub.grupos[0].canonico, true);
  assert.equal(sub.grupos[0].ruta, '/x/cultivo.json');
});

test('las alertas de cada grupo dicen de que grupo son', () => {
  const lista = alertas(estado);
  assert.equal(lista.length, 2);
  assert.deepEqual(lista.map((a) => a.etiqueta), ['cultivo · grupo 1', 'cultivo · grupo 2']);
  assert.equal(lista[0].origen, 'cultivo'); // el origen sigue siendo la pantalla
});

test('los hallazgos declarados se leen tambien en su lugar nuevo', () => {
  assert.equal(hallazgosDeclarados(estado).length, 1);
  assert.equal(hallazgosDeclarados({ hallazgos_de_auditoria_abiertos: ['viejo'] }).length, 1);
  assert.deepEqual(hallazgosDeclarados({}), []);
});

test('grupo-2 se escribe Grupo 2', () => {
  assert.equal(nombreDeGrupo('grupo-2'), 'Grupo 2');
});

// ---------- colision de nombres ----------

test('el archivo y estado.json llamando distinto al mismo grupo se levanta', () => {
  const items = auditarNomenclatura(estado, canonico);
  const textos = items.map((i) => i.texto).join(' | ');
  assert.match(textos, /grupo-2 a 3 plantas y estado\.json, a 11/);
  assert.match(textos, /grupo-3 a 11 plantas y estado\.json, a 3/);
});

test('el archivo del grupo 2 no contradice la nomenclatura', () => {
  assert.deepEqual(auditarNomenclatura(estado, g2), []);
});
