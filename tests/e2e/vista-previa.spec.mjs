// Vista previa con los datos reales de hoy, para mirar antes de publicar.
//
// No es una prueba: no afirma nada, saca capturas. Los archivos son recortes
// fieles de cultivo.json v1.9.0 y cultivo_grupo2.json v1.1.0 tal como estan en
// Drive el 2026-09-19, con estado.json v9. Los riegos si son inventados: el
// registro real esta detenido desde el 2026-08-26 (hallazgo g2-a3) y con eso
// las dos pantallas mostrarian solo "pide agua".
//
// No corre en la suite: es para mirar, no para verificar. Se pide a mano.
//
//   PV_PREVIA=1 npx playwright test vista-previa --project=412

import { test } from '@playwright/test';

const PEDIDA = Boolean(process.env.PV_PREVIA);

const json = (datos) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(datos) });

const ESTADO = {
  _meta: { version: 9, actualizado: '2026-09-19' },
  principio_rector: { enunciado: 'El asistente RECUERDA. Nico DECIDE. El sistema AUDITA.' },
  perfil: { nombre: 'Nico (Nicolas Quiroga)', ciudad: 'Cordoba, Argentina' },
  calendario: { calendar_id: 'nicoq172@gmail.com', mapa_colores: { 7: { tipo: 'salud', etiqueta: 'No negociable' }, 11: { tipo: 'tesis', etiqueta: 'Tesis' } }, default: { tipo: 'otro', etiqueta: '' } },
  subsistemas: {
    cultivo: {
      activo: true,
      ciclos_en_paralelo: true,
      archivo_datos: '/Asistente Nico/Cultivo/cultivo.json',
      archivos_por_grupo: [
        { grupo: 'grupo-1', archivo: '/Asistente Nico/Cultivo/cultivo.json' },
        { grupo: 'grupo-2', archivo: '/Asistente Nico/Cultivo/cultivo_grupo2.json' },
      ],
      nomenclatura_de_grupos: {
        'grupo-1': '8 plantas bajo SilverFox. Flip real 2026-08-24. Vive en cultivo.json.',
        'grupo-2': '11 plantas bajo DHP 2+R: 3 veteranas (subconjunto A) + 8 nuevas (subconjunto B). Flip planificado 2026-09-23.',
        'grupo-3': '3 plantas que quedan en carpa para el ciclo siguiente, luminaria prevista Mars 420E. NO integrar todavia.',
      },
      registro: { archivo_entrada_app: '/Asistente Nico/Cultivo/riegos_registrados.json' },
      grupos: {
        'grupo-1': {
          drive_file_id: 'FIXTURE-CULTIVO',
          resumen: {
            ciclo_activo: 'Ciclo Agosto 2026 - Grupo 1 SilverFox', fase_actual: 'S4 - Floracion, flor media',
            dia_de_ciclo: 27, ultimo_riego: null, proximo_riego: '2026-09-20 (completo, S4)',
            alertas: [
              'MANANA 2026-09-20 vence p2 (termometro min/max). Sin el no se opera el diferencial termico de terpenos que arranca en S5 el 21.',
              'Contencion de drenaje antes del 2026-09-21: con cogollos formados el agua en el piso sube la HR.',
              'Decision d1: salida de Rhino Skin en S6 o S7, antes del 2026-09-27.',
            ],
          },
        },
        'grupo-2': {
          drive_file_id: 'FIXTURE-CULTIVO2',
          resumen: {
            ciclo_activo: 'Ciclo Septiembre 2026 - Grupo 2 DHP', fase_actual: 'V-PRE - Veg pre-flip',
            dia_de_ciclo: 18, ultimo_riego: null, proximo_riego: '2026-09-20 (completo, V-PRE, alcance todos)',
            alertas: [
              'HOY 2026-09-19: primera foliar del par anti-trips (Oil 85E 5 ml/L + Green Leaf), con luz apagada.',
              '2026-09-22: medicion de PPFD por posicion con ambas luminarias. Es requisito del disparo del flip.',
            ],
          },
        },
      },
      hallazgos_de_auditoria_abiertos: {
        nota: 'Regresiones de cultivo.json que siguen sin resolver.',
        items: [
          'S3 de cultivo.json con ppfd 675 y ppfd_techo null. La fase ya paso sin resolverse.',
          'Fase de oscuridad y corte ausente en cultivo.json: hueco del 19 al 21 de octubre.',
          'g2-a3: el registro de riegos esta detenido desde el 2026-08-26.',
        ],
      },
    },
    academico: { activo: true, resumen: { cursando: { nombre: 'Diplomatura en Ciencias de Datos', estado: 'en curso', cursada: 'sabados' }, tesis: { estado: 'Fase 1 - bloque profundo', deadline: null, avance_pct: null }, pipeline_formacion: [] } },
    laboral: { activo: true, resumen: { objetivo: 'Perfil puente: clinica + datos + IA', proyectos: [{ nombre: 'FENIA', rol: 'Co-founder & AI Specialist', estado: 'activo' }], hoja_de_ruta: [] } },
  },
};

