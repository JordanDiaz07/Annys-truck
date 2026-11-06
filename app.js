/* Anny · Caja y cuentas — pantallas.
   Pensado para usarse con el pulgar y sin conocimientos técnicos:
   una pregunta por pantalla, botones grandes y solo lo importante a la vista. */
'use strict';

/* ================= Estado de navegación ================= */
const TAB_DE = { inicio: 'inicio', cierre: 'inicio', dia: 'inicio', guia: 'inicio', gastos: 'gastos', gasto: 'gastos', vamos: 'vamos', informe: 'vamos', mas: 'mas', config: 'mas', historial: 'mas' };
const RAIZ = { inicio: true, gastos: true, vamos: true, mas: true };

const state = {
  view: 'inicio',
  pila: [],            // pantallas anteriores, para el botón "atrás"
  mes: hoy().slice(0, 7),
  mesHist: mesAnt(hoy().slice(0, 7)),
  vamosTab: 'mes',
  diaVer: null,
  wiz: null,
  gasto: null,
  installEvt: null,
};

function irA(view, { push = true } = {}) {
  if (push && view !== state.view) {
    if (RAIZ[view]) state.pila = [];
    else state.pila.push(state.view);
  }
  state.view = view;
  render();
  window.scrollTo({ top: 0 });
}

function volver() {
  if (state.view === 'cierre' && state.wiz && state.wiz.step > 1) { state.wiz.step--; render(); return true; }
  if (state.view === 'cierre' && wizConDatos() && !confirm('¿Salir sin guardar el cierre?')) return true;
  if (state.pila.length) { irA(state.pila.pop(), { push: false }); return true; }
  if (state.view !== 'inicio') { irA('inicio'); return true; }
  return false;
}

function render() {
  const views = { inicio: vInicio, cierre: vCierre, dia: vDia, guia: vGuia, gastos: vGastos, gasto: vGasto, vamos: vVamos, mas: vMas, config: vConfig, historial: vHistorial, informe: vInforme };
  if (!views[state.view]) state.view = 'inicio';
  $('#view').innerHTML = views[state.view]();
  const bienvenida = state.view === 'inicio' && !db.bienvenida && !fechasCerradas().length && !db.gastos.length;
  document.body.classList.toggle('enfocado', bienvenida || state.view === 'cierre' || state.view === 'gasto' || state.view === 'guia');
  const tab = TAB_DE[state.view];
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const after = { cierre: bindCierre, gasto: bindGasto, informe: () => cargarJsPDF().catch(() => {}) };
  if (after[state.view]) after[state.view]();
}

/* ================= Piezas comunes ================= */
const iconoFijo = f => ({ alquiler: '🏠', alcaldia: '🏛️', basura: '🗑️' }[f && f.id] || '📅');
const iconoGasto = g => g.cat === 'fijo' ? iconoFijo(S().fijos.find(x => x.id === g.fijoId)) : catInfo(g).icon;
const plural = (n, s, p = s + 's') => `${n} ${n === 1 ? s : p}`;
const cuando = f => { const d = diffDays(hoy(), f); return d === 0 ? 'hoy' : d === 1 ? 'mañana' : d === -1 ? 'ayer' : d > 1 && d < 7 ? `el ${DOW_LARGO[parse(f).getDay()]}` : `el ${fechaCorta(f)}`; };

function encabezado(titulo, { atras = true } = {}) {
  return `<div class="subhead">${atras ? '<button class="back" data-act="volver" aria-label="Volver">‹</button>' : ''}<h1>${titulo}</h1></div>`;
}

function saludo() {
  const h = new Date().getHours();
  const nombre = S().personas[0] ? S().personas[0].nombre : '';
  return `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}${nombre ? ', ' + esc(nombre) : ''}`;
}

/* Resultado de un día: lo que ven al cerrar y al abrir un día guardado */
function resultado(c, { yappyNota = true } = {}) {
  const iguales = c.personas.length > 1 && c.personas.every(x => Math.abs(x.monto - c.personas[0].monto) < 0.01);
  let html = `<div class="hero-num"><div class="lbl">Vendieron</div><div class="num">${money(c.venta)}</div>
    <div class="sub">💵 ${money(c.efectivo)} efectivo · 📱 ${money(c.yappy)} Yappy</div></div>`;
  if (c.salarios >= 0) {
    html += `<div class="toca"><div class="lbl">💰 A cada una le toca</div>
      ${iguales ? `<div class="num">${money(c.personas[0].monto)}</div><div class="sub">${c.personas.map(x => esc(x.nombre)).join(' y ')}</div>`
        : c.personas.map(x => `<div class="row between"><span>${esc(x.nombre)}</span><b>${money(x.monto)}</b></div>`).join('')}</div>`;
  } else {
    html += `<div class="aviso bad"><span class="ic">😕</span><div>Hoy fue un día flojo: la venta no alcanzó para cubrir los gastos. Faltaron <b>${money(-c.salarios)}</b>. No queda para salarios.</div></div>`;
  }
  html += `<h3 class="mt">Separen la plata así</h3>
    <ul class="sobres">
      <li><span class="ic">🔒</span><span class="t">Dejar en la caja para mañana</span><b>${money(c.p.caja)}</b></li>
      <li><span class="ic">🛒</span><span class="t">Para compras <small>(insumos y gas)</small></span><b>${money(c.inversion)}</b></li>
      <li><span class="ic">📅</span><span class="t">Para los pagos del mes <small>(alquiler, alcaldía, basura)</small></span><b>${money(c.apFijos)}</b></li>
      ${c.salarios > 0 ? c.personas.map(x => `<li><span class="ic">👩</span><span class="t">${esc(x.nombre)}</span><b>${money(x.monto)}</b></li>`).join('') : ''}
    </ul>
    ${yappyNota && c.yappy > 0 ? `<p class="hint">📱 Recuerden que ${money(c.yappy)} de la venta están en Yappy, no en billetes.</p>` : ''}
    <details class="help"><summary>Ver cómo se calculó</summary>
      <ul class="lines">
        <li><span>Efectivo vendido <small class="muted">(caja − ${money(c.p.caja)}${c.salidas ? ' + lo pagado con la caja' : ''})</small></span><span class="amt">${money(c.efectivo)}</span></li>
        <li><span>+ Yappy</span><span class="amt">${money(c.yappy)}</span></li>
        <li class="total"><span>Venta del día</span><span class="amt">${money(c.venta)}</span></li>
        <li><span>− Compras: insumos y gas (${c.p.pctInv}%)</span><span class="amt">${money(c.inversion)}</span></li>
        <li><span>− Pagos del mes (parte del día)</span><span class="amt">${money(c.apFijos)}</span></li>
        <li><span>− Taxi y otros gastos del día</span><span class="amt">${money(c.gastosDia)}</span></li>
        <li class="total"><span>Para salarios</span><span class="amt ${c.salarios < 0 ? 'neg' : ''}">${money(c.salarios)}</span></li>
      </ul></details>`;
  return html;
}

function aviso(tipo, ic, texto, btn = '') {
  return `<div class="aviso ${tipo}"><span class="ic">${ic}</span><div class="grow">${texto}</div>${btn}</div>`;
}

