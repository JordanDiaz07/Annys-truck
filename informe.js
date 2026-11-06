/* Anny · Caja y cuentas — informe del mes en PDF.
   Se arma en el mismo teléfono (sin internet) con la librería jsPDF y se comparte por WhatsApp. */
'use strict';

/* ================= Cargar la librería solo cuando hace falta ================= */
let _jspdfCargando = null;
function cargarJsPDF() {
  if (window.jspdf) return Promise.resolve();
  if (!_jspdfCargando) {
    _jspdfCargando = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.onload = () => res();
      s.onerror = () => { _jspdfCargando = null; rej(new Error('No se pudo cargar jsPDF')); };
      document.head.appendChild(s);
    });
  }
  return _jspdfCargando;
}

const destinatario = () => (S().destinatarioInforme || '').trim();
const MesCap = ym => mesNombre(ym).replace(/^./, m => m.toUpperCase());
const nombreArchivoInforme = ym => `Informe-Anny-${MesCap(ym).replace(' ', '-')}.pdf`;
/* Las letras estándar del PDF no traen emojis: se quitan de los textos que escriben ellas */
const pdfTxt = s => String(s ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '').replace(/\s+/g, ' ').trim();

/* ================= Datos del informe ================= */
function datosInforme(ym) {
  const t = hoy();
  const ini = `${ym}-01`, fin = finDeMes(ym);
  const cs = cierresEntre(ini, fin);
  const esteMes = ym === t.slice(0, 7);
  const venta = sum(cs, c => c.venta);
  const ant = cierresEntre(`${mesAnt(ym)}-01`, finDeMes(mesAnt(ym)));
  const prom = cs.length ? venta / cs.length : 0;
  const promAnt = ant.length ? sum(ant, c => c.venta) / ant.length : 0;
  const gastos = db.gastos.filter(g => g.fecha >= ini && g.fecha <= fin);
  const porCat = {};
  for (const g of gastos) {
    const n = g.cat === 'otro' ? 'Otros gastos' : catInfo(g).nombre;
    porCat[n] = (porCat[n] || 0) + g.monto;
  }
  const personas = S().personas.map((p, i) => ({ nombre: p.nombre, monto: sum(cs, c => c.personas[i] ? c.personas[i].monto : 0) }));
  const d = {
    ym, cs, esteMes, venta, prom,
    varPct: promAnt > 0 && cs.length ? Math.round(100 * (prom - promAnt) / promAnt) : null,
    mesAnterior: MESES[+mesAnt(ym).slice(5) - 1],
    efectivo: sum(cs, c => c.efectivo), yappy: sum(cs, c => c.yappy),
    inversion: sum(cs, c => c.inversion), apFijos: sum(cs, c => c.apFijos),
    gastosDia: sum(cs, c => c.gastosDia), salarios: sum(cs, c => c.salarios),
    personas,
    iguales: personas.length > 1 && S().personas.every(p => p.pct === S().personas[0].pct),
    gastos, porCat: Object.entries(porCat).sort((a, b) => b[1] - a[1]),
    comprasMes: sum(gastos.filter(g => catInfo(g).sobre === 'inversion'), g => g.monto),
    eq: equilibrio(),
    sobres: sobres(),
    pagos: esteMes ? proximosPagos() : [],
    gas: infoGas(),
    hasta: cs.length ? cs[cs.length - 1].fecha : null,
  };
  if (esteMes) {
    const p = promedioReciente();
    if (p) {
      const desde = db.dias[t] ? addDays(t, 1) : t;
      const rest = contarLaborables(desde, addDays(fin, 1));
      d.proy = {
        rest, promVenta: p.venta, n: p.n,
        venta: venta + rest * p.venta,
        personas: personas.map((x, i) => x.monto + rest * (p.personas[i] || 0)),
      };
    }
  }
  if (cs.length) {
    d.mejorDia = cs.reduce((a, b) => b.venta > a.venta ? b : a);
    d.peorDia = cs.reduce((a, b) => b.venta < a.venta ? b : a);
    const porDow = S().diasTrabajo.map(k => { const xs = cs.filter(c => parse(c.fecha).getDay() === k); return { k, v: xs.length ? sum(xs, c => c.venta) / xs.length : 0 }; });
    d.mejorDow = porDow.reduce((a, b) => b.v > a.v ? b : a, { v: -1 });
    d.diasMeta = cs.filter(c => c.venta >= d.eq.meta).length;
    d.diasMin = cs.filter(c => c.venta >= d.eq.minimo).length;
  }
  return d;
}

