// Pruebas de la lógica que arma la mezcla.
//
// Existen por un motivo concreto: la app mostraba el orden de mezcla completo
// del ciclo —con PK Booster y Flora Booster— al lado de la receta de una fase
// vegetativa donde esos productos no van. Los números salían bien del archivo,
// pero la parte compuesta por código estaba mal, y no había forma de saberlo
// sin mirar la pantalla.
//
//   node --test tests/
//
// El fixture reproduce la estructura real de cultivo.json con los valores
// reales de la fase V1, para que un cambio en la lógica se note acá y no en el
// celular parado frente al balde.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dosisOrdenadas, ordenDeLaFase, totalMezcla, productosDeLaFase,
  faseDe, diaDeCiclo, aguaBase, nombreDe, leerNutricion, rango,
  recetaDe, tiposDeRiego, estadoDeSecado, secadoObservado, tipoSugerido, secadosConsolidados,
} from '../js/cultivo-datos.js';

const cultivo = {
  sitio: {
    agua: { ec_ms_cm: 0.225, ph_origen: 7.0, nota_critica: 'El agua APORTA 0.225 mS/cm.' },
  },
  grupos: [{ id: 'grupo-1', cantidad_plantas: 8, ciclo_secado_dias: [4, 5] }],
  ciclo_activo: {
    grupo: 'grupo-1',
    fecha_inicio: '2026-08-02',
    fases: [
      {
        id: 'V1',
        fecha_inicio: '2026-08-14',
        fecha_fin: '2026-08-17',
        nutricion: {
          rhino_skin_ml_l: 2, calmag_ml_l: 2, grow_g_l: 0.5,
          pure_zym_ml_l: 1, vitamax_ml_l: 0.5,
        },
        ec_objetivo: [0.8, 1.0],
        ph_entrada: [6.0, 6.2],
        volumen_por_maceta_l: [2.5, 3],
        nutricion_intermedio: { pure_zym_ml_l: 1, vitamax_ml_l: 0.5 },
        nutricion_intermedio_nota: 'Formula FIJA, no es una fraccion del completo.',
        ec_objetivo_intermedio: null,
        ph_entrada_intermedio: [6.0, 6.2],
      },
      {
        id: 'S6',
        tipo: 'floracion',
        fecha_inicio: '2026-09-27',
        fecha_fin: '2026-10-03',
        nutricion: {
          rhino_skin_ml_l: 2, rhino_skin_nota: 'ultima aplicacion', calmag_ml_l: 3,
          hybrids_g_l: 0.8, pk_booster_g_l: 0.3, trico_mas_g_l: 0.5,
          pure_zym_ml_l: 1, vitamax_ml_l: 0.5,
        },
        volumen_por_maceta_l: [4, 4],
      },
      {
        id: 'S7',
        fecha_inicio: '2026-10-04',
        fecha_fin: '2026-10-10',
        nutricion: { calmag_ml_l: 3, rhino_skin_ml_l: null, flora_booster_aplicacion: 4 },
      },
    ],
  },
  productos: [
    { id: 'rhino', nombre: 'Rhino Skin (Advanced Nutrients)' },
    { id: 'calmag', nombre: 'Sensi CalMag Xtra' },
    { id: 'grow', nombre: 'Greenhouse Powder Feeding Grow' },
    { id: 'hybrids', nombre: 'Greenhouse Powder Feeding Hybrids' },
    { id: 'pure_zym', nombre: 'Pure Zym (Plagron)' },
    { id: 'vitamax', nombre: 'Vitamax Pro' },
    { id: 'pk_booster', nombre: 'PK Booster Feeding' },
    { id: 'flora_booster', nombre: 'Flora Booster (Namaste)' },
    { id: 'trico_mas', nombre: 'Trico+ (Namaste)' },
  ],
  tipos_de_riego: {
    completo: { usa: 'fase.nutricion', aporta_sales: true },
    intermedio: {
      usa: 'fase.nutricion_intermedio',
      aporta_sales: false,
      formula_fija: 'Pure Zym 1 ml/L + Vitamax 0.5 ml/L',
      nota: 'NO es media dosis del completo.',
    },
    agua: { usa: null, aporta_sales: false },
    flush: { usa: null, aporta_sales: false, formula_fija: 'Agua + Pure Zym 2 ml/L' },
  },
  orden_de_mezcla: [
    'Agua',
    'Rhino Skin (solo, agitar antes de seguir)',
    'CalMag',
    'Grow o Hybrids',
    'PK Booster',
    'Flora Booster',
    'Pure Zym',
    'Vitamax',
    'Trico+',
    'Recien ahora: medir EC y ajustar pH',
  ],
};