/* ================= INICIO ================= */
function avisosInicio() {
  const out = [];
  const t = hoy();
  // ¿Se les olvidó cerrar el último día de trabajo?
  if (fechasCerradas().some(f => !db.dias[f].hist)) {
    let d = addDays(t, -1), k = 0;
    while (!esLaborable(d) && k < 7) { d = addDays(d, -1); k++; }
    if (!db.dias[d] && d > inicioSaldos()) {
      out.push(aviso('info', '🤔', `¿Se les pasó cerrar el <b>${DOW_LARGO[parse(d).getDay()]} ${parse(d).getDate()}</b>?`, `<button class="btn sm" data-cerrar="${d}">Cerrar</button>`));
    }
  }
  for (const p of proximosPagos()) {
    const d = diffDays(t, p.fecha);
    if (p.vencido) out.push(aviso('bad', iconoFijo(p.f), `El pago de <b>${esc(p.f.nombre.toLowerCase())}</b> (${money(p.f.monto)}) era ${cuando(p.fecha)}. ¿Ya lo pagaron?`, `<button class="btn sm" data-pagar="${esc(p.f.id)}">Ya pagué</button>`));
    else if (d <= 5) out.push(aviso(p.alcanza ? 'ok' : 'warn', iconoFijo(p.f), `El pago de <b>${esc(p.f.nombre.toLowerCase())}</b> (${money(p.f.monto)}) es <b>${cuando(p.fecha)}</b>. ${p.alcanza ? 'Ya tienen la plata apartada ✓' : `Faltan ${money(p.f.monto - p.saldoAntes)} por apartar.`}`, d <= 0 ? `<button class="btn sm" data-pagar="${esc(p.f.id)}">Ya pagué</button>` : ''));
  }
  const g = infoGas();
  if (g.faltan != null && g.faltan <= 2) out.push(aviso('warn', '🔥', g.faltan <= 0 ? `El gas ya debería estar por acabarse (lo cambiaron hace ${plural(g.diasDesde, 'día')}).` : `El gas se acaba pronto: suele durar ${Math.round(g.intervalo)} días.`, `<button class="btn sm" data-act="gas-hoy">Ya lo cambiamos</button>`));
  const r = diasSinRespaldo();
  if (r >= 7) out.push(aviso('warn', '💾', db.ultimoRespaldo ? `Hace ${r} días que no guardan una copia de las cuentas.` : 'Guarden una copia de las cuentas por si algo le pasa al teléfono.', `<button class="btn sm" data-act="respaldar">Guardar</button>`));
  if (state.installEvt) out.push(aviso('info', '📲', 'Pongan la app en la pantalla del teléfono para abrirla más fácil.', `<button class="btn sm" data-act="instalar">Instalar</button>`));
  return out;
}

function vInicio() {
  if (!db.bienvenida && !fechasCerradas().length && !db.gastos.length) return vGuia(true);
  const t = hoy();
  const c = calc(t);
  let html = `<div class="saludo"><h1>${saludo()} 👋</h1><p>${fechaLarga(t).replace(/^./, m => m.toUpperCase())}</p></div>`;

  if (c) {
    const iguales = c.personas.length > 1 && c.personas.every(x => Math.abs(x.monto - c.personas[0].monto) < 0.01);
    html += `<div class="card hero done" data-ver-dia="${t}">
      <div class="estado">✅ Día cerrado</div>
      <div class="row between mt"><span>Vendieron</span><b class="n">${money(c.venta)}</b></div>
      ${c.salarios >= 0 ? (iguales ? `<div class="row between"><span>A cada una</span><b class="n">${money(c.personas[0].monto)}</b></div>` : c.personas.map(x => `<div class="row between"><span>${esc(x.nombre)}</span><b class="n">${money(x.monto)}</b></div>`).join(''))
        : `<p class="neg-text">No alcanzó para salarios hoy.</p>`}
      <div class="ver">Ver detalle ›</div></div>`;
  } else {
    const lab = esLaborable(t);
    html += `<div class="card hero">
      <div class="estado">${lab ? '🌙 Al terminar el día' : '😴 Hoy no es día de trabajo'}</div>
      <p>${lab ? 'Cuenten la caja y la app les dice cuánto le toca a cada una.' : 'Si igual abrieron, pueden cerrar la caja.'}</p>
      <button class="btn primary xl" data-cerrar="${t}">💵 Cerrar el día</button></div>`;
  }

  const av = avisosInicio();
  if (av.length) html += `<div class="avisos">${av.slice(0, 3).join('')}</div>`;

  html += `<div class="accesos">
    <button data-act="gas-hoy"><span>🔥</span>Cambiamos el gas</button>
    <button data-goto="gastos"><span>🧾</span>Anotar un gasto</button>
    <button data-goto="vamos"><span>📊</span>¿Cómo vamos?</button>
    <button data-act="respaldar"><span>💾</span>Guardar copia</button>
  </div>`;

  const lunes = addDays(t, -((parse(t).getDay() + 6) % 7));
  const sem = cierresEntre(lunes, t);
  if (sem.length) {
    const p0 = sum(sem, x => x.personas[0] ? x.personas[0].monto : 0);
    html += `<div class="card semana"><div class="lbl">Esta semana</div>
      <p>Vendieron <b>${money(sum(sem, x => x.venta))}</b> en ${plural(sem.length, 'día')}${S().personas.length > 1 ? ` · a cada una <b>${money(p0)}</b>` : ''}.</p></div>`;
  }
  return html;
}

/* ================= GUÍA / BIENVENIDA ================= */
function vGuia(primeraVez) {
  primeraVez = primeraVez === true;
  return `<div class="guia">
    ${primeraVez ? '' : encabezado('Cómo se usa')}
    ${primeraVez ? `<div class="center"><div class="sign big"><span>ANNY</span></div><h1 class="mt">¡Bienvenidas!</h1><p class="muted">Esta app hace las cuentas del kiosco por ustedes.</p></div>` : ''}
    <ol class="pasos">
      <li><span class="ic">💵</span><div><b>Cada noche, cierren el día</b><p>Cuenten la caja y anoten el Yappy. Son 3 preguntas.</p></div></li>
      <li><span class="ic">💰</span><div><b>La app les dice cuánto le toca a cada una</b><p>Y cuánto separar para compras y para los pagos del mes.</p></div></li>
      <li><span class="ic">🔥</span><div><b>Cuando cambien el gas, avísenle</b><p>Así aprende cuánto dura y les avisa cuándo toca.</p></div></li>
      <li><span class="ic">💾</span><div><b>Una vez por semana, guarden una copia</b><p>La app se los recuerda. La copia se guarda en Drive o WhatsApp.</p></div></li>
    </ol>
    <p class="hint center">Todo queda guardado en este teléfono. Funciona sin internet.</p>
    <button class="btn primary xl mt" data-act="${primeraVez ? 'empezar' : 'volver'}">${primeraVez ? '¡Empezar!' : 'Entendido'}</button>
  </div>`;
}

/* ================= CIERRE DEL DÍA (paso a paso) ================= */
function iniciarCierre(f) {
  const dia = db.dias[f];
  const gs = gastosDe(f);
  const taxi = gs.find(g => g.cat === 'taxi');
  const salidas = gs.filter(g => g.deCaja && g.cat !== 'taxi').map(g => ({ ...g }));
  state.wiz = {
    f, step: 1, edit: !!dia,
    efectivo: dia ? String(r2(dia.efectivo)) : '',
    yappy: dia ? String(r2(dia.yappy)) : '',
    taxi: dia ? !!taxi : (+S().taxiDiario > 0 && esLaborable(f)),
    taxiMonto: taxi ? taxi.monto : +S().taxiDiario,
    taxiDeCaja: taxi ? taxi.deCaja : true,
    salidas, origIds: salidas.map(g => g.id),
    nota: dia ? dia.nota || '' : '',
    otra: false, otraCat: 'gas',
  };
  irA('cierre');
}
const wizConDatos = () => state.wiz && (state.wiz.efectivo !== '' || state.wiz.yappy !== '') && !state.wiz.edit;

function calcWiz() {
  const w = state.wiz;
  const dia = db.dias[w.f];
  const p = dia ? dia.p : paramsActuales();
  const gs = w.salidas.map(g => ({ ...g, deCaja: true }));
  if (w.taxi && w.taxiMonto > 0) gs.push({ cat: 'taxi', monto: w.taxiMonto, deCaja: w.taxiDeCaja });
  gastosDe(w.f).filter(g => !g.deCaja && g.cat !== 'taxi').forEach(g => gs.push(g));
  return calcular({ efectivo: num(w.efectivo) || 0, yappy: num(w.yappy) || 0, p }, gs);
}