/* ================= Dibujo del PDF ================= */
async function crearInformePDF(ym) {
  await cargarJsPDF();
  const { jsPDF } = window.jspdf;
  const d = datosInforme(ym);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = 612, H = 792, M = 40, CW = W - 2 * M;
  const C = { brown: '#4B2A1E', brown2: '#6E4231', cream: '#F6EEE1', cream2: '#EDE0CB', line: '#E2D3BD', ink: '#2B1A13', muted: '#6F5A4E', green: '#2E7D4F', greenBg: '#E3F1E7', red: '#B23A2E', redBg: '#F8E1DE', amber: '#8A5800', amberBg: '#FBEFD5', yappy: '#1F6F8B', soft: '#C9A894' };
  const mes = MesCap(ym);
  const quien = destinatario();
  let y = 0;

  const font = (size, style = 'normal', color = C.ink) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(color); };
  const fill = c => doc.setFillColor(c);
  const txt = (s, x, yy, opt) => doc.text(pdfTxt(s), x, yy, opt);

  const cabeceraChica = () => {
    fill(C.brown); doc.rect(0, 0, W, 44, 'F');
    font(15, 'bold', C.cream); doc.setFont('times', 'bold'); txt('ANNY', M, 28);
    font(11, 'normal', C.cream); txt(`Informe de ${mesNombre(ym)}`, M + 62, 28);
    y = 72;
  };
  const espacio = h => { if (y + h > H - 50) { doc.addPage(); cabeceraChica(); } };
  const seccion = (titulo, h = 60) => {
    y += 6;
    espacio(h + 26);
    font(14, 'bold', C.brown); txt(titulo, M, y);
    doc.setDrawColor(C.line); doc.setLineWidth(1); doc.line(M, y + 6, W - M, y + 6);
    y += 24;
  };
  const parrafo = (s, size = 10.5, color = C.ink, style = 'normal') => {
    font(size, style, color);
    const lines = doc.splitTextToSize(pdfTxt(s), CW);
    espacio(lines.length * size * 1.35);
    doc.text(lines, M, y);
    y += lines.length * size * 1.35 + 4;
  };
  /* Tabla simple con salto de página automático */
  const tabla = (cols, filas, { total = null, zebra = true } = {}) => {
    const rowH = 19;
    const head = () => {
      fill(C.cream2); doc.rect(M, y - 13, CW, rowH, 'F');
      font(8.5, 'bold', C.muted);
      let x = M;
      cols.forEach(c => { txt(c.t.toUpperCase(), c.a === 'r' ? x + c.w - 6 : x + 6, y, c.a === 'r' ? { align: 'right' } : undefined); x += c.w; });
      y += rowH;
    };
    espacio(rowH * 3); head();
    filas.forEach((f, i) => {
      if (y + rowH > H - 50) { doc.addPage(); cabeceraChica(); head(); }
      if (zebra && i % 2 === 1) { fill('#FBF6EE'); doc.rect(M, y - 13, CW, rowH, 'F'); }
      let x = M;
      cols.forEach((c, j) => {
        const v = f[j];
        const o = v && typeof v === 'object' ? v : { t: v };
        font(9.5, o.bold ? 'bold' : 'normal', o.color || C.ink);
        let s = pdfTxt(o.t);
        while (s.length > 3 && doc.getTextWidth(s) > c.w - 10) s = s.slice(0, -2);
        txt(s, c.a === 'r' ? x + c.w - 6 : x + 6, y, c.a === 'r' ? { align: 'right' } : undefined);
        x += c.w;
      });
      y += rowH;
    });
    if (total) {
      doc.setDrawColor(C.brown); doc.setLineWidth(1.2); doc.line(M, y - 13, W - M, y - 13);
      let x = M;
      cols.forEach((c, j) => { font(10, 'bold', C.brown); txt(total[j] || '', c.a === 'r' ? x + c.w - 6 : x + 6, y + 1, c.a === 'r' ? { align: 'right' } : undefined); x += c.w; });
      y += rowH;
    }
    y += 8;
  };
  /* Barra apilada con leyenda */
  const barraApilada = (partes) => {
    const tot = sum(partes, p => Math.max(0, p.v)) || 1;
    let x = M;
    espacio(40);
    partes.forEach(p => { const w = CW * Math.max(0, p.v) / tot; if (w > 0) { fill(p.c); doc.rect(x, y, w, 14, 'F'); } x += w; });
    y += 28;
    let lx = M;
    partes.forEach(p => {
      const s = `${p.n} ${Math.round(100 * Math.max(0, p.v) / tot)}%`;
      font(8.5, 'normal', C.muted);
      fill(p.c); doc.rect(lx, y - 7, 8, 8, 'F');
      txt(s, lx + 11, y);
      lx += doc.getTextWidth(s) + 26;
    });
    y += 16;
  };
  const caja = (titulo, valor, sub, x, w, h, colores = { bg: C.cream, v: C.brown }) => {
    fill(colores.bg); doc.roundedRect(x, y, w, h, 8, 8, 'F');
    font(8, 'bold', C.muted); txt(titulo.toUpperCase(), x + 10, y + 16);
    font(17, 'bold', colores.v); txt(valor, x + 10, y + 38);
    if (sub) { font(8, 'normal', C.muted); doc.text(doc.splitTextToSize(pdfTxt(sub), w - 20), x + 10, y + 52); }
  };

  /* ---------- Página 1: portada y resumen ---------- */
  fill(C.brown); doc.rect(0, 0, W, 96, 'F');
  fill(C.cream); doc.rect(M, 26, 112, 44, 'F');
  doc.setDrawColor(C.brown); doc.setLineWidth(2); doc.rect(M + 4, 30, 104, 36, 'S');
  doc.setFont('times', 'bold'); doc.setFontSize(25); doc.setTextColor(C.brown); doc.text('ANNY', M + 56, 57, { align: 'center' });
  font(20, 'bold', C.cream); txt('Informe del negocio', M + 132, 50);
  font(11, 'normal', C.cream);
  txt(`${mes}${d.hasta ? ` · días cerrados hasta el ${parse(d.hasta).getDate()} de ${MESES[parse(d.hasta).getMonth()]}` : ''}`, M + 132, 68);
  font(9, 'normal', C.cream2);
  txt(`${quien ? `Para: ${quien} · ` : ''}Hecho el ${fechaLarga(hoy())}`, W - M, 86, { align: 'right' });
  y = 124;

  if (!d.cs.length) {
    parrafo(`Todavía no hay días cerrados en ${mesNombre(ym)}.`, 13, C.muted);
  } else {
    // Frase principal
    font(13, 'bold', C.ink);
    const cada = d.iguales ? d.personas[0].monto : null;
    parrafo(`En ${mesNombre(ym)} ${d.esteMes ? 'llevan vendido' : 'vendieron'} ${money(d.venta)} en ${plural(d.cs.length, 'día')} de trabajo` +
      (cada != null ? `, y a cada una le ${d.esteMes ? 'ha tocado' : 'tocó'} ${money(cada)}.` : '.'), 13, C.ink, 'bold');
    y += 4;

    // Cajas resumen
    const bw = (CW - 30) / 4, bh = 66;
    espacio(bh + 10);
    caja('Ventas del mes', money(d.venta), `${plural(d.cs.length, 'día')} trabajados`, M, bw, bh);
    caja('Promedio por día', money(d.prom), d.varPct != null ? `${d.varPct >= 0 ? '+' : ''}${d.varPct}% vs ${d.mesAnterior}` : '', M + (bw + 10), bw, bh,
      d.varPct == null ? undefined : d.varPct >= 0 ? { bg: C.greenBg, v: C.green } : { bg: C.redBg, v: C.red });
    caja(d.iguales ? 'A cada una' : 'Salarios', money(d.iguales ? d.personas[0].monto : d.salarios), d.personas.map(p => p.nombre).join(' y '), M + 2 * (bw + 10), bw, bh, { bg: C.greenBg, v: C.green });
    caja('Para compras', money(d.inversion), `${S().pctInversion}% de las ventas (insumos y gas)`, M + 3 * (bw + 10), bw, bh);
    y += bh + 26;

    // Gráfica de ventas por día
    seccion('Venta de cada día', 160);
    const gh = 105, gx = M + 34, gw = CW - 34;
    const max = Math.max(...d.cs.map(c => c.venta), d.eq.minimo, 1);
    const nice = Math.ceil(max / 50) * 50;
    const yv = v => y + gh * (1 - v / nice);
    doc.setLineWidth(.5); doc.setDrawColor(C.line);
    for (let k = 0; k <= 2; k++) {
      const val = nice * k / 2;
      doc.line(gx, yv(val), gx + gw, yv(val));
      font(8, 'normal', C.muted); txt(`$${Math.round(val)}`, gx - 5, yv(val) + 3, { align: 'right' });
    }
    const bwid = gw / d.cs.length;
    const paso = Math.ceil(d.cs.length / 16);
    d.cs.forEach((c, i) => {
      const x = gx + i * bwid + bwid * 0.15, w = bwid * 0.7, v = Math.max(0, c.venta);
      fill(v < d.eq.minimo ? C.soft : C.brown2);
      doc.rect(x, yv(v), w, y + gh - yv(v), 'F');
      if (i % paso === 0) { font(7.5, 'normal', C.muted); txt(String(parse(c.fecha).getDate()), x + w / 2, y + gh + 11, { align: 'center' }); }
    });
    doc.setDrawColor(C.red); doc.setLineWidth(1); doc.setLineDashPattern([4, 3], 0);
    doc.line(gx, yv(d.eq.minimo), gx + gw, yv(d.eq.minimo));
    doc.setLineDashPattern([], 0);
    y += gh + 24;
    parrafo(`La línea roja es lo mínimo que hay que vender al día para cubrir los gastos (${money(d.eq.minimo)}). ${d.diasMin} de ${d.cs.length} días lo lograron.`, 9, C.muted);
  
    // A dónde fue la plata
    seccion('¿A dónde fue la plata de las ventas?', 160);
    barraApilada([
      { n: 'Compras', v: d.inversion, c: C.brown2 },
      { n: 'Pagos del mes', v: d.apFijos, c: C.soft },
      { n: 'Taxi y otros', v: d.gastosDia, c: '#E0C9A6' },
      { n: 'Salarios', v: d.salarios, c: C.green },
    ]);
    const pct = v => d.venta > 0 ? `${Math.round(100 * v / d.venta)}%` : '';
    tabla([{ t: 'Concepto', w: CW - 180 }, { t: 'Monto', w: 100, a: 'r' }, { t: '% venta', w: 80, a: 'r' }], [
      ['Compras: insumos y gas', money(d.inversion), pct(d.inversion)],
      ['Apartado para pagos del mes (alquiler, alcaldía, basura)', money(d.apFijos), pct(d.apFijos)],
      ['Taxi y otros gastos del día', money(d.gastosDia), pct(d.gastosDia)],
      ...d.personas.map(p => [`Salario de ${p.nombre}`, { t: money(p.monto), color: p.monto < 0 ? C.red : C.green, bold: true }, pct(p.monto)]),
    ], { total: ['Total vendido', money(d.venta), '100%'] });

    // Efectivo y Yappy
    seccion('Cómo les pagaron', 50);
    barraApilada([{ n: `Efectivo ${money(d.efectivo)}`, v: d.efectivo, c: C.green }, { n: `Yappy ${money(d.yappy)}`, v: d.yappy, c: C.yappy }]);
  }

  /* ---------- Página 2: lo que viene, compras y gas ---------- */
  doc.addPage(); cabeceraChica();

  if (d.proy) {
    seccion('Proyección del mes', 90);
    const bw = (CW - 10) / 2, bh = 62;
    espacio(bh + 10);
    caja('Ventas estimadas del mes', money(d.proy.venta), `Si siguen vendiendo ${money(d.proy.promVenta)} por día`, M, bw, bh);
    caja(d.iguales ? 'Estimado para cada una' : `Estimado para ${d.personas[0].nombre}`, money(d.proy.personas[0]), `Faltan ${plural(d.proy.rest, 'día')} de trabajo este mes`, M + bw + 10, bw, bh, { bg: C.greenBg, v: C.green });
    y += bh + 14;
    parrafo(`Calculado con el promedio de los últimos ${plural(d.proy.n, 'día')} trabajados. Es una estimación: puede cambiar según cómo se vendan los días que faltan.`, 9, C.muted);
    y += 6;
  }

  if (d.pagos.length) {
    seccion('Pagos fijos del mes', 100);
    parrafo(`Plata apartada para estos pagos al día de hoy: ${money(d.sobres.fijos)}.`, 10);
    tabla([{ t: 'Pago', w: CW - 300 }, { t: 'Monto', w: 80, a: 'r' }, { t: 'Fecha', w: 110 }, { t: 'Estado', w: 110 }],
      d.pagos.map(p => [p.f.nombre, money(p.f.monto), fechaCorta(p.fecha),
        p.vencido ? { t: 'Pendiente', color: C.red, bold: true } : p.alcanza ? { t: 'Alcanza', color: C.green, bold: true } : { t: `Faltan ${money(p.f.monto - p.saldoAntes)}`, color: C.amber, bold: true }]),
      { total: ['Total del mes', money(totalFijos()), '', ''] });
  }

  seccion('Compras y gastos pagados', 100);
  if (d.porCat.length) {
    tabla([{ t: 'Tipo de gasto', w: CW - 200 }, { t: 'Veces', w: 80, a: 'r' }, { t: 'Total', w: 120, a: 'r' }],
      d.porCat.map(([n, v]) => [n, String(d.gastos.filter(g => (g.cat === 'otro' ? 'Otros gastos' : catInfo(g).nombre) === n).length), money(v)]),
      { total: ['Total pagado', String(d.gastos.length), money(sum(d.gastos, g => g.monto))] });
    parrafo(`Este mes se separaron ${money(d.inversion)} para compras (insumos y gas) y se anotaron compras por ${money(d.comprasMes)}. ` +
      (d.esteMes ? `Hoy hay ${money(d.sobres.inversion)} disponibles para compras.` : ''), 10);
  } else {
    parrafo('No se anotaron gastos en este mes.', 10, C.muted);
  }

  if (d.gas.compras) {
    seccion('Gas', 70);
    const g = d.gas;
    parrafo(`Último cambio de cilindro: ${fechaLarga(g.ultima.fecha)} (${money(g.ultima.monto)}).` +
      (g.intervalo ? ` Un cilindro les dura unos ${Math.round(g.intervalo)} días y cuesta en promedio ${money(g.costoProm)}, unos ${money(g.porDia || 0)} por día de trabajo. El próximo cambio sería ${cuando(g.proxima)}.` : ''), 10);
  }

  if (d.cs.length) {
    seccion('Metas y días destacados', 90);
    tabla([{ t: 'Dato', w: CW - 150 }, { t: 'Valor', w: 150, a: 'r' }], [
      ['Venta mínima diaria para cubrir gastos', money(d.eq.minimo)],
      [`Venta diaria para ganar ${money(S().metaPersona)} cada una`, money(d.eq.meta)],
      ['Días que llegaron a esa meta', `${d.diasMeta} de ${d.cs.length}`],
      ['Mejor día del mes', `${fechaCorta(d.mejorDia.fecha)} · ${money(d.mejorDia.venta)}`],
      ['Día más flojo del mes', `${fechaCorta(d.peorDia.fecha)} · ${money(d.peorDia.venta)}`],
      ...(d.mejorDow.v > 0 ? [['Día de la semana que más venden', `${DOW_LARGO[d.mejorDow.k]} (${money(d.mejorDow.v)})`]] : []),
    ]);

    /* ---------- Detalle día por día ---------- */
    seccion('Detalle día por día', 80);
    const p0 = d.personas[0] ? d.personas[0].nombre : '';
    tabla([{ t: 'Fecha', w: 92 }, { t: 'Efectivo', w: 72, a: 'r' }, { t: 'Yappy', w: 66, a: 'r' }, { t: 'Venta', w: 76, a: 'r' }, { t: d.iguales ? 'A cada una' : p0, w: 80, a: 'r' }, { t: 'Nota', w: CW - 386 }],
      d.cs.map(c => [fechaCorta(c.fecha), money(c.efectivo), money(c.yappy), { t: money(c.venta), bold: true }, { t: money(c.personas[0] ? c.personas[0].monto : 0), color: c.salarios < 0 ? C.red : C.green }, db.dias[c.fecha].nota || '']),
      { total: ['Total', money(d.efectivo), money(d.yappy), money(d.venta), money(d.personas[0] ? d.personas[0].monto : 0), ''] });
  }

  /* ---------- Pie de página ---------- */
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(C.line); doc.setLineWidth(.5); doc.line(M, H - 34, W - M, H - 34);
    font(8, 'normal', C.muted);
    txt('Hecho con la app Anny · Caja y cuentas. Los montos salen de los cierres que anotan cada día.', M, H - 22);
    txt(`Página ${i} de ${n}`, W - M, H - 22, { align: 'right' });
  }
  return doc.output('blob');
}