const fase = (id) => cultivo.ciclo_activo.fases.find((f) => f.id === id);

// ---------- el bug que originó estas pruebas ----------

test('el orden de mezcla de una fase vegetativa no incluye PK ni Flora Booster', () => {
  const { dosis } = dosisOrdenadas(cultivo, fase('V1'));
  const pasos = ordenDeLaFase(cultivo, dosis);

  assert.ok(!pasos.some((p) => /PK Booster/i.test(p)), 'PK Booster no va en V1');
  assert.ok(!pasos.some((p) => /Flora Booster/i.test(p)), 'Flora Booster no va en V1');
  assert.ok(!pasos.some((p) => /Trico/i.test(p)), 'Trico+ no va en V1');
});

test('el orden conserva el agua al principio y la medición al final', () => {
  const { dosis } = dosisOrdenadas(cultivo, fase('V1'));
  const pasos = ordenDeLaFase(cultivo, dosis);

  assert.equal(pasos[0], 'Agua');
  assert.match(pasos.at(-1), /medir EC/i);
});

test('el orden de V1 es exactamente el esperado', () => {
  const { dosis } = dosisOrdenadas(cultivo, fase('V1'));
  assert.deepEqual(ordenDeLaFase(cultivo, dosis), [
    'Agua',
    'Rhino Skin (solo, agitar antes de seguir)',
    'CalMag',
    'Grow o Hybrids',
    'Pure Zym',
    'Vitamax',
    'Recien ahora: medir EC y ajustar pH',
  ]);
});

test('en S6, donde el PK Booster sí entra, el paso aparece', () => {
  const { dosis } = dosisOrdenadas(cultivo, fase('S6'));
  const pasos = ordenDeLaFase(cultivo, dosis);
  assert.ok(pasos.some((p) => /PK Booster/i.test(p)));
  assert.ok(!pasos.some((p) => /Flora Booster/i.test(p)), 'S6 no lleva Flora Booster');
});

// ---------- dosis ----------

test('las dosis de V1 salen del archivo, en el orden de preparación', () => {
  const { dosis } = dosisOrdenadas(cultivo, fase('V1'));
  assert.deepEqual(
    dosis.map((d) => [nombreDe(d.clave), d.valor, d.unidad]),
    [
      ['Rhino Skin', 2, 'ml/L'],
      ['CalMag', 2, 'ml/L'],
      ['Grow', 0.5, 'g/L'],
      ['Pure Zym', 1, 'ml/L'],
      ['Vitamax', 0.5, 'ml/L'],
    ]
  );
});

test('el Rhino Skin va primero: precipita si entra junto al CalMag', () => {
  const { dosis } = dosisOrdenadas(cultivo, fase('V1'));
  assert.equal(dosis[0].clave, 'rhino_skin');
});

test('una dosis en null no se muestra como dosis sino como nota', () => {
  const { dosis, notas } = leerNutricion(fase('S7').nutricion);
  assert.ok(!dosis.some((d) => d.clave === 'rhino_skin'), 'no es una dosis');
  assert.ok(notas.some((n) => /Rhino Skin/.test(n)), 'sí es una aclaración');
});

test('el número de aplicación de Flora Booster es una nota, no una dosis', () => {
  const { dosis, notas } = leerNutricion(fase('S7').nutricion);
  assert.ok(!dosis.some((d) => d.clave.includes('aplicacion')));
  assert.ok(notas.some((n) => /aplicación 4/.test(n)));
});

// ---------- tipos de riego (regla r13) ----------

