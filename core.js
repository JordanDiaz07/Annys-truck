/* Anny · Caja y cuentas — lógica del negocio (cuentas, datos, respaldo)
   Todo se guarda en el teléfono (localStorage). No usa internet para funcionar. */
'use strict';

const KEY = 'anny-app-v1';
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DOW_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const DEFAULT_SETTINGS = {
  cajaInicial: 100,
  pctInversion: 45,
  taxiDiario: 2,
  diasTrabajo: [1, 2, 3, 4, 5],
  fijos: [
    { id: 'alquiler', nombre: 'Alquiler', monto: 100, dia: 1 },
    { id: 'alcaldia', nombre: 'Impuesto alcaldía', monto: 15, dia: 1 },
    { id: 'basura', nombre: 'Basura', monto: 10, dia: 1 },
  ],
  personas: [
    { nombre: 'Socia 1', pct: 50 },
    { nombre: 'Socia 2', pct: 50 },
  ],
  metaPersona: 15,
  /* Los nombres reales NO van en el código (se publica en un sitio público):
     cada teléfono los guarda en su propia configuración (Más → Configuración). */
  destinatarioInforme: '',
  saldosIniciales: { inversion: 0, fijos: 0 },
  inicioSaldos: '',
};

/* ================= Utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = n => Math.round((+n || 0) * 100) / 100;
const money = n => {
  const v = r2(n);
  return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const num = v => {
  if (v === '' || v == null) return NaN;
  return parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
};
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (+f(x) || 0), 0);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const hoy = () => iso(new Date());
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const fechaLarga = s => { const d = parse(s); return `${DOW_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const fechaCorta = s => { const d = parse(s); return `${DOW[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
const mesNombre = ym => { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1]} ${y}`; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ================= Datos ================= */
function nuevaBase() {
  return { version: 1, settings: clone(DEFAULT_SETTINGS), dias: {}, gastos: [], ultimoRespaldo: null, creado: hoy() };
}
function normalizar(d) {
  const base = nuevaBase();
  const out = Object.assign(base, d);
  out.settings = Object.assign(clone(DEFAULT_SETTINGS), d.settings || {});
  out.settings.saldosIniciales = Object.assign({ inversion: 0, fijos: 0 }, out.settings.saldosIniciales || {});
  out.dias = d.dias || {};
  out.gastos = Array.isArray(d.gastos) ? d.gastos : [];
  return out;
}
function cargar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizar(JSON.parse(raw));
  } catch (e) { console.error(e); }
  return nuevaBase();
}
let db = cargar();

function guardar() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    alert('No se pudo guardar en el teléfono. Haga un respaldo cuanto antes.');
  }
  if (navigator.storage && navigator.storage.persist && !guardar._p) {
    guardar._p = true;
    navigator.storage.persist().catch(() => {});
  }
}

/* ================= Reglas del negocio ================= */
const S = () => db.settings;
const diasLabMes = (st = S()) => Math.max(1, st.diasTrabajo.length) * 52 / 12;
const totalFijos = (st = S()) => sum(st.fijos, f => f.monto);
const apFijosDia = (st = S()) => r2(totalFijos(st) / diasLabMes(st));
const esLaborable = s => S().diasTrabajo.includes(parse(s).getDay());

function paramsActuales() {
  const st = S();
  return {
    caja: +st.cajaInicial || 0,
    pctInv: +st.pctInversion || 0,
    apFijos: apFijosDia(st),
    personas: st.personas.map(p => ({ nombre: p.nombre, pct: +p.pct || 0 })),
  };
}

function catInfo(g) {
  switch (g.cat) {
    case 'taxi': return { nombre: 'Taxi', sobre: 'dia', icon: '🚕' };
    case 'gas': return { nombre: 'Gas', sobre: 'inversion', icon: '🔥' };
    case 'insumos': return { nombre: 'Insumos / compras', sobre: 'inversion', icon: '🛒' };
    case 'fijo': {
      const f = S().fijos.find(x => x.id === g.fijoId);
      return { nombre: f ? f.nombre : (g.concepto || 'Pago fijo'), sobre: 'fijos', icon: '📅' };
    }
    default: return { nombre: g.concepto || 'Otro gasto', sobre: 'dia', icon: '📝' };
  }
}
const SOBRE_TXT = {
  dia: 'Se descuenta de la ganancia de ese día',
  gas: 'Sale del apartado de gas',
  inversion: 'Sale de la inversión (el 45% para insumos y gas)',
  fijos: 'Sale del apartado de pagos fijos',
};