const INTERMEDIO_NOTA = 'Formula FIJA, no es una fraccion del completo. No lleva sales. NUNCA calcular como factor del riego completo.';

const CULTIVO = {
  _meta: { version: '1.9.0', actualizado: '2026-09-19' },
  sitio: { agua: { ec_ms_cm: 0.225, ph_origen: 7.0, nota_critica: 'El agua APORTA 0.225 mS/cm antes de agregar nada.' } },
  luminarias: [
    { id: 'silverfox', nombre: 'SilverFox 480 EVO', consumo_w: 480, ppfd_pico: 800, asignada_a: 'grupo-1' },
    { id: 'dhp', nombre: 'DHP 2+R DydeLED', consumo_w: 950, ppfd_pico: 1400, asignada_a: null },
    { id: 'mars', nombre: 'Mars Sunflash 420E', ppfd_pico: 700, asignada_a: 'grupo-2' },
  ],
  grupos: [
    {
      id: 'grupo-1', nombre: 'Grupo 1 SilverFox', cantidad_plantas: 8, luminaria: 'silverfox',
      maceta: { tipo: 'air pot', litros_nominal: 25, litros_efectivos: 15 },
      fecha_trasplante: '2026-08-02', fecha_flip_real: '2026-08-24',
      ciclo_secado_horas: 60, ciclo_secado_dias: [4, 5], _ciclo_secado_dias_obsoleto: true,
    },
    { id: 'grupo-2', nombre: 'Grupo 2 ex-esquejes en veg extendida', cantidad_plantas: 3, luminaria_actual: 'mars' },
  ],
  ciclo_activo: {
    id: 'ciclo-ago2026-g1', nombre: 'Ciclo Agosto 2026 - Grupo 1 SilverFox', grupo: 'grupo-1',
    fecha_inicio: '2026-08-02', fecha_flip_planificada: '2026-08-23', fecha_flip_real: '2026-08-24',
    duracion_floracion_semanas: 8, fecha_corte_estimada: '2026-10-21',
    fecha_corte_criterio: 'La define la lupa 60x: mayoria de tricomas lechosos y 10-15% ambar. NUNCA el calendario.',
    fases: [
      {
        id: 'S3', nombre: 'Floracion S3 flor temprana', tipo: 'floracion', dias_flor: [15, 21],
        fecha_inicio: '2026-09-07', fecha_fin: '2026-09-13',
        nutricion: { rhino_skin_ml_l: 2, calmag_ml_l: 2.5, hybrids_g_l: 0.8, trico_mas_g_l: 0.5, pure_zym_ml_l: 1, vitamax_ml_l: 0.5 },
        ec_objetivo: [1.5, 1.8], ph_entrada: [6.2, 6.4], volumen_por_maceta_l: [3, 4],
        ppfd: 675, ppfd_techo: null,
        ambiente: { temp_luz_c: [23, 25], temp_oscuridad_c: [18, 21], hr_pct: [45, 50], diferencial_c: [5, 7] },
        acciones: ['Entra Flora Booster aplicacion 1 y Trico+', 'Subir a 650 PPFD solo si el sustrato seca en 24-36h'],
        nutricion_intermedio: { pure_zym_ml_l: 1, vitamax_ml_l: 0.5, trico_mas_g_l: 0.5 },
        nutricion_intermedio_nota: INTERMEDIO_NOTA, ec_objetivo_intermedio: null, ph_entrada_intermedio: [6.2, 6.4],
        aplicaciones_evento: [{ producto: 'flora_booster', aplicacion_numero: 1, dosis_ml_l: 2, cuando: 'UNA sola vez en la fase, en el PRIMER fertirriego completo.' }],
      },
      {
        id: 'S4', nombre: 'Floracion S4 flor media', tipo: 'floracion', dias_flor: [22, 28],
        fecha_inicio: '2026-09-14', fecha_fin: '2026-09-20',
        nutricion: { rhino_skin_ml_l: 2, calmag_ml_l: 2.5, hybrids_g_l: 0.8, trico_mas_g_l: 0.5, pure_zym_ml_l: 1, vitamax_ml_l: 0.5 },
        ec_objetivo: [1.6, 1.9], ph_entrada: [6.2, 6.4], volumen_por_maceta_l: [4, 4],
        ppfd: 700, ppfd_techo: 800,
        ambiente: { temp_luz_c: [23, 25], temp_oscuridad_c: [18, 21], hr_pct: [45, 50], diferencial_c: [5, 7] },
        acciones: ['Flora Booster aplicacion 2', 'Revisar interior del canopy tras defoliacion'],
        nutricion_intermedio: { pure_zym_ml_l: 1, vitamax_ml_l: 0.5, trico_mas_g_l: 0.5 },
        nutricion_intermedio_nota: INTERMEDIO_NOTA, ec_objetivo_intermedio: null, ph_entrada_intermedio: [6.2, 6.4],
        aplicaciones_evento: [{ producto: 'flora_booster', aplicacion_numero: 2, dosis_ml_l: 3, cuando: 'UNA sola vez en la fase, en el PRIMER fertirriego completo de la fase.' }],
      },
      {
        id: 'S5', nombre: 'Floracion S5 pico de PK inicio', tipo: 'floracion', dias_flor: [29, 35],
        fecha_inicio: '2026-09-21', fecha_fin: '2026-09-27',
        nutricion: { rhino_skin_ml_l: 2, calmag_ml_l: 3, hybrids_g_l: 1.0, trico_mas_g_l: 0.5, pure_zym_ml_l: 1, vitamax_ml_l: 0.5 },
        ec_objetivo: [1.7, 2.0], ph_entrada: [6.2, 6.4], volumen_por_maceta_l: [4, 4],
        ppfd: 700, ppfd_techo: 800,
        ambiente: { temp_luz_c: [22, 24], temp_oscuridad_c: [17, 20], hr_pct: [42, 48], diferencial_c: [6, 8] },
        acciones: ['Hybrids llega a 1 g/L: techo absoluto, SOLO esta semana', 'CalMag sube a 3 preventivo', 'Arranca la ventana termica de terpenos'],
        nutricion_intermedio: { pure_zym_ml_l: 1, vitamax_ml_l: 0.5, trico_mas_g_l: 0.5 },
        nutricion_intermedio_nota: INTERMEDIO_NOTA, ec_objetivo_intermedio: null, ph_entrada_intermedio: [6.2, 6.4],
        aplicaciones_evento: [{ producto: 'flora_booster', aplicacion_numero: 3, dosis_ml_l: 4, cuando: 'UNA sola vez en la fase, en el PRIMER fertirriego completo de la fase.' }],
      },
      {
        id: 'S6', nombre: 'Floracion S6 engorde 1', tipo: 'floracion', dias_flor: [36, 42],
        fecha_inicio: '2026-09-28', fecha_fin: '2026-10-04',
        nutricion: { rhino_skin_ml_l: 2, calmag_ml_l: 3, hybrids_g_l: 0.8, pk_booster_g_l: 0.3, trico_mas_g_l: 0.5, pure_zym_ml_l: 1, vitamax_ml_l: 0.5 },
        ec_objetivo: [1.7, 2.0], ph_entrada: [6.2, 6.4], volumen_por_maceta_l: [4, 4], ppfd: 700, ppfd_techo: 800,
        ambiente: { temp_luz_c: [22, 24], temp_oscuridad_c: [17, 20], hr_pct: [42, 48], diferencial_c: [6, 8] },
        acciones: ['Entra PK Booster', 'Ultima aplicacion de Rhino Skin'],
        nutricion_intermedio: { pure_zym_ml_l: 1, vitamax_ml_l: 0.5, trico_mas_g_l: 0.5 },
        nutricion_intermedio_nota: INTERMEDIO_NOTA, ec_objetivo_intermedio: null, ph_entrada_intermedio: [6.2, 6.4],
      },
    ],
    riegos_programados: [
      { fecha: '2026-09-16', tipo: 'intermedio', fase: 'S4' },
      { fecha: '2026-09-20', tipo: 'completo', fase: 'S4' },
      { fecha: '2026-09-24', tipo: 'intermedio', fase: 'S5' },
      { fecha: '2026-09-27', tipo: 'completo', fase: 'S5' },
    ],
    riegos_ejecutados: [],
    hitos: [
      { fecha: '2026-09-21', tipo: 'fase', descripcion: 'Entra S5: arranca la ventana termica de terpenos y CalMag sube a 3', estado: 'pendiente' },
      { fecha: '2026-10-12', tipo: 'fase', descripcion: 'Ultimo riego con nutricion, arranca ripening', estado: 'pendiente' },
      { fecha: '2026-10-21', tipo: 'cosecha', descripcion: 'Corte estimado, lo define la lupa 60x', estado: 'pendiente' },
    ],
    sanidad: {
      humedad_por_drenaje: {
        observacion: 'El drenaje moja el piso de la sala y eleva la HR por evaporacion.',
        estado: 'alerta desde S5',
        plan: [{ fecha: '2026-09-21', producto: 'Bandeja o contencion de drenaje', nota: 'Con cogollos formados, contener el drenaje pasa a ser sanidad.' }],
      },
    },
  },
  productos: [
    { id: 'rhino', nombre: 'Rhino Skin (Advanced Nutrients)', rol: 'silicio, paredes celulares', unidad: 'ml/L', nota: 'SIEMPRE primero y solo en el orden de mezcla. Precipita si entra junto al CalMag.' },
    { id: 'calmag', nombre: 'Sensi CalMag Xtra', rol: 'corrector critico Ca/Mg', unidad: 'ml/L', nota: 'Nunca se baja para ajustar EC.' },
    { id: 'hybrids', nombre: 'Greenhouse Powder Feeding Hybrids', rol: 'base de floracion', unidad: 'g/L' },
    { id: 'grow', nombre: 'Greenhouse Powder Feeding Grow', rol: 'base de vegetativo', unidad: 'g/L' },
    { id: 'pure_zym', nombre: 'Pure Zym (Plagron)', rol: 'enzimas, limpieza de sustrato', unidad: 'ml/L', nota: 'Todos los riegos, sin excepcion.' },
    { id: 'vitamax', nombre: 'Vitamax Pro', rol: 'kelp, aminoacidos', unidad: 'ml/L' },
    { id: 'trico_mas', nombre: 'Trico+ (Namaste)', rol: 'melaza, alimenta microbiologia', unidad: 'g/L' },
    { id: 'pk_booster', nombre: 'PK Booster Feeding', rol: 'cierre de floracion', unidad: 'g/L' },
    { id: 'flora_booster', nombre: 'Flora Booster (Namaste)', rol: 'estimulador floral', unidad: 'ml/L', nota: '4 aplicaciones EXACTAS. Nunca una quinta.' },
  ],
  orden_de_mezcla: ['Agua', 'Rhino Skin (solo, agitar antes de seguir)', 'CalMag', 'Grow o Hybrids', 'PK Booster', 'Flora Booster', 'Pure Zym', 'Vitamax', 'Trico+', 'Recien ahora: medir EC y ajustar pH'],
  tipos_de_riego: {
    completo: { usa: 'fase.nutricion', aporta_sales: true, nota: 'Un solo completo por semana en floracion activa (r11).' },
    intermedio: { usa: 'fase.nutricion_intermedio', aporta_sales: false, formula_fija: 'Pure Zym 1 ml/L + Vitamax 0.5 ml/L + Trico+ 0.5 g/L', nota: 'NO es media dosis del completo ni escala con la fase.' },
    agua: { usa: null, aporta_sales: false, nota: 'Solo agua a pH de fase. Sin aditivos.' },
    ripening: { usa: 'fase.nutricion de S8', aporta_sales: true },
    flush: { usa: null, aporta_sales: false, formula_fija: 'Agua + Pure Zym 2 ml/L', nota: 'De corrido, nunca en cuotas (r6).' },
  },
  reglas_no_negociables: [
    { id: 'r8', regla: 'La frecuencia de riego se decide por peso de maceta, nunca por fecha', origen: 'El calendario propone, la planta dispone', criticidad: 'maxima' },
    { id: 'r11', regla: 'Un solo fertirriego completo por semana en floracion activa, alternado con intermedio', criticidad: 'maxima' },
    { id: 'r13', regla: 'El riego intermedio no aporta sales y no se calcula como fraccion del completo', criticidad: 'maxima' },
    { id: 'r14', regla: 'Flora Booster es aplicacion de evento, no concentracion de la solucion', criticidad: 'maxima' },
  ],
  pendientes: [{ id: 'p2', item: 'Termometro minima/maxima', fecha_limite: '2026-09-20', motivo: 'Entrada a S5: el diferencial termico pasa a ser la palanca de terpenos.', estado: 'pendiente' }],
  datos_estimados: [
    { dato: 'PPFD de campo del SilverFox sobre 120x120 con 8 plantas', valor: '~650 estimado', estado: 'ESTIMADO. 800 es pico central declarado, no valor de campo.' },
    { dato: 'ratio humedo/seco', valor: '4.5 a 5 : 1', estado: 'ESTIMADO, nunca medido' },
  ],
  grupos_futuros: [{ id: 'grupo-3', estado: 'NO INTEGRAR TODAVIA', cantidad_plantas: 11, luminaria_prevista: 'dhp' }],
  registro_crudo: { esquema: { tipo: 'completo | intermedio | agua | ripening | flush' } },
};

