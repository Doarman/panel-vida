// Datos con los que corren las pruebas de navegador.
//
// No son una copia de los archivos de Nico: son datos hechos para estresar la
// interfaz. Incluyen a propósito lo que su archivo real todavía no tiene —un
// título larguísimo, ocho alertas cuando la pantalla muestra tres, una fase con
// muchas dosis— porque ahí es donde el layout se rompe.
//
// Las fechas se calculan desde hoy para que la fase siempre contenga el día en
// que se corre la prueba, sin congelar el reloj.

const dosDig = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`;

const hoy = new Date();
hoy.setHours(0, 0, 0, 0);
const dia = (n) => {
  const d = new Date(hoy);
  d.setDate(d.getDate() + n);
  return iso(d);
};

/** Un horario de hoy, en ISO con la hora local. */
const aLaHora = (h, m = 0) => {
  const d = new Date(hoy);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const ESTADO = {
  _meta: { version: 4, actualizado: dia(0), zona_horaria: 'America/Argentina/Cordoba' },
  principio_rector: { enunciado: 'El asistente RECUERDA. Nico DECIDE. El sistema AUDITA.' },
  perfil: { nombre: 'Nico (Nicolas Quiroga)', ciudad: 'Cordoba, Argentina' },
  calendario: {
    calendar_id: 'nicoq172@gmail.com',
    mapa_colores: {
      7: { tipo: 'salud', etiqueta: 'No negociable' },
      11: { tipo: 'tesis', etiqueta: 'Tesis' },
      5: { tipo: 'flexible', etiqueta: 'Flexible' },
      3: { tipo: 'formacion', etiqueta: 'Diplomatura' },
      8: { tipo: 'trabajo', etiqueta: 'Trabajo' },
      1: { tipo: 'profesional', etiqueta: 'Profesional' },
    },
    default: { tipo: 'otro', etiqueta: '' },
  },
  subsistemas: {
    cultivo: {
      activo: true,
      archivo_datos: '/Asistente Nico/Cultivo/cultivo.json',
      drive_file_id: 'FIXTURE-CULTIVO',
      registro: { archivo_entrada_app: '/Asistente Nico/Cultivo/riegos_registrados.json' },
      resumen: {
        ciclo_activo: 'Ciclo de prueba',
        fase_actual: 'V1',
        dia_de_ciclo: 13,
        ultimo_riego: null,
        proximo_hito: 'Flip a 12/12',
        // Ocho: la pantalla Hoy muestra tres y enlaza al resto.
        alertas: [
          'Riego proyectado: primer fertirriego tras doce dias de solo agua',
          'Spinosad sin comprar, limite en dos semanas',
          'Pasar los tres ex-esquejes a la carpa',
          'Red sin instalar, requisito para flipear',
          'Decision pendiente: salida de Rhino Skin en S6 o S7',
          'Revisar hermetismo de la sala antes del cambio de fotoperiodo',
          'Calibrar el medidor de pH: el ciclo pasado tuvo un desvio de 0.20 unidades en zona acida y eso arruino dos semanas de lecturas',
          'Trampas cromaticas azules sin reponer desde el ciclo anterior',
        ],
      },
    },
    academico: {
      activo: true,
      resumen: {
        cursando: { nombre: 'Diplomatura en Ciencias de Datos', estado: 'en curso, terminando', cursada: 'sabados' },
        tesis: { estado: 'Fase 1 - bloque profundo', deadline: null, avance_pct: null, nota: 'Bloques protegidos: 13-16h y 16:15-18:15.' },
        pipeline_formacion: [
          { area: 'EMDR/Trauma', nombre: 'PARCUVE - Modelo de trauma (Manuel Hernandez)', institucion: 'Parcuve Argentina - aval Universidad de Mendoza', modalidad: 'online + practicas presenciales en Mendoza', costo: 'a consultar', estado: 'evaluando' },
          { area: 'Neurociencias', nombre: 'Posgrado en Neurociencias', institucion: 'opciones: UNC / Favaloro / INECO', modalidad: 'a definir', estado: 'diferido a 2027' },
        ],
      },
    },
    laboral: {
      activo: true,
      resumen: {
        objetivo: 'Perfil puente: clinica + datos + IA',
        proyectos: [
          { nombre: 'FENIA', rol: 'Co-founder & AI Specialist', descripcion: 'Consultora de auditoria cognitiva del uso de IA en equipos de trabajo', estado: 'activo' },
          { nombre: 'Investigacion CIEVPsi (UNC)', rol: 'Investigador colaborador', descripcion: 'Impacto de la IA en el vinculo pedagogico', estado: 'activo' },
        ],
        hoja_de_ruta: [
          { hito: 'LinkedIn realineado (perfil puente)', estado: 'aplazado' },
          { hito: 'FENIA - IA + personas', estado: 'activo' },
          { hito: 'Matricula / encuadre clinico', estado: 'pendiente' },
          { hito: 'Consultorio integral', estado: 'futuro' },
        ],
      },
    },
  },
};

const NUTRICION_INTERMEDIO = { pure_zym_ml_l: 1, vitamax_ml_l: 0.5 };
const NOTA_INTERMEDIO =
  'Formula FIJA, no es una fraccion del completo. No lleva sales. NUNCA calcular como factor del riego completo.';

export const CULTIVO = {
  _meta: { version: '1.4.0', actualizado: dia(0) },
  sitio: {
    espacios: [
      { id: 'sala-flor', nombre: 'Sala de floracion' },
      { id: 'carpa-veg', nombre: 'Carpa de vegetacion' },
    ],
    agua: { ec_ms_cm: 0.225, ph_origen: 7.0, nota_critica: 'El agua APORTA 0.225 mS/cm antes de agregar nada.' },
  },
  luminarias: [
    { id: 'silverfox', nombre: 'SilverFox 480 EVO', espacio: 'sala-flor', asignada_a: 'grupo-1' },
    { id: 'generico', nombre: 'LED generico', espacio: 'carpa-veg', asignada_a: 'grupo-2' },
  ],
  grupos: [
    {
      id: 'grupo-1', nombre: 'Grupo 1 SilverFox', cantidad_plantas: 8,
      espacio: 'sala-flor', luminaria: 'silverfox', estado: 'vegetativo',
      fecha_flip_planificada: dia(8), ciclo_secado_dias: [4, 5],
      notas: 'Deficit foliar visible, clorosis en tercio medio.',
    },
    {
      id: 'grupo-2', nombre: 'Grupo 2 ex-esquejes en veg extendida', cantidad_plantas: 3,
      espacio: 'carpa-veg', luminaria: 'generico', estado: 'vegetativo extendido',
      fecha_flip_planificada: null,
      notas: 'Retirados del Grupo 1 para evitar dos alturas de canopy bajo una misma luminaria.',
    },
  ],
  ciclo_activo: {
    id: 'ciclo-prueba', nombre: 'Ciclo de prueba - Grupo 1 SilverFox', grupo: 'grupo-1',
    fecha_inicio: dia(-12), fecha_flip_planificada: dia(8),
    duracion_floracion_semanas: 8, fecha_corte_estimada: dia(66),
    fecha_corte_criterio: 'La define la lupa 60x: mayoria de tricomas lechosos y 10-15% ambar. NUNCA el calendario.',
    fases: [
      {
        id: 'V1', nombre: 'Veg 1 post-trasplante', tipo: 'vegetativo',
        fecha_inicio: dia(-1), fecha_fin: dia(2),
        nutricion: { rhino_skin_ml_l: 2, calmag_ml_l: 2, grow_g_l: 0.5, pure_zym_ml_l: 1, vitamax_ml_l: 0.5 },
        ec_objetivo: [0.8, 1.0], ph_entrada: [6.0, 6.2], volumen_por_maceta_l: [2.5, 3],
        ppfd: 360, ppfd_techo: null,
        ambiente: { temp_luz_c: [23, 26], temp_oscuridad_c: [18, 22], hr_pct: [60, 70], diferencial_c: null },
        acciones: ['Primer fertirriego del ciclo tras doce dias de solo agua', 'Pasar los tres ex-esquejes a carpa'],
        nutricion_intermedio: NUTRICION_INTERMEDIO,
        nutricion_intermedio_nota: NOTA_INTERMEDIO,
        ec_objetivo_intermedio: null, ph_entrada_intermedio: [6.0, 6.2],
      },
      {
        id: 'S5', nombre: 'Floracion S5 pico de PK inicio', tipo: 'floracion', dias_flor: [29, 35],
        fecha_inicio: dia(3), fecha_fin: dia(9),
        // Ocho dosis: la fase mas cargada del ciclo, para ver si la lista aguanta.
        nutricion: {
          rhino_skin_ml_l: 2, calmag_ml_l: 3, hybrids_g_l: 1.0, flora_booster_ml_l: 4,
          flora_booster_aplicacion: 3, trico_mas_g_l: 0.5, pure_zym_ml_l: 1, vitamax_ml_l: 0.5,
        },
        ec_objetivo: [1.7, 2.0], ph_entrada: [6.2, 6.4], volumen_por_maceta_l: [4, 4],
        ppfd: 1150, ppfd_techo: 1200,
        ambiente: { temp_luz_c: [22, 24], temp_oscuridad_c: [17, 20], hr_pct: [42, 48], diferencial_c: [6, 8] },
        // Contradiccion deliberada: la fase dice 1150 y la accion 1200. Es la
        // regresion real que volvio en la v1.7.0, puesta aca para que la
        // seccion de auditoria tenga algo que mostrar.
        acciones: ['Hybrids llega a 1 g/L: techo absoluto, SOLO esta semana', 'Subir a 1200 PPFD solo si el sustrato seca en 24-36h'],
        nutricion_intermedio: { ...NUTRICION_INTERMEDIO, trico_mas_g_l: 0.5 },
        nutricion_intermedio_nota: NOTA_INTERMEDIO,
        ec_objetivo_intermedio: null, ph_entrada_intermedio: [6.2, 6.4],
      },
    ],
    riegos_programados: [
      { fecha: dia(-1), tipo: 'completo', fase: 'V1' },
      { fecha: dia(3), tipo: 'intermedio', fase: 'S5' },
      { fecha: dia(7), tipo: 'completo', fase: 'S5' },
    ],
    riegos_ejecutados: [],
    hitos: [
      { fecha: dia(4), tipo: 'sanidad', descripcion: 'Primera foliar anti-trips del par reiniciado, con luz apagada', estado: 'pendiente' },
      { fecha: dia(8), tipo: 'fase', descripcion: 'FLIP a 12/12', estado: 'pendiente' },
    ],
    sanidad: {
      trips: {
        estado: 'ciclo foliar reiniciado',
        plan: [{ fecha: dia(4), producto: 'Mamboreta Oil 85E 5 ml/L + Green Leaf', via: 'foliar', nota: 'Enves, haz y puntos de crecimiento. LUZ APAGADA.' }],
        cierre_ventana_foliar: dia(21),
        despues_del_cierre: 'Solo control fisico: diatomeas semanales y trampas cromaticas azules.',
      },
    },
  },
  productos: [
    { id: 'rhino', nombre: 'Rhino Skin (Advanced Nutrients)', rol: 'silicio, paredes celulares', unidad: 'ml/L', nota: 'SIEMPRE primero y solo en el orden de mezcla. Precipita si entra junto al CalMag.' },
    { id: 'calmag', nombre: 'Sensi CalMag Xtra', rol: 'corrector critico Ca/Mg', unidad: 'ml/L', nota: 'Nunca se baja para ajustar EC.' },
    { id: 'grow', nombre: 'Greenhouse Powder Feeding Grow', rol: 'base de vegetativo', unidad: 'g/L' },
    { id: 'hybrids', nombre: 'Greenhouse Powder Feeding Hybrids', rol: 'base de floracion', unidad: 'g/L' },
    { id: 'pure_zym', nombre: 'Pure Zym (Plagron)', rol: 'enzimas, limpieza de sustrato', unidad: 'ml/L', nota: 'Todos los riegos, sin excepcion.' },
    { id: 'vitamax', nombre: 'Vitamax Pro', rol: 'kelp, aminoacidos', unidad: 'ml/L' },
    { id: 'flora_booster', nombre: 'Flora Booster (Namaste)', rol: 'estimulador floral', unidad: 'ml/L', nota: '4 aplicaciones EXACTAS. Nunca una quinta.' },
    { id: 'trico_mas', nombre: 'Trico+ (Namaste)', rol: 'melaza, alimenta microbiologia', unidad: 'g/L' },
    { id: 'pk_booster', nombre: 'PK Booster Feeding', rol: 'cierre de floracion', unidad: 'g/L' },
  ],
  orden_de_mezcla: [
    'Agua', 'Rhino Skin (solo, agitar antes de seguir)', 'CalMag', 'Grow o Hybrids',
    'PK Booster', 'Flora Booster', 'Pure Zym', 'Vitamax', 'Trico+',
    'Recien ahora: medir EC y ajustar pH',
  ],
  tipos_de_riego: {
    completo: { usa: 'fase.nutricion', aporta_sales: true, nota: 'Un solo completo por semana en floracion activa (r11).' },
    intermedio: { usa: 'fase.nutricion_intermedio', aporta_sales: false, formula_fija: 'Pure Zym 1 ml/L + Vitamax 0.5 ml/L', nota: 'NO es media dosis del completo ni escala con la fase.' },
    agua: { usa: null, aporta_sales: false, nota: 'Solo agua a pH de fase. Sin aditivos.' },
    flush: { usa: null, aporta_sales: false, formula_fija: 'Agua + Pure Zym 2 ml/L', nota: 'De corrido, nunca en cuotas (r6).' },
  },
  reglas_no_negociables: [
    { id: 'r1', regla: 'Maximo 500 PPFD en Floracion S1 y S2', origen: 'El ciclo anterior se arruino subiendo a 740 sobre raiz inmadura.', criticidad: 'maxima' },
    { id: 'r8', regla: 'La frecuencia de riego se decide por peso de maceta, nunca por fecha', origen: 'El calendario propone, la planta dispone.', criticidad: 'maxima' },
    { id: 'r13', regla: 'El riego intermedio no aporta sales y no se calcula como fraccion del completo', origen: 'Es lo que hace funcionar la alternancia de r2 y r11.', criticidad: 'maxima' },
    { id: 'r3', regla: 'Rhino Skin siempre primero y solo en la mezcla', origen: 'El silicio precipita con el CalMag', criticidad: 'alta' },
  ],
  pendientes: [
    { id: 'p1', item: 'Spinosad', fecha_limite: dia(14), motivo: 'Se cierra la ventana foliar. Pendiente de dos ciclos. El par foliar se reinicio, lo que deja poco margen.', estado: 'pendiente' },
    { id: 'p3', item: 'Lupa de tricomas 60x', fecha_limite: dia(50), motivo: 'El corte se define por tricomas. Sin lupa es a ciegas.', estado: 'pendiente' },
  ],
  decisiones_abiertas: [
    { id: 'd1', tema: 'Salida de Rhino Skin', estado: 'PENDIENTE DE NICO', decidir_antes_de: dia(40) },
    { id: 'd2', tema: 'Aplicaciones foliares', estado: 'RESUELTA', resolucion: 'Ciclo reiniciado.' },
  ],
  datos_estimados: [
    { dato: 'ratio humedo/seco', valor: '4.5 a 5 : 1', estado: 'ESTIMADO, nunca medido' },
    { dato: 'temperatura nocturna', estado: 'SIN REGISTRO SISTEMATICO. Es la variable con menos datos de todo el sistema.' },
  ],
  grupos_futuros: [
    { id: 'grupo-3', estado: 'NO INTEGRAR TODAVIA', cantidad_plantas: 11, luminaria: 'dhp', ingreso_a_sala_estimado: '~20 dias', nota: 'Ciclo escalonado.' },
  ],
  registro_crudo: {
    esquema: { id: 'string', fecha: 'YYYY-MM-DD', tipo: 'completo | intermedio | agua | ripening | flush' },
  },
};

export const EVENTOS = {
  items: [
    {
      id: 'e1', colorId: '7', summary: '🩺 Rehabilitación espalda (L4-L5-S1)',
      start: { dateTime: aLaHora(8, 15) }, end: { dateTime: aLaHora(9, 45) },
    },
    {
      id: 'e2', colorId: '5', summary: '🔁 Comodín 10–12 · Tesis (default) / Cultivo cuando toca',
      start: { dateTime: aLaHora(10) }, end: { dateTime: aLaHora(12) },
    },
    // Bloque larguísimo: es donde el título desborda si algo está mal.
    {
      id: 'e3', colorId: '11',
      summary: '📕 TESIS — Bloque profundo de análisis, argumentación y secciones nuevas sin notificaciones',
      start: { dateTime: aLaHora(13) }, end: { dateTime: aLaHora(16) },
    },
    { id: 'e4', colorId: '3', summary: '🎓 Diplomatura en Ciencias de Datos', start: { dateTime: aLaHora(16, 15) }, end: { dateTime: aLaHora(18, 15) } },
    { id: 'e5', colorId: '8', summary: '💼 Reunión FENIA', start: { dateTime: aLaHora(19) }, end: { dateTime: aLaHora(20) } },
    // Sin colorId y creado por Gmail: tiene que verse distinto, no romperse.
    { id: 'e6', eventType: 'fromGmail', summary: 'Cita en JONATHAN Hair Studio', start: { dateTime: aLaHora(21) }, end: { dateTime: aLaHora(21, 30) } },
    { id: 'e7', summary: 'Aniversario', start: { date: dia(0) }, end: { date: dia(1) } },
    { id: 'e8', colorId: '11', summary: '📕 TESIS — Redacción', start: { dateTime: aLaHora(9) }, end: { dateTime: aLaHora(10) } },
  ],
};

export const CORREO_IDS = {
  messages: Array.from({ length: 12 }, (_, i) => ({ id: `m${i}` })),
  resultSizeEstimate: 12,
};

const REMITENTES = [
  ['Estudio Márquez <estudio@marquez.com.ar>', 'Adjunto el borrador del contrato', false],
  ['Growshop Sur <ventas@growshopsur.com>', 'Llegó el PK Booster que encargaste', false],
  ['Ana <ana@gmail.com>', '¿Confirmás el sábado?', false],
  ['CIEVPsi <investigacion@psyche.unc.edu.ar>', 'Reunión de equipo: cambio de horario para el ateneo de la semana que viene', false],
  ['Newsletter de Neurociencias <no-reply@news.example.com>', 'Diez artículos que no te podés perder', true],
  ['Coursera <no-reply@coursera.org>', 'Tu curso te espera', true],
  ['Dr. Hernández <mh@parcuve.ar>', 'Fechas de la práctica presencial en Mendoza', false],
  ['Banco <alertas@banco.com.ar>', 'Resumen de cuenta disponible', true],
];

export function mensaje(id) {
  const [from, subject, masivo] = REMITENTES[Number(id.slice(1)) % REMITENTES.length];
  const headers = [{ name: 'From', value: from }, { name: 'Subject', value: subject }];
  if (masivo) headers.push({ name: 'List-Unsubscribe', value: '<mailto:x@x.com>' });
  return { id, payload: { headers } };
}
