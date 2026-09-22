// El archivo revisado contra sí mismo, desde el teléfono.
//
// Los mismos controles que corre tools/verificar-cultivo.mjs, pero sobre el
// cultivo.json que la app acaba de cargar. La razón es concreta: el archivo se
// regenera desde bases anteriores y las correcciones se pierden. Ya pasó una
// vez —volvieron un hueco de calendario, un PPFD contradictorio y una regla
// desactualizada— y se detectó recién en el repaso del lunes.
//
// Esto no juzga agronomía ni conducta: busca lugares donde el archivo se
// contradice a sí mismo, que están a doscientas líneas de distancia y nadie ve
// leyendo de corrido.

import { cicloDe, luminariaDe } from './cultivo-datos.js';

const dia = (iso) => Date.parse(`${iso}T00:00:00Z`);

/** "S3", "S3 y S4", "S3, S4 y S8". */
const enumerar = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

/** El PPFD de una fase, y el de cada subconjunto si lo declara. */
function ppfdsDe(f) {
  const out = [{ quien: null, ppfd: f.ppfd, techo: f.ppfd_techo }];
  for (const [id, s] of Object.entries(f.ppfd_por_subconjunto || {})) {
    if (s && typeof s === 'object') out.push({ quien: id, ppfd: s.ppfd, techo: s.ppfd_techo });
  }
  return out.filter((x) => typeof x.ppfd === 'number');
}
const masUnDia = (iso) => new Date(dia(iso) + 86400000).toISOString().slice(0, 10);

const fmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const corta = (iso) => (Number.isNaN(dia(iso)) ? iso : fmt.format(new Date(dia(iso))));

/**
 * Contradicciones internas de cultivo.json.
 * Devuelve textos cortos, en tono de observación: el archivo dice dos cosas
 * distintas y hay que mirarlo, no "algo está mal hecho".
 */