/* Cálculo de un cierre. dia = {efectivo, yappy, p}; gastos = gastos de esa fecha */
function calcular(dia, gastos) {
  const p = dia.p;
  const salidas = sum(gastos.filter(g => g.deCaja), g => g.monto);
  const efectivo = (+dia.efectivo || 0) - p.caja + salidas;
  const yappy = +dia.yappy || 0;
  const venta = efectivo + yappy;
  const inversion = venta > 0 ? venta * p.pctInv / 100 : 0;
  const gastosDia = sum(gastos.filter(g => catInfo(g).sobre === 'dia'), g => g.monto);
  const salarios = venta - inversion - p.apFijos - gastosDia;
  return {
    venta, efectivo, yappy, salidas, inversion, gastosDia, salarios,
    apFijos: p.apFijos, p,
    personas: p.personas.map(x => ({ nombre: x.nombre, pct: x.pct, monto: salarios * x.pct / 100 })),
  };
}
const gastosDe = fecha => db.gastos.filter(g => g.fecha === fecha);
const calc = fecha => db.dias[fecha] ? { fecha, ...calcular(db.dias[fecha], gastosDe(fecha)) } : null;
const fechasCerradas = () => Object.keys(db.dias).sort();
const cierresEntre = (a, b) => fechasCerradas().filter(f => f >= a && f <= b).map(calc);

/* Fecha desde la que se cuentan los apartados: la elegida en Ajustes o el primer cierre normal (no histórico) */
function inicioSaldos() {
  if (S().inicioSaldos) return S().inicioSaldos;
  const normales = fechasCerradas().filter(f => !db.dias[f].hist);
  return normales[0] || hoy();
}

function sobres() {
  const si = S().saldosIniciales;
  const desde = inicioSaldos();
  let inversion = +si.inversion || 0, fijos = +si.fijos || 0;
  for (const f of fechasCerradas()) {
    if (f < desde) continue;
    const c = calc(f);
    inversion += c.inversion; fijos += c.apFijos;
  }
  for (const g of db.gastos) {
    if (g.fecha < desde) continue;
    const s = catInfo(g).sobre;
    if (s === 'inversion') inversion -= g.monto;
    else if (s === 'fijos') fijos -= g.monto;
  }
  return { inversion, fijos };
}

function contarLaborables(desde, hastaExcl) {
  let n = 0;
  for (let d = desde; d < hastaExcl; d = addDays(d, 1)) if (esLaborable(d)) n++;
  return n;
}
function vencimiento(dia, ym) {
  const [y, m] = ym.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return iso(new Date(y, m - 1, Math.min(+dia || 1, ultimo)));
}
const mesSig = ym => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
const mesAnt = ym => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const finDeMes = ym => vencimiento(31, ym);

/* Próximos pagos fijos con simulación del apartado */
function proximosPagos() {
  const t = hoy();
  const ym = t.slice(0, 7);
  const pagos = [];
  for (const f of S().fijos) {
    const pagadoEsteMes = db.gastos.some(g => g.cat === 'fijo' && g.fijoId === f.id && g.fecha.slice(0, 7) === ym);
    const v = vencimiento(f.dia, ym);
    if (pagadoEsteMes) pagos.push({ f, fecha: vencimiento(f.dia, mesSig(ym)), vencido: false });
    else if (v < t && v < inicioSaldos()) pagos.push({ f, fecha: vencimiento(f.dia, mesSig(ym)), vencido: false });
    else pagos.push({ f, fecha: v, vencido: v < t });
  }
  pagos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  let saldo = sobres().fijos;
  let cursor = db.dias[t] ? addDays(t, 1) : t;
  const ap = apFijosDia();
  for (const p of pagos) {
    if (!p.vencido && p.fecha > cursor) { saldo += contarLaborables(cursor, p.fecha) * ap; cursor = p.fecha; }
    p.saldoAntes = saldo;
    p.alcanza = saldo >= p.f.monto - 0.005;
    saldo -= p.f.monto;
  }
  return pagos;
}