const VOL = { A: [2.5, 3], B: [1.5, 2], nota: 'Referencia de arranque. El criterio real es alcanzar 10-20% de drenaje.' };

const CULTIVO_G2 = {
  _meta: { version: '1.1.0', actualizado: '2026-09-19' },
  referencias: {
    archivo_canonico: '/Asistente Nico/Cultivo/cultivo.json',
    bloques_no_copiados: ['sitio', 'productos', 'orden_de_mezcla', 'tipos_de_riego', 'modelo_de_nutricion', 'reglas_no_negociables', 'registro_crudo', 'regimen_riego_acelerado', 'alertas_ambientales', 'linea_base', 'pendientes'],
  },
  luminarias_correcciones: {
    nota: 'Override local mientras cultivo.json no incorpore la correccion.',
    dhp: { id: 'dhp', nombre: 'DHP 2+R DydeLED', consumo_w: 950, ppfd_pico: 1400, asignada_a: 'grupo-2', notas: 'SIN DIMMER: la unica palanca de intensidad es la altura y la posicion.' },
  },
  grupos: [
    {
      id: 'grupo-2', nombre: 'Grupo 2 DHP - lote heterogeneo de 11', cantidad_plantas: 11, luminaria: 'dhp',
      maceta: { tipo: 'air pot', litros_nominal: 25, litros_efectivos: 15 },
      fecha_trasplante: '2026-09-02', fecha_flip_planificada: '2026-09-23',
      ciclo_secado_horas: null,
      metodo_de_riego: 'Por vueltas de 250 ml por planta hasta alcanzar drenaje.',
      subconjuntos: [
        { id: 'A', nombre: 'Veteranas', cantidad_plantas: 3, regimen_riego_acelerado: true },
        { id: 'B', nombre: 'Nuevas', cantidad_plantas: 8, regimen_riego_acelerado: false },
      ],
      secados_medidos: [],
    },
  ],
  ciclos: [
    {
      id: 'ciclo-sep2026-g2', nombre: 'Ciclo Septiembre 2026 - Grupo 2 DHP', grupo: 'grupo-2',
      fecha_inicio: '2026-09-02', fecha_flip_planificada: '2026-09-23', fecha_flip_real: null,
      duracion_floracion_semanas: 8, fecha_corte_estimada: '2026-11-20',
      fecha_corte_criterio: 'La define la lupa 60x: mayoria de tricomas lechosos y 10-15% ambar. NUNCA el calendario.',
      fases: [
        {
          id: 'V-PRE', nombre: 'Veg pre-flip, carga previa al pase', tipo: 'vegetativo',
          fecha_inicio: '2026-09-19', fecha_fin: '2026-09-22',
          nutricion: { rhino_skin_ml_l: 2, calmag_ml_l: 2, hybrids_g_l: 0.5, grow_g_l: 0.8, pure_zym_ml_l: 1, vitamax_ml_l: 0.5 },
          ec_objetivo: [1.0, 1.3], ph_entrada: [6.0, 6.2], drenaje_objetivo_pct: [10, 20], volumen_por_maceta_l: VOL,
          ppfd: 400, ppfd_techo: null,
          ambiente: { temp_luz_c: [23, 26], temp_oscuridad_c: [18, 22], hr_pct: [60, 70], diferencial_c: null },
          acciones: ['Fertirriego completo de veg tardia ANTES del flip. Lo dispara el peso de la maceta, ventana 19 al 21', '2026-09-22: medir PPFD en sala con ambas luminarias'],
          nutricion_intermedio: { pure_zym_ml_l: 1, vitamax_ml_l: 0.5 },
          nutricion_intermedio_nota: INTERMEDIO_NOTA, ec_objetivo_intermedio: null, ph_entrada_intermedio: [6.0, 6.2],
        },
        {
          id: 'S1', nombre: 'Floracion S1 stretch inicio', tipo: 'floracion', dias_flor: [1, 7],
          fecha_inicio: '2026-09-23', fecha_fin: '2026-09-29',
          nutricion: { rhino_skin_ml_l: 2, calmag_ml_l: 2, hybrids_g_l: 0.5, pure_zym_ml_l: 1, vitamax_ml_l: 0.5 },
          ec_objetivo: [1.4, 1.6], ph_entrada: [6.2, 6.4], drenaje_objetivo_pct: [10, 20], volumen_por_maceta_l: VOL,
          ppfd: 500, ppfd_techo: 500,
          ppfd_por_subconjunto: { A: { ppfd: 700, ppfd_techo: 700, origen: 'excepcion vigente a r1' }, B: { ppfd: 500, ppfd_techo: 500, origen: 'r1' } },
          ambiente: { temp_luz_c: [22, 24], temp_oscuridad_c: [17, 20], hr_pct: [42, 48], diferencial_c: [6, 8] },
          acciones: ['Pase a sala y flip a 12/12', 'Sale el Grow', 'Disposicion etapa 1: zona de gradiente'],
          nutricion_intermedio: { pure_zym_ml_l: 1, vitamax_ml_l: 0.5 },
          nutricion_intermedio_nota: INTERMEDIO_NOTA, ec_objetivo_intermedio: null, ph_entrada_intermedio: [6.2, 6.4],
        },
        {
          id: 'S3', nombre: 'Floracion S3 flor temprana', tipo: 'floracion', dias_flor: [15, 21],
          fecha_inicio: '2026-10-07', fecha_fin: '2026-10-13',
          nutricion: { rhino_skin_ml_l: 2, calmag_ml_l: 2.5, hybrids_g_l: 0.8, trico_mas_g_l: 0.5, pure_zym_ml_l: 1, vitamax_ml_l: 0.5 },
          ec_objetivo: [1.5, 1.8], ph_entrada: [6.2, 6.4], drenaje_objetivo_pct: [10, 20], volumen_por_maceta_l: VOL,
          ppfd: 500, ppfd_techo: 650,
          ambiente: { temp_luz_c: [23, 25], temp_oscuridad_c: [18, 21], hr_pct: [45, 50], diferencial_c: [5, 7] },
          acciones: ['Entra Flora Booster aplicacion 1 y Trico+', '2026-10-13 (dia 21): defoliacion agresiva, arrancar por 30%'],
          aplicaciones_evento: [{ producto: 'flora_booster', aplicacion_numero: 1, dosis_ml_l: 2, cuando: 'UNA sola vez en la fase, en el PRIMER fertirriego completo de la fase.' }],
          nutricion_intermedio: { pure_zym_ml_l: 1, vitamax_ml_l: 0.5, trico_mas_g_l: 0.5 },
          nutricion_intermedio_nota: INTERMEDIO_NOTA, ec_objetivo_intermedio: null, ph_entrada_intermedio: [6.2, 6.4],
        },
      ],
      riegos_programados: [
        { fecha: '2026-09-20', tipo: 'completo', fase: 'V-PRE', alcance: 'todos', nota: 'Ventana 19 al 21. Lo dispara el peso de la maceta.' },
        { fecha: '2026-09-23', tipo: 'completo', fase: 'S1', alcance: 'todos' },
        { fecha: '2026-09-26', tipo: 'intermedio', fase: 'S1', alcance: 'todos' },
        { fecha: '2026-09-28', tipo: 'agua', fase: 'S1', alcance: 'A' },
      ],
      riegos_ejecutados: [],
      hitos: [
        { fecha: '2026-09-19', tipo: 'sanidad', descripcion: 'Primera foliar del par anti-trips (Oil 85E 5 ml/L + Green Leaf), luz apagada', estado: 'pendiente' },
        { fecha: '2026-09-22', tipo: 'medicion', descripcion: 'Medicion de PPFD en sala con ambas luminarias, por posicion y a altura de copa', estado: 'pendiente' },
        { fecha: '2026-09-23', tipo: 'fase', descripcion: 'Pase a sala bajo DHP 2+R y FLIP a 12/12', estado: 'pendiente' },
      ],
      observaciones: [
        { fecha: '2026-09-19', observacion: 'Amarillamiento franco en dos o tres hojas del tercio medio-alto de una de las veteranas, con peciolos y tallos violaceos alrededor.', estado: 'a vigilar' },
      ],
      sanidad: {
        trips: {
          estado: 'par foliar programado',
          plan: [
            { fecha: '2026-09-19', producto: 'Mamboreta Oil 85E 5 ml/L + Green Leaf', via: 'foliar', nota: 'Primera del par. LUZ APAGADA.' },
            { fecha: '2026-09-23', producto: 'Mamboreta Oil 85E 5 ml/L + Green Leaf', via: 'foliar', nota: 'Segunda del par, ANTES de entrar a sala.' },
          ],
          cierre_ventana_foliar: '2026-10-06',
          despues_del_cierre: 'Solo control fisico: diatomeas semanales y trampas cromaticas azules.',
        },
      },
    },
  ],
  ciclo_activo_id: 'ciclo-sep2026-g2',
  decisiones_abiertas: [{ id: 'g2-d1', tema: 'Techo de PPFD en S5-S6 del grupo-2', estado: 'PENDIENTE DE NICO', decidir_antes_de: '2026-10-21' }],
  datos_estimados: [{ dato: 'PPFD de campo del DHP sobre 150x150 con 11 plantas', valor: 'sin medir', estado: 'ESTIMADO. 1400 es pico central declarado.' }],
};