test('el intermedio NO es una fracción del completo: es su propia fórmula', () => {
  const completo = recetaDe(cultivo, fase('V1'), 'completo');
  const intermedio = recetaDe(cultivo, fase('V1'), 'intermedio');

  assert.deepEqual(
    intermedio.dosis.map((d) => [d.clave, d.valor]),
    [['pure_zym', 1], ['vitamax', 0.5]]
  );

  // Ninguna dosis del intermedio es una proporción de la del completo.
  for (const d of intermedio.dosis) {
    const igual = completo.dosis.find((c) => c.clave === d.clave);
    assert.equal(d.valor, igual.valor, `${d.clave} mantiene su valor, no se escala`);
  }
});

test('el intermedio no lleva sales: sin Grow, sin CalMag, sin Rhino', () => {
  const { dosis, aportaSales } = recetaDe(cultivo, fase('V1'), 'intermedio');
  const claves = dosis.map((d) => d.clave);
  for (const sal of ['grow', 'calmag', 'rhino_skin', 'hybrids', 'pk_booster']) {
    assert.ok(!claves.includes(sal), `${sal} no va en un intermedio`);
  }
  assert.equal(aportaSales, false);
});

test('un riego de agua no muestra ninguna dosis', () => {
  const r = recetaDe(cultivo, fase('V1'), 'agua');
  assert.deepEqual(r.dosis, []);
  assert.equal(r.aportaSales, false);
});

test('el flush declara su fórmula fija en vez de dosis por fase', () => {
  const r = recetaDe(cultivo, fase('V1'), 'flush');
  assert.deepEqual(r.dosis, []);
  assert.match(r.formulaFija, /Pure Zym 2 ml\/L/);
});

test('el intermedio no arrastra el EC objetivo del completo', () => {
  assert.deepEqual(recetaDe(cultivo, fase('V1'), 'completo').ec, [0.8, 1.0]);
  assert.equal(recetaDe(cultivo, fase('V1'), 'intermedio').ec, null);
});

test('un tipo no declarado se marca como tal en vez de inventar receta', () => {
  const r = recetaDe(cultivo, fase('V1'), 'ripening');
  assert.equal(r.declarado, false);
  assert.deepEqual(r.dosis, []);
});

test('los tipos se ordenan de forma estable para la pantalla', () => {
  assert.deepEqual(tiposDeRiego(cultivo), ['completo', 'intermedio', 'agua', 'flush']);
});

test('los productos registrados dependen del tipo de riego', () => {
  assert.deepEqual(productosDeLaFase(cultivo, fase('V1'), 'intermedio').sort(), [
    'pure_zym', 'vitamax',
  ]);
  assert.deepEqual(productosDeLaFase(cultivo, fase('V1'), 'agua'), []);
});

// ---------- cantidades ----------

test('el total de la tanda son las macetas por los litros de la fase', () => {
  assert.deepEqual(totalMezcla(cultivo, fase('V1')), {
    n: 8,
    vol: [2.5, 3],
    litros: '20–24 L',
  });
});

test('si el volumen no es un rango, no se muestra un rango falso', () => {
  assert.equal(totalMezcla(cultivo, fase('S6')).litros, '32 L');
});

test('la cantidad de producto es la dosis por los litros', () => {
  const { dosis } = dosisOrdenadas(cultivo, fase('V1'));
  const rhino = dosis.find((d) => d.clave === 'rhino_skin');
  assert.equal(rhino.valor * 6, 12); // 6 L de la captura: 12 ml
  const grow = dosis.find((d) => d.clave === 'grow');
  assert.equal(grow.valor * 6, 3);
});

// ---------- fase y ciclo ----------

test('la fase activa es la que contiene la fecha', () => {
  assert.equal(faseDe(cultivo, '2026-08-14').id, 'V1');
  assert.equal(faseDe(cultivo, '2026-08-17').id, 'V1');
  assert.equal(faseDe(cultivo, '2026-09-30').id, 'S6');
});

test('un día sin fase declarada no inventa una fase', () => {
  assert.equal(faseDe(cultivo, '2026-08-30'), undefined);
});

test('el día de ciclo se cuenta desde el trasplante, empezando en 1', () => {
  assert.equal(diaDeCiclo(cultivo, '2026-08-02'), 1);
  assert.equal(diaDeCiclo(cultivo, '2026-08-14'), 13);
});