function vCierre() {
  const w = state.wiz;
  if (!w) { state.view = 'inicio'; return vInicio(); }
  const total = 4;
  const top = `<div class="wiz-top">
      <button class="back" data-act="volver" aria-label="Atrás">‹</button>
      <div class="grow"><div class="wiz-paso">Paso ${w.step} de ${total}</div><div class="bar"><i style="width:${100 * w.step / total}%"></i></div></div>
      <button class="cerrar" data-act="salir-cierre" aria-label="Salir">✕</button>
    </div>
    <div class="wiz-fecha">${w.edit ? 'Corrigiendo el' : 'Cierre del'} <b>${fechaLarga(w.f)}</b></div>`;
  let body = '';
  if (w.step === 1) {
    body = `<div class="q"><div class="q-ic">💵</div><h1>¿Cuánto efectivo hay en la caja?</h1>
      <p>Cuenten <b>todos</b> los billetes y monedas, incluyendo los ${money(S().cajaInicial)} con los que abrieron.</p></div>
      <div class="money-in big"><input id="w-in" inputmode="decimal" placeholder="0.00" value="${esc(w.efectivo)}" autocomplete="off"></div>
      <button class="btn primary xl" data-act="wiz-sig">Siguiente →</button>
      ${w.edit ? '' : `<details class="otro-dia"><summary>¿Es el cierre de otro día?</summary>
        <input type="date" id="w-fecha" class="input" value="${w.f}" max="${hoy()}"></details>`}`;
  } else if (w.step === 2) {
    body = `<div class="q"><div class="q-ic">📱</div><h1>¿Cuánto entró por Yappy?</h1>
      <p>Revisen en el teléfono el total que les pagaron por Yappy ese día.</p></div>
      <div class="money-in big"><input id="w-in" inputmode="decimal" placeholder="0.00" value="${esc(w.yappy)}" autocomplete="off"></div>
      <button class="btn primary xl" data-act="wiz-sig">Siguiente →</button>
      <button class="btn xl block mt" data-act="sin-yappy">No hubo Yappy</button>`;
  } else if (w.step === 3) {
    const cats = [['gas', '🔥', 'Gas'], ['insumos', '🛒', 'Compras'], ...S().fijos.map(f => ['fijo:' + f.id, iconoFijo(f), f.nombre]), ['otro', '📝', 'Otra cosa']];
    body = `<div class="q"><div class="q-ic">👛</div><h1>¿Pagaron algo con la plata de la caja?</h1>
      <p>Solo lo que se pagó con billetes de la caja ese día.</p></div>
      <button class="toggle ${w.taxi ? 'on' : ''}" data-act="toggle-taxi">
        <span class="chk">${w.taxi ? '✓' : ''}</span><span class="grow">🚕 Taxi</span>
        <span class="money-in mini"><input id="w-taxi" inputmode="decimal" value="${w.taxiMonto}" aria-label="Monto del taxi"></span></button>
      ${w.salidas.map((g, i) => `<div class="toggle on static"><span class="chk">✓</span><span class="grow">${iconoGasto(g)} ${esc(g.cat === 'otro' ? g.concepto : catInfo(g).nombre)}</span><b>${money(g.monto)}</b><button class="x" data-quitar-salida="${i}" aria-label="Quitar">✕</button></div>`).join('')}
      ${w.otra ? `<div class="card otra">
          <div class="lbl">¿Qué pagaron?</div>
          <div class="chips">${cats.map(([k, ic, n]) => `<button class="chip ${w.otraCat === k ? 'on' : ''}" data-otra-cat="${esc(k)}">${ic} ${esc(n)}</button>`).join('')}</div>
          ${w.otraCat === 'otro' ? '<input id="w-otra-que" class="input" placeholder="¿Qué fue? Ej.: bolsas">' : ''}
          <div class="row mt"><div class="money-in grow"><input id="w-otra-monto" class="input" inputmode="decimal" placeholder="¿Cuánto?"></div><button class="btn" data-act="add-salida">Agregar</button></div>
        </div>` : `<button class="btn block mt" data-act="otra-salida">＋ Se pagó otra cosa</button>`}
      <button class="btn primary xl mt" data-act="wiz-sig">Ver resultado →</button>`;
  } else {
    const c = calcWiz();
    body = `<div class="card resultado">${resultado(c)}</div>
      <label class="field">📝 ¿Algo especial ese día? <span class="muted small">(opcional)</span>
        <input id="w-nota" class="input" placeholder="Ej.: llovió, hubo feria" value="${esc(w.nota)}"></label>
      <button class="btn primary xl" data-act="guardar-cierre">✅ Guardar el día</button>`;
  }
  return top + `<div class="wiz">${body}</div>`;
}

function bindCierre() {
  const w = state.wiz;
  const inp = $('#w-in');
  if (inp) {
    setTimeout(() => inp.focus(), 80);
    inp.addEventListener('input', () => { if (w.step === 1) w.efectivo = inp.value; else w.yappy = inp.value; });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); wizSiguiente(); } });
  }
  const tx = $('#w-taxi');
  if (tx) {
    tx.addEventListener('click', e => e.stopPropagation());
    tx.addEventListener('input', () => { const v = num(tx.value); w.taxiMonto = isNaN(v) ? 0 : v; });
  }
  const fe = $('#w-fecha');
  if (fe) fe.addEventListener('change', () => {
    if (!fe.value || fe.value === w.f) return;
    if (db.dias[fe.value]) {
      if (confirm(`El ${fechaLarga(fe.value)} ya está cerrado. ¿Quieren corregirlo?`)) { state.pila.pop(); iniciarCierre(fe.value); } else fe.value = w.f;
      return;
    }
    const keep = w.efectivo; state.pila.pop(); iniciarCierre(fe.value); state.wiz.efectivo = keep; render();
  });
  const nota = $('#w-nota');
  if (nota) nota.addEventListener('input', () => { w.nota = nota.value; });
}

function wizSiguiente() {
  const w = state.wiz;
  if (w.step === 1) {
    const v = num(w.efectivo);
    if (isNaN(v) || v < 0) { toast('Escriban cuánto efectivo hay en la caja'); $('#w-in').focus(); return; }
    if (v < S().cajaInicial * 0.5 && !confirm(`Escribieron ${money(v)}, que es menos que los ${money(S().cajaInicial)} de base. ¿Está bien?`)) return;
  }
  if (w.step === 2) {
    const v = w.yappy === '' ? 0 : num(w.yappy);
    if (isNaN(v) || v < 0) { toast('Revisen el monto de Yappy'); return; }
    w.yappy = String(v);
  }
  w.step = Math.min(4, w.step + 1);
  w.otra = false;
  render();
  window.scrollTo({ top: 0 });
}

function guardarCierre() {
  const w = state.wiz;
  const prev = db.dias[w.f];
  db.dias[w.f] = {
    efectivo: r2(num(w.efectivo)), yappy: r2(num(w.yappy) || 0), nota: (w.nota || '').trim(),
    p: prev ? prev.p : paramsActuales(), guardado: new Date().toISOString(),
    ...(prev && prev.hist ? { hist: true } : {}),
  };
  db.gastos = db.gastos.filter(g => !w.origIds.includes(g.id) && !(g.fecha === w.f && g.cat === 'taxi'));
  for (const g of w.salidas) db.gastos.push({ ...g, id: g.id || uid(), fecha: w.f, deCaja: true });
  if (w.taxi && w.taxiMonto > 0) db.gastos.push({ id: uid(), fecha: w.f, cat: 'taxi', concepto: 'Taxi', monto: r2(w.taxiMonto), deCaja: w.taxiDeCaja });
  guardar();
  if (navigator.vibrate) navigator.vibrate(60);
  const f = w.f;
  state.wiz = null;
  toast(w.edit ? 'Cierre corregido ✓' : '¡Día cerrado! ✓');
  state.pila = [];
  state.view = 'inicio';
  if (f === hoy()) irA('inicio', { push: false });
  else { state.diaVer = f; irA('dia'); }
}

/* ================= DETALLE DE UN DÍA ================= */
function vDia() {
  const f = state.diaVer;
  const c = f && calc(f);
  if (!c) return encabezado('Día') + '<div class="card empty">Ese día no tiene cierre.</div>';
  const d = db.dias[f];
  return encabezado(fechaLarga(f).replace(/^./, m => m.toUpperCase())) +
    `<div class="card resultado">${resultado(c, { yappyNota: false })}
      ${d.nota ? `<p class="mt">📝 ${esc(d.nota)}</p>` : ''}
      ${d.hist ? '<p class="hint">Cargado desde las anotaciones de meses anteriores.</p>' : ''}</div>
    <button class="btn xl block" data-act="corregir-dia">✏️ Corregir este día</button>
    <button class="btn ghost block mt danger-text" data-act="borrar-dia">Borrar este cierre</button>`;
}

