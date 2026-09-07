// Configuración de la app. Nada de esto es secreto: el Client ID está pensado
// para vivir a la vista en el cliente, y los IDs de Drive no sirven sin tu login.
export const CONFIG = {
  CLIENT_ID: '85762150808-hajffeif9igd2uspkb1v9nn7gv77l526.apps.googleusercontent.com',

  // A qué cuenta apuntar. Sin esta pista Google no asume nada y muestra el
  // selector de cuenta en cada renovación, aunque haya sesión activa y permiso
  // ya otorgado. Con ella, la renovación no muestra nada.
  CUENTA: 'nicoq172@gmail.com',

  // Los cuatro permisos declarados en Google Cloud.
  // drive.file es el único de escritura: solo alcanza archivos creados por esta app.
  SCOPES: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file',
  ].join(' '),

  // Solo respaldo. Los archivos se resuelven por NOMBRE, porque el conector de
  // Drive que usa Claude no puede editar contenido: reemplaza, y en cada
  // reemplazo el ID cambia. Un ID guardado es un dato con fecha de vencimiento.
  ESTADO_FILE_ID: '1gpUSFVPYXZL88QPjKedS27IHW9AsvFI3',


  // PUENTE, no destino. El sustrato de este cultivo seca en unas 60 horas y el
  // archivo todavía lo trae en días enteros, donde 2.5 días no se puede decir.
  // Se usa solo mientras cultivo.json no declare `ciclo_secado_horas` en el
  // grupo: apenas lo declare, manda el archivo. Y cualquier medición de Nico
  // le gana a los dos.
  SECADO_HORAS: 60,

  CALENDAR_ID: 'primary',
  TZ: 'America/Argentina/Cordoba',
};
