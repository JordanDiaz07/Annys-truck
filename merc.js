/* Anny · Caja y cuentas — mercancía: lo que llevan, lo que vuelve a casa y cuánto conviene llevar.
   Todo se calcula en el teléfono con lo que ya anotaron; no usa internet.
   Cada día cerrado puede traer dia.merc = { llevada, volvio, agoto, lluvia, evento }.
   Los días sin ese dato (historial viejo o días que saltaron la pregunta) simplemente no cuentan. */
'use strict';

const MERC_MIN_DIAS = 3;            // días anotados de un mismo día de la semana antes de dar una sugerencia
const MERC_MIN_DIAS_BALANCE = 15;   // días anotados (≈ 3 semanas) antes de comparar lo gastado con lo apartado

/* Días cerrados que tienen anotada la mercancía, ordenados por fecha */
function diasConMerc() {
  return fechasCerradas().filter(f => db.dias[f].merc).map(f => ({ fecha: f, dow: parse(f).getDay(), ...db.dias[f].merc }));
}

const prom = (arr, f) => arr.length ? sum(arr, f) / arr.length : 0;
const pctDe = (parte, total) => total > 0 ? Math.round(100 * parte / total) : 0;

/* Lo que se muestra en las casillas del cierre para un día (vacío si no tiene mercancía anotada) */
function camposMercDelDia(fecha) {
  const m = db.dias[fecha] && db.dias[fecha].merc;
  return {
    llevada: m ? String(m.llevada) : '', volvio: m ? String(m.volvio) : '',
    agoto: !!(m && m.agoto), lluvia: !!(m && m.lluvia), evento: !!(m && m.evento),
  };
}

/* Presupuesto de compras para los próximos días de trabajo (una semana), a partir de la fecha indicada (inclusive).
   Suma lo que sugiere llevar cada día más el gas y lo compara con la plata apartada para compras.
   Solo se da cuando TODOS esos días ya tienen sugerencia: un total con días faltantes engañaría. */
function presupuestoSemana(desde, { gasDia } = {}) {
  const fechas = [];
  for (let d = desde, k = 0; fechas.length < S().diasTrabajo.length && k < 21; d = addDays(d, 1), k++) if (esLaborable(d)) fechas.push(d);
  if (!fechas.length) return { listo: false, tengo: 0, total: 0 };
  const sug = fechas.map(f => sugerenciaDia(parse(f).getDay()));
  const listos = sug.filter(s => s.listo).length;
  if (listos < fechas.length) return { listo: false, tengo: listos, total: fechas.length };
  const gas = (gasDia != null ? gasDia : infoGas().porDia) || 0;
  const mercancia = r2(sum(sug, s => s.monto)), gastoGas = r2(gas * fechas.length), total = r2(mercancia + gastoGas);
  const disponible = r2(sobres().inversion);
  return {
    listo: true, dias: fechas.length, mercancia, gas: gastoGas, total, disponible,
    diferencia: r2(disponible - total), alcanza: disponible >= total - 0.005,
    diasAlcanza: total > 0 ? Math.max(0, Math.floor(disponible / (total / fechas.length))) : 0,
  };
}

/* ¿Alcanza lo que apartan para compras? Compara lo que realmente gastan (mercancía usada + gas) con lo apartado
   (el % de inversión de cada día). Solo informa: el porcentaje lo cambian ellas en Configuración.
   gasDia = costo del gas por día de trabajo; si no se indica, sale de los cambios de gas anotados (0 si aún no hay dos). */
function balanceInversion({ gasDia } = {}) {
  const ds = diasConMerc();
  if (ds.length < MERC_MIN_DIAS_BALANCE) return { listo: false, dias: ds.length, faltan: MERC_MIN_DIAS_BALANCE - ds.length };
  const gasAnotado = gasDia != null ? gasDia : infoGas().porDia;
  const gas = gasAnotado || 0, n = ds.length;
  const cs = ds.map(d => calc(d.fecha));
  const venta = sum(cs, c => c.venta), apartado = sum(cs, c => c.inversion);
  const usada = sum(ds, d => d.llevada - d.volvio);
  const difDia = (apartado - (usada + gas * n)) / n;
  return {
    listo: true, dias: n, usadaDia: r2(usada / n), gasDia: r2(gas), sinGas: !gasAnotado,
    pctReal: pctDe(usada + gas * n, venta), pctApartado: pctDe(apartado, venta),
    difDia: r2(difDia), difMes: r2(difDia * diasLabMes()),
  };
}