// Riegos inventados, para que los contadores muestren algo. El registro real
// esta detenido desde el 2026-08-26.
const RIEGOS = [
  { id: 'r-2026-09-17-a1b2', ciclo: 'ciclo-ago2026-g1', fecha: '2026-09-17', fase: 'S4', tipo: 'completo', alcance: 'todos', drenaje: 'si', ec_medida: 1.8, ph_medido: 6.3, litros_por_maceta: 4, productos_aplicados: ['rhino', 'calmag', 'hybrids', 'trico_mas', 'pure_zym', 'vitamax', 'flora_booster'], registrado_el: '2026-09-17' },
  { id: 'r-2026-09-18-c3d4', ciclo: 'ciclo-sep2026-g2', fecha: '2026-09-18', fase: 'V-PRE', tipo: 'agua', alcance: 'todos', drenaje: 'no', ec_medida: null, ph_medido: 6.1, registrado_el: '2026-09-18' },
  { id: 'r-2026-09-19-e5f6', ciclo: 'ciclo-sep2026-g2', fecha: '2026-09-19', fase: 'V-PRE', tipo: 'agua', alcance: 'A', drenaje: 'si', ec_medida: null, ph_medido: 6.1, registrado_el: '2026-09-19' },
];

const SECADOS = [
  { id: 's-2026-09-17', ciclo: 'ciclo-ago2026-g1', desde: '2026-09-14', fecha: '2026-09-17', horas: 62, fase: 'S4' },
];