/* ================= Pantalla del informe ================= */
function mesesConDatos() {
  const set = new Set(fechasCerradas().map(f => f.slice(0, 7)));
  set.add(hoy().slice(0, 7));
  return [...set].sort();
}

function vInforme() {
  const ym = state.mes;
  const d = datosInforme(ym);
  const quien = destinatario();
  const lista = mesesConDatos();
  const i = lista.indexOf(ym);
  return encabezado('Informe en PDF') + `
  <div class="card informe-intro">
    <div class="q-ic">📄</div>
    <p>Un resumen del mes en PDF${quien ? ` para mandarle a <b>${esc(quien)}</b>` : ''} por WhatsApp: ventas, salarios, compras, pagos del mes, gas y proyección.</p>
  </div>
  <div class="card">
    <div class="monthnav"><button data-inf-mes="-1" aria-label="Mes anterior" ${i <= 0 ? 'disabled' : ''}>‹</button><h2>${MesCap(ym)}</h2><button data-inf-mes="1" aria-label="Mes siguiente" ${i >= lista.length - 1 ? 'disabled' : ''}>›</button></div>
    ${d.cs.length ? `<ul class="lines">
      <li><span>Días cerrados</span><span class="amt">${d.cs.length}</span></li>
      <li><span>Vendieron</span><span class="amt">${money(d.venta)}</span></li>
      <li><span>${d.iguales ? 'A cada una' : 'Salarios'}</span><span class="amt">${money(d.iguales ? d.personas[0].monto : d.salarios)}</span></li>
    </ul>` : '<p class="empty">Este mes todavía no tiene días cerrados.</p>'}
  </div>
  <button class="btn primary xl" data-act="informe-enviar" ${d.cs.length ? '' : 'disabled'}>📤 Enviar ${quien ? `a ${esc(quien)}` : 'informe'}</button>
  <button class="btn xl block mt" data-act="informe-ver" ${d.cs.length ? '' : 'disabled'}>👀 Ver el PDF</button>
  <p class="hint center mt">Al tocar "Enviar", elijan WhatsApp y luego ${quien ? esc(quien) : 'la persona'}.${quien ? '' : ' El nombre se puede poner en Más → Configuración.'}</p>`;
}