/* ================= GASTOS ================= */
function opcionesGasto() {
  return [
    { k: 'gas', ic: '🔥', n: 'Gas' },
    { k: 'insumos', ic: '🛒', n: 'Compras / insumos' },
    ...S().fijos.map(f => ({ k: 'fijo:' + f.id, ic: iconoFijo(f), n: f.nombre })),
    { k: 'taxi', ic: '🚕', n: 'Taxi' },
    { k: 'otro', ic: '📝', n: 'Otra cosa' },
  ];
}

function vGastos() {
  const ym = state.mes;
  const lista = db.gastos.filter(g => g.fecha.slice(0, 7) === ym).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return `<h1 class="page">Anotar un gasto</h1>
    <p class="muted">¿Qué pagaron? Toquen una opción.</p>
    <div class="opciones">${opcionesGasto().map(o => `<button data-nuevo-gasto="${esc(o.k)}"><span>${o.ic}</span>${esc(o.n)}</button>`).join('')}</div>

    <div class="card mt">
      <div class="monthnav"><button data-mes="-1" aria-label="Mes anterior">‹</button><h2>Gastos de ${mesNombre(ym).split(' ')[0]}</h2><button data-mes="1" aria-label="Mes siguiente">›</button></div>
      ${lista.length ? `<ul class="list">${lista.map(g => { const d = parse(g.fecha); return `
        <li><div class="when"><b>${d.getDate()}</b><span>${DOW[d.getDay()]}</span></div>
        <div class="what"><div class="n">${iconoGasto(g)} ${esc(g.cat === 'otro' ? g.concepto : catInfo(g).nombre)}</div><div class="d">${g.deCaja ? 'Con plata de la caja' : 'Pagado aparte'}</div></div>
        <div class="amt">${money(g.monto)}</div><button class="btn ghost sm" data-del-gasto="${g.id}" aria-label="Borrar">🗑️</button></li>`; }).join('')}</ul>
        <p class="total-line">Total: <b>${money(sum(lista, g => g.monto))}</b></p>` : '<div class="empty">Todavía no hay gastos anotados este mes.</div>'}
    </div>`;
}

function nuevoGasto(k) {
  const st = S();
  const g = { cat: k, fijoId: null, monto: '', cuando: 'hoy', fecha: hoy(), deCaja: false, concepto: '' };
  if (k.startsWith('fijo:')) { g.cat = 'fijo'; g.fijoId = k.slice(5); const f = st.fijos.find(x => x.id === g.fijoId); if (f) g.monto = String(f.monto); }
  if (k === 'taxi') { g.monto = String(st.taxiDiario); g.deCaja = true; }
  state.gasto = g;
  irA('gasto');
}

function vGasto() {
  const g = state.gasto;
  if (!g) { state.view = 'gastos'; return vGastos(); }
  const op = opcionesGasto().find(o => o.k === (g.cat === 'fijo' ? 'fijo:' + g.fijoId : g.cat)) || { ic: '📝', n: 'Gasto' };
  const ayer = addDays(hoy(), -1);
  const ayudas = {
    gas: 'Anótenlo el día que cambian el cilindro. Así la app aprende cuánto les dura.',
    insumos: 'Sale de la plata para compras (el 45% de cada venta).',
    fijo: 'Sale de la plata apartada para los pagos del mes.',
    taxi: 'Se descuenta de la ganancia de ese día.',
    otro: 'Se descuenta de la ganancia de ese día.',
  };
  return encabezado(`${op.ic} ${esc(op.n)}`) + `<div class="wiz">
    ${g.cat === 'otro' ? `<label class="field">¿Qué fue?<input id="g-que" class="input" placeholder="Ej.: bolsas, reparación" value="${esc(g.concepto)}"></label>` : ''}
    <div class="field">¿Cuánto costó?</div>
    <div class="money-in big"><input id="g-monto" inputmode="decimal" placeholder="0.00" value="${esc(g.monto)}" autocomplete="off"></div>

    <div class="field">¿Cuándo?
      <div class="seg">
        <button class="${g.cuando === 'hoy' ? 'on' : ''}" data-cuando="hoy">Hoy</button>
        <button class="${g.cuando === 'ayer' ? 'on' : ''}" data-cuando="ayer">Ayer</button>
        <button class="${g.cuando === 'otro' ? 'on' : ''}" data-cuando="otro">Otro día</button>
      </div>
      ${g.cuando === 'otro' ? `<input type="date" id="g-fecha" class="input mt" value="${g.fecha}" max="${hoy()}">` : `<div class="hint">${fechaLarga(g.cuando === 'hoy' ? hoy() : ayer)}</div>`}
    </div>

    <div class="field">¿Lo pagaron con billetes de la caja?
      <div class="seg">
        <button class="${!g.deCaja ? 'on' : ''}" data-decaja="0">No</button>
        <button class="${g.deCaja ? 'on' : ''}" data-decaja="1">Sí, de la caja</button>
      </div>
      <div class="hint">${g.deCaja ? 'La app lo tomará en cuenta al cerrar la caja de ese día.' : 'Por ejemplo, si lo pagaron con Yappy o con plata ya separada.'}</div>
    </div>

    <p class="hint">💡 ${ayudas[g.cat] || ''}</p>
    <button class="btn primary xl mt" data-act="guardar-gasto">Guardar</button>
  </div>`;
}

function bindGasto() {
  const g = state.gasto;
  const m = $('#g-monto');
  if (m) { if (!g.monto) setTimeout(() => m.focus(), 80); m.addEventListener('input', () => { g.monto = m.value; }); }
  const q = $('#g-que'); if (q) q.addEventListener('input', () => { g.concepto = q.value; });
  const f = $('#g-fecha'); if (f) f.addEventListener('change', () => { g.fecha = f.value || hoy(); });
}

function guardarGasto() {
  const g = state.gasto;
  const monto = num(g.monto);
  if (isNaN(monto) || monto <= 0) { toast('Escriban cuánto costó'); $('#g-monto').focus(); return; }
  const fecha = g.cuando === 'hoy' ? hoy() : g.cuando === 'ayer' ? addDays(hoy(), -1) : (g.fecha || hoy());
  const nuevo = { id: uid(), fecha, cat: g.cat, monto: r2(monto), deCaja: g.deCaja };
  if (g.cat === 'fijo') { nuevo.fijoId = g.fijoId; const f = S().fijos.find(x => x.id === g.fijoId); nuevo.concepto = f ? f.nombre : 'Pago fijo'; }
  else if (g.cat === 'otro') nuevo.concepto = (g.concepto || '').trim() || 'Otro gasto';
  else nuevo.concepto = catInfo(nuevo).nombre;
  if (nuevo.cat === 'taxi') db.gastos = db.gastos.filter(x => !(x.fecha === fecha && x.cat === 'taxi'));
  db.gastos.push(nuevo);
  guardar();
  if (navigator.vibrate) navigator.vibrate(40);
  state.mes = fecha.slice(0, 7);
  state.gasto = null;
  toast(nuevo.cat === 'gas' ? 'Cambio de gas anotado 🔥' : 'Gasto guardado ✓');
  volver();
}

/* ================= ¿CÓMO VAMOS? ================= */
function vVamos() {
  const seg = `<h1 class="page">¿Cómo vamos?</h1>
    <div class="seg big">
      <button class="${state.vamosTab === 'mes' ? 'on' : ''}" data-vamos="mes">📊 El mes</button>
      <button class="${state.vamosTab === 'viene' ? 'on' : ''}" data-vamos="viene">🔮 Lo que viene</button>
    </div>
    <button class="btn block informe-btn" data-goto="informe">📄 Enviar informe en PDF${destinatario() ? ` a ${esc(destinatario())}` : ''}</button>`;
  return seg + (state.vamosTab === 'mes' ? vMes() : vViene());
}

