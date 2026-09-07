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

// ---------- secado, en horas ----------
//
// El archivo lo traia en dias enteros y ahi estaba el problema: este sustrato
// seca en unas 60 horas, que son dos dias y medio. En un contador de dias
// enteros ese numero no se puede decir.

const AHORA = Date.parse('2026-08-16T12:00:00');
const SEC = (desde, fecha, horas, fase = 'V1') => ({ desde, fecha, horas, fase });

test('sin nada declarado, el rango en dias del archivo se convierte a horas', () => {
  const e = estadoDeSecado(cultivo, '2026-08-14', { ahora: AHORA });
  assert.equal(e.origen, 'dias');
  assert.equal(e.horas, 108); // (4+5)/2 dias
});

test('el puente de config le gana al rango en dias', () => {
  const e = estadoDeSecado(cultivo, '2026-08-14', { puente: 60, ahora: AHORA });
  assert.equal(e.origen, 'puente');
  assert.equal(e.horas, 60);
});

test('el secado consolidado llega como rango y no se ignora en silencio', () => {
  // Hoy ciclo_secado_horas es un escalar puesto a mano. Cuando Cowork
  // consolide tres mediciones pasa a ser [min, max]. Si la app solo aceptara el
  // escalar no se romperia: descartaria la medicion y seguiria con el puente,
  // que es peor que romperse.
  const conRango = { ...cultivo, grupos: [{ ...cultivo.grupos[0], ciclo_secado_horas: [54, 66] }] };
  const e = estadoDeSecado(conRango, '2026-08-14', { puente: 60, ahora: AHORA });
  assert.equal(e.origen, 'archivo');
  assert.equal(e.horas, 60); // el punto medio del rango
  assert.deepEqual([e.min, e.max], [54, 66]);
});

test('un rango invertido o incompleto no se toma como valido', () => {
  const malo = { ...cultivo, grupos: [{ ...cultivo.grupos[0], ciclo_secado_horas: [60] }] };
  assert.equal(estadoDeSecado(malo, '2026-08-14', { puente: 48, ahora: AHORA }).origen, 'puente');

  const alReves = { ...cultivo, grupos: [{ ...cultivo.grupos[0], ciclo_secado_horas: [66, 54] }] };
  const e = estadoDeSecado(alReves, '2026-08-14', { ahora: AHORA });
  assert.deepEqual([e.min, e.max], [54, 66]); // se ordena en vez de descartarse
});

test('lo que declara el archivo en horas le gana al puente', () => {
  const conHoras = { ...cultivo, grupos: [{ ...cultivo.grupos[0], ciclo_secado_horas: 66 }] };
  const e = estadoDeSecado(conHoras, '2026-08-14', { puente: 60, ahora: AHORA });
  assert.equal(e.origen, 'archivo');
  assert.equal(e.horas, 66);
});

test('una medicion de Nico le gana a todo lo demas', () => {
  const e = estadoDeSecado(cultivo, '2026-08-14', {
    secados: [SEC('2026-08-10', '2026-08-12', 58)],
    puente: 60,
    ahora: AHORA,
  });
  assert.equal(e.origen, 'medido');
  assert.equal(e.horas, 58);
});

test('60 horas desde el sabado al mediodia: quedan 12 el lunes a la mañana', () => {
  const e = estadoDeSecado(cultivo, '2026-08-15', {
    puente: 60,
    ahora: Date.parse('2026-08-17T12:00:00'),
  });
  assert.equal(e.transcurridas, 48);
  assert.equal(e.restantes, 12);
  assert.equal(e.seco, false);
});

test('pasadas las horas, el estado dice que pide agua', () => {
  const e = estadoDeSecado(cultivo, '2026-08-14', {
    puente: 60,
    ahora: Date.parse('2026-08-17T12:00:00'),
  });
  assert.equal(e.seco, true);
  assert.ok(e.restantes < 0);
});

test('una observacion vieja en dias se sigue leyendo, convertida', () => {
  const e = estadoDeSecado(cultivo, '2026-08-14', {
    secados: [{ desde: '2026-08-10', fecha: '2026-08-13', dias: 3, fase: 'V1' }],
    ahora: AHORA,
  });
  assert.equal(e.horas, 72);
});

test('corregir una anotacion no suma dos observaciones del mismo riego', () => {
  const e = estadoDeSecado(cultivo, '2026-08-20', {
    secados: [SEC('2026-08-10', '2026-08-12', 120), SEC('2026-08-10', '2026-08-13', 60)],
    ahora: AHORA,
  });
  assert.equal(e.n, 1);
  assert.equal(e.horas, 60);
});

test('se prefiere lo medido en la misma fase: en flor la planta toma mas', () => {
  const secados = [SEC('2026-08-02', '2026-08-05', 72, 'V1'), SEC('2026-09-21', '2026-09-23', 48, 'S5')];
  const enFlor = estadoDeSecado(cultivo, '2026-09-25', { secados, faseId: 'S5', ahora: Date.parse('2026-09-26T12:00:00') });
  assert.equal(enFlor.mismaFase, true);
  assert.equal(enFlor.horas, 48);
});

test('la observacion de este riego se reconoce como ya seco', () => {
  const e = estadoDeSecado(cultivo, '2026-08-14', {
    secados: [SEC('2026-08-14', '2026-08-17', 60)],
    ahora: AHORA,
  });
  assert.equal(e.yaSeco.horas, 60);
});

test('secadoObservado sin datos no inventa un numero', () => {
  assert.equal(secadoObservado([]), null);
  assert.equal(secadoObservado([{ desde: null, horas: 60 }]), null);
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
  const e = estadoDeSecado(soloUno, '2026-08-14', { puente: 60, ahora: AHORA });
  assert.equal(e.horas, 60);
});

test('sin grupos declarados no se inventa una tanda', () => {
  assert.equal(totalMezcla({ ...cultivo, grupos: [] }, fase('V1')), null);
});

test('sin grupos, sin puente y sin observaciones, el secado no proyecta nada', () => {
  assert.equal(estadoDeSecado({ ...cultivo, grupos: [] }, '2026-08-14', { ahora: AHORA }), null);
});
