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
import { ESTADO, CULTIVO, CULTIVO_G2, EVENTOS, CORREO_IDS, mensaje } from './fixtures.mjs';

// El ecosistema como era antes del segundo ciclo: un solo archivo de cultivo.
const UN_SOLO_GRUPO = structuredClone(ESTADO);
delete UN_SOLO_GRUPO.subsistemas.cultivo.archivos_por_grupo;
delete UN_SOLO_GRUPO.subsistemas.cultivo.grupos;
UN_SOLO_GRUPO.subsistemas.cultivo.resumen = ESTADO.subsistemas.cultivo.grupos['grupo-1'].resumen;

const json = (datos) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(datos),
});

/**
 * Devuelve el archivo que escribe la app, para poder mirar lo que subió: los
 * campos nuevos (ciclo, alcance, drenaje) no se ven en pantalla y son
 * justamente los que permiten rutear cada registro a su grupo.
 */
async function prepararGoogle(page, { riegos = [], secados = [], estado = ESTADO } = {}) {
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
        : q.includes('cultivo_grupo2.json') ? 'FIXTURE-CULTIVO2'
        : q.includes('cultivo.json') ? 'FIXTURE-CULTIVO'
        : 'FIXTURE-RIEGOS';
      return ruta.fulfill(json({ files: [{ id, name: 'x' }] }));
    }
    if (u.pathname.includes('FIXTURE-ESTADO')) return ruta.fulfill(json(estado));
    if (u.pathname.includes('FIXTURE-CULTIVO2')) return ruta.fulfill(json(CULTIVO_G2));
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

  return archivo;
}

