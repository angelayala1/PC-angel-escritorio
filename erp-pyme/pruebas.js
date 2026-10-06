// Pruebas del núcleo: node pruebas.js
const assert = require('assert');
const { ERP, validarRut, rutDesdeNumero } = require('./nucleo.js');

const memoria = () => { const m = {}; return { leer: (k) => m[k], escribir: (k, v) => (m[k] = v) }; };
const nuevo = () => new ERP({ almacen: memoria(), hoy: '2026-10-02' });
const prueba = (nombre, fn) => { try { fn(); console.log('✓', nombre); } catch (e) { console.error('✗', nombre, '\n ', e.message); process.exitCode = 1; } };

prueba('RUT: valida dígito verificador', () => {
  assert(validarRut('11.111.111-1'));
  assert(!validarRut('11.111.111-2'));
  assert(validarRut(rutDesdeNumero(76543210)));
});

prueba('Contabilidad: todos los asientos cuadran y el balance suma cero', () => {
  const erp = nuevo();
  for (const a of erp.d.asientos) {
    const d = a.lineas.reduce((s, l) => s + (l.debe || 0), 0), h = a.lineas.reduce((s, l) => s + (l.haber || 0), 0);
    assert.strictEqual(d, h, a.glosa);
  }
  assert.strictEqual(Object.values(erp.saldos()).reduce((s, v) => s + v, 0), 0);
});

prueba('Venta: folio correlativo, IVA 19%, rebaja stock y crea postventa', () => {
  const erp = nuevo();
  const stock = erp.buscar('productos', 'PRO-3').stock;
  const folioPrevio = erp.d.folios.factura;
  const tickets = erp.d.tickets.length;
  const doc = erp.emitirVenta({ tipo: 'factura', terceroId: 'TER-1', ordenCompra: 'OC-1', lineas: [{ productoId: 'PRO-3', cantidad: 2 }] });
  assert.strictEqual(doc.folio, folioPrevio + 1);
  assert.strictEqual(doc.neto, 7000);
  assert.strictEqual(doc.iva, 1330);
  assert.strictEqual(erp.buscar('productos', 'PRO-3').stock, stock - 2);
  assert.strictEqual(erp.d.tickets.length, tickets + 1);
});

prueba('Venta: factura sin cliente y stock insuficiente se rechazan', () => {
  const erp = nuevo();
  assert.throws(() => erp.emitirVenta({ tipo: 'factura', lineas: [{ productoId: 'PRO-3', cantidad: 1 }] }));
  assert.throws(() => erp.emitirVenta({ tipo: 'boleta', lineas: [{ productoId: 'PRO-3', cantidad: 9999 }] }), /Stock insuficiente/);
});

prueba('Nota de crédito revierte stock y no permite doble anulación', () => {
  const erp = nuevo();
  const doc = erp.emitirVenta({ tipo: 'boleta', lineas: [{ productoId: 'PRO-3', cantidad: 2 }] });
  const stock = erp.buscar('productos', 'PRO-3').stock;
  erp.emitirNotaCredito(doc.id, 'Error de digitación');
  assert.strictEqual(erp.buscar('productos', 'PRO-3').stock, stock + 2);
  assert.throws(() => erp.emitirNotaCredito(doc.id, 'otra vez'));
  assert.strictEqual(Object.values(erp.saldos()).reduce((s, v) => s + v, 0), 0);
});

prueba('Marketing: gasto de compras y ventas de clientes atribuidos alimentan el ROI', () => {
  const erp = nuevo();
  const r = erp.resultadoCampana('CAM-1');
  assert.strictEqual(r.gasto, 180000);
  assert.strictEqual(r.clientes, 1);
  assert(r.ventas > 0);
  assert(erp.audiencia().every((t) => t.consentimientoDatos));
});

prueba('RR.HH.: valida jornada máxima y sueldo mínimo', () => {
  const erp = nuevo();
  const base = { nombre: 'X', rut: rutDesdeNumero(12345678), cargo: 'Y', fechaIngreso: '2026-10-01', tipoContrato: 'indefinido', afp: 'Uno', jornadaSemanal: 42, sueldoBase: 600000 };
  assert.throws(() => erp.guardarEmpleado({ ...base, jornadaSemanal: 45 }), /jornada/);
  assert.throws(() => erp.guardarEmpleado({ ...base, sueldoBase: 300000 }), /mínimo/);
  assert.ok(erp.guardarEmpleado(base).id);
});