/* Cuánto vendieron por cada $1 de mercancía que realmente usaron (llevado − lo que volvió). Sirve para revisar precios. */
function rendimientoMerc() {
  const ds = diasConMerc();
  const usada = sum(ds, d => d.llevada - d.volvio);
  if (ds.length < MERC_MIN_DIAS || usada <= 0) return null;
  return { dias: ds.length, porDolar: r2(sum(ds, d => calc(d.fecha).venta) / usada) };
}

/* Todo lo que lleva el informe del mes sobre la mercancía, contrastado con lo que se vendió esos días.
   Devuelve null si el mes no tiene ningún día con mercancía anotada (entonces el informe no trae la sección). */
function informeMerc(ym) {
  const ds = diasConMerc().filter(d => d.fecha.slice(0, 7) === ym).map(d => ({ ...d, venta: calc(d.fecha).venta }));
  if (!ds.length) return null;
  const llevada = r2(sum(ds, d => d.llevada)), volvio = r2(sum(ds, d => d.volvio)), venta = r2(sum(ds, d => d.venta));
  const pctSobra = pctDe(volvio, llevada), volvioDia = r2(volvio / ds.length);
  const ant = resumenMerc(`${mesAnt(ym)}-01`, finDeMes(mesAnt(ym)));
  const anterior = ant.dias ? { dias: ant.dias, pctSobra: ant.pctSobra, volvioDia: r2(ant.volvio / ant.dias) } : null;
  const dows = [...new Set(ds.map(d => d.dow))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));   // lunes primero
  return {
    dias: ds.length, llevada, volvio, pctSobra, volvioDia, venta,
    usada: r2(llevada - volvio), pctUsadaVenta: pctDe(llevada - volvio, venta),
    anterior,
    difPuntos: anterior ? pctSobra - anterior.pctSobra : null,
    difVolvioDia: anterior ? r2(volvioDia - anterior.volvioDia) : null,
    porDia: dows.map(dow => {
      const xs = ds.filter(d => d.dow === dow);
      return {
        dow, n: xs.length, ventaProm: r2(prom(xs, d => d.venta)), llevaProm: r2(prom(xs, d => d.llevada)),
        volvioProm: r2(prom(xs, d => d.volvio)), pctSobra: pctDe(sum(xs, d => d.volvio), sum(xs, d => d.llevada)),
      };
    }),
    diario: ds.map(d => ({ fecha: d.fecha, venta: r2(d.venta), llevada: d.llevada, volvio: d.volvio })),
  };
}

/* Días de pago: la quincena (del 15 al 17) y el fin de mes (del 30 al 2) */
function esDiaDePago(fecha) {
  const d = parse(fecha).getDate();
  return (d >= 15 && d <= 17) || d >= 30 || d <= 2;
}

const FACTORES = [
  { clave: 'lluvia', con: d => d.lluvia },
  { clave: 'evento', con: d => d.evento },
  { clave: 'pago', con: d => esDiaDePago(d.fecha) },
];

/* Cómo cambian las ventas y lo que sobra en los días con lluvia, feria o cerca de pago.
   Cada día con la marca se compara solo con días del MISMO día de la semana sin la marca (un viernes de feria
   contra viernes normales); si no, la feria parecería vender más solo porque cayó en viernes.
   Solo con días que tienen la mercancía anotada y solo si hay al menos 3 con la marca y 3 de comparación. */