export function auditarCultivo(cultivo, hoy) {
  if (!cultivo) return [];
  const out = [];
  const ciclo = cicloDe(cultivo);
  const fases = ciclo?.fases || [];

  // Días que ninguna fase cubre: la pantalla se queda sin mezcla esos días.
  for (let i = 0; i < fases.length - 1; i++) {
    const esperado = masUnDia(fases[i].fecha_fin);
    if (fases[i + 1].fecha_inicio !== esperado) {
      out.push({
        clave: `fase-hueco-${fases[i].id}`,
        texto: `Entre ${fases[i].id} y ${fases[i + 1].id} quedan días sin fase: ${fases[i].id} termina el ${corta(fases[i].fecha_fin)} y ${fases[i + 1].id} empieza el ${corta(fases[i + 1].fecha_inicio)}.`,
      });
    }
  }

  // Un riego que dice pertenecer a una fase que no lo contiene.
  for (const r of ciclo?.riegos_programados || []) {
    const f = fases.find((x) => x.id === r.fase);
    if (!f) {
      out.push({ clave: `riego-fase-${r.fecha}`, texto: `El riego del ${corta(r.fecha)} declara la fase ${r.fase}, que no existe.` });
    } else if (dia(r.fecha) < dia(f.fecha_inicio) || dia(r.fecha) > dia(f.fecha_fin)) {
      out.push({
        clave: `riego-fuera-${r.fecha}`,
        texto: `El riego del ${corta(r.fecha)} figura en la fase ${r.fase}, que va del ${corta(f.fecha_inicio)} al ${corta(f.fecha_fin)}.`,
      });
    }
  }

  // El PPFD de la fase contra el que mencionan sus propias acciones. Es la
  // incoherencia atada al fallo que arruinó el ciclo anterior.
  //
  // Un número que la fase ya declara en otro campo no es contradicción: una
  // acción que dice "subir a 650 solo si el sustrato seca en 24-36 h" está
  // nombrando el techo condicional, no discutiendo con el nominal. Marcarlo
  // sería enseñar a ignorar al auditor, que es la única forma de romperlo.
  for (const f of fases) {
    const declarados = new Set(
      [f.ppfd, f.ppfd_techo, ...ppfdsDe(f).flatMap((x) => [x.ppfd, x.techo])]
        .filter((x) => typeof x === 'number')
    );
    for (const a of f.acciones || []) {
      const m = a.match(/(\d{3,4})\s*PPFD|PPFD\s*(?:a|de)?\s*(\d{3,4})/i);
      if (!m) continue;
      const n = Number(m[1] || m[2]);
      if (f.ppfd != null && !declarados.has(n)) {
        out.push({
          clave: `ppfd-${f.id}-${n}`,
          texto: `La fase ${f.id} declara ${f.ppfd} PPFD y una de sus acciones menciona ${n}. ¿Cuál manda?`,
        });
      }
    }
  }

  // Lo que el plan pide contra lo que el panel entrega. Así pasó con el grupo 1:
  // S4 pide 1000 y S5-S7 1150 sobre un SilverFox que llega a ~800, y el archivo
  // no lo reflejaba. Un plan inalcanzable no se nota leyéndolo: cada número es
  // razonable por separado.
  const lum = luminariaDe(cultivo);
  if (typeof lum?.ppfd_pico === 'number') {
    const excedidas = fases.filter((f) => ppfdsDe(f).some((x) => x.ppfd > lum.ppfd_pico));
    if (excedidas.length) {
      const max = Math.max(...excedidas.flatMap((f) => ppfdsDe(f).map((x) => x.ppfd)));
      out.push({
        clave: `ppfd-panel-${lum.id}`,
        texto: `${enumerar(excedidas.map((f) => f.id))} ${excedidas.length === 1 ? 'pide' : 'piden'} hasta ${max} PPFD y el ${lum.nombre || lum.id} entrega ~${lum.ppfd_pico} de pico.`,
      });
    }
  }

  // El PPFD nominal por encima del techo que la misma fase declara. Con
  // subconjuntos se mira cada uno contra el suyo: la excepción de las
  // veteranas (700 en S1-S2) está declarada y no es una contradicción.
  for (const f of fases) {
    for (const x of ppfdsDe(f)) {
      if (typeof x.techo === 'number' && x.ppfd > x.techo) {
        out.push({
          clave: `ppfd-techo-${f.id}-${x.quien || 'grupo'}`,
          texto: `${f.id}${x.quien ? ` (subconjunto ${x.quien})` : ''} declara ${x.ppfd} PPFD con techo ${x.techo}.`,
        });
      }
    }
  }

  // Un techo null en floración no es "sin techo": es un techo sin declarar. Es
  // la forma que tomó la regresión de S3 (675 con techo null).
  const sinTecho = fases.filter(
    (f) => f.tipo === 'floracion' && f.ppfd > 0 && f.ppfd_techo == null
  );
  if (sinTecho.length) {
    const r15 = (cultivo?.reglas_no_negociables || []).some((r) => r.id === 'r15');
    out.push({
      clave: 'ppfd-sin-techo',
      texto: `${enumerar(sinTecho.map((f) => f.id))} ${sinTecho.length === 1 ? 'es de floración y no declara' : 'son de floración y no declaran'} techo de PPFD${r15 ? ' (r15)' : ''}.`,
    });
  }

  // Una regla que fija un valor "desde" una fase, contra dónde lo aplica el plan.
  for (const r of cultivo?.reglas_no_negociables || []) {
    for (const t of (r.regla || '').match(/(\d(?:\.\d)?)\s*desde\s*(\w\d)/gi) || []) {
      const [, val, faseRegla] = t.match(/(\d(?:\.\d)?)\s*desde\s*(\w\d)/i);
      const primera = fases.find((f) => (f.nutricion?.calmag_ml_l ?? null) === Number(val));
      if (primera && primera.id !== faseRegla.toUpperCase()) {
        out.push({
          clave: `regla-${r.id}-${val}`,
          texto: `La regla ${r.id} dice ${val} desde ${faseRegla.toUpperCase()}, pero el plan ya lo aplica en ${primera.id}.`,
        });
      }
    }
  }

  // Hitos cuya fecha pasó y siguen sin cerrar. Se pregunta, no se reclama:
  // que un hito siga abierto puede ser un olvido de registro o algo real.
  const vencidos = (ciclo?.hitos || []).filter(
    (h) => h.estado === 'pendiente' && dia(h.fecha) < dia(hoy)
  );
  if (vencidos.length) {
    const cuales = vencidos.slice(0, 3).map((h) => corta(h.fecha)).join(', ');
    out.push({
      clave: 'hitos-sin-cerrar',
      texto: `${vencidos.length} ${vencidos.length === 1 ? 'hito sigue marcado' : 'hitos siguen marcados'} pendiente con la fecha ya pasada (${cuales}). El archivo no sabe si se hicieron.`,
    });
  }

  // IDs repetidos: dos chats numerando por su cuenta se pisan, y una decisión
  // abierta puede desaparecer tapada por otra que reusó el número.
  for (const [nombre, lista] of [
    ['decisiones abiertas', cultivo?.decisiones_abiertas],
    ['pendientes', cultivo?.pendientes],
    ['auditoría', cultivo?.auditoria],
  ]) {
    const vistos = new Set();
    for (const x of lista || []) {
      if (!x?.id) continue;
      if (vistos.has(x.id)) {
        out.push({ clave: `id-dup-${x.id}`, texto: `El id ${x.id} está repetido en ${nombre}.` });
      }
      vistos.add(x.id);
    }
  }

  return out;
}