prueba('Liquidación: líquido coherente y asiento a remuneraciones', () => {
  const erp = nuevo();
  const l = erp.calcularLiquidacion('EMP-1');
  assert.strictEqual(l.imponible, l.base + l.gratificacion);
  assert.strictEqual(l.liquido, l.imponible - l.afp - l.salud - l.cesantia - l.impuesto + l.noImponibles);
  assert(l.costoEmpresa > l.imponible);
  assert.throws(() => erp.emitirLiquidacion('EMP-1', '2026-09'), /Ya existe/);
});

prueba('Configuración: núcleo legal no se desactiva, campos personalizados acotados', () => {
  const erp = nuevo();
  assert.throws(() => erp.activarModulo('finanzas', false));
  assert.throws(() => erp.activarModulo('rrhh', false));
  erp.activarModulo('marketing', false);
  for (let i = erp.d.config.camposPersonalizados.tercero.length; i < 8; i++) erp.agregarCampo('tercero', { etiqueta: 'Campo ' + i, tipo: 'texto' });
  assert.throws(() => erp.agregarCampo('tercero', { etiqueta: 'Uno más', tipo: 'texto' }), /Máximo/);
});

prueba('Producción: orden terminada consume insumos y suma producto', () => {
  const erp = nuevo();
  const op = erp.d.ordenes[0];
  const harina = erp.buscar('productos', 'PRO-1').stock;
  const pan = erp.buscar('productos', 'PRO-3').stock;
  erp.cambiarEstadoOrden(op.id, 'en_proceso');
  assert.throws(() => erp.cambiarEstadoOrden(op.id, 'planificada'), /Transición/);
  erp.cambiarEstadoOrden(op.id, 'terminada');
  assert.strictEqual(erp.buscar('productos', 'PRO-3').stock, pan + 60);
  assert(erp.buscar('productos', 'PRO-1').stock < harina);
});

prueba('Dirección: indicadores y alertas cruzadas', () => {
  const erp = nuevo();
  const i = erp.indicadores();
  assert(i.ventasNetas > 0 && i.porCobrarVencido > 0);
  const modulos = new Set(erp.alertas().map((a) => a.modulo));
  ['rrhh', 'finanzas', 'produccion', 'comercial', 'marketing'].forEach((m) => assert(modulos.has(m), 'falta alerta de ' + m));
});

// --- Hallazgos de la investigación (oct-2026) ---------------------------------
const cuadra = (erp) => Object.values(erp.saldos()).reduce((s, v) => s + v, 0) === 0;

prueba('Acuse de recibo: 8 días para reclamar una factura recibida', () => {
  const erp = nuevo();
  const pendiente = erp.d.documentos.find((d) => d.tipo === 'factura_compra' && erp.estadoAcuse(d) === 'pendiente');
  assert(pendiente, 'la demo trae una factura pendiente');
  assert.strictEqual(erp.diasParaReclamar(pendiente), 2);
  assert(erp.alertas().some((a) => a.nivel === 'critica' && a.mensaje.includes(`Factura ${pendiente.folio}`)));
  const stock = erp.buscar('productos', 'PRO-1').stock;
  erp.acusarCompra(pendiente.id, 'reclamar', 'Faltaron 2 sacos');
  assert.strictEqual(erp.buscar('productos', 'PRO-1').stock, stock - 6);
  assert(cuadra(erp));
  assert(!erp.cuentasPendientes('compra').some((d) => d.id === pendiente.id));
  const vieja = new ERP({ almacen: memoria(), hoy: '2026-10-20' });
  const tacita = vieja.d.documentos.find((d) => d.folio === pendiente.folio);
  assert.strictEqual(vieja.estadoAcuse(tacita), 'pendiente');
  vieja._hoy = '2026-10-30';
  assert.strictEqual(vieja.estadoAcuse(tacita), 'aceptada_tacita');
  assert.throws(() => vieja.acusarCompra(tacita.id, 'reclamar', 'x'), /8 días/);
});

prueba('Honorarios: retención 15,25 % y entra al F29', () => {
  const erp = nuevo();
  const b = erp.registrarCompra({ terceroId: 'TER-6', folioProveedor: '999', destino: 'honorarios', montoNeto: 100000 });
  assert.strictEqual(b.retencion, 15250);
  assert.strictEqual(b.total, 84750);
  assert.strictEqual(b.iva, 0);
  assert(erp.resumenIVA().retenciones >= 15250);
  assert(cuadra(erp));
});

