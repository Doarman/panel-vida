// Pantalla Rumbo: lo académico y lo laboral juntos.
//
// Eran dos pestañas de una sola lectura cada una, y comparten tema: hacia dónde
// vas. Juntarlas deja la barra en tres y libera lugar para cuando cultivo tenga
// más de un grupo. Además se lee estado.json una sola vez en vez de dos.

import { leerEstado } from '../api.js';
import { el, seccion, error, cargando } from '../ui.js';
import { conCache, antiguedad } from '../cache.js';
import { secciones as academicas } from './academico.js';
import { secciones as laborales } from './laboral.js';

export async function render(main) {
  main.textContent = '';
  const aviso = cargando('Leyendo tu rumbo…');
  main.append(aviso);

  let e;
  try {
    e = await conCache('estado', leerEstado);
  } catch (err) {
    aviso.remove();
    main.append(error('Rumbo', err));
    return;
  }

  aviso.remove();

  if (!e.fresco) {
    main.append(el('p', 'marca suelta', `Copia local · ${antiguedad(e.ts)}`));
  }

  const bloques = [...academicas(e.datos), ...laborales(e.datos)];

  if (!bloques.length) {
    const s = seccion('Rumbo');
    s.append(el('p', 'vacio', 'No hay subsistemas activos en estado.json.'));
    main.append(s);
    return;
  }

  for (const b of bloques) main.append(b);
}