function promedioReciente(n = 20) {
  const cs = fechasCerradas().slice(-n).map(calc);
  if (!cs.length) return null;
  return {
    n: cs.length,
    venta: sum(cs, c => c.venta) / cs.length,
    salarios: sum(cs, c => c.salarios) / cs.length,
    personas: S().personas.map((p, i) => sum(cs, c => (c.personas[i] ? c.personas[i].monto : 0)) / cs.length),
    cs,
  };
}

/* Cada compra de gas = un cambio de cilindro. Cuánto duró cada uno y cuándo toca el próximo. */
function infoGas() {
  const gs = db.gastos.filter(g => g.cat === 'gas').sort((a, b) => a.fecha.localeCompare(b.fecha));
  const out = { compras: gs.length, lista: [] };
  if (!gs.length) return out;
  out.ultima = gs[gs.length - 1];
  out.diasDesde = diffDays(out.ultima.fecha, hoy());
  out.lista = gs.map((g, i) => {
    const sig = gs[i + 1];
    return { ...g, duro: sig ? diffDays(g.fecha, sig.fecha) : null, lab: sig ? contarLaborables(g.fecha, sig.fecha) : null };
  });
  out.costoProm = sum(gs, g => g.monto) / gs.length;
  const dur = out.lista.filter(x => x.duro != null && x.duro > 0);
  if (dur.length) {
    out.intervalo = sum(dur, x => x.duro) / dur.length;
    out.intervaloLab = sum(dur, x => x.lab) / dur.length;
    out.minDuro = Math.min(...dur.map(x => x.duro));
    out.maxDuro = Math.max(...dur.map(x => x.duro));
    out.proxima = addDays(out.ultima.fecha, Math.round(out.intervalo));
    out.faltan = diffDays(hoy(), out.proxima);
    const labTot = sum(dur, x => x.lab);
    if (labTot > 0) out.porDia = sum(dur, x => x.monto) / labTot;
  }
  return out;
}


function equilibrio() {
  const st = S();
  const libre = 1 - (+st.pctInversion || 0) / 100;
  const base = apFijosDia() + (+st.taxiDiario || 0);
  return {
    minimo: libre > 0 ? base / libre : 0,
    meta: libre > 0 ? (base + (+st.metaPersona || 0) * st.personas.length) / libre : 0,
  };
}

function diasSinRespaldo() {
  if (!fechasCerradas().length && !db.gastos.length) return 0;
  const ref = db.ultimoRespaldo || db.creado || hoy();
  return diffDays(ref.slice(0, 10), hoy());
}


