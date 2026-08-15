// Audita un cultivo.json contra sí mismo.
//
// No valida agronomía: valida coherencia interna. Busca las contradicciones que
// nadie ve leyendo el archivo de arriba a abajo, porque están a doscientas
// líneas de distancia una de otra.
//
//   node tools/verificar-cultivo.mjs ruta/al/cultivo.json

import { readFileSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta) {
  console.error('Falta la ruta al archivo.\n  node tools/verificar-cultivo.mjs cultivo.json');
  process.exit(2);
}

const c = JSON.parse(readFileSync(ruta, 'utf8'));
const problemas = [];
const avisos = [];

const falla = (m) => problemas.push(m);
const aviso = (m) => avisos.push(m);

const dia = (iso) => Date.parse(`${iso}T00:00:00Z`);
const masUnDia = (iso) => new Date(dia(iso) + 86400000).toISOString().slice(0, 10);

const fases = c?.ciclo_activo?.fases || [];
const productos = c?.productos || [];
const idsProducto = new Set(productos.map((p) => p.id));

// ---------- fases ----------

for (const f of fases) {
  if (!(dia(f.fecha_inicio) <= dia(f.fecha_fin))) {
    falla(`Fase ${f.id}: empieza (${f.fecha_inicio}) después de terminar (${f.fecha_fin}).`);
  }
}

for (let i = 0; i < fases.length - 1; i++) {
  const esperado = masUnDia(fases[i].fecha_fin);
  if (fases[i + 1].fecha_inicio !== esperado) {
    falla(
      `Hueco o solape entre ${fases[i].id} y ${fases[i + 1].id}: ` +
        `${fases[i].id} termina el ${fases[i].fecha_fin} y ${fases[i + 1].id} ` +
        `empieza el ${fases[i + 1].fecha_inicio} (se esperaba ${esperado}).`
    );
  }
}

// El día de flor debería avanzar de a 7 y arrancar en el flip.
const flip = c?.ciclo_activo?.fecha_flip_planificada;
for (const f of fases.filter((x) => Array.isArray(x.dias_flor))) {
  const esperado = Math.round((dia(f.fecha_inicio) - dia(flip)) / 86400000) + 1;
  if (f.dias_flor[0] !== esperado) {
    falla(`Fase ${f.id}: dias_flor arranca en ${f.dias_flor[0]} pero por fecha sería ${esperado}.`);
  }
}

// ---------- riegos programados ----------

for (const r of c?.ciclo_activo?.riegos_programados || []) {
  const f = fases.find((x) => x.id === r.fase);
  if (!f) {
    falla(`Riego del ${r.fecha}: declara la fase ${r.fase}, que no existe.`);
    continue;
  }
  if (dia(r.fecha) < dia(f.fecha_inicio) || dia(r.fecha) > dia(f.fecha_fin)) {
    falla(
      `Riego del ${r.fecha}: dice ser de la fase ${r.fase}, que va del ` +
        `${f.fecha_inicio} al ${f.fecha_fin}. La fecha queda fuera.`
    );
  }
}

// ---------- nutrición ----------

for (const f of fases) {
  for (const [k, v] of Object.entries(f.nutricion || {})) {
    const m = k.match(/^(.+?)_(ml|g)_l$/);
    if (!m) continue;
    if (v === null) continue;

    const clave = m[1];
    const existe = [...idsProducto].some((id) => clave.startsWith(id) || id.startsWith(clave));
    if (!existe) falla(`Fase ${f.id}: la dosis "${k}" no corresponde a ningún producto declarado.`);

    const p = productos.find((x) => clave.startsWith(x.id) || x.id.startsWith(clave));
    if (p?.unidad && p.unidad !== `${m[2]}/L`) {
      falla(`Fase ${f.id}: ${p.nombre} se dosifica en ${m[2]}/L pero está declarado en ${p.unidad}.`);
    }
  }
}

// ---------- PPFD contra lo que dicen las acciones ----------

for (const f of fases) {
  for (const a of f.acciones || []) {
    const m = a.match(/(\d{3,4})\s*PPFD|PPFD\s*(?:a|de)?\s*(\d{3,4})/i);
    if (!m) continue;
    const n = Number(m[1] || m[2]);
    const techo = f.ppfd_techo;
    if (techo != null && n > techo) {
      falla(`Fase ${f.id}: una acción menciona ${n} PPFD y el techo de la fase es ${techo}.`);
    } else if (f.ppfd != null && n !== f.ppfd && (techo == null || n <= techo)) {
      aviso(`Fase ${f.id}: la fase declara ${f.ppfd} PPFD y una acción menciona ${n}. ¿Cuál manda?`);
    }
  }
}

// ---------- reglas citadas ----------

const idsRegla = new Set((c?.reglas_no_negociables || []).map((r) => r.id));
const textoEntero = JSON.stringify(c);
for (const cita of textoEntero.match(/\br\d{1,2}\b/g) || []) {
  if (!idsRegla.has(cita)) aviso(`Se cita la regla ${cita}, que no está declarada.`);
}

// Una regla que fija valores por fase debería coincidir con las fases.
const r10 = (c?.reglas_no_negociables || []).find((r) => /calmag/i.test(r.regla || ''));
if (r10) {
  const desde = [...(r10.regla.match(/(\d(?:\.\d)?)\s*desde\s*(\w\d)/gi) || [])].map((t) => {
    const [, val, fase] = t.match(/(\d(?:\.\d)?)\s*desde\s*(\w\d)/i);
    return { val: Number(val), fase: fase.toUpperCase() };
  });
  for (const d of desde) {
    const primera = fases.find((f) => (f.nutricion?.calmag_ml_l ?? null) === d.val);
    if (primera && primera.id !== d.fase) {
      aviso(
        `La regla ${r10.id} dice CalMag ${d.val} desde ${d.fase}, pero el plan ya lo aplica en ${primera.id}.`
      );
    }
  }
}

// ---------- registros cargados ----------

const esquema = c?.registro_crudo?.esquema || {};
for (const r of c?.ciclo_activo?.riegos_ejecutados || []) {
  for (const campo of Object.keys(esquema)) {
    if (!(campo in r)) falla(`Riego ${r.id}: le falta el campo "${campo}" que pide registro_crudo.`);
  }
  if (r.fecha === null && !r.fecha_estado) {
    aviso(`Riego ${r.id}: fecha en null sin explicar por qué. Conviene un campo que lo aclare.`);
  }
}

// ---------- salida ----------

const linea = (s) => console.log(s);

linea(`\n  ${ruta}`);
linea(`  version ${c?._meta?.version ?? '?'} · ${fases.length} fases · ${productos.length} productos\n`);

if (problemas.length) {
  linea('  CONTRADICCIONES\n');
  for (const p of problemas) linea(`    ✕ ${p}`);
  linea('');
}

if (avisos.length) {
  linea('  PARA MIRAR\n');
  for (const a of avisos) linea(`    · ${a}`);
  linea('');
}

if (!problemas.length && !avisos.length) linea('  Sin contradicciones internas.\n');

process.exit(problemas.length ? 1 : 0);