async function ir(page, ruta = 'hoy', modo = 'dia', opciones = {}) {
  const archivo = await prepararGoogle(page, opciones);
  await page.addInitScript((m) => localStorage.setItem('pv.modo', m), modo);
  if (opciones.grupo) {
    await page.addInitScript((g) => localStorage.setItem('pv.grupo', g), opciones.grupo);
  }
  await page.goto(`/#/${ruta}`);
  await page.waitForFunction(() => !document.querySelector('.cargando'));
  await page.waitForTimeout(250); // que terminen las transiciones
  return archivo;
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

test('las contradicciones que dejo anotadas Cowork tambien se ven', async ({ page }) => {
  await ir(page, 'plan');
  await expect(page.locator('.mirada-t', { hasText: 'oscuridad y corte' })).toBeVisible();
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

test('con un solo grupo no aparece el selector y la pantalla no cambia', async ({ page }) => {
  // Antes del segundo ciclo, estado.json no declaraba archivos_por_grupo. Ese
  // estado tiene que seguir funcionando igual: nada de pestañas para un grupo.
  await ir(page, 'cultivo', 'dia', { estado: UN_SOLO_GRUPO });

  await expect(page.locator('.grupos-sel')).toHaveCount(0);
  await expect(page.locator('.litros-ref')).toContainText('8 macetas');
  await sinDesborde(page);
  await navNoTapa(page);
});

// ---------- dos ciclos en paralelo ----------

test('los dos grupos se eligen por pestaña y no se mezclan', async ({ page }, info) => {
  await ir(page, 'cultivo');

  const pestanas = page.locator('.grupo-b');
  await expect(pestanas).toHaveCount(2);
  await expect(pestanas.first()).toHaveClass(/activo/);
  await expect(pestanas.first()).toContainText('Grupo 1');
  // Debajo del nombre, en qué está cada uno: la fase y el panel.
  await expect(pestanas.first()).toContainText('V1');
  await expect(pestanas.nth(1)).toContainText('DHP');

  // El grupo 1: ocho macetas, un solo contador.
  await expect(page.locator('.litros-ref')).toContainText('8 macetas');
  await expect(page.locator('.estado-col')).toHaveCount(0);

  await pestanas.nth(1).click();
  await page.waitForFunction(() => document.querySelectorAll('.estado-col').length > 0);

  // El grupo 2: dos subconjuntos, cada uno con su volumen y su contador.
  await expect(page.locator('.grupo-b.activo')).toContainText('Grupo 2');
  await expect(page.locator('.contexto')).toContainText('día 3 de flor');
  await expect(page.locator('.litros-ref')).toContainText('3 × 2.5–3 L + 8 × 1.5–2 L');
  await expect(page.locator('.estado-col')).toHaveCount(2);
  await expect(page.locator('.estado-col').first()).toContainText('Veteranas');
  await expect(page.locator('.estado-col').nth(1)).toContainText('Nuevas');

  await sinDesborde(page);
  await navNoTapa(page);
  await page.screenshot({
    path: `tests/e2e/capturas/${info.project.name}-cultivo-grupo2.png`,
    fullPage: true,
  });
});

test('la eleccion de grupo se mantiene entre Cultivo y el plan', async ({ page }) => {
  await ir(page, 'cultivo', 'dia', { grupo: 'grupo-2' });
  await expect(page.locator('.grupo-b.activo')).toContainText('Grupo 2');

  await page.locator('.boton-enlace').first().click();
  await page.waitForFunction(() => location.hash === '#/plan');
  await page.waitForFunction(() => !document.querySelector('.cargando'));

  await expect(page.locator('.grupo-b.activo')).toContainText('Grupo 2');
  await expect(page.locator('.ciclo-f')).toContainText('Grupo 2');

  // El plan abre plegado: es un índice, no un documento para leer de corrido.
  // Cada apartado dice cuántos trae, y se abre el que se fue a buscar.
  const fases = page.locator('.plegable.apartado').filter({ hasText: 'Fases' });
  await expect(fases.locator('summary')).toHaveText('Fases · 2');
  await expect(page.locator('.fase').first()).toBeHidden();

  await fases.locator('summary').click();
  await expect(page.locator('.fase.actual .fase-d')).toBeVisible();
  // El PPFD de cada subconjunto y el drenaje, que solo tiene el grupo 2.
  await expect(page.locator('.fase.actual .fase-d')).toContainText('Veteranas 700 / Nuevas 500');
  await expect(page.locator('.fase.actual .fase-d')).toContainText('drenaje 10–20 %');
});

test('el grupo 2 no hereda el secado del grupo 1', async ({ page }) => {
  // Distinta maceta, distinto porte y distinta luz: 60 horas del grupo 1 no
  // dicen nada del grupo 2. Sin medicion propia, se cuenta lo transcurrido y
  // no se proyecta nada.
  const hace = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const riegos = [
    { id: 'r-g1', fecha: hace(2), fase: 'V1', tipo: 'completo' },
    { id: 'r-g2', fecha: hace(2), fase: 'S1', tipo: 'completo', ciclo: 'ciclo-prueba-g2', alcance: 'todos' },
  ];

  await ir(page, 'cultivo', 'dia', { riegos, grupo: 'grupo-2' });

  const col = page.locator('.estado-col').first();
  await expect(col).toContainText('Desde el último riego');
  await expect(col).toContainText('Secado todavía sin medir');
  await expect(col.locator('.barra')).toHaveCount(0);
  await expect(page.locator('.estado-col .btn')).toHaveCount(2);

  // El grupo 1, con su dato, sí proyecta.
  await page.locator('.grupo-b').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.estado-col').length === 0);
  await expect(page.locator('.estado-s')).toContainText('seca en ~');
});

test('el registro sale con ciclo, alcance y drenaje', async ({ page }) => {
  // Son los tres campos que pidió el contrato nuevo: sin ellos no se puede
  // rutear el registro a su archivo ni auditar el riego sin drenaje.
  const archivo = await ir(page, 'cultivo', 'dia', { grupo: 'grupo-2' });

  await page.locator('.registro-d > summary').click();
  await page.selectOption('#r-alcance', 'A');
  await page.selectOption('#r-drenaje', 'si');
  await page.fill('#r-ec', '1.5');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();

  // Se espera a que suba, no a un cartel: al registrar, la pantalla se
  // redibuja con el contador reiniciado y el aviso se va con ella.
  await expect.poll(() => archivo.riegos.length, { timeout: 5000 }).toBe(1);

  const r = archivo.riegos.at(-1);
  expect(r.ciclo, 'el ciclo al que pertenece').toBe('ciclo-prueba-g2');
  expect(r.alcance, 'a qué subconjunto se regó').toBe('A');
  expect(r.drenaje, 'si llegó a drenar').toBe('si');
  expect(r.fase).toBe('S1');
  expect(r.ec_medida).toBe(1.5);
  expect(r.productos_aplicados, 'la aplicación de evento entra en el primer completo')
    .toContain('flora_booster');
});

test('Flora Booster se muestra como aplicacion de la fase, no como una dosis mas', async ({ page }) => {
  // r14: con secado de 60 horas hay dos o tres fertirriegos por fase. Si se
  // leyera como concentración, las cuatro aplicaciones del ciclo serían ocho.
  await ir(page, 'cultivo', 'dia', { grupo: 'grupo-2' });

  await page.getByRole('button', { name: 'completo', exact: true }).click();
  await expect(page.locator('.seg-b.activo')).toHaveText('completo');

  const evento = page.locator('.mezcla li.evento');
  await expect(evento).toHaveCount(1);
  await expect(evento.locator('.mz-n')).toHaveText('Flora Booster');
  await expect(evento.locator('.mz-ev')).toContainText('aplicación 1 de 1');
  await expect(evento.locator('.mz-ev')).toContainText('primer completo de la fase');
});

test('el riego se mide por drenaje y no por litros (r17)', async ({ page }) => {
  await ir(page, 'cultivo', 'dia', { grupo: 'grupo-2' });
  await expect(page.locator('.mezcla-drenaje')).toContainText('Hasta drenar 10–20 %');
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
  expect(visibles, 'secciones en Cultivo').toBeLessThanOrEqual(9);
  await expect(page.locator('.estado-n')).toBeVisible();
  await expect(page.locator('.titulo', { hasText: 'Requiere tu mirada' })).toHaveCount(0);
});
