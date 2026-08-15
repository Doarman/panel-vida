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
        volumen_por_maceta_l: [2.5, 3],
      },
      {
        id: 'S6',
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

test('los productos del riego se deducen de la fase', () => {
  assert.deepEqual(productosDeLaFase(cultivo, fase('V1'), 'completo').sort(), [
    'calmag', 'grow', 'pure_zym', 'rhino', 'vitamax',
  ]);
});

test('un riego de agua no lleva productos', () => {
  assert.deepEqual(productosDeLaFase(cultivo, fase('V1'), 'agua'), []);
  assert.deepEqual(productosDeLaFase(cultivo, fase('V1'), 'flush'), []);
});

// ---------- formato ----------

test('un rango se muestra con guión, un valor suelto tal cual', () => {
  assert.equal(rango([0.8, 1.0]), '0.8–1');
  assert.equal(rango(null), '—');
  assert.equal(rango(500), 500);
});