function vMes() {
  const ym = state.mes;
  const ini = `${ym}-01`, fin = finDeMes(ym);
  const cs = cierresEntre(ini, fin);
  const nav = `<div class="monthnav"><button data-mes="-1" aria-label="Mes anterior">‹</button><h2>${mesNombre(ym).replace(/^./, m => m.toUpperCase())}</h2><button data-mes="1" aria-label="Mes siguiente" ${ym >= hoy().slice(0, 7) ? 'disabled' : ''}>›</button></div>`;
  if (!cs.length) return nav + '<div class="card empty">📭 No hay días cerrados en este mes.</div>';

  const venta = sum(cs, c => c.venta), efe = sum(cs, c => c.efectivo), yap = sum(cs, c => c.yappy);
  const prom = venta / cs.length;
  const eq = equilibrio();
  const pctE = venta > 0 ? 100 * efe / venta : 0;
  const ant = cierresEntre(`${mesAnt(ym)}-01`, finDeMes(mesAnt(ym)));
  const promAnt = ant.length ? sum(ant, c => c.venta) / ant.length : 0;
  const varPct = promAnt > 0 ? Math.round(100 * (prom - promAnt) / promAnt) : null;
  const esteMes = ym === hoy().slice(0, 7);
  const items = cs.map(c => ({ label: String(parse(c.fecha).getDate()), value: c.venta, title: fechaCorta(c.fecha) }));
  const porDow = S().diasTrabajo.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => {
    const xs = cs.filter(c => parse(c.fecha).getDay() === d);
    return { label: DOW[d], value: xs.length ? sum(xs, c => c.venta) / xs.length : 0 };
  });
  const mejor = porDow.reduce((a, b) => b.value > a.value ? b : a, { value: -1 });
  const gastosMes = db.gastos.filter(g => g.fecha >= ini && g.fecha <= fin);
  const porCat = {};
  for (const g of gastosMes) { const n = iconoGasto(g) + ' ' + (g.cat === 'otro' ? 'Otros' : catInfo(g).nombre); porCat[n] = (porCat[n] || 0) + g.monto; }
  const catRows = Object.entries(porCat).map(([label, value]) => ({ label: esc(label), value })).sort((a, b) => b.value - a.value);
  const iguales = S().personas.length > 1 && S().personas.every(p => p.pct === S().personas[0].pct);

  return `${nav}
  <div class="card hero-mes">
    <div class="lbl">${esteMes ? 'Llevan vendido' : 'Vendieron'}</div>
    <div class="num">${money(venta)}</div>
    <div class="sub">en ${plural(cs.length, 'día')} de trabajo · ${money(prom)} por día</div>
    ${varPct != null ? `<div class="var ${varPct >= 0 ? 'up' : 'down'}">${varPct >= 0 ? '▲' : '▼'} ${Math.abs(varPct)}% ${varPct >= 0 ? 'más' : 'menos'} por día que en ${MESES[+mesAnt(ym).slice(5) - 1]}</div>` : ''}
    <div class="toca-mes">${iguales
      ? `💰 A cada una le ${esteMes ? 'ha tocado' : 'tocó'} <b>${money(sum(cs, c => c.personas[0] ? c.personas[0].monto : 0))}</b>`
      : S().personas.map((p, i) => `💰 ${esc(p.nombre)}: <b>${money(sum(cs, c => c.personas[i] ? c.personas[i].monto : 0))}</b>`).join('<br>')}</div>
  </div>

  <div class="card chart"><h2>Venta de cada día</h2>
    ${barChart(items, { ref: eq.minimo })}
    <p class="hint">La línea roja es lo mínimo que hay que vender para cubrir gastos (${money(eq.minimo)}). ${cs.filter(c => c.venta >= eq.minimo).length} de ${cs.length} días lo lograron.</p>
  </div>

  ${mejor.value > 0 ? `<div class="card chart"><h2>Los mejores días</h2>
    ${barChart(porDow, { height: 130 })}
    <p class="hint">El día que más venden es el <b>${DOW_LARGO[DOW.indexOf(mejor.label)]}</b> (${money(mejor.value)} en promedio).</p></div>` : ''}

  <div class="card"><h2>Efectivo y Yappy</h2>
    <div class="split"><div class="a" style="width:${pctE.toFixed(1)}%"></div><div class="b" style="width:${(100 - pctE).toFixed(1)}%"></div></div>
    <div class="row between small"><span>💵 Efectivo ${money(efe)} (${Math.round(pctE)}%)</span><span>📱 Yappy ${money(yap)} (${Math.round(100 - pctE)}%)</span></div>
  </div>

  <details class="card plegable"><summary><h2>¿A dónde fue la plata?</h2></summary>
    <ul class="lines">
      <li><span>🛒 Compras: insumos y gas</span><span class="amt">${money(sum(cs, c => c.inversion))}</span></li>
      <li><span>📅 Pagos del mes</span><span class="amt">${money(sum(cs, c => c.apFijos))}</span></li>
      <li><span>🚕 Taxi y otros</span><span class="amt">${money(sum(cs, c => c.gastosDia))}</span></li>
      <li class="total"><span>💰 Salarios</span><span class="amt">${money(sum(cs, c => c.salarios))}</span></li>
    </ul></details>

  ${catRows.length ? `<details class="card plegable"><summary><h2>Gastos pagados</h2></summary>${hbars(catRows)}<p class="total-line">Total: <b>${money(sum(gastosMes, g => g.monto))}</b></p></details>` : ''}

  <details class="card plegable"><summary><h2>Día por día</h2></summary>
    <ul class="list">${cs.slice().reverse().map(c => { const d = parse(c.fecha); return `
      <li class="tap" data-ver-dia="${c.fecha}"><div class="when"><b>${d.getDate()}</b><span>${DOW[d.getDay()]}</span></div>
      <div class="what"><div class="n">${money(c.venta)}</div><div class="d">${c.salarios >= 0 ? `A cada una ${money(c.personas[0] ? c.personas[0].monto : 0)}` : 'No alcanzó para salarios'}${db.dias[c.fecha].nota ? ' · ' + esc(db.dias[c.fecha].nota) : ''}</div></div>
      <span class="muted">›</span></li>`; }).join('')}</ul></details>`;
}

function vViene() {
  const t = hoy(), ym = t.slice(0, 7);
  const pagos = proximosPagos();
  const so = sobres();
  const prom = promedioReciente();
  const eq = equilibrio();
  let html = '';

  if (prom) {
    const cerrados = cierresEntre(`${ym}-01`, t);
    const desde = db.dias[t] ? addDays(t, 1) : t;
    const rest = contarLaborables(desde, addDays(finDeMes(ym), 1));
    const proy = sum(cerrados, c => c.venta) + rest * prom.venta;
    const proyP0 = sum(cerrados, c => c.personas[0] ? c.personas[0].monto : 0) + rest * prom.personas[0];
    html += `<div class="card hero-mes">
      <div class="lbl">Si siguen así, en ${MESES[+ym.slice(5) - 1]} venderán unos</div>
      <div class="num">${money(proy)}</div>
      <div class="toca-mes">💰 y a cada una le tocarían unos <b>${money(proyP0)}</b></div>
      <div class="sub">Faltan ${plural(rest, 'día')} de trabajo este mes. Calculado con lo que venden normalmente (${money(prom.venta)} al día).</div>
    </div>`;
  } else {
    html += `<div class="card empty">🔮 Cuando tengan algunos días cerrados, aquí verán cómo se espera que termine el mes.</div>`;
  }

  html += `<div class="card"><h2>📅 Pagos del mes</h2>
    <p class="hint">Plata apartada para estos pagos: <b>${money(so.fijos)}</b></p>
    <div class="pagos">${pagos.map(p => {
      const estado = p.vencido ? '<span class="pill bad">¿Ya lo pagaron?</span>' : p.alcanza ? '<span class="pill ok">Alcanza ✓</span>' : `<span class="pill warn">Faltan ${money(p.f.monto - p.saldoAntes)}</span>`;
      return `<div class="pago"><span class="ic">${iconoFijo(p.f)}</span><div class="grow"><b>${esc(p.f.nombre)}</b> · ${money(p.f.monto)}<br>
        <span class="small muted">${p.vencido ? 'Era' : 'Se paga'} ${cuando(p.fecha)}</span></div>${estado}</div>`;
    }).join('')}</div>
    <p class="hint">Cuando paguen, toquen <b>Gastos</b> y elijan el pago para descontarlo.</p></div>`;

  html += tarjetaGas();

  html += `<div class="card"><h2>🎯 ¿Cuánto hay que vender al día?</h2>
    <div class="metas">
      <div><div class="lbl">Para cubrir los gastos</div><div class="num">${money(eq.minimo)}</div></div>
      <div><div class="lbl">Para ganar ${money(S().metaPersona)} cada una</div><div class="num">${money(eq.meta)}</div></div>
    </div>
    ${prom ? `<p class="hint mt">De los últimos ${plural(prom.n, 'día')}, ${prom.cs.filter(c => c.venta >= eq.meta).length} llegaron a la meta.</p>` : ''}
    <p class="hint">La meta de ${money(S().metaPersona)} se puede cambiar en Más → Configuración.</p></div>`;

  html += `<div class="card"><h2>🛒 Plata para compras</h2>
    <div class="num-md">${money(so.inversion)}</div>
    <p class="hint">Es lo que se ha separado para insumos y gas, menos lo que ya se compró.</p></div>`;
  return html;
}

