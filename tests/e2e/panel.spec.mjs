// Pruebas de navegador: abren la app de verdad y la miran.
//
// Lo que el barrido estático no puede ver: texto que desborda, una tarjeta que
// se rompe a 360 px, la barra inferior tapando contenido, un botón que no
// responde. Hasta ahora eso lo encontraba Nico mirando la pantalla.
//
//   npx playwright test
//
// La app necesita sesión de Google, que un navegador automatizado no tiene.
// En vez de saltear el login, se hacen dos cosas: se siembra un token válido en
// localStorage antes de cargar, y se interceptan las llamadas a Google para
// servir los fixtures. Así se ejercita el mismo código que corre en el celular.

import { test, expect } from '@playwright/test';
import { ESTADO, CULTIVO, EVENTOS, CORREO_IDS, mensaje } from './fixtures.mjs';

const sinGrupo2 = { ...CULTIVO, grupos: [CULTIVO.grupos[0]] };

const json = (datos) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(datos),
});

async function prepararGoogle(page, { riegos = [], secados = [] } = {}) {
  // El archivo que escribe la app se simula con estado: lo que la app sube
  // queda guardado y se devuelve en la lectura siguiente. Sin eso no se puede
  // probar el ciclo completo de anotar, subir y releer.
  const archivo = { _meta: {}, riegos, secados };
  // Google Identity Services: un doble que no abre ningún popup.
  await page.route('https://accounts.google.com/gsi/client', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `window.google = { accounts: { oauth2: {
        initTokenClient: (c) => ({ requestAccessToken: () => {} , callback: c.callback }),
        hasGrantedAnyScope: () => true,
        revoke: (t, cb) => cb && cb(),
      } } };`,
    })
  );

  await page.route('https://www.googleapis.com/**', (ruta) => {
    const u = new URL(ruta.request().url());

    // Subida: la app reemplaza el archivo entero. Se guarda lo que mandó.
    if (u.pathname.startsWith('/upload/drive/')) {
      try {
        Object.assign(archivo, JSON.parse(ruta.request().postData() || '{}'));
      } catch {}
      return ruta.fulfill(json({ id: 'FIXTURE-RIEGOS' }));
    }

    if (u.pathname.startsWith('/calendar/')) return ruta.fulfill(json(EVENTOS));

    if (u.pathname === '/gmail/v1/users/me/messages') return ruta.fulfill(json(CORREO_IDS));
    if (u.pathname.startsWith('/gmail/v1/users/me/messages/')) {
      return ruta.fulfill(json(mensaje(u.pathname.split('/').pop())));
    }

    // Drive: la app resuelve por nombre y después baja el contenido.
    if (u.pathname === '/drive/v3/files') {
      const q = u.searchParams.get('q') || '';
      const id = q.includes('estado.json') ? 'FIXTURE-ESTADO'
        : q.includes('cultivo.json') ? 'FIXTURE-CULTIVO'
        : 'FIXTURE-RIEGOS';
      return ruta.fulfill(json({ files: [{ id, name: 'x' }] }));
    }
    if (u.pathname.includes('FIXTURE-ESTADO')) return ruta.fulfill(json(ESTADO));
    if (u.pathname.includes('FIXTURE-CULTIVO')) return ruta.fulfill(json(CULTIVO));
    if (u.pathname.includes('FIXTURE-RIEGOS')) return ruta.fulfill(json(archivo));

    return ruta.fulfill(json({}));
  });

  await page.addInitScript(() => {
    localStorage.setItem('pv.otorgado', '1');
    localStorage.setItem(
      'pv.token',
      JSON.stringify({ access_token: 'prueba', expira_en: Date.now() + 3600e3 })
    );
  });
}

async function ir(page, ruta = 'hoy', modo = 'dia', archivo = {}) {
  await prepararGoogle(page, archivo);
  await page.addInitScript((m) => localStorage.setItem('pv.modo', m), modo);
  await page.goto(`/#/${ruta}`);
  await page.waitForFunction(() => !document.querySelector('.cargando'));
  await page.waitForTimeout(250); // que terminen las transiciones
}

/** Nada puede desbordar horizontalmente: la pantalla no scrollea de costado. */
async function sinDesborde(page) {
  const desbordes = await page.evaluate(() => {
    const malos = [];
    const limite = document.documentElement.clientWidth;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > limite + 1 || r.left < -1) {
        malos.push(`${el.tagName.toLowerCase()}.${el.className || '?'} → ${Math.round(r.left)}..${Math.round(r.right)} de ${limite}`);
      }
    }
    return malos;
  });
  expect(desbordes, 'elementos que se salen del ancho').toEqual([]);
}