// ---------- agua ----------

test('el aporte de EC del agua se lee del archivo', () => {
  assert.equal(aguaBase(cultivo).ec, 0.225);
});

test('sin bloque de agua no se inventa un valor', () => {
  assert.equal(aguaBase({ sitio: {} }), null);
});

// ---------- productos aplicados ----------

test('los productos del riego completo se deducen de la fase', () => {
  assert.deepEqual(productosDeLaFase(cultivo, fase('V1'), 'completo').sort(), [
    'calmag', 'grow', 'pure_zym', 'rhino', 'vitamax',
  ]);
});

// ---------- formato ----------

test('un rango se muestra con guión, un valor suelto tal cual', () => {
  assert.equal(rango([0.8, 1.0]), '0.8–1');
  assert.equal(rango(null), '—');
  assert.equal(rango(500), 500);
});

// ---------- secado medido contra secado planificado ----------

const SEC = (desde, fecha, dias, fase = 'V1') => ({ desde, fecha, dias, fase });

test('sin observaciones, el secado sale del plan del archivo', () => {
  const e = estadoDeSecado(cultivo, '2026-08-14', { hoy: '2026-08-16' });
  assert.equal(e.medido, false);
  assert.deepEqual([e.min, e.max], [4, 5]);
  assert.equal(e.transcurridos, 2);
});

test('una observación reemplaza al plan y lo deja como referencia', () => {
  const e = estadoDeSecado(cultivo, '2026-08-14', {
    secados: [SEC('2026-08-10', '2026-08-13', 3)],
    hoy: '2026-08-16',
  });
  assert.equal(e.medido, true);
  assert.deepEqual([e.min, e.max], [3, 3]);
  assert.deepEqual(e.plan, { min: 4, max: 5 }); // el archivo no se pisa
  assert.equal(e.n, 1);
});

test('varias observaciones arman un rango', () => {
  const e = estadoDeSecado(cultivo, '2026-08-20', {
    secados: [
      SEC('2026-08-02', '2026-08-05', 3),
      SEC('2026-08-06', '2026-08-10', 4),
      SEC('2026-08-11', '2026-08-14', 3),
    ],
    hoy: '2026-08-22',
  });
  assert.deepEqual([e.min, e.max], [3, 4]);
  assert.equal(e.n, 3);
});

test('corregir una anotación no suma dos observaciones del mismo riego', () => {
  // Append-only en el archivo, pero la última de cada riego es la que vale.
  const e = estadoDeSecado(cultivo, '2026-08-20', {
    secados: [SEC('2026-08-10', '2026-08-13', 3), SEC('2026-08-10', '2026-08-14', 4)],
    hoy: '2026-08-21',
  });
  assert.equal(e.n, 1);
  assert.deepEqual([e.min, e.max], [4, 4]);
});

test('se prefiere lo medido en la misma fase: en flor la planta toma mas', () => {
  const secados = [SEC('2026-08-02', '2026-08-05', 3, 'V1'), SEC('2026-09-21', '2026-09-23', 2, 'S5')];
  const enFlor = estadoDeSecado(cultivo, '2026-09-25', { secados, faseId: 'S5', hoy: '2026-09-26' });
  assert.equal(enFlor.mismaFase, true);
  assert.deepEqual([enFlor.min, enFlor.max], [2, 2]);
});

test('la observación de este riego se reconoce como ya seco', () => {
  const e = estadoDeSecado(cultivo, '2026-08-14', {
    secados: [SEC('2026-08-14', '2026-08-17', 3)],
    hoy: '2026-08-18',
  });
  assert.equal(e.yaSeco.dias, 3);
});

test('secadoObservado sin datos no inventa un rango', () => {
  assert.equal(secadoObservado([]), null);
  assert.equal(secadoObservado([{ desde: null, dias: 3 }]), null);
});

// ---------- que tipo de riego proponer (reglas r11 y r2) ----------

const conPlan = (programados) => ({
  ...cultivo,
  ciclo_activo: { ...cultivo.ciclo_activo, riegos_programados: programados },
});

