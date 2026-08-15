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

  // Único ID que la app hardcodea. Todo lo demás se descubre desde acá:
  // estado.json guarda el drive_file_id de cada subsistema.
  ESTADO_FILE_ID: '1fi9DplzogB_gpnQG9qgZPtJuNT3qrhG3',

  CALENDAR_ID: 'primary',
  TZ: 'America/Argentina/Cordoba',
};
