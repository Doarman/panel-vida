# Panel de Vida

PWA personal que nuclea agenda, correo y subsistemas leyendo **en vivo** de una
cuenta de Google. Sin backend y sin base de datos propia: la cuenta de Google
es la fuente de verdad.

## Principio rector

> El asistente **recuerda**. Nico **decide**. El sistema **audita**.

La interfaz nunca emite instrucciones de acción. Todo aviso se formula como
proyección o pregunta.

- ❌ "Hoy regás" · "Tareas pendientes"
- ✅ "Riego proyectado para hoy (fase V1)" · "Requiere tu mirada"

Nada de checkboxes ni de nada que sugiera cumplimiento. El origen de la regla
es concreto: un ciclo de cultivo se arruinó por operar contra el calendario en
vez de contra la planta, y una app que ordena reproduce ese error con más
autoridad.

## Arquitectura de datos, en dos niveles

```
/Asistente Nico/
├── estado.json          ← índice: perfil, resúmenes y punteros
└── Cultivo/
    └── cultivo.json     ← base de datos completa del subsistema
```

`estado.json` guarda el `drive_file_id` de cada subsistema, así que la app
hardcodea **un solo ID** y descubre el resto. Se pueden sumar subsistemas sin
tocar el índice.

Escriben: Claude (Cowork) y esta app. Leen: esta app y Claude.

## Permisos

| Scope | Para qué |
|---|---|
| `calendar.readonly` | agenda del día |
| `gmail.readonly` | triage de correo |
| `drive.readonly` | leer `estado.json` y los archivos de subsistemas |
| `drive.file` | **único de escritura**: solo archivos creados por esta app |

La app **nunca muta `cultivo.json`**. Los riegos se agregan append-only a un
archivo propio y Claude consolida en el repaso semanal. Así es imposible
corromper la base desde el celular y no hay carrera entre los dos escritores.

## Desarrollo

```bash
node tools/serve.mjs      # http://localhost:8080
node tools/make-icons.mjs # regenerar íconos
```

El puerto 8080 no es arbitrario: es el origen autorizado en Google Cloud.

## Estructura

```
index.html              shell
config.js               Client ID, scopes, IDs de Drive (nada secreto)
sw.js                   service worker: solo cachea el shell propio
css/app.css
js/auth.js              OAuth vía Google Identity Services
js/api.js               llamadas a Calendar, Gmail y Drive
js/app.js               arranque y cableado
tools/                  servidor de dev y generador de íconos
```

## Notas de sesión

Sin backend no hay refresh token: el access token dura ~1 h y se renueva con
`prompt: ''`, que funciona mientras la sesión de Google siga viva en el
navegador. El token va en memoria + `sessionStorage`, nunca en `localStorage`.