test('sin riegos previos, manda el plan', () => {
  const c = conPlan([{ fecha: '2026-08-22', tipo: 'completo', fase: 'V3' }]);
  const s = tipoSugerido(c, [], fase('V1'), '2026-08-19');
  assert.equal(s.tipo, 'completo');
  assert.equal(s.aviso, null);
});

test('si el plan proyecta intermedio, se propone intermedio', () => {
  const c = conPlan([{ fecha: '2026-08-30', tipo: 'intermedio', fase: 'S2' }]);
  assert.equal(tipoSugerido(c, [], fase('V1'), '2026-08-19').tipo, 'intermedio');
});

test('en floracion no se propone un segundo completo en la misma semana (r11)', () => {
  // El caso real: el sustrato seco antes, entra un riego extra en la semana.
  const c = conPlan([{ fecha: '2026-09-30', tipo: 'completo', fase: 'S6' }]);
  const previos = [{ fecha: '2026-09-27', tipo: 'completo' }];
  const s = tipoSugerido(c, previos, fase('S6'), '2026-09-30');

  assert.equal(s.tipo, 'intermedio', 'no un segundo completo');
  assert.equal(s.motivo, 'r11');
  assert.match(s.aviso, /hace 3 días/);
});

test('en vegetativo se avisa pero no se cambia: r11 rige en floracion', () => {
  // El alcance lo fija el archivo. Inventarlo no es tarea de la interfaz.
  const c = conPlan([{ fecha: '2026-08-19', tipo: 'completo', fase: 'V2' }]);
  const s = tipoSugerido(c, [{ fecha: '2026-08-15', tipo: 'completo' }], fase('V1'), '2026-08-19');

  assert.equal(s.tipo, 'completo', 'la decision queda de este lado');
  assert.match(s.aviso, /hace 4 días/);
});

test('un completo de hace mas de una semana no dispara el aviso', () => {
  const c = conPlan([{ fecha: '2026-09-30', tipo: 'completo', fase: 'S6' }]);
  const s = tipoSugerido(c, [{ fecha: '2026-09-20', tipo: 'completo' }], fase('S6'), '2026-09-30');
  assert.equal(s.aviso, null);
});

test('un intermedio previo no cuenta como carga de sales', () => {
  const c = conPlan([{ fecha: '2026-09-30', tipo: 'completo', fase: 'S6' }]);
  const s = tipoSugerido(c, [{ fecha: '2026-09-29', tipo: 'intermedio' }], fase('S6'), '2026-09-30');
  assert.equal(s.tipo, 'completo');
  assert.equal(s.aviso, null);
});

test('las mediciones consolidadas por Cowork se siguen encontrando', () => {
  // Cowork vacia el buzon al consolidar. Sin leer cultivo.json, la app
  // perderia la memoria del secado en cada consolidacion.
  const dentro = { ciclo_activo: { secados_medidos: [{ desde: 'a', fecha: 'b', dias: 3 }] } };
  assert.equal(secadosConsolidados(dentro).length, 1);
  assert.equal(secadosConsolidados({ secados_medidos: [{ dias: 4 }] }).length, 1);
  assert.deepEqual(secadosConsolidados({}), []);
});

// ---------- un solo grupo ----------
// El grupo 2 sale del archivo y se modela aparte mas adelante. Todo lo que
// depende del grupo tiene que seguir en pie con uno solo.

const soloUno = {
  ...cultivo,
  grupos: [cultivo.grupos[0]],
};

test('con un solo grupo, el grupo activo se sigue resolviendo', () => {
  assert.equal(totalMezcla(soloUno, fase('V1')).n, 8);
});

test('con un solo grupo, el secado sigue proyectando', () => {
  const e = estadoDeSecado(soloUno, '2026-08-14', { hoy: '2026-08-16' });
  assert.deepEqual([e.min, e.max], [4, 5]);
});

test('sin grupos declarados no se inventa una tanda', () => {
  assert.equal(totalMezcla({ ...cultivo, grupos: [] }, fase('V1')), null);
});

test('sin grupos y sin observaciones, el secado no proyecta nada', () => {
  assert.equal(estadoDeSecado({ ...cultivo, grupos: [] }, '2026-08-14', { hoy: '2026-08-16' }), null);
});