function tarjetaGas() {
  const g = infoGas();
  if (!g.compras) {
    return `<div class="card"><h2>🔥 Gas</h2>
      <p class="hint">Cuando cambien el cilindro, toquen "Cambiamos el gas" en el Inicio. Así la app aprende cuánto les dura.</p>
      <button class="btn mt" data-act="gas-hoy">🔥 Cambiamos el gas</button></div>`;
  }
  const est = g.faltan == null ? '' : g.faltan <= 0 ? '<span class="pill bad">Ya debería tocar</span>' : g.faltan <= 2 ? '<span class="pill warn">Pronto</span>' : '<span class="pill ok">Tranquilas</span>';
  return `<div class="card"><div class="row between"><h2 style="margin:0">🔥 Gas</h2>${est}</div>
    <p class="mt">Lo cambiaron <b>${g.diasDesde === 0 ? 'hoy' : `hace ${plural(g.diasDesde, 'día')}`}</b> (${fechaCorta(g.ultima.fecha)}).</p>
    ${g.intervalo ? `<p>Un cilindro les dura unos <b>${Math.round(g.intervalo)} días</b>. El próximo cambio sería <b>${cuando(g.proxima)}</b>.</p>
      <div class="tiles mt">${tile('Cuesta', g.costoProm)}${tile('Por día', g.porDia || 0)}<div class="tile"><div class="t">Dura</div><div class="v">${g.minDuro === g.maxDuro ? g.minDuro : g.minDuro + '–' + g.maxDuro}</div><div class="s">días</div></div></div>`
      : '<p class="hint">Con el próximo cambio la app ya podrá calcular cuánto dura un cilindro.</p>'}
    <details class="help"><summary>Ver todos los cambios</summary>
      <ul class="list">${g.lista.slice().reverse().map(x => { const d = parse(x.fecha); return `
        <li><div class="when"><b>${d.getDate()}</b><span>${MESES[d.getMonth()].slice(0, 3)}</span></div>
        <div class="what"><div class="n">${money(x.monto)}</div><div class="d">${x.duro == null ? 'El que tienen ahora' : `Duró ${plural(x.duro, 'día')}`}</div></div></li>`; }).join('')}</ul></details>
  </div>`;
}

/* ================= MÁS ================= */
function vMas() {
  const ur = db.ultimoRespaldo ? `Última: ${fechaCorta(db.ultimoRespaldo.slice(0, 10))}` : 'Nunca se ha guardado';
  const fila = (ic, t, s, attr, cls = '') => `<button class="menu-row ${cls}" ${attr}><span class="ic">${ic}</span><span class="grow"><b>${t}</b><small>${s}</small></span><span class="chev">›</span></button>`;
  return `<h1 class="page">Más opciones</h1>
    <div class="menu">
      ${fila('💾', 'Guardar una copia', ur + ' · Hágalo cada semana', 'data-act="respaldar"', diasSinRespaldo() >= 7 ? 'alerta' : '')}
      ${fila('♻️', 'Recuperar una copia', 'Si cambian de teléfono o se borró la app', 'data-act="restaurar"')}
      ${fila('📤', 'Informe en PDF', destinatario() ? `Para mandarle a ${esc(destinatario())} por WhatsApp` : 'Para mandar por WhatsApp', 'data-goto="informe"')}
      ${fila('📄', 'Pasar a Excel', 'Descarga todas las cuentas en una tabla', 'data-act="excel"')}
    </div>
    <div class="menu">
      ${fila('📚', 'Cargar meses anteriores', 'Lo que tenían anotado a mano', 'data-goto="historial"')}
      ${fila('⚙️', 'Configuración del negocio', 'Caja, porcentajes, pagos del mes', 'data-goto="config"')}
      ${state.installEvt ? fila('📲', 'Instalar en el teléfono', 'Para abrirla desde la pantalla de inicio', 'data-act="instalar"') : ''}
      ${fila('❓', 'Cómo se usa', 'Repaso rápido de la app', 'data-goto="guia"')}
    </div>
    <p class="hint center mt">Anny · Caja y cuentas · v2.1<br>Los datos están guardados en este teléfono.</p>`;
}

