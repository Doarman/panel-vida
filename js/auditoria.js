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

const dia = (iso) => Date.parse(`${iso}T00:00:00Z`);
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
  const fases = cultivo?.ciclo_activo?.fases || [];

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
  for (const r of cultivo?.ciclo_activo?.riegos_programados || []) {
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
  for (const f of fases) {
    for (const a of f.acciones || []) {
      const m = a.match(/(\d{3,4})\s*PPFD|PPFD\s*(?:a|de)?\s*(\d{3,4})/i);
      if (!m) continue;
      const n = Number(m[1] || m[2]);
      if (f.ppfd != null && n !== f.ppfd) {
        out.push({
          clave: `ppfd-${f.id}-${n}`,
          texto: `La fase ${f.id} declara ${f.ppfd} PPFD y una de sus acciones menciona ${n}. ¿Cuál manda?`,
        });
      }
    }
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
  const vencidos = (cultivo?.ciclo_activo?.hitos || []).filter(
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

/** Hallazgos que Cowork dejó anotados en estado.json para que no se pierdan. */
export function hallazgosDeclarados(estado) {
  const h = estado?.hallazgos_de_auditoria_abiertos;
  if (!Array.isArray(h)) return [];
  return h
    .map((x, i) => ({
      clave: `declarado-${x?.id || i}`,
      texto: typeof x === 'string' ? x : x?.hallazgo || x?.texto || x?.descripcion || null,
    }))
    .filter((x) => x.texto);
}
