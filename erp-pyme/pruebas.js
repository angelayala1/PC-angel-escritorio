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
  const doc = erp.emitirVenta({ tipo: 'factura', terceroId: 'TER-1', lineas: [{ productoId: 'PRO-3', cantidad: 2 }] });
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