function vConfig() {
  const st = S();
  const sumPct = sum(st.personas, p => p.pct);
  return encabezado('Configuración') + `
  <div class="aviso info"><span class="ic">ℹ️</span><div>Esto normalmente no se toca. Los cambios aplican a los días que se cierren desde ahora.</div></div>
  <div class="card"><h2>La caja</h2>
    <label class="field">Plata con la que abren la caja<div class="money-in"><input id="a-caja" class="input" inputmode="decimal" value="${st.cajaInicial}"></div></label>
    <label class="field">% de la venta para compras (insumos y gas)<input id="a-pct" class="input" inputmode="decimal" value="${st.pctInversion}"></label>
    <label class="field">Taxi de cada día<div class="money-in"><input id="a-taxi" class="input" inputmode="decimal" value="${st.taxiDiario}"></div></label>
    <div class="field">Días que trabajan
      <div class="chips">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button class="chip ${st.diasTrabajo.includes(d) ? 'on' : ''}" data-dow="${d}">${DOW[d]}</button>`).join('')}</div></div>
  </div>

  <div class="card"><h2>Pagos del mes</h2>
    <div class="fijo-row colhead"><span>Nombre</span><span>Monto</span><span>Día</span><span></span></div>
    <div id="fijos">${st.fijos.map(f => `
      <div class="fijo-row" data-fijo="${esc(f.id)}">
        <input class="input sm f-nombre" value="${esc(f.nombre)}">
        <input class="input sm f-monto" inputmode="decimal" value="${f.monto}">
        <input class="input sm f-dia" inputmode="numeric" value="${f.dia}">
        <button class="btn ghost sm" data-del-fijo="1" aria-label="Quitar">✕</button>
      </div>`).join('')}</div>
    <button class="btn sm" data-act="add-fijo">＋ Agregar pago</button>
    <p class="hint mt">"Día" es el día del mes en que se paga. Total ${money(totalFijos())} al mes = <b>${money(apFijosDia())}</b> que se separan cada día de trabajo.</p>
  </div>

  <div class="card"><h2>Salarios</h2>
    <div class="persona-row colhead"><span>Nombre</span><span>% del reparto</span></div>
    ${st.personas.map((p, i) => `<div class="persona-row"><input class="input sm p-nombre" data-i="${i}" value="${esc(p.nombre)}"><input class="input sm p-pct" data-i="${i}" inputmode="decimal" value="${p.pct}"></div>`).join('')}
    ${sumPct !== 100 ? `<div class="aviso warn"><span class="ic">⚠️</span><div>Los porcentajes suman ${sumPct}%; deberían sumar 100%.</div></div>` : ''}
    <label class="field mt">Meta de ganancia diaria por persona<div class="money-in"><input id="a-meta" class="input" inputmode="decimal" value="${st.metaPersona}"></div></label>
  </div>

  <div class="card"><h2>Informe en PDF</h2>
    <label class="field">¿A quién se le manda el informe?<input id="a-dest" class="input" placeholder="Ej.: el dueño" value="${esc(st.destinatarioInforme || '')}"></label>
  </div>

  <div class="card"><h2>Plata que ya tenían separada</h2>
    <p class="hint">La plata apartada se cuenta desde el primer día que cerraron con la app. Si ese día ya tenían algo separado, anótenlo aquí.</p>
    <label class="field">Contar desde<input type="date" id="a-inicio" class="input" value="${st.inicioSaldos || inicioSaldos()}"></label>
    <label class="field">🛒 Para compras<div class="money-in"><input id="a-si-inv" class="input" inputmode="decimal" value="${st.saldosIniciales.inversion}"></div></label>
    <label class="field">📅 Para pagos del mes<div class="money-in"><input id="a-si-fij" class="input" inputmode="decimal" value="${st.saldosIniciales.fijos}"></div></label>
  </div>

  <button class="btn primary xl" data-act="guardar-ajustes">Guardar cambios</button>

  <div class="card mt"><h2>Zona de cuidado</h2>
    <button class="btn danger block" data-act="borrar-todo">Borrar todos los datos</button>
    <p class="hint center mt">Solo úsenlo si quieren empezar de cero. Guarden una copia antes.</p></div>`;
}

function guardarAjustes() {
  const st = S();
  const n = (sel, def) => { const v = num($(sel).value); return isNaN(v) || v < 0 ? def : r2(v); };
  st.cajaInicial = n('#a-caja', st.cajaInicial);
  st.pctInversion = Math.min(100, n('#a-pct', st.pctInversion));
  st.taxiDiario = n('#a-taxi', st.taxiDiario);
  st.metaPersona = n('#a-meta', st.metaPersona);
  st.destinatarioInforme = $('#a-dest').value.trim();
  st.diasTrabajo = $$('[data-dow].on').map(b => +b.dataset.dow);
  if (!st.diasTrabajo.length) st.diasTrabajo = [1, 2, 3, 4, 5];
  st.fijos = $$('#fijos .fijo-row').map(r => ({
    id: r.dataset.fijo,
    nombre: r.querySelector('.f-nombre').value.trim() || 'Pago',
    monto: r2(num(r.querySelector('.f-monto').value) || 0),
    dia: Math.min(31, Math.max(1, parseInt(r.querySelector('.f-dia').value, 10) || 1)),
  }));
  st.personas = $$('.p-nombre').map((el, i) => ({ nombre: el.value.trim() || `Persona ${i + 1}`, pct: n(`.p-pct[data-i="${i}"]`, 0) }));
  st.saldosIniciales = { inversion: n('#a-si-inv', 0), fijos: n('#a-si-fij', 0) };
  const ini = $('#a-inicio').value;
  const tmp = st.inicioSaldos; st.inicioSaldos = ''; const auto = inicioSaldos(); st.inicioSaldos = tmp;
  st.inicioSaldos = ini && ini !== auto ? ini : '';
  guardar();
  toast('Cambios guardados ✓');
  volver();
}

/* ================= HISTORIA (meses anteriores) ================= */
function vHistorial() {
  const t = hoy();
  const ym = state.mesHist;
  const ini = `${ym}-01`, fin = finDeMes(ym);
  const fechas = [];
  for (let d = ini; d <= fin && d < t; d = addDays(d, 1)) if (esLaborable(d) || db.dias[d]) fechas.push(d);
  const cs = cierresEntre(ini, fin);
  const gasMes = db.gastos.filter(g => g.cat === 'gas' && g.fecha >= ini && g.fecha <= fin).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const puedeSig = mesSig(ym) <= t.slice(0, 7);
  return encabezado('Meses anteriores') + `
  <div class="aviso info"><span class="ic">💡</span><div>Copien lo que vendieron cada día según sus anotaciones. Los días vacíos no se guardan.</div></div>

  <div class="card">
    <div class="monthnav"><button data-mesh="-1" aria-label="Mes anterior">‹</button><h2>${mesNombre(ym).replace(/^./, m => m.toUpperCase())}</h2><button data-mesh="1" aria-label="Mes siguiente" ${puedeSig ? '' : 'disabled'}>›</button></div>
    ${fechas.length ? `
    <div class="hist-row colhead"><span>Día</span><span>💵 Efectivo vendido</span><span>📱 Yappy</span><span title="Taxi">🚕</span></div>
    <div id="hist">${fechas.map(f => {
      const c = calc(f);
      const d = parse(f);
      const taxi = gastosDe(f).some(g => g.cat === 'taxi');
      const ef = c ? r2(c.efectivo) : '', ya = c ? r2(c.yappy) : '';
      return `<div class="hist-row" data-f="${f}" data-orig="${ef}|${ya}|${c ? taxi : ''}">
        <div class="when"><b>${d.getDate()}</b><span>${DOW[d.getDay()]}</span></div>
        <input class="input sm h-ef" inputmode="decimal" placeholder="0.00" value="${ef}">
        <input class="input sm h-ya" inputmode="decimal" placeholder="0.00" value="${ya}">
        <input type="checkbox" class="h-tx" ${c ? (taxi ? 'checked' : '') : (+S().taxiDiario > 0 ? 'checked' : '')}>
      </div>`;
    }).join('')}</div>
    <p class="hint">"Efectivo vendido" es lo que quedó en la caja <b>por encima</b> de los ${money(S().cajaInicial)} de base. Si solo anotaron el total del día, pónganlo ahí y dejen Yappy vacío.</p>
    <button class="btn primary xl mt" data-act="guardar-hist">Guardar ${mesNombre(ym)}</button>
    ${cs.length ? `<p class="center mt"><b>${plural(cs.length, 'día')}</b> cargados · Vendieron ${money(sum(cs, c => c.venta))}</p>` : ''}`
    : '<div class="empty">No hay días de trabajo en este mes.</div>'}
  </div>

  <div class="card"><h2>🔥 Cambios de gas en ${MESES[+ym.slice(5) - 1]}</h2>
    ${gasMes.length ? `<ul class="list">${gasMes.map(g => { const d = parse(g.fecha); return `<li><div class="when"><b>${d.getDate()}</b><span>${DOW[d.getDay()]}</span></div><div class="what"><div class="n">${money(g.monto)}</div></div><button class="btn ghost sm" data-del-gasto="${g.id}" aria-label="Borrar">🗑️</button></li>`; }).join('')}</ul>` : '<p class="hint">Si recuerdan cuándo cambiaron el cilindro, anótenlo aquí. Con eso la app calcula cuánto les dura.</p>'}
    <div class="row mt wrap" style="gap:6px">
      <input type="date" id="hg-fecha" class="input sm" min="${ini}" max="${fin < t ? fin : t}" value="${ini}" style="width:auto">
      <div class="money-in grow"><input id="hg-monto" class="input sm" inputmode="decimal" placeholder="Costo"></div>
      <button class="btn sm" data-act="add-gas-hist">Agregar</button>
    </div>
  </div>

  <details class="card plegable"><summary><h2>📄 ¿Lo tienen en Excel?</h2></summary>
    <p class="hint">Descarguen la plantilla, llénenla en Excel (una fila por día), guárdenla como <b>CSV</b> e impórtenla aquí.</p>
    <div class="row mt wrap">
      <button class="btn grow" data-act="plantilla">⬇️ Descargar plantilla</button>
      <button class="btn grow" data-act="importar-csv">⬆️ Importar CSV</button>
    </div>
  </details>`;
}

function guardarHistorial() {
  let n = 0, err = 0;
  for (const row of $$('#hist .hist-row')) {
    const f = row.dataset.f;
    const efTxt = row.querySelector('.h-ef').value.trim(), yaTxt = row.querySelector('.h-ya').value.trim();
    const tx = row.querySelector('.h-tx').checked;
    if (!efTxt && !yaTxt) continue;
    const ef = efTxt ? num(efTxt) : 0, ya = yaTxt ? num(yaTxt) : 0;
    if (isNaN(ef) || isNaN(ya)) { err++; row.querySelector('.h-ef').style.borderColor = 'var(--red)'; continue; }
    if (row.dataset.orig === `${r2(ef)}|${r2(ya)}|${tx}`) continue;
    const taxiPrev = gastosDe(f).find(g => g.cat === 'taxi');
    guardarDiaHist(f, ef, ya, tx ? (taxiPrev ? taxiPrev.monto : +S().taxiDiario) : 0);
    n++;
  }
  if (err) { toast('Revisen los números marcados en rojo'); return; }
  guardar();
  toast(n ? `${n} ${n === 1 ? 'día guardado' : 'días guardados'} ✓` : 'No había cambios');
  render();
}

function agregarGasHist() {
  const f = $('#hg-fecha').value;
  const m = num($('#hg-monto').value);
  if (!f) { toast('Elijan la fecha'); return; }
  if (isNaN(m) || m <= 0) { toast('Escriban el costo del gas'); $('#hg-monto').focus(); return; }
  db.gastos.push({ id: uid(), fecha: f, cat: 'gas', concepto: 'Gas', monto: r2(m), deCaja: false });
  guardar(); toast('Cambio de gas anotado 🔥'); render();
}

/* ================= Eventos ================= */
document.addEventListener('click', e => {
  const b = e.target.closest('button, [data-ver-dia]');
  if (!b) return;
  const ds = b.dataset;
  if (ds.tab) { state.pila = []; if (ds.tab === 'vamos' || ds.tab === 'gastos') state.mes = hoy().slice(0, 7); return irA(ds.tab); }
  if (ds.goto) { if (ds.goto === 'vamos') state.mes = hoy().slice(0, 7); return irA(ds.goto); }
  if (ds.cerrar) return iniciarCierre(ds.cerrar);
  if (ds.verDia) { state.diaVer = ds.verDia; return irA('dia'); }
  if (ds.pagar) return nuevoGasto('fijo:' + ds.pagar);
  if (ds.nuevoGasto) return nuevoGasto(ds.nuevoGasto);
  if (ds.vamos) { state.vamosTab = ds.vamos; return render(); }
  if (ds.infMes) { const l = mesesConDatos(); const i = l.indexOf(state.mes) + (ds.infMes === '1' ? 1 : -1); if (l[i]) state.mes = l[i]; return render(); }
  if (ds.mes) { const nm = ds.mes === '1' ? mesSig(state.mes) : mesAnt(state.mes); if (state.view === 'gastos' || nm <= hoy().slice(0, 7)) state.mes = nm; return render(); }
  if (ds.mesh) { const nm = ds.mesh === '1' ? mesSig(state.mesHist) : mesAnt(state.mesHist); if (nm <= hoy().slice(0, 7)) state.mesHist = nm; return render(); }
  if (ds.cuando) { state.gasto.cuando = ds.cuando; return render(); }
  if (ds.decaja) { state.gasto.deCaja = ds.decaja === '1'; return render(); }
  if (ds.otraCat) { state.wiz.otraCat = ds.otraCat; const m = $('#w-otra-monto') && $('#w-otra-monto').value; render(); if (m) $('#w-otra-monto').value = m; return; }
  if (ds.quitarSalida) { state.wiz.salidas.splice(+ds.quitarSalida, 1); return render(); }
  if (ds.dow !== undefined) return b.classList.toggle('on');
  if (ds.delFijo) { b.closest('.fijo-row').remove(); return; }
  if (ds.delGasto) {
    const g = db.gastos.find(x => x.id === ds.delGasto);
    if (g && confirm(`¿Borrar "${g.cat === 'otro' ? g.concepto : catInfo(g).nombre}" de ${money(g.monto)}?`)) { db.gastos = db.gastos.filter(x => x !== g); guardar(); toast('Borrado'); render(); }
    return;
  }
  switch (ds.act) {
    case 'volver': return volver();
    case 'empezar': db.bienvenida = true; guardar(); return render();
    case 'salir-cierre': if (!wizConDatos() || confirm('¿Salir sin guardar el cierre?')) { state.wiz = null; state.pila = []; irA('inicio'); } return;
    case 'wiz-sig': return wizSiguiente();
    case 'sin-yappy': state.wiz.yappy = '0'; return wizSiguiente();
    case 'toggle-taxi': state.wiz.taxi = !state.wiz.taxi; return render();
    case 'otra-salida': state.wiz.otra = true; render(); setTimeout(() => $('#w-otra-monto') && $('#w-otra-monto').focus(), 50); return;
    case 'add-salida': {
      const w = state.wiz;
      const m = num($('#w-otra-monto').value);
      if (isNaN(m) || m <= 0) { toast('Escriban cuánto fue'); $('#w-otra-monto').focus(); return; }
      const g = { monto: r2(m) };
      if (w.otraCat.startsWith('fijo:')) { g.cat = 'fijo'; g.fijoId = w.otraCat.slice(5); const f = S().fijos.find(x => x.id === g.fijoId); g.concepto = f ? f.nombre : 'Pago fijo'; }
      else if (w.otraCat === 'otro') { g.cat = 'otro'; g.concepto = ($('#w-otra-que').value || '').trim() || 'Otro gasto'; }
      else { g.cat = w.otraCat; g.concepto = catInfo(g).nombre; }
      w.salidas.push(g); w.otra = false; return render();
    }
    case 'guardar-cierre': return guardarCierre();
    case 'corregir-dia': return iniciarCierre(state.diaVer);
    case 'borrar-dia':
      if (confirm(`¿Borrar el cierre del ${fechaLarga(state.diaVer)}? Los gastos de ese día se mantienen.`)) { delete db.dias[state.diaVer]; guardar(); toast('Cierre borrado'); volver(); }
      return;
    case 'gas-hoy': return nuevoGasto('gas');
    case 'guardar-gasto': return guardarGasto();
    case 'guardar-ajustes': return guardarAjustes();
    case 'add-fijo': {
      const div = document.createElement('div');
      div.className = 'fijo-row'; div.dataset.fijo = uid();
      div.innerHTML = `<input class="input sm f-nombre" placeholder="Nombre"><input class="input sm f-monto" inputmode="decimal" placeholder="0.00"><input class="input sm f-dia" inputmode="numeric" value="1"><button class="btn ghost sm" data-del-fijo="1" aria-label="Quitar">✕</button>`;
      $('#fijos').appendChild(div); div.querySelector('input').focus();
      return;
    }
    case 'informe-enviar': return informeEnviar(false);
    case 'informe-ver': return informeEnviar(true);
    case 'respaldar': return respaldar();
    case 'excel': return exportarExcel();
    case 'restaurar': return $('#file-restore').click();
    case 'instalar':
      if (state.installEvt) { state.installEvt.prompt(); state.installEvt.userChoice.finally(() => { state.installEvt = null; render(); }); }
      return;
    case 'guardar-hist': return guardarHistorial();
    case 'add-gas-hist': return agregarGasHist();
    case 'plantilla': return descargarPlantilla();
    case 'importar-csv': {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.csv,.txt,text/csv,text/plain';
      inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => importarCSV(rd.result); rd.readAsText(f, 'utf-8'); };
      inp.click(); return;
    }
    case 'borrar-todo':
      if (confirm('¿Seguro? Se borrarán todos los cierres y gastos de este teléfono.') && confirm('Última confirmación: ¿ya guardaron una copia? Esto no se puede deshacer.')) {
        localStorage.removeItem(KEY); db = nuevaBase(); db.bienvenida = true; guardar(); toast('Datos borrados'); state.pila = []; irA('inicio');
      }
      return;
  }
});

$('#file-restore').addEventListener('change', e => { const f = e.target.files[0]; if (f) restaurar(f); e.target.value = ''; });

/* Botón "atrás" del teléfono: navega dentro de la app en vez de cerrarla */
history.replaceState({ anny: 'base' }, '');
history.pushState({ anny: 'app' }, '');
window.addEventListener('popstate', () => {
  if (volver()) history.pushState({ anny: 'app' }, '');
  else history.back();
});

/* Ofrecer instalar la app */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.installEvt = e; if (state.view === 'inicio' || state.view === 'mas') render(); });
window.addEventListener('appinstalled', () => { state.installEvt = null; toast('App instalada ✓'); });

/* Si la app queda abierta de un día para otro, refrescar */
let ultimoDia = hoy();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && hoy() !== ultimoDia) {
    ultimoDia = hoy();
    if (state.view === 'inicio') render();
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