const EVENTOS = { items: [] };

async function preparar(page, grupo) {
  const archivo = { _meta: {}, riegos: RIEGOS, secados: SECADOS };

  await page.route('https://accounts.google.com/gsi/client', (r) =>
    r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.google = { accounts: { oauth2: { initTokenClient: (c) => ({ requestAccessToken: () => {}, callback: c.callback }), hasGrantedAnyScope: () => true, revoke: (t, cb) => cb && cb() } } };' }));

  await page.route('https://www.googleapis.com/**', (ruta) => {
    const u = new URL(ruta.request().url());
    if (u.pathname.startsWith('/upload/drive/')) return ruta.fulfill(json({ id: 'FIXTURE-RIEGOS' }));
    if (u.pathname.startsWith('/calendar/')) return ruta.fulfill(json(EVENTOS));
    if (u.pathname.startsWith('/gmail/')) return ruta.fulfill(json({ messages: [] }));
    if (u.pathname === '/drive/v3/files') {
      const q = u.searchParams.get('q') || '';
      const id = q.includes('estado.json') ? 'FIXTURE-ESTADO'
        : q.includes('cultivo_grupo2.json') ? 'FIXTURE-CULTIVO2'
        : q.includes('cultivo.json') ? 'FIXTURE-CULTIVO'
        : 'FIXTURE-RIEGOS';
      return ruta.fulfill(json({ files: [{ id, name: 'x' }] }));
    }
    if (u.pathname.includes('FIXTURE-ESTADO')) return ruta.fulfill(json(ESTADO));
    if (u.pathname.includes('FIXTURE-CULTIVO2')) return ruta.fulfill(json(CULTIVO_G2));
    if (u.pathname.includes('FIXTURE-CULTIVO')) return ruta.fulfill(json(CULTIVO));
    if (u.pathname.includes('FIXTURE-RIEGOS')) return ruta.fulfill(json(archivo));
    return ruta.fulfill(json({}));
  });

  await page.addInitScript((g) => {
    localStorage.setItem('pv.otorgado', '1');
    localStorage.setItem('pv.token', JSON.stringify({ access_token: 'prueba', expira_en: Date.now() + 3600e3 }));
    localStorage.setItem('pv.grupo', g);
    localStorage.setItem('pv.modo', 'dia');
    localStorage.removeItem('pv.litros');
  }, grupo);
}

const VISTAS = [
  ['g1-cultivo', 'grupo-1', 'cultivo'],
  ['g1-plan', 'grupo-1', 'plan'],
  ['g2-cultivo', 'grupo-2', 'cultivo'],
  ['g2-plan', 'grupo-2', 'plan'],
];

for (const [nombre, grupo, ruta] of VISTAS) {
  test(`vista previa ${nombre}`, async ({ page }, info) => {
    test.skip(!PEDIDA, 'se pide con PV_PREVIA=1');
    await preparar(page, grupo);
    await page.goto(`/#/${ruta}`);
    await page.waitForFunction(() => !document.querySelector('.cargando'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `tests/e2e/capturas/real-${info.project.name}-${nombre}.png`, fullPage: true });
  });
}