function tile(t, v, s = '') {
  return `<div class="tile"><div class="t">${t}</div><div class="v ${v < 0 ? 'neg' : ''}">${money(v)}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
}

function barChart(items, { ref = null, refLabel = '', height = 170, color = '#6E4231' } = {}) {
  if (!items.length) return '<div class="empty">Sin datos todavía</div>';
  const W = 340, H = height, padL = 34, padB = 22, padT = 10;
  const max = Math.max(...items.map(i => i.value), ref || 0, 1);
  const nice = Math.ceil(max / 10) * 10;
  const bw = (W - padL - 4) / items.length;
  const y = v => padT + (H - padT - padB) * (1 - v / nice);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (let k = 0; k <= 2; k++) {
    const val = nice * k / 2, yy = y(val);
    s += `<line x1="${padL}" x2="${W}" y1="${yy}" y2="${yy}" stroke="#E2D3BD" stroke-width="1"/>`;
    s += `<text x="${padL - 4}" y="${yy + 4}" font-size="10" text-anchor="end" fill="#7A6559">$${Math.round(val)}</text>`;
  }
  const step = Math.ceil(items.length / 10);
  items.forEach((it, i) => {
    const x = padL + i * bw + bw * 0.15, w = bw * 0.7;
    const v = Math.max(0, it.value);
    const yy = y(v);
    const fill = it.color || (ref != null && v < ref ? '#C9A894' : color);
    s += `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${w.toFixed(1)}" height="${(H - padB - yy).toFixed(1)}" rx="2" fill="${fill}"><title>${esc(it.title || it.label)}: ${money(it.value)}</title></rect>`;
    if (i % step === 0) s += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 7}" font-size="10" text-anchor="middle" fill="#7A6559">${esc(it.label)}</text>`;
  });
  if (ref != null) {
    const yy = y(ref);
    s += `<line x1="${padL}" x2="${W}" y1="${yy}" y2="${yy}" stroke="#B23A2E" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    if (refLabel) s += `<text x="${W - 2}" y="${yy - 4}" font-size="10" text-anchor="end" fill="#B23A2E">${esc(refLabel)}</text>`;
  }
  return s + '</svg>';
}

function hbars(rows) {
  const max = Math.max(...rows.map(r => r.value), 1);
  return rows.map(r => `
    <div class="hbar">
      <div class="lbl"><span>${r.label}</span><b>${money(r.value)}</b></div>
      <div class="track"><div class="fill" style="width:${(100 * r.value / max).toFixed(1)}%"></div></div>
    </div>`).join('');
}


/* ================= Respaldo / Excel ================= */
async function compartirOBajar(nombre, contenido, tipo) {
  const intentos = [new File([contenido], nombre, { type: tipo })];
  if (tipo !== 'text/plain') intentos.push(new File([contenido], nombre.replace(/\.\w+$/, '.txt'), { type: 'text/plain' }));
  for (const file of intentos) {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nombre }); return true; }
      catch (e) { if (e.name === 'AbortError') return false; }
    }
  }
  const url = URL.createObjectURL(intentos[0]);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  return true;
}

async function respaldar() {
  const ok = await compartirOBajar(`anny-respaldo-${hoy()}.json`, JSON.stringify(db, null, 1), 'application/json');
  if (ok) { db.ultimoRespaldo = new Date().toISOString(); guardar(); toast('Copia guardada ✓'); render(); }
}

function csv(rows) {
  return '﻿' + rows.map(r => r.map(v => {
    const s = typeof v === 'number' ? r2(v).toFixed(2) : String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
}

async function exportarExcel() {
  const pers = S().personas;
  const rows = [['Fecha', 'Día', 'Efectivo en caja', 'Yappy', 'Venta efectivo', 'Venta total', 'Inversión', 'Apartado fijos', 'Gastos del día', 'Salarios', ...pers.map(p => p.nombre), 'Nota', 'Cargado como historia']];
  for (const f of fechasCerradas()) {
    const c = calc(f), d = db.dias[f];
    rows.push([f, DOW_LARGO[parse(f).getDay()], d.efectivo, c.yappy, c.efectivo, c.venta, c.inversion, c.apFijos, c.gastosDia, c.salarios, ...pers.map((p, i) => c.personas[i] ? c.personas[i].monto : 0), d.nota || '', d.hist ? 'Sí' : '']);
  }
  rows.push([]);
  rows.push(['GASTOS']);
  rows.push(['Fecha', 'Tipo', 'Detalle', 'Monto', 'De la caja']);
  for (const g of db.gastos.slice().sort((a, b) => a.fecha.localeCompare(b.fecha))) rows.push([g.fecha, catInfo(g).nombre, g.concepto || '', g.monto, g.deCaja ? 'Sí' : 'No']);
  await compartirOBajar(`anny-cuentas-${hoy()}.csv`, csv(rows), 'text/csv');
}

function restaurar(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (!d || typeof d !== 'object' || !d.settings || !d.dias) throw new Error('formato');
      const n = Object.keys(d.dias).length;
      if (!confirm(`El respaldo tiene ${n} cierres y ${(d.gastos || []).length} gastos. Esto reemplaza lo que hay ahora en el teléfono. ¿Continuar?`)) return;
      db = normalizar(d); guardar();
      toast('Copia recuperada ✓'); irA('inicio');
    } catch (e) { alert('Ese archivo no es un respaldo válido de la app.'); }
  };
  rd.readAsText(file);
}

/* ================= HISTORIA (meses anteriores) ================= */
/* Guarda un día pasado. ventaEf = efectivo vendido (lo que quedó sobre la caja base). */
function guardarDiaHist(f, ventaEf, yappy, taxiMonto, nota) {
  const prev = db.dias[f];
  const p = prev ? prev.p : paramsActuales();
  const otrasSalidas = sum(gastosDe(f).filter(g => g.deCaja && g.cat !== 'taxi'), g => g.monto);
  db.dias[f] = {
    efectivo: r2(p.caja + ventaEf - otrasSalidas),
    yappy: r2(yappy),
    nota: nota != null ? nota : (prev ? prev.nota || '' : ''),
    p,
    hist: prev ? !!prev.hist : true,
    guardado: new Date().toISOString(),
  };
  db.gastos = db.gastos.filter(g => !(g.fecha === f && g.cat === 'taxi'));
  if (taxiMonto > 0) db.gastos.push({ id: uid(), fecha: f, cat: 'taxi', concepto: 'Taxi', monto: r2(taxiMonto), deCaja: false });
}

async function descargarPlantilla() {
  const t = hoy();
  const rows = [['fecha', 'efectivo_vendido', 'yappy', 'taxi', 'nota']];
  let d = `${mesAnt(t.slice(0, 7))}-01`, k = 0;
  while (k < 3) { if (esLaborable(d)) { rows.push([d.split('-').reverse().join('/'), k === 0 ? 85.5 : '', k === 0 ? 20 : '', k === 0 ? 'si' : '', k === 0 ? 'ejemplo: borrar esta fila' : '']); k++; } d = addDays(d, 1); }
  await compartirOBajar('anny-plantilla-historia.csv', csv(rows), 'text/csv');
}

function parseFecha(txt) {
  txt = String(txt || '').trim();
  let m = txt.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(new Date(+m[1], +m[2] - 1, +m[3]));
  m = txt.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; const dt = new Date(y, +m[2] - 1, +m[1]); if (dt.getDate() === +m[1]) return iso(dt); }
  return null;
}

function importarCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const lineas = texto.split(/\r?\n/).filter(l => l.trim());
  if (!lineas.length) return alert('El archivo está vacío.');
  const sep = [';', '\t', ','].sort((a, b) => lineas[0].split(b).length - lineas[0].split(a).length)[0];
  const decimalComa = sep === ';';
  const celdas = l => {
    const out = []; let cur = '', q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === sep && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map(x => x.trim());
  };
  const aNum = v => {
    v = String(v || '').replace(/[$\s]/g, '');
    if (!v) return 0;
    if (decimalComa) v = v.replace(/\./g, '').replace(',', '.'); else v = v.replace(/,/g, '');
    return parseFloat(v);
  };
  const filas = [], malas = [];
  const hoyIso = hoy();
  lineas.forEach((l, i) => {
    const c = celdas(l);
    const f = parseFecha(c[0]);
    if (!f) { if (i > 0) malas.push(i + 1); return; }
    if (/ejemplo/i.test(c[4] || '')) return;
    if (f >= hoyIso) { malas.push(i + 1); return; }
    const ef = aNum(c[1]), ya = aNum(c[2]);
    if (isNaN(ef) || isNaN(ya)) { malas.push(i + 1); return; }
    const tx = String(c[3] || '').trim().toLowerCase();
    const taxi = !tx || /^(no|0)$/.test(tx) ? 0 : /^(si|sí|x|s|yes)$/.test(tx) ? +S().taxiDiario : (aNum(tx) || 0);
    filas.push({ f, ef, ya, taxi, nota: c[4] || '' });
  });
  if (!filas.length) return alert('No se encontraron filas válidas. La primera columna debe ser la fecha (día/mes/año).');
  filas.sort((a, b) => a.f.localeCompare(b.f));
  const existen = filas.filter(x => db.dias[x.f]).length;
  const msg = `Se encontraron ${filas.length} días (del ${fechaCorta(filas[0].f)} al ${fechaCorta(filas[filas.length - 1].f)}).` +
    (existen ? `\n${existen} ya existían y se reemplazarán.` : '') +
    (malas.length ? `\nSe saltaron ${malas.length} filas con problemas (filas ${malas.slice(0, 8).join(', ')}${malas.length > 8 ? '…' : ''}).` : '') +
    '\n\n¿Importar?';
  if (!confirm(msg)) return;
  for (const x of filas) guardarDiaHist(x.f, x.ef, x.ya, x.taxi, x.nota);
  guardar();
  state.mesHist = filas[filas.length - 1].f.slice(0, 7);
  toast(`${filas.length} días importados ✓`);
  render();
}