prueba('Gasto personal del dueño va a retiros, no a gastos ni a IVA crédito', () => {
  const erp = nuevo();
  const antes = erp.indicadores().resultadoOperacional;
  const r = erp.registrarCompra({ terceroId: 'TER-4', folioProveedor: 'P-1', destino: 'retiro', montoNeto: 50000 });
  assert.strictEqual(r.iva, 0);
  assert.strictEqual(erp.indicadores().resultadoOperacional, antes);
  assert.strictEqual(erp.saldos()['3102'], 50000);
});

prueba('Liquidación: SIS incluido en la reforma (3,5 %) y tope de cesantía aparte', () => {
  const erp = nuevo();
  const l = erp.calcularLiquidacion('EMP-1');
  assert.strictEqual(l.aportesEmpleador.sis, 0);
  assert.strictEqual(l.aportesEmpleador.reforma, Math.round(l.imponible * 0.035));
  erp.guardarEmpleado({ ...erp.buscar('empleados', 'EMP-1'), sueldoBase: 5000000 });
  const alta = erp.calcularLiquidacion('EMP-1');
  assert.strictEqual(alta.afp, Math.round(90 * 39500 * (0.10 + 0.0058)));
  assert.strictEqual(alta.cesantia, Math.round(Math.min(alta.imponible, 135.2 * 39500) * 0.006));
});

prueba('Umbrales: sala cuna se anticipa por número de trabajadoras', () => {
  const erp = nuevo();
  const sala = () => erp.umbrales().find((u) => u.medida === 'trabajadoras');
  assert.strictEqual(sala().estado, 'lejos');
  for (let i = 0; i < 17; i++) erp.guardarEmpleado({ nombre: 'T' + i, rut: rutDesdeNumero(21000000 + i), cargo: 'Venta', fechaIngreso: '2026-10-01', fechaFirmaContrato: '2026-10-01', tipoContrato: 'indefinido', afp: 'Uno', jornadaSemanal: 42, sueldoBase: 600000, sexo: 'F' });
  assert.strictEqual(sala().estado, 'cerca');
  assert(erp.alertas().some((a) => a.mensaje.includes('Sala cuna')));
  assert.strictEqual(erp.umbrales().find((u) => u.umbral === 10).estado, 'activa');
});

prueba('Orden de compra exigida, retracto y supresión de datos', () => {
  const erp = nuevo();
  assert.throws(() => erp.emitirVenta({ tipo: 'factura', terceroId: 'TER-1', lineas: [{ productoId: 'PRO-3', cantidad: 1 }] }), /orden de compra/);
  const b = erp.emitirVenta({ tipo: 'boleta', terceroId: 'TER-2', lineas: [{ productoId: 'PRO-3', cantidad: 1 }] });
  assert(/Dentro del plazo de retracto/.test(erp.crearTicket({ terceroId: 'TER-2', documentoId: b.id, tipo: 'retracto', descripcion: 'Compra web' }).observacion));
  erp.suprimirDatosPersonales('TER-2', 'Correo del cliente');
  const t = erp.buscar('terceros', 'TER-2');
  assert(!t.email && t.bajaComunicaciones && t.rut);
  assert(!erp.audiencia().some((x) => x.id === 'TER-2'));
  const nuevoCliente = erp.guardarTercero({ nombre: 'Luis', rut: rutDesdeNumero(18222333), consentimientoDatos: true });
  assert.strictEqual(nuevoCliente.fechaConsentimiento, '2026-10-02');
});

prueba('Datos guardados con la versión anterior se migran', () => {
  const almacen = memoria();
  const viejo = new ERP({ almacen, hoy: '2026-10-02' });
  delete viejo.d.config.legal.topeCesantiaUF;
  viejo.d.documentos.filter((d) => d.clase === 'compra').forEach((d) => delete d.estadoAcuse);
  viejo.guardar();
  const erp = new ERP({ almacen, hoy: '2026-10-02' });
  assert.strictEqual(erp.d.config.legal.topeCesantiaUF, 135.2);
  assert(erp.d.documentos.filter((d) => d.clase === 'compra').every((d) => d.estadoAcuse === 'aceptada'));
});