async function informeEnviar(soloVer) {
  const ym = state.mes;
  toast('Preparando el informe…');
  let blob;
  try { blob = await crearInformePDF(ym); }
  catch (e) { console.error(e); alert('No se pudo crear el PDF. Intenten de nuevo.'); return; }
  const nombre = nombreArchivoInforme(ym);
  if (soloVer) { abrirPDF(blob, nombre); return; }
  const file = new File([blob], nombre, { type: 'application/pdf' });
  const quien = destinatario();
  const texto = `${quien ? `Hola ${quien}, ` : ''}te envío el informe del kiosco Anny de ${mesNombre(ym)}.`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nombre, text: texto }); toast('Informe enviado ✓'); return; }
    catch (e) {
      if (e.name === 'AbortError') return;
      // El teléfono pidió un toque nuevo: se deja el PDF listo para enviar con otro toque
      state.pdfListo = { file, texto };
      if (confirm('El informe está listo. ¿Enviarlo ahora?')) {
        try { await navigator.share({ files: [file], title: nombre, text: texto }); toast('Informe enviado ✓'); } catch (_) { abrirPDF(blob, nombre, true); }
      }
      return;
    }
  }
  abrirPDF(blob, nombre, true);
}

function abrirPDF(blob, nombre, descargar) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  if (descargar) { a.download = nombre; toast('El PDF se guardó en Descargas'); }
  else a.target = '_blank';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 60000);
}