/**
 * El archivo del grupo contra la nomenclatura del ecosistema.
 *
 * Hubo una colisión real: cultivo.json llama "grupo-2" a 3 ex-esquejes y
 * "grupo-3" a un lote de 11, y estado.json —que es la fuente de verdad para
 * nombres desde el 2026-09-19— los usa al revés. Dos archivos hablando de
 * cosas distintas con el mismo id es exactamente lo que el auditor tiene que
 * levantar, porque leyéndolos por separado los dos parecen coherentes.
 */
export function auditarNomenclatura(estado, cultivo) {
  const nombres = estado?.subsistemas?.cultivo?.nomenclatura_de_grupos;
  if (!nombres || !cultivo) return [];

  const out = [];
  for (const g of [...(cultivo.grupos || []), ...(cultivo.grupos_futuros || [])]) {
    const texto = typeof nombres[g?.id] === 'string' ? nombres[g.id] : null;
    if (!texto || g.cantidad_plantas == null) continue;
    const m = texto.match(/(\d+)\s*plantas/i);
    if (!m || Number(m[1]) === g.cantidad_plantas) continue;
    out.push({
      clave: `nombre-${g.id}`,
      texto: `El archivo llama ${g.id} a ${g.cantidad_plantas} plantas y estado.json, a ${m[1]}. Para los nombres manda estado.json.`,
    });
  }
  return out;
}

/**
 * Hallazgos que Cowork dejó anotados en estado.json para que no se pierdan.
 *
 * Cambiaron de lugar y de forma: primero una lista en la raíz, después un
 * objeto `{ nota, items }` dentro del subsistema de cultivo. Leer solo la
 * primera forma los dejaba afuera sin avisar, que es lo contrario de para qué
 * existen.
 */
export function hallazgosDeclarados(estado) {
  const crudo =
    estado?.subsistemas?.cultivo?.hallazgos_de_auditoria_abiertos ??
    estado?.hallazgos_de_auditoria_abiertos;
  const h = Array.isArray(crudo) ? crudo : crudo?.items;
  if (!Array.isArray(h)) return [];
  return h
    .map((x, i) => ({
      clave: `declarado-${x?.id || i}`,
      texto: typeof x === 'string' ? x : x?.hallazgo || x?.texto || x?.descripcion || null,
    }))
    .filter((x) => x.texto);
}