function efectoFactores() {
  const ds = diasConMerc().map(d => ({ ...d, venta: calc(d.fecha).venta }));
  const out = [];
  for (const { clave, con } of FACTORES) {
    const conMarca = [], comparados = new Set();
    let vCon = 0, vRef = 0, llCon = 0, voCon = 0, llRef = 0, voRef = 0;
    for (const d of ds.filter(con)) {
      const ref = ds.filter(x => !con(x) && x.dow === d.dow);
      if (!ref.length) continue;
      conMarca.push(d);
      ref.forEach(x => comparados.add(x.fecha));
      vCon += d.venta; vRef += prom(ref, x => x.venta);
      llCon += d.llevada; voCon += d.volvio;
      llRef += prom(ref, x => x.llevada); voRef += prom(ref, x => x.volvio);
    }
    if (conMarca.length < MERC_MIN_DIAS || comparados.size < MERC_MIN_DIAS) continue;
    out.push({
      clave, nCon: conMarca.length, nSin: comparados.size,
      difVenta: vRef > 0 ? Math.round(100 * (vCon - vRef) / vRef) : 0,
      sobraCon: pctDe(voCon, llCon), sobraSin: pctDe(voRef, llRef),
      // Lo mismo en dinero, por cada día con la marca
      difVentaDia: r2((vCon - vRef) / conMarca.length),
      sobraConDia: r2(voCon / conMarca.length), sobraSinDia: r2(voRef / conMarca.length),
    });
  }
  return out;
}

/* Revisa lo que escribieron en el cierre (textos) y lo convierte en datos listos para guardar.
   Devuelve { ok: true, merc } (merc = null si saltaron la pregunta) o { ok: false, campo, error }. */
function validarMerc({ llevada = '', volvio = '', agoto = false, lluvia = false, evento = false } = {}) {
  const vacio = v => String(v).trim() === '';
  if (vacio(llevada) && vacio(volvio) && !agoto && !lluvia && !evento) return { ok: true, merc: null };
  const mal = (campo, error) => ({ ok: false, campo, error });
  const ll = vacio(llevada) ? NaN : num(llevada);
  if (isNaN(ll) || ll <= 0) return mal('llevada', 'Escriban cuánto costó lo que llevaron hoy (un número mayor que cero).');
  if (vacio(volvio)) return mal('volvio', 'Escriban cuánto volvió a casa. Si no sobró nada, toquen «No sobró nada».');
  const vo = num(volvio);
  if (isNaN(vo) || vo < 0) return mal('volvio', 'Revisen lo que volvió: tiene que ser un número, o cero si no sobró nada.');
  if (vo > ll) return mal('volvio', 'No puede volver más de lo que llevaron. Revisen los dos montos.');
  return { ok: true, merc: { llevada: r2(ll), volvio: r2(vo), agoto: !!agoto, lluvia: !!lluvia, evento: !!evento } };
}

/* Lo llevado y lo que volvió entre dos fechas (solo días con la mercancía anotada) */
function resumenMerc(desde, hasta) {
  const ds = diasConMerc().filter(d => d.fecha >= desde && d.fecha <= hasta);
  const llevada = r2(sum(ds, d => d.llevada)), volvio = r2(sum(ds, d => d.volvio));
  return { dias: ds.length, llevada, volvio, pctSobra: pctDe(volvio, llevada) };
}

/* Cuánta mercancía conviene llevar un día de la semana (dow: 0 = domingo … 6 = sábado).
   Se usa lo que realmente se gastó (llevado − lo que volvió) más un colchón. */
function sugerenciaDia(dow) {
  const ds = diasConMerc().filter(d => d.dow === dow);
  const tengo = ds.length;
  if (tengo < MERC_MIN_DIAS) return { listo: false, tengo, faltan: MERC_MIN_DIAS - tengo };
  // Si en 1 de cada 3 días (o más) se acabó todo, ese día se queda corto: colchón mayor
  const seAcabo = ds.filter(d => d.agoto).length;
  const colchon = seAcabo * 3 >= tengo ? 20 : 10;
  const llevada = sum(ds, d => d.llevada), volvio = sum(ds, d => d.volvio);
  return {
    listo: true, tengo, colchon,
    llevaHoy: r2(prom(ds, d => d.llevada)),
    monto: r2(prom(ds, d => d.llevada - d.volvio) * (1 + colchon / 100)),
    pctSobra: llevada > 0 ? Math.round(100 * volvio / llevada) : 0,
    volvioProm: r2(prom(ds, d => d.volvio)),   // lo que ese porcentaje es en dinero, por día
  };
}
