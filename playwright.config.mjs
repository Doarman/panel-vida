import { defineConfig, devices } from '@playwright/test';

// El puerto es el 8080 porque es el origen autorizado en Google Cloud.
// Playwright levanta el servidor de dev solo y lo baja al terminar.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: [['list']],
  outputDir: './tests/e2e/.salida',

  use: {
    baseURL: 'http://localhost:8080',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Cordoba',
  },

  // Tres anchos: el más angosto que hay que aguantar, el de diseño, y el ancho.
  projects: [
    { name: '360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 800 } } },
    { name: '412', use: { ...devices['Pixel 5'], viewport: { width: 412, height: 892 } } },
    { name: '430', use: { ...devices['Pixel 5'], viewport: { width: 430, height: 932 } } },
  ],

  webServer: {
    command: 'node tools/serve.mjs',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    stdout: 'ignore',
  },
});