/** La barra inferior no puede tapar el último contenido. */
async function navNoTapa(page) {
  const tapado = await page.evaluate(() => {
    const nav = document.querySelector('.sectores').getBoundingClientRect();
    const main = document.querySelector('#main');
    window.scrollTo(0, document.body.scrollHeight);
    const ultimo = main.lastElementChild?.getBoundingClientRect();
    return ultimo && ultimo.bottom > nav.top ? Math.round(ultimo.bottom - nav.top) : 0;
  });
  expect(tapado, 'px del último bloque tapados por la barra').toBe(0);
}

const PANTALLAS = ['hoy', 'cultivo', 'rumbo', 'plan', 'diagnostico'];

for (const pantalla of PANTALLAS) {
  test(`${pantalla}: no desborda ni queda tapado`, async ({ page }, info) => {
    await ir(page, pantalla);
    await sinDesborde(page);
    if (pantalla !== 'diagnostico') await navNoTapa(page);
    await page.screenshot({
      path: `tests/e2e/capturas/${info.project.name}-${pantalla}.png`,
      fullPage: true,
    });
  });
}

test('penumbra: la pantalla más densa tampoco desborda', async ({ page }, info) => {
  await ir(page, 'cultivo', 'penumbra');
  await expect(page.locator('html')).toHaveAttribute('data-modo', 'penumbra');
  await sinDesborde(page);
  await page.screenshot({
    path: `tests/e2e/capturas/${info.project.name}-cultivo-penumbra.png`,
    fullPage: true,
  });
});

test('el toque mínimo es de 44 px en todo lo que se pueda tocar', async ({ page }) => {
  await ir(page, 'cultivo');
  const chicos = await page.evaluate(() => {
    const malos = [];
    for (const el of document.querySelectorAll('button, a, input, select, summary')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Se redondea antes de comparar: el layout devuelve 43.99 para un
      // elemento de 44 y la prueba fallaba de a ratos por esa diferencia, que
      // no existe para el dedo.
      const alto = Math.round(r.height);
      if (alto < 44) malos.push(`${el.tagName.toLowerCase()}.${el.className || '?'} → ${alto}px`);
    }
    return malos;
  });
  expect(chicos, 'controles más bajos que 44 px').toEqual([]);
});

test('la mezcla arranca en el tipo del próximo riego del plan', async ({ page }) => {
  // En el fixture el próximo riego proyectado es un intermedio, así que la
  // pantalla tiene que abrir en intermedio. Mostrar el completo sería ofrecer
  // números que hoy no corresponden.
  await ir(page, 'cultivo');
  await expect(page.locator('.seg-b.activo')).toHaveText('intermedio');
});

test('el riego intermedio no muestra las dosis del completo (r13)', async ({ page }) => {
  await ir(page, 'cultivo');
  const dosis = () => page.locator('.mz-n').allTextContents();

  // Arranca en intermedio: solo enzimas y kelp, ninguna sal.
  expect(await dosis(), 'el intermedio no lleva sales').toEqual(['Pure Zym', 'Vitamax']);

  await page.getByRole('button', { name: 'completo', exact: true }).click();
  // El redibujado es asincrono: sin esperar a que la pestaña quede marcada, se
  // leen las dosis de antes del cambio y el resultado depende de la maquina.
  await expect(page.locator('.seg-b.activo')).toHaveText('completo');
  const tras = await dosis();

  expect(tras, 'el completo sí las lleva').toContain('Rhino Skin');
  expect(tras).toContain('CalMag');
  expect(tras.length).toBeGreaterThan(2);
});

test('mover los litros recalcula y los números no saltan de lugar', async ({ page }) => {
  await ir(page, 'cultivo');

  const antes = await page.locator('.mz-c').first().boundingBox();
  const valorAntes = await page.locator('.mz-c').first().textContent();

  const barra = page.locator('.litros-r');
  await barra.evaluate((el) => {
    el.value = String(Number(el.max) - 1);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const valorDespues = await page.locator('.mz-c').first().textContent();
  const despues = await page.locator('.mz-c').first().boundingBox();

  expect(valorDespues, 'la cantidad tiene que cambiar').not.toBe(valorAntes);
  expect(Math.abs(despues.y - antes.y), 'la fila no se mueve verticalmente').toBeLessThan(2);
});

test('ocultar un aviso no recarga la pantalla ni pierde el scroll', async ({ page }) => {
  await ir(page, 'hoy');

  const avisos = page.locator('.mirada li');
  const cuantos = await avisos.count();
  expect(cuantos).toBeGreaterThan(0);

  await page.evaluate(() => window.scrollTo(0, 300));
  const scrollAntes = await page.evaluate(() => window.scrollY);

  // Se dispara el clic desde el DOM: si se usa el clic de Playwright, él mismo
  // desplaza la página para alcanzar el elemento y el scroll deja de medir lo
  // que interesa, que es si la app redibuja.
  await page.evaluate(() => document.querySelector('.mirada .ocultar').click());
  await page.waitForTimeout(320);

  expect(await avisos.count(), 'se va uno solo').toBe(cuantos - 1);
  expect(await page.evaluate(() => window.scrollY), 'no salta al principio').toBe(scrollAntes);
  await expect(page.locator('.comoBoton')).toHaveText(/1 oculto hoy/, { timeout: 2000 });
});

test('la navegación cambia de sección y marca la pestaña', async ({ page }) => {
  await ir(page, 'hoy');
  await expect(page.locator('.sector[data-r="hoy"]')).toHaveClass(/activo/);

  await page.locator('.sector[data-r="cultivo"]').click();
  await page.waitForFunction(() => document.body.dataset.seccion === 'cultivo');
  await expect(page.locator('.sector[data-r="cultivo"]')).toHaveClass(/activo/);

  // El plan es una pantalla interna: mantiene marcada la pestaña de Cultivo.
  await page.locator('.boton-enlace').first().click();
  await page.waitForFunction(() => location.hash === '#/plan');
  await expect(page.locator('.sector[data-r="cultivo"]')).toHaveClass(/activo/);
});

test('ninguna pantalla habla en imperativo', async ({ page }) => {
  const prohibido = /\b(tenés que|debés|hacé|regá|pesá|poné|vencido|completad[oa]s?|tarea pendiente)\b/i;
  for (const pantalla of PANTALLAS) {
    await ir(page, pantalla);
    const texto = await page.locator('#main').innerText();
    const linea = texto.split('\n').find((l) => prohibido.test(l));
    expect(linea, `en la pantalla ${pantalla}`).toBeUndefined();
  }
});

test('el contador del sustrato cuenta en horas', async ({ page }) => {
  // Este sustrato seca en unas 60 horas: dos dias y medio. En un contador de
  // dias enteros ese numero no se puede decir, y por eso el anterior nunca
  // coincidia con la maceta.
  const hace = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const riego = { id: 'r-previo', fecha: hace(2), fase: 'V1', tipo: 'completo' };

  await ir(page, 'cultivo', 'dia', { riegos: [riego] });

  await expect(page.locator('.estado-k')).toHaveText(/Próximo riego|Secado/);
  await expect(page.locator('.estado-n')).toContainText(/h|Pide agua/);
  await expect(page.locator('.estado-s')).toContainText('Regado hace');
  await expect(page.getByRole('button', { name: 'Ya se secó' })).toBeVisible();
});

test('con un solo grupo la pantalla no se rompe ni muestra la seccion Grupos', async ({ page }) => {
  // El grupo 2 salio del archivo para modelarse aparte. Que desaparezca una
  // seccion no puede dejar huecos ni romper lo que depende del grupo.
  await prepararGoogle(page);
  await page.route('https://www.googleapis.com/drive/v3/files/FIXTURE-CULTIVO*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sinGrupo2) })
  );
  await page.goto('/#/cultivo');
  await page.waitForFunction(() => !document.querySelector('.cargando'));
  await page.waitForTimeout(250);

  await expect(page.locator('.titulo', { hasText: 'Grupos' })).toHaveCount(0);
  await expect(page.locator('.litros-ref')).toContainText('8 macetas');
  await sinDesborde(page);
  await navNoTapa(page);
});

test('las contradicciones del archivo se ven en el plan', async ({ page }) => {
  // El archivo se regenera desde bases anteriores y las correcciones vuelven
  // atras. Van en el plan y no en Cultivo: son consulta sobre el archivo, no
  // la pregunta del sustrato que se hace todos los dias.
  await ir(page, 'plan');
  await expect(page.locator('.titulo', { hasText: 'El archivo se contradice' })).toHaveCount(1);
  await expect(page.locator('.mirada-t', { hasText: 'PPFD' })).toBeVisible();
});

test('cultivo muestra cuatro cosas, no doce', async ({ page }) => {
  // La pantalla tenia doce secciones y dejo de usarse. Lo que se mira todos los
  // dias es una sola pregunta; el resto es consulta y vive en el plan.
  await ir(page, 'cultivo');
  const visibles = await page.locator('#main > *').count();
  expect(visibles, 'secciones en Cultivo').toBeLessThanOrEqual(8);
  await expect(page.locator('.estado-n')).toBeVisible();
  await expect(page.locator('.titulo', { hasText: 'Requiere tu mirada' })).toHaveCount(0);
});
