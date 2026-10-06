/*
 * Núcleo del ERP Pyme — lógica de negocio sin interfaz.
 *
 * Idea central: todos los módulos escriben sobre UN solo modelo de datos y cada
 * operación relevante dispara efectos en los demás módulos (la información
 * "conversa"). Ej.: emitir una factura descuenta stock (Producción), genera el
 * asiento contable (Finanzas), alimenta el ROI de la campaña que trajo al
 * cliente (Marketing) y agenda un seguimiento de postventa (Comercial).
 *
 * Marco legal de referencia: Chile. Los parámetros legales son valores
 * REFERENCIALES configurables; deben validarse con contador/abogado y con las
 * tasas vigentes (SII, Previred, Dirección del Trabajo) antes de uso real.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  const redondear = (n) => Math.round(Number(n) || 0);
  const hoyISO = () => new Date().toISOString().slice(0, 10);
  const sumarDias = (iso, dias) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  };
  const diasEntre = (desde, hasta) =>
    Math.round((new Date(hasta + 'T00:00:00Z') - new Date(desde + 'T00:00:00Z')) / 86400000);
  const periodoDe = (iso) => iso.slice(0, 7); // 'YYYY-MM'

  // RUT chileno (módulo 11)
  const limpiarRut = (r) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
  function dvRut(cuerpo) {
    let suma = 0, mult = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
      suma += Number(cuerpo[i]) * mult;
      mult = mult === 7 ? 2 : mult + 1;
    }
    const r = 11 - (suma % 11);
    return r === 11 ? '0' : r === 10 ? 'K' : String(r);
  }
  function validarRut(r) {
    const c = limpiarRut(r);
    return c.length >= 2 && /^\d+$/.test(c.slice(0, -1)) && dvRut(c.slice(0, -1)) === c.slice(-1);
  }
  function formatearRut(r) {
    const c = limpiarRut(r);
    if (c.length < 2) return r;
    return c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1);
  }
  const rutDesdeNumero = (n) => formatearRut(String(n) + dvRut(String(n)));

  // ---------------------------------------------------------------------------
  // Catálogos estándar (lo que NO se personaliza: garantiza procesos uniformes)
  // ---------------------------------------------------------------------------
  const PLAN_CUENTAS = {
    '1101': 'Caja y bancos',
    '1103': 'Clientes',
    '1104': 'IVA crédito fiscal',
    '1105': 'Existencias',
    '2101': 'Proveedores',
    '2102': 'IVA débito fiscal',
    '2103': 'Remuneraciones por pagar',
    '2104': 'Cotizaciones previsionales por pagar',
    '2105': 'Impuesto único por pagar',
    '2106': 'Retenciones de honorarios por pagar',
    '3101': 'Capital',
    '3102': 'Retiros del dueño',
    '4101': 'Ventas',
    '5101': 'Costo de ventas',
    '5201': 'Remuneraciones',
    '5202': 'Gastos de marketing',
    '5203': 'Gastos generales',
    '5204': 'Honorarios',
  };

  const MODULOS = {
    direccion: { nombre: 'Dirección', obligatorio: true },
    comercial: { nombre: 'Comercial', obligatorio: true },
    finanzas: { nombre: 'Finanzas', obligatorio: true },
    rrhh: { nombre: 'Recursos Humanos', obligatorio: false },
    produccion: { nombre: 'Producción e inventario', obligatorio: false },
    marketing: { nombre: 'Marketing', obligatorio: false },
  };

  // Flujos de estado fijos = procesos estandarizados
  const FLUJOS = {
    ticket: { abierto: ['en_gestion', 'cerrado'], en_gestion: ['resuelto', 'cerrado'], resuelto: ['cerrado'], cerrado: [] },
    orden: { planificada: ['en_proceso', 'anulada'], en_proceso: ['terminada'], terminada: [], anulada: [] },
    karin: { recibida: ['en_investigacion'], en_investigacion: ['informe_enviado'], informe_enviado: ['cerrada'], cerrada: [] },
  };

  const AFP = { Capital: 0.0144, Cuprum: 0.0144, Habitat: 0.0127, Modelo: 0.0058, PlanVital: 0.0116, Provida: 0.0145, Uno: 0.0046 };

  const LIMITE_CAMPOS_PERSONALIZADOS = 8;

  // Parámetros legales referenciales (editables en Configuración).
  // Revisados contra el informe de investigación (oct-2026) y fuentes oficiales: ver LEGAL_META.
  const LEGAL_POR_DEFECTO = {
    iva: 0.19,
    diaVencimientoF29: 20, // facturador electrónico
    ingresoMinimo: 539000,
    jornadaMaximaSemanal: 42, // Ley 21.561: 42 h desde abr-2026, 40 h desde abr-2028
    valorUF: 39500,
    valorUTM: 69000,
    topeImponibleUF: 90, // AFP, salud y mutual (desde feb-2026)
    topeCesantiaUF: 135.2, // seguro de cesantía (desde feb-2026)
    tasaAFP: 0.10,
    tasaSalud: 0.07,
    cesantiaTrabajadorIndefinido: 0.006,
    cesantiaEmpleadorIndefinido: 0.024,
    cesantiaEmpleadorPlazoFijo: 0.03,
    sis: 0, // desde ago-2026 va incluido en el aporte de la reforma (2,5 % de ese 3,5 %)
    mutualBase: 0.0093,
    aporteEmpleadorReforma: 0.035, // Ley 21.735: 3,5 % ago-2026 → 8,5 % en ago-2033
    retencionHonorarios: 0.1525, // 2026
    ppmTasa: 0.00125, // Pro Pyme General, ingresos < 50.000 UF (rebaja transitoria)
    diasReclamoFactura: 8, // días corridos para reclamar una factura recibida
    diasEscrituraContrato: 15,
    diasEscrituraContratoCorto: 5,
    mesesGarantiaLegal: 6, // Ley 19.496
    diasRetracto: 10, // compras a distancia
    diasInvestigacionKarin: 30, // Ley 21.643
  };

  // De dónde sale cada parámetro y si está confirmado. Se muestra en Configuración.
  const LEGAL_META = {
    iva: { estado: 'confirmado', fuente: 'SII' },
    diaVencimientoF29: { estado: 'confirmado', fuente: 'SII' },
    ingresoMinimo: { estado: 'confirmado', fuente: 'gob.cl', nota: 'Vigente desde el 1 de enero de 2026' },
    jornadaMaximaSemanal: { estado: 'confirmado', fuente: 'Ley 21.561', nota: '40 h desde abril de 2028' },
    valorUF: { estado: 'actualizar', fuente: 'Banco Central / SII', nota: 'Cambia todos los días' },
    valorUTM: { estado: 'actualizar', fuente: 'SII', nota: 'Cambia cada mes' },
    topeImponibleUF: { estado: 'confirmado', fuente: 'Superintendencia de Pensiones', nota: '90 UF desde febrero de 2026; se reajusta cada año' },
    topeCesantiaUF: { estado: 'confirmado', fuente: 'Superintendencia de Pensiones', nota: '135,2 UF desde febrero de 2026' },
    tasaAFP: { estado: 'confirmado', fuente: 'Superintendencia de Pensiones' },
    tasaSalud: { estado: 'confirmado', fuente: 'Ley' },
    cesantiaTrabajadorIndefinido: { estado: 'confirmado', fuente: 'Superintendencia de Pensiones' },
    cesantiaEmpleadorIndefinido: { estado: 'confirmado', fuente: 'Superintendencia de Pensiones' },
    cesantiaEmpleadorPlazoFijo: { estado: 'confirmado', fuente: 'Superintendencia de Pensiones' },
    sis: { estado: 'confirmado', fuente: 'Ley 21.735', nota: 'Desde agosto de 2026 va dentro del aporte de la reforma; antes era 1,62 %' },
    mutualBase: { estado: 'verificar', fuente: 'SUSESO', nota: '0,90 % básica + 0,03 % extraordinaria; se suma la adicional por riesgo' },
    aporteEmpleadorReforma: { estado: 'confirmado', fuente: 'Ley 21.735', nota: '3,5 % desde agosto de 2026; 4,25 % en agosto de 2027; llega a 8,5 % en 2033' },
    retencionHonorarios: { estado: 'confirmado', fuente: 'SII', nota: 'Sube cada año hasta 17 % en 2028' },
    ppmTasa: { estado: 'verificar', fuente: 'SII, circular 53/2025', nota: 'Depende del régimen tributario y de las ventas del año anterior' },
    diasReclamoFactura: { estado: 'confirmado', fuente: 'SII, Ley 19.983' },
    diasEscrituraContrato: { estado: 'confirmado', fuente: 'Código del Trabajo, art. 9' },
    diasEscrituraContratoCorto: { estado: 'confirmado', fuente: 'Código del Trabajo, art. 9' },
    mesesGarantiaLegal: { estado: 'confirmado', fuente: 'Ley 19.496 y Ley 21.398' },
    diasRetracto: { estado: 'confirmado', fuente: 'Ley 19.496' },
    diasInvestigacionKarin: { estado: 'verificar', fuente: 'Ley 21.643', nota: 'Confirmar si son días hábiles o corridos; el sistema avisa con días corridos' },
  };

  // Obligaciones que se activan al crecer (umbral >= valor). Fuente: investigación oct-2026.
  const UMBRALES = [
    { medida: 'trabajadores', umbral: 5, area: 'rrhh', obligacion: 'Libro de Remuneraciones Electrónico mensual (Dirección del Trabajo)' },
    { medida: 'trabajadores', umbral: 10, area: 'rrhh', obligacion: 'Reglamento Interno de Orden, Higiene y Seguridad' },
    { medida: 'trabajadoras', umbral: 20, area: 'rrhh', obligacion: 'Sala cuna para las trabajadoras' },
    { medida: 'trabajadores', umbral: 26, area: 'rrhh', obligacion: 'Comité Paritario de Higiene y Seguridad (más de 25)' },
    { medida: 'trabajadores', umbral: 100, area: 'rrhh', obligacion: 'Ley de Inclusión Laboral: 1 % de la dotación' },
    { medida: 'trabajadores', umbral: 101, area: 'rrhh', obligacion: 'Departamento de Prevención de Riesgos (más de 100)' },
    { medida: 'ventasUF', umbral: 2400, area: 'direccion', obligacion: 'Deja de ser microempresa y pasa a pequeña' },
    { medida: 'ventasUF', umbral: 25000, area: 'direccion', obligacion: 'Pasa a mediana empresa' },
    { medida: 'ventasUF', umbral: 50000, area: 'finanzas', obligacion: 'Sube la tasa de PPM en Pro Pyme General (verificar con contador)' },
    { medida: 'ventasUF', umbral: 75000, area: 'finanzas', obligacion: 'Riesgo de salir del régimen Pro Pyme (promedio de 3 años)' },
  ];

    // Impuesto Único de Segunda Categoría (tramos en UTM: hasta, tasa, rebaja)
  const TRAMOS_IUSC = [
    [13.5, 0, 0], [30, 0.04, 0.54], [50, 0.08, 1.74], [70, 0.135, 4.49],
    [90, 0.23, 11.14], [120, 0.304, 17.80], [310, 0.35, 23.32], [Infinity, 0.40, 38.82],
  ];

  // Plantillas por rubro: punto de partida flexible, dentro del margen estándar
  const PLANTILLAS = {
    comercio: {
      nombre: 'Comercio / retail',
      modulos: { marketing: true, rrhh: true, produccion: true },
      opciones: { ordenesProduccion: false, postventaAutomatica: true, diasPostventa: 7 },
      campos: {
        producto: [{ clave: 'marca', etiqueta: 'Marca', tipo: 'texto' }],
        tercero: [{ clave: 'canal', etiqueta: 'Canal de venta', tipo: 'lista', opciones: ['Tienda', 'Online', 'Mayorista'] }],
        empleado: [],
      },
    },
    servicios: {
      nombre: 'Servicios profesionales',
      modulos: { marketing: true, rrhh: true, produccion: false },
      opciones: { ordenesProduccion: false, postventaAutomatica: true, diasPostventa: 30 },
      campos: {
        producto: [{ clave: 'horas', etiqueta: 'Horas estimadas', tipo: 'numero' }],
        tercero: [{ clave: 'contrato', etiqueta: 'N° contrato de servicio', tipo: 'texto' }],
        empleado: [{ clave: 'especialidad', etiqueta: 'Especialidad', tipo: 'texto' }],
      },
    },
    manufactura: {
      nombre: 'Manufactura / alimentos',
      modulos: { marketing: true, rrhh: true, produccion: true },
      opciones: { ordenesProduccion: true, postventaAutomatica: true, diasPostventa: 3 },
      campos: {
        producto: [
          { clave: 'lote', etiqueta: 'Lote', tipo: 'texto' },
          { clave: 'vencimiento', etiqueta: 'Vencimiento', tipo: 'fecha' },
        ],
        tercero: [{ clave: 'canal', etiqueta: 'Canal', tipo: 'lista', opciones: ['Directo', 'Distribuidor', 'Online'] }],
        empleado: [{ clave: 'manipulador', etiqueta: 'Curso manipulador de alimentos', tipo: 'lista', opciones: ['Sí', 'No'] }],
      },
    },
  };

  // ---------------------------------------------------------------------------
  // Datos de demostración
  // ---------------------------------------------------------------------------
  function datosDemo(hoy) {
    const h = hoy || hoyISO();
    const base = estructuraVacia();
    base.config.empresa = { razonSocial: 'Panadería Los Aromos SpA', rut: rutDesdeNumero(76543210), giro: 'Elaboración de productos de panadería', rubro: 'manufactura' };
    aplicarPlantillaEn(base.config, 'manufactura');
    base.campanas = [
      { id: 'CAM-1', nombre: 'Instagram — pan de masa madre', canal: 'Redes sociales', presupuesto: 300000, inicio: sumarDias(h, -60), fin: sumarDias(h, 30) },
      { id: 'CAM-2', nombre: 'Feria gastronómica comunal', canal: 'Eventos', presupuesto: 450000, inicio: sumarDias(h, -40), fin: sumarDias(h, -35) },
    ];
    base.terceros = [
      { id: 'TER-1', tipo: 'cliente', rut: rutDesdeNumero(77123456), nombre: 'Café Central Ltda.', email: 'compras@cafecentral.cl', telefono: '+56 9 1111 2222', origenCampanaId: 'CAM-2', consentimientoDatos: true, extra: { canal: 'Directo' } },
      { id: 'TER-2', tipo: 'cliente', rut: rutDesdeNumero(15432876), nombre: 'María González', email: 'maria@correo.cl', telefono: '+56 9 3333 4444', origenCampanaId: 'CAM-1', consentimientoDatos: true, extra: { canal: 'Online' } },
      { id: 'TER-3', tipo: 'cliente', rut: rutDesdeNumero(78999111), nombre: 'Minimarket Don Pepe', email: 'pepe@minimarket.cl', telefono: '', origenCampanaId: '', consentimientoDatos: false, extra: { canal: 'Distribuidor' } },
      { id: 'TER-4', tipo: 'proveedor', rut: rutDesdeNumero(96500400), nombre: 'Molinos del Sur S.A.', email: 'ventas@molinosdelsur.cl', telefono: '', origenCampanaId: '', consentimientoDatos: true, extra: {} },
      { id: 'TER-5', tipo: 'proveedor', rut: rutDesdeNumero(76111222), nombre: 'Agencia Digital Pixel', email: 'hola@pixel.cl', telefono: '', origenCampanaId: '', consentimientoDatos: true, extra: {} },
      { id: 'TER-6', tipo: 'proveedor', rut: rutDesdeNumero(13579246), nombre: 'Ana Soto (contadora)', email: 'ana.soto@correo.cl', telefono: '', origenCampanaId: '', consentimientoDatos: true, extra: {} },
    ];
    base.terceros.forEach((t) => Object.assign(t, { exigeOC: t.id === 'TER-1', bajaComunicaciones: false, fechaConsentimiento: t.consentimientoDatos ? sumarDias(h, -90) : '', medioConsentimiento: t.consentimientoDatos ? 'Formulario en tienda' : '' }));
    base.productos = [
      { id: 'PRO-1', sku: 'HAR-25', nombre: 'Harina (saco 25 kg)', tipo: 'insumo', precioNeto: 0, costo: 18000, stock: 12, stockMinimo: 5, extra: {} },
      { id: 'PRO-2', sku: 'LEV-1', nombre: 'Levadura (kg)', tipo: 'insumo', precioNeto: 0, costo: 4500, stock: 6, stockMinimo: 3, extra: {} },
      { id: 'PRO-3', sku: 'PAN-MM', nombre: 'Pan de masa madre', tipo: 'producto', precioNeto: 3500, costo: 1200, stock: 40, stockMinimo: 20, extra: { lote: 'L-0921' } },
      { id: 'PRO-4', sku: 'CAJ-HAL', nombre: 'Caja hallullas (50 u.)', tipo: 'producto', precioNeto: 9000, costo: 4000, stock: 8, stockMinimo: 10, extra: {} },
      { id: 'PRO-5', sku: 'SRV-CAT', nombre: 'Servicio de catering', tipo: 'servicio', precioNeto: 120000, costo: 0, stock: 0, stockMinimo: 0, extra: {} },
    ];
    base.recetas = { 'PRO-3': [{ productoId: 'PRO-1', cantidad: 0.02 }, { productoId: 'PRO-2', cantidad: 0.005 }] };
    base.empleados = [
      { id: 'EMP-1', rut: rutDesdeNumero(16789123), nombre: 'Juan Pérez', cargo: 'Maestro panadero', fechaIngreso: sumarDias(h, -400), tipoContrato: 'indefinido', fechaTermino: '', renovaciones: 0, fechaFirmaContrato: sumarDias(h, -398), sueldoBase: 750000, jornadaSemanal: 42, afp: 'Modelo', salud: 'Fonasa', sexo: 'M', colacion: 40000, movilizacion: 30000, extra: { manipulador: 'Sí' } },
      { id: 'EMP-2', rut: rutDesdeNumero(19876543), nombre: 'Camila Rojas', cargo: 'Vendedora', fechaIngreso: sumarDias(h, -75), tipoContrato: 'plazo_fijo', fechaTermino: sumarDias(h, 10), renovaciones: 1, fechaFirmaContrato: sumarDias(h, -74), sueldoBase: 560000, jornadaSemanal: 42, afp: 'Habitat', salud: 'Fonasa', sexo: 'F', colacion: 30000, movilizacion: 25000, extra: { manipulador: 'Sí' } },
      { id: 'EMP-3', rut: rutDesdeNumero(20111333), nombre: 'Diego Muñoz', cargo: 'Ayudante de producción', fechaIngreso: sumarDias(h, -20), tipoContrato: 'indefinido', fechaTermino: '', renovaciones: 0, fechaFirmaContrato: '', sueldoBase: 539000, jornadaSemanal: 42, afp: 'Uno', salud: 'Fonasa', sexo: 'M', colacion: 30000, movilizacion: 25000, extra: { manipulador: 'No' } },
    ];
    base.bienestar = [
      { id: 'BIE-1', empleadoId: 'EMP-3', tipo: 'capacitacion', fecha: sumarDias(h, 14), detalle: 'Curso manipulador de alimentos (obligatorio sanitario)' },
      { id: 'BIE-2', empleadoId: 'EMP-1', tipo: 'beneficio', fecha: sumarDias(h, -30), detalle: 'Aguinaldo fiestas patrias' },
    ];
    base.secuencias = { ...base.secuencias, TER: 6, PRO: 5, EMP: 3, CAM: 2, BIE: 2 };
    return base;
  }

  function estructuraVacia() {
    return {
      version: 1,
      config: {
        empresa: { razonSocial: '', rut: '', giro: '', rubro: '', regimen: 'pro_pyme_general' },
        modulos: { direccion: true, comercial: true, finanzas: true, rrhh: true, produccion: true, marketing: true },
        opciones: { ordenesProduccion: false, postventaAutomatica: true, diasPostventa: 7, interesMora: false, slaDias: { consulta: 3, reclamo: 5, garantia: 10, retracto: 5, postventa: 5 } },
        camposPersonalizados: { tercero: [], producto: [], empleado: [] },
        legal: { ...LEGAL_POR_DEFECTO },
      },
      terceros: [], productos: [], recetas: {}, documentos: [], asientos: [],
      empleados: [], liquidaciones: [], bienestar: [], denunciasKarin: [],
      campanas: [], tickets: [], ordenes: [], auditoria: [],
      folios: { factura: 0, boleta: 0, nota_credito: 0 },
      secuencias: {},
    };
  }

  // Completa datos guardados con versiones anteriores del prototipo
  function migrar(d) {
    const vacia = estructuraVacia();
    d.config.legal = { ...LEGAL_POR_DEFECTO, ...d.config.legal };
    d.config.opciones = { ...vacia.config.opciones, ...d.config.opciones, slaDias: { ...vacia.config.opciones.slaDias, ...d.config.opciones.slaDias } };
    d.config.empresa = { ...vacia.config.empresa, ...d.config.empresa };
    for (const doc of d.documentos) if (doc.clase === 'compra' && !doc.estadoAcuse) Object.assign(doc, { estadoAcuse: 'aceptada', fechaRecepcion: doc.fecha });
    return d;
  }

  function aplicarPlantillaEn(config, rubro) {
    const p = PLANTILLAS[rubro];
    if (!p) throw new Error('Plantilla desconocida: ' + rubro);
    config.empresa.rubro = rubro;
    Object.assign(config.modulos, p.modulos);
    Object.assign(config.opciones, p.opciones);
    config.camposPersonalizados = JSON.parse(JSON.stringify(p.campos));
  }

  // ---------------------------------------------------------------------------
  // ERP
  // ---------------------------------------------------------------------------
  class ERP {
    constructor({ almacen, clave = 'erp-pyme-v1', hoy } = {}) {
      this.almacen = almacen || null; // { leer(clave), escribir(clave, texto) }
      this.clave = clave;
      this._hoy = hoy || null;
      this.oyentes = {};
      this._registrarIntegraciones();
      const guardado = this.almacen && this.almacen.leer(this.clave);
      if (guardado) this.d = migrar(JSON.parse(guardado));
      else this.reiniciar();
    }

    hoy() { return this._hoy || hoyISO(); }

    // --- Persistencia --------------------------------------------------------
    guardar() { if (this.almacen) this.almacen.escribir(this.clave, JSON.stringify(this.d)); }
    exportar() { return JSON.stringify(this.d, null, 2); }
    importar(texto) {
      const d = JSON.parse(texto);
      if (!d || d.version !== 1 || !d.config) throw new Error('Archivo no corresponde a un respaldo válido del ERP');
      this.d = migrar(d); this.guardar();
    }
    reiniciar(vacio = false) {
      this.d = vacio ? estructuraVacia() : datosDemo(this.hoy());
      if (!vacio) this._movimientosDemo();
      this.guardar();
    }

    // Operaciones reales sobre los datos demo: así la demo ya muestra los cruces
    _movimientosDemo() {
      const h = this.hoy();
      const dia = (n) => sumarDias(h, n);
      const mesAnterior = periodoDe(sumarDias(h.slice(0, 8) + '01', -1));
      this.registrarApertura(2500000, dia(-60));
      this.registrarCompra({ terceroId: 'TER-4', folioProveedor: '88121', fecha: dia(-35), lineas: [{ productoId: 'PRO-1', cantidad: 10, costo: 18500 }, { productoId: 'PRO-2', cantidad: 5, costo: 4600 }] });
      this.registrarCompra({ terceroId: 'TER-5', folioProveedor: '1203', fecha: dia(-45), destino: 'marketing', campanaId: 'CAM-1', montoNeto: 180000, glosa: 'Pauta Instagram' });
      this.registrarCompra({ terceroId: 'TER-5', folioProveedor: '1219', fecha: dia(-38), destino: 'marketing', campanaId: 'CAM-2', montoNeto: 480000, glosa: 'Stand feria + material impreso' });
      this.d.documentos.filter((d) => d.clase === 'compra').forEach((d) => (d.estadoAcuse = 'aceptada')); // aceptadas en su momento
      this.registrarPago(this.d.documentos[0].id, null, dia(-10));
      this.registrarCompra({ terceroId: 'TER-6', folioProveedor: '214', fecha: dia(-20), destino: 'honorarios', montoNeto: 350000, glosa: 'Contabilidad mensual' });
      this.registrarCompra({ terceroId: 'TER-4', folioProveedor: '88390', fecha: dia(-6), lineas: [{ productoId: 'PRO-1', cantidad: 6, costo: 18600 }] });
      const f1 = this.emitirVenta({ tipo: 'factura', terceroId: 'TER-1', fecha: dia(-40), diasCredito: 30, ordenCompra: 'OC-4512', lineas: [{ productoId: 'PRO-3', cantidad: 15 }, { productoId: 'PRO-5', cantidad: 1 }] });
      this.emitirVenta({ tipo: 'factura', terceroId: 'TER-3', fecha: dia(-6), diasCredito: 30, lineas: [{ productoId: 'PRO-4', cantidad: 4 }] });
      const f3 = this.emitirVenta({ tipo: 'boleta', terceroId: 'TER-2', fecha: dia(-2), lineas: [{ productoId: 'PRO-3', cantidad: 3 }] });
      this.emitirVenta({ tipo: 'boleta', fecha: dia(-1), lineas: [{ productoId: 'PRO-3', cantidad: 6 }, { productoId: 'PRO-4', cantidad: 1 }] });
      this.registrarPago(f1.id, 100000, dia(-5));
      this.crearTicket({ terceroId: 'TER-2', documentoId: f3.id, tipo: 'garantia', descripcion: 'Pan llegó aplastado en despacho', fechaApertura: dia(-1) });
      this.crearTicket({ terceroId: 'TER-1', documentoId: f1.id, tipo: 'reclamo', descripcion: 'Factura con dirección de despacho incorrecta', fechaApertura: dia(-12) });
      this.emitirLiquidacion('EMP-1', mesAnterior);
      this.emitirLiquidacion('EMP-2', mesAnterior);
      this.crearOrden({ productoId: 'PRO-3', cantidad: 60, fecha: h });
      this.cambiarEstadoTicket(this.d.tickets[0].id, 'cerrado');
    }

    // Saldo inicial: caja aportada + inventario existente contra capital
    registrarApertura(caja, fecha) {
      if (this.d.asientos.some((a) => a.origen.modulo === 'apertura')) throw new Error('La apertura ya fue registrada');
      const inventario = this.d.productos.reduce((t, p) => t + (p.tipo === 'servicio' ? 0 : redondear(p.stock * p.costo)), 0);
      this._asiento(fecha || this.hoy(), 'Asiento de apertura', { modulo: 'apertura', ref: '' }, [
        { cuenta: '1101', debe: redondear(caja) },
        { cuenta: '1105', debe: inventario },
        { cuenta: '3101', haber: redondear(caja) + inventario },
      ]);
      this._auditar('finanzas', 'Asiento de apertura', `Caja $${caja} + inventario $${inventario}`);
      this.guardar();
    }

    // --- Bus de eventos: así "conversan" los módulos --------------------------
    on(evento, fn) { (this.oyentes[evento] = this.oyentes[evento] || []).push(fn); }
    emitir(evento, datos) { (this.oyentes[evento] || []).forEach((fn) => fn(datos)); }

    _registrarIntegraciones() {
      // Comercial → Postventa: seguimiento automático tras cada venta
      this.on('venta.emitida', (doc) => {
        const op = this.d.config.opciones;
        if (!op.postventaAutomatica || doc.tipo === 'nota_credito' || !doc.terceroId) return;
        this.crearTicket({ terceroId: doc.terceroId, documentoId: doc.id, tipo: 'postventa', descripcion: `Seguimiento de satisfacción ${doc.tipo} N° ${doc.folio}`, fechaApertura: sumarDias(doc.fecha, op.diasPostventa) }, { silencioso: true });
      });
      // Producción → Compras/Producción: alerta de reposición
      this.on('stock.bajo', (p) => this._auditar('produccion', 'Stock bajo mínimo', `${p.nombre}: ${p.stock} (mín. ${p.stockMinimo})`));
    }

    _id(prefijo) {
      const s = this.d.secuencias;
      s[prefijo] = (s[prefijo] || 0) + 1;
      return `${prefijo}-${s[prefijo]}`;
    }

    _auditar(modulo, accion, detalle) {
      this.d.auditoria.unshift({ fecha: new Date().toISOString(), modulo, accion, detalle });
      if (this.d.auditoria.length > 500) this.d.auditoria.length = 500;
    }

    _asiento(fecha, glosa, origen, lineas) {
      const debe = lineas.reduce((s, l) => s + (l.debe || 0), 0);
      const haber = lineas.reduce((s, l) => s + (l.haber || 0), 0);
      if (debe !== haber) throw new Error(`Asiento descuadrado (${debe} ≠ ${haber}): ${glosa}`);
      const a = { id: this._id('ASI'), fecha, glosa, origen, lineas: lineas.filter((l) => l.debe || l.haber) };
      this.d.asientos.push(a);
      return a;
    }

    buscar(coleccion, id) { return this.d[coleccion].find((x) => x.id === id); }
    moduloActivo(m) { return MODULOS[m].obligatorio || !!this.d.config.modulos[m]; }

    // --- Configuración (flexibilidad acotada) --------------------------------
    aplicarPlantilla(rubro) {
      aplicarPlantillaEn(this.d.config, rubro);
      this._auditar('configuracion', 'Plantilla aplicada', PLANTILLAS[rubro].nombre);
      this.guardar();
    }

    activarModulo(m, activo) {
      if (MODULOS[m].obligatorio && !activo) throw new Error(`${MODULOS[m].nombre} es parte del núcleo legal y no se puede desactivar`);
      if (m === 'rrhh' && !activo && this.d.empleados.length) throw new Error('Hay trabajadores registrados: RR.HH. es obligatorio (contratos y cotizaciones)');
      this.d.config.modulos[m] = activo;
      this._auditar('configuracion', activo ? 'Módulo activado' : 'Módulo desactivado', MODULOS[m].nombre);
      this.guardar();
    }

    agregarCampo(entidad, campo) {
      const lista = this.d.config.camposPersonalizados[entidad];
      if (!lista) throw new Error('Entidad no admite campos personalizados');
      if (lista.length >= LIMITE_CAMPOS_PERSONALIZADOS) throw new Error(`Máximo ${LIMITE_CAMPOS_PERSONALIZADOS} campos personalizados por entidad`);
      const clave = String(campo.etiqueta || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (!clave) throw new Error('El campo necesita un nombre');
      if (lista.some((c) => c.clave === clave)) throw new Error('Ya existe un campo con ese nombre');
      if (!['texto', 'numero', 'fecha', 'lista'].includes(campo.tipo)) throw new Error('Tipo de campo no válido');
      const nuevo = { clave, etiqueta: campo.etiqueta.trim(), tipo: campo.tipo };
      if (campo.tipo === 'lista') {
        nuevo.opciones = (campo.opciones || []).map((o) => String(o).trim()).filter(Boolean);
        if (!nuevo.opciones.length) throw new Error('Una lista necesita opciones');
      }
      lista.push(nuevo);
      this._auditar('configuracion', 'Campo personalizado agregado', `${entidad}.${clave}`);
      this.guardar();
    }

    quitarCampo(entidad, clave) {
      const c = this.d.config.camposPersonalizados;
      c[entidad] = c[entidad].filter((x) => x.clave !== clave);
      this.guardar();
    }

    actualizarLegal(cambios) {
      for (const [k, v] of Object.entries(cambios)) {
        if (!(k in LEGAL_POR_DEFECTO)) continue;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new Error(`Valor no válido para ${k}`);
        this.d.config.legal[k] = n;
      }
      this._auditar('configuracion', 'Parámetros legales actualizados', Object.keys(cambios).join(', '));
      this.guardar();
    }

    // --- Comercial: clientes y proveedores ------------------------------------
    guardarTercero(t) {
      if (!t.nombre) throw new Error('El nombre es obligatorio');
      if (!validarRut(t.rut)) throw new Error('RUT no válido');
      const rut = formatearRut(t.rut);
      if (this.d.terceros.some((x) => x.rut === rut && x.id !== t.id)) throw new Error('Ya existe un tercero con ese RUT');
      const previo = t.id ? this.buscar('terceros', t.id) : null;
      const registro = { tipo: 'cliente', email: '', telefono: '', origenCampanaId: '', consentimientoDatos: false, exigeOC: false, bajaComunicaciones: false, fechaConsentimiento: '', medioConsentimiento: '', extra: {}, ...t, rut };
      // Ley 21.719: el consentimiento queda registrado con fecha y medio
      if (registro.consentimientoDatos && !(previo && previo.consentimientoDatos)) {
        registro.fechaConsentimiento = this.hoy();
        registro.medioConsentimiento = registro.medioConsentimiento || 'Registro manual';
      }
      if (!registro.consentimientoDatos) { registro.fechaConsentimiento = ''; registro.medioConsentimiento = ''; }
      if (previo) Object.assign(previo, registro);
      else { registro.id = this._id('TER'); this.d.terceros.push(registro); }
      this._auditar('comercial', t.id ? 'Tercero modificado' : 'Tercero creado', `${registro.nombre} (${rut})`);
      this.guardar();
      return registro;
    }

    // Derecho de supresión (Ley 21.719). Nombre y RUT se conservan porque los
    // documentos tributarios deben guardarse (Código Tributario, 6 años).
    suprimirDatosPersonales(id, solicitud) {
      const t = this.buscar('terceros', id);
      if (!t) throw new Error('Cliente inexistente');
      if (!solicitud) throw new Error('Indique cómo llegó la solicitud');
      Object.assign(t, { email: '', telefono: '', extra: {}, consentimientoDatos: false, fechaConsentimiento: '', medioConsentimiento: '', bajaComunicaciones: true, datosSuprimidos: this.hoy() });
      this._auditar('marketing', 'Supresión de datos personales', `${t.id}: ${solicitud}`);
      this.guardar();
      return t;
    }

    // --- Producción: productos e inventario -----------------------------------
    guardarProducto(p) {
      if (!p.nombre || !p.sku) throw new Error('SKU y nombre son obligatorios');
      if (this.d.productos.some((x) => x.sku === p.sku && x.id !== p.id)) throw new Error('SKU duplicado');
      const registro = { tipo: 'producto', precioNeto: 0, costo: 0, stock: 0, stockMinimo: 0, extra: {}, ...p };
      ['precioNeto', 'costo', 'stock', 'stockMinimo'].forEach((k) => (registro[k] = Number(registro[k]) || 0));
      if (p.id) Object.assign(this.buscar('productos', p.id), registro);
      else { registro.id = this._id('PRO'); this.d.productos.push(registro); }
      this._auditar('produccion', p.id ? 'Producto modificado' : 'Producto creado', registro.nombre);
      this.guardar();
      return registro;
    }

    _moverStock(productoId, delta) {
      const p = this.buscar('productos', productoId);
      if (!p || p.tipo === 'servicio') return;
      p.stock = Math.round((p.stock + delta) * 1000) / 1000;
      if (p.stock <= p.stockMinimo) this.emitir('stock.bajo', p);
    }

    // --- Comercial + Finanzas: documentos tributarios -------------------------
    _calcularLineas(lineas) {
      const iva = this.d.config.legal.iva;
      const ls = (lineas || []).filter((l) => l.productoId && Number(l.cantidad) > 0).map((l) => {
        const p = this.buscar('productos', l.productoId);
        if (!p) throw new Error('Producto inexistente');
        const precio = l.precioNeto !== undefined && l.precioNeto !== '' ? Number(l.precioNeto) : p.precioNeto;
        return { productoId: p.id, descripcion: p.nombre, cantidad: Number(l.cantidad), precioNeto: precio, subtotal: redondear(precio * Number(l.cantidad)), costoUnitario: p.costo };
      });
      if (!ls.length) throw new Error('El documento necesita al menos una línea');
      const neto = ls.reduce((s, l) => s + l.subtotal, 0);
      const montoIva = redondear(neto * iva);
      return { lineas: ls, neto, iva: montoIva, total: neto + montoIva };
    }

    emitirVenta({ tipo = 'factura', terceroId, lineas, fecha, diasCredito = 30, ordenCompra = '' }) {
      if (!['factura', 'boleta'].includes(tipo)) throw new Error('Tipo de documento de venta no válido');
      fecha = fecha || this.hoy();
      const cliente = terceroId ? this.buscar('terceros', terceroId) : null;
      if (tipo === 'factura' && !cliente) throw new Error('La factura exige un cliente identificado con RUT');
      if (tipo === 'factura' && cliente.exigeOC && !String(ordenCompra).trim()) throw new Error(`${cliente.nombre} exige orden de compra: ingrese su número para que no rechacen el pago`);
      for (const l of lineas || []) {
        const p = this.buscar('productos', l.productoId);
        if (p && p.tipo !== 'servicio' && p.stock < Number(l.cantidad)) throw new Error(`Stock insuficiente de ${p.nombre} (disponible: ${p.stock})`);
      }
      const calc = this._calcularLineas(lineas);
      const folio = ++this.d.folios[tipo]; // correlativo, nunca se reutiliza
      const pagadaAlContado = tipo === 'boleta';
      const doc = {
        id: this._id('DOC'), clase: 'venta', tipo, folio, fecha, terceroId: terceroId || '', ...calc,
        vencimiento: pagadaAlContado ? fecha : sumarDias(fecha, Number(diasCredito) || 0),
        pagado: pagadaAlContado ? calc.total : 0, anulado: false, ordenCompra: String(ordenCompra).trim(),
      };
      this.d.documentos.push(doc);

      // Finanzas: asiento de venta + costo
      this._asiento(fecha, `${tipo} N° ${folio}`, { modulo: 'comercial', ref: doc.id }, [
        { cuenta: pagadaAlContado ? '1101' : '1103', debe: doc.total },
        { cuenta: '4101', haber: doc.neto },
        { cuenta: '2102', haber: doc.iva },
      ]);
      const costo = calc.lineas.reduce((s, l) => {
        const p = this.buscar('productos', l.productoId);
        return s + (p.tipo === 'servicio' ? 0 : redondear(l.costoUnitario * l.cantidad));
      }, 0);
      if (costo) this._asiento(fecha, `Costo ${tipo} N° ${folio}`, { modulo: 'produccion', ref: doc.id }, [{ cuenta: '5101', debe: costo }, { cuenta: '1105', haber: costo }]);

      // Producción: rebaja de inventario
      calc.lineas.forEach((l) => this._moverStock(l.productoId, -l.cantidad));

      this._auditar('comercial', `Emisión ${tipo}`, `N° ${folio} — ${cliente ? cliente.nombre : 'consumidor final'} — $${doc.total}`);
      this.emitir('venta.emitida', doc);
      this.guardar();
      return doc;
    }

    // Los documentos tributarios no se borran: se anulan con nota de crédito
    emitirNotaCredito(documentoId, motivo) {
      const orig = this.buscar('documentos', documentoId);
      if (!orig || orig.clase !== 'venta' || orig.tipo === 'nota_credito') throw new Error('Documento no anulable');
      if (orig.anulado) throw new Error('El documento ya fue anulado');
      if (!motivo) throw new Error('Debe indicar el motivo de la anulación');
      const fecha = this.hoy();
      const folio = ++this.d.folios.nota_credito;
      const nc = { id: this._id('DOC'), clase: 'venta', tipo: 'nota_credito', folio, fecha, terceroId: orig.terceroId, lineas: orig.lineas, neto: -orig.neto, iva: -orig.iva, total: -orig.total, vencimiento: fecha, pagado: -orig.total, referencia: orig.id, motivo, anulado: false };
      this.d.documentos.push(nc);
      orig.anulado = true;
      const pendiente = orig.total - orig.pagado;
      const devuelto = orig.pagado; // lo ya cobrado se devuelve por caja
      this._asiento(fecha, `Nota de crédito N° ${folio} (anula ${orig.tipo} ${orig.folio})`, { modulo: 'comercial', ref: nc.id }, [
        { cuenta: '4101', debe: orig.neto },
        { cuenta: '2102', debe: orig.iva },
        { cuenta: '1103', haber: pendiente },
        { cuenta: '1101', haber: devuelto },
      ]);
      orig.pagado = orig.total;
      const costo = orig.lineas.reduce((s, l) => s + (this.buscar('productos', l.productoId)?.tipo === 'servicio' ? 0 : redondear(l.costoUnitario * l.cantidad)), 0);
      if (costo) this._asiento(fecha, `Reverso costo NC N° ${folio}`, { modulo: 'produccion', ref: nc.id }, [{ cuenta: '1105', debe: costo }, { cuenta: '5101', haber: costo }]);
      orig.lineas.forEach((l) => this._moverStock(l.productoId, l.cantidad));
      this._auditar('comercial', 'Nota de crédito', `N° ${folio} anula ${orig.tipo} ${orig.folio}: ${motivo}`);
      this.guardar();
      return nc;
    }

    registrarCompra({ terceroId, folioProveedor, fecha, fechaRecepcion, destino = 'inventario', lineas, montoNeto, glosa, campanaId, diasCredito = 30 }) {
      fecha = fecha || this.hoy();
      const prov = this.buscar('terceros', terceroId);
      if (!prov) throw new Error('La compra exige un proveedor');
      if (!folioProveedor) throw new Error('Indique el folio del documento del proveedor');
      if (!['inventario', 'marketing', 'general', 'honorarios', 'retiro'].includes(destino)) throw new Error('Destino de compra no válido');
      if (this.d.documentos.some((d) => d.clase === 'compra' && d.terceroId === terceroId && String(d.folio) === String(folioProveedor))) throw new Error('Documento de proveedor ya registrado');
      const L = this.d.config.legal;
      let calc;
      if (destino === 'inventario') {
        calc = this._calcularLineas((lineas || []).map((l) => {
          const costo = l.costo !== undefined && l.costo !== '' ? l.costo : this.buscar('productos', l.productoId)?.costo;
          return { ...l, precioNeto: costo };
        }));
      } else {
        const neto = redondear(montoNeto);
        if (neto <= 0) throw new Error('Monto no válido');
        // Honorarios y gastos personales no tienen IVA recuperable
        const iva = ['honorarios', 'retiro'].includes(destino) ? 0 : redondear(neto * L.iva);
        calc = { lineas: [{ descripcion: glosa || 'Gasto', cantidad: 1, precioNeto: neto, subtotal: neto }], neto, iva, total: neto + iva };
      }
      if (destino === 'marketing' && campanaId && !this.buscar('campanas', campanaId)) throw new Error('Campaña inexistente');
      const retencion = destino === 'honorarios' ? redondear(calc.neto * L.retencionHonorarios) : 0;
      const tipo = destino === 'honorarios' ? 'boleta_honorarios' : destino === 'retiro' ? 'gasto_personal' : 'factura_compra';
      const doc = {
        id: this._id('DOC'), clase: 'compra', tipo, folio: folioProveedor, fecha, terceroId, destino,
        campanaId: destino === 'marketing' ? campanaId || '' : '', glosa: glosa || '', ...calc, retencion, total: calc.total - retencion,
        vencimiento: sumarDias(fecha, Number(diasCredito) || 0), pagado: 0,
        fechaRecepcion: fechaRecepcion || fecha, estadoAcuse: tipo === 'factura_compra' ? 'pendiente' : 'no_aplica',
      };
      this.d.documentos.push(doc);
      const cuentaDestino = { inventario: '1105', marketing: '5202', general: '5203', honorarios: '5204', retiro: '3102' }[destino];
      const nombreDoc = { boleta_honorarios: 'Honorarios', gasto_personal: 'Gasto personal (retiro)', factura_compra: 'Compra' }[tipo];
      this._asiento(fecha, `${nombreDoc} ${prov.nombre} N° ${folioProveedor}`, { modulo: destino === 'marketing' ? 'marketing' : 'comercial', ref: doc.id }, [
        { cuenta: cuentaDestino, debe: doc.neto },
        { cuenta: '1104', debe: doc.iva },
        { cuenta: '2106', haber: retencion },
        { cuenta: '2101', haber: doc.total },
      ]);
      if (destino === 'inventario') {
        doc.lineas.forEach((l) => {
          const p = this.buscar('productos', l.productoId);
          // costo promedio ponderado
          const stockPrevio = Math.max(p.stock, 0);
          p.costo = redondear((p.costo * stockPrevio + l.precioNeto * l.cantidad) / (stockPrevio + l.cantidad));
          this._moverStock(p.id, l.cantidad);
        });
      }
      this._auditar(destino === 'marketing' ? 'marketing' : 'comercial', `${nombreDoc} registrada`, `${prov.nombre} N° ${folioProveedor} — $${doc.total}`);
      this.guardar();
      return doc;
    }

    // Una factura recibida se acepta sola a los 8 días: después el proveedor puede cobrarla judicialmente
    estadoAcuse(doc) {
      if (doc.estadoAcuse !== 'pendiente') return doc.estadoAcuse;
      return this.diasParaReclamar(doc) < 0 ? 'aceptada_tacita' : 'pendiente';
    }

    diasParaReclamar(doc) {
      return this.d.config.legal.diasReclamoFactura - diasEntre(doc.fechaRecepcion, this.hoy());
    }

    acusarCompra(id, decision, motivo) {
      const doc = this.buscar('documentos', id);
      if (!doc || doc.tipo !== 'factura_compra') throw new Error('Solo las facturas de compra tienen acuse de recibo');
      const estado = this.estadoAcuse(doc);
      if (estado === 'aceptada_tacita') throw new Error('Pasaron los 8 días: la factura quedó aceptada y ya no se puede reclamar en el SII');
      if (estado !== 'pendiente') throw new Error('La factura ya fue ' + estado);
      if (decision === 'aceptar') {
        doc.estadoAcuse = 'aceptada';
      } else if (decision === 'reclamar') {
        if (!motivo) throw new Error('Indique el motivo del reclamo');
        if (doc.pagado) throw new Error('La factura tiene pagos registrados; revise con el proveedor antes de reclamar');
        const cuenta = { inventario: '1105', marketing: '5202', general: '5203' }[doc.destino];
        this._asiento(this.hoy(), `Reclamo factura ${doc.folio} (${motivo})`, { modulo: 'finanzas', ref: doc.id }, [
          { cuenta: '2101', debe: doc.total },
          { cuenta, haber: doc.neto },
          { cuenta: '1104', haber: doc.iva },
        ]);
        if (doc.destino === 'inventario') doc.lineas.forEach((l) => this._moverStock(l.productoId, -l.cantidad));
        Object.assign(doc, { estadoAcuse: 'reclamada', motivoReclamo: motivo, anulado: true, pagado: doc.total });
      } else throw new Error('Decisión no válida');
      this._auditar('finanzas', decision === 'aceptar' ? 'Factura de compra aceptada' : 'Factura de compra reclamada', `N° ${doc.folio}${motivo ? ': ' + motivo : ''}`);
      this.guardar();
      return doc;
    }

    registrarPago(documentoId, monto, fecha) {
      const doc = this.buscar('documentos', documentoId);
      if (!doc) throw new Error('Documento inexistente');
      const saldo = doc.total - doc.pagado;
      monto = redondear(monto || saldo);
      if (monto <= 0 || monto > saldo) throw new Error(`Monto no válido (saldo: ${saldo})`);
      fecha = fecha || this.hoy();
      doc.pagado += monto;
      const esVenta = doc.clase === 'venta';
      this._asiento(fecha, `${esVenta ? 'Cobro' : 'Pago'} ${doc.tipo} ${doc.folio}`, { modulo: 'finanzas', ref: doc.id }, esVenta
        ? [{ cuenta: '1101', debe: monto }, { cuenta: '1103', haber: monto }]
        : [{ cuenta: '2101', debe: monto }, { cuenta: '1101', haber: monto }]);
      this._auditar('finanzas', esVenta ? 'Cobro registrado' : 'Pago registrado', `${doc.tipo} ${doc.folio} — $${monto}`);
      this.guardar();
      return doc;
    }

    // --- Producción: órdenes ----------------------------------------------------
    crearOrden({ productoId, cantidad, fecha }) {
      if (!this.d.config.opciones.ordenesProduccion) throw new Error('Las órdenes de producción no están habilitadas para este rubro');
      const p = this.buscar('productos', productoId);
      if (!p || p.tipo !== 'producto') throw new Error('Seleccione un producto terminado');
      if (!(Number(cantidad) > 0)) throw new Error('Cantidad no válida');
      const receta = this.d.recetas[productoId] || [];
      const o = { id: this._id('OP'), productoId, cantidad: Number(cantidad), fecha: fecha || this.hoy(), estado: 'planificada', insumos: receta.map((r) => ({ productoId: r.productoId, cantidad: Math.round(r.cantidad * cantidad * 1000) / 1000 })) };
      this.d.ordenes.push(o);
      this._auditar('produccion', 'Orden creada', `${o.id}: ${o.cantidad} × ${p.nombre}`);
      this.guardar();
      return o;
    }

    guardarReceta(productoId, insumos) {
      this.d.recetas[productoId] = insumos.filter((i) => i.productoId && Number(i.cantidad) > 0).map((i) => ({ productoId: i.productoId, cantidad: Number(i.cantidad) }));
      this.guardar();
    }

    cambiarEstadoOrden(id, estado) {
      const o = this.buscar('ordenes', id);
      this._transicion('orden', o, estado);
      if (estado === 'terminada') {
        for (const i of o.insumos) {
          const ins = this.buscar('productos', i.productoId);
          if (ins.stock < i.cantidad) { o.estado = 'en_proceso'; throw new Error(`Insumo insuficiente: ${ins.nombre}`); }
        }
        const costoTotal = o.insumos.reduce((s, i) => s + i.cantidad * this.buscar('productos', i.productoId).costo, 0);
        o.insumos.forEach((i) => this._moverStock(i.productoId, -i.cantidad));
        const p = this.buscar('productos', o.productoId);
        if (costoTotal) p.costo = redondear((p.costo * Math.max(p.stock, 0) + costoTotal) / (Math.max(p.stock, 0) + o.cantidad));
        this._moverStock(p.id, o.cantidad);
      }
      this._auditar('produccion', 'Orden ' + estado, o.id);
      this.guardar();
    }

    _transicion(flujo, obj, estado) {
      if (!obj) throw new Error('Registro inexistente');
      if (!FLUJOS[flujo][obj.estado].includes(estado)) throw new Error(`Transición no permitida: ${obj.estado} → ${estado}`);
      obj.estado = estado;
    }

    // --- Comercial: atención al cliente y postventa -------------------------
    crearTicket({ terceroId, documentoId = '', tipo = 'consulta', descripcion, fechaApertura }, { silencioso = false } = {}) {
      const cliente = this.buscar('terceros', terceroId);
      if (!cliente) throw new Error('Seleccione un cliente');
      if (!descripcion) throw new Error('Describa la solicitud');
      fechaApertura = fechaApertura || this.hoy();
      const t = { id: this._id('TIC'), terceroId, documentoId, tipo, descripcion, fechaApertura, plazo: sumarDias(fechaApertura, this.d.config.opciones.slaDias[tipo] || 5), estado: 'abierto', observacion: '' };
      if (tipo === 'retracto') {
        const doc = this.buscar('documentos', documentoId);
        if (!doc) throw new Error('Un retracto debe asociarse al documento de venta');
        const limite = sumarDias(doc.fecha, this.d.config.legal.diasRetracto);
        t.observacion = fechaApertura <= limite
          ? `Dentro del plazo de retracto (hasta ${limite}, contado desde la entrega). Devolver el dinero y emitir nota de crédito.`
          : `Fuera del plazo de retracto (venció ${limite}). Revisar si hubo entrega posterior a la fecha del documento.`;
      }
      if (tipo === 'garantia') {
        const doc = this.buscar('documentos', documentoId);
        if (!doc) throw new Error('Una garantía debe asociarse al documento de venta');
        const limite = sumarDias(doc.fecha, this.d.config.legal.mesesGarantiaLegal * 30);
        t.observacion = fechaApertura <= limite
          ? `Dentro de garantía legal (hasta ${limite}): cliente puede optar a reparación, cambio o devolución.`
          : `Fuera de garantía legal (venció ${limite}). Evaluar garantía voluntaria.`;
      }
      this.d.tickets.push(t);
      if (!silencioso) this._auditar('comercial', 'Ticket creado', `${t.id} ${tipo} — ${cliente.nombre}`);
      this.guardar();
      return t;
    }

    cambiarEstadoTicket(id, estado) {
      this._transicion('ticket', this.buscar('tickets', id), estado);
      this._auditar('comercial', 'Ticket ' + estado, id);
      this.guardar();
    }

    // --- Marketing -------------------------------------------------------------
    guardarCampana(c) {
      if (!c.nombre) throw new Error('Nombre obligatorio');
      const r = { canal: '', presupuesto: 0, inicio: this.hoy(), fin: this.hoy(), ...c, presupuesto: Number(c.presupuesto) || 0 };
      if (r.fin < r.inicio) throw new Error('La fecha de término es anterior al inicio');
      if (c.id) Object.assign(this.buscar('campanas', c.id), r);
      else { r.id = this._id('CAM'); this.d.campanas.push(r); }
      this._auditar('marketing', c.id ? 'Campaña modificada' : 'Campaña creada', r.nombre);
      this.guardar();
      return r;
    }

    resultadoCampana(id) {
      const clientes = this.d.terceros.filter((t) => t.origenCampanaId === id);
      const ids = new Set(clientes.map((c) => c.id));
      const ventas = this.d.documentos.filter((d) => d.clase === 'venta' && ids.has(d.terceroId)).reduce((s, d) => s + d.neto, 0);
      const gasto = this.d.documentos.filter((d) => d.clase === 'compra' && d.campanaId === id).reduce((s, d) => s + d.neto, 0);
      return { clientes: clientes.length, ventas, gasto, cac: clientes.length ? redondear(gasto / clientes.length) : null, roi: gasto ? (ventas - gasto) / gasto : null };
    }

    // Audiencia respetando la protección de datos personales (Ley 21.719)
    audiencia({ soloInactivosDias = 0 } = {}) {
      return this.d.terceros.filter((t) => t.tipo !== 'proveedor' && t.consentimientoDatos && !t.bajaComunicaciones && t.email).filter((t) => {
        if (!soloInactivosDias) return true;
        const ultima = this.d.documentos.filter((d) => d.clase === 'venta' && d.terceroId === t.id).map((d) => d.fecha).sort().pop();
        return !ultima || diasEntre(ultima, this.hoy()) >= soloInactivosDias;
      });
    }

    // --- RR.HH. ----------------------------------------------------------------
    guardarEmpleado(e) {
      const L = this.d.config.legal;
      // Mínimos del contrato (art. 10 Código del Trabajo)
      const faltan = ['nombre', 'rut', 'cargo', 'fechaIngreso', 'tipoContrato', 'sueldoBase', 'jornadaSemanal'].filter((k) => !e[k]);
      if (faltan.length) throw new Error('Faltan datos mínimos del contrato: ' + faltan.join(', '));
      if (!validarRut(e.rut)) throw new Error('RUT no válido');
      const jornada = Number(e.jornadaSemanal);
      if (jornada > L.jornadaMaximaSemanal) throw new Error(`La jornada supera el máximo legal de ${L.jornadaMaximaSemanal} h semanales`);
      const minimo = redondear(L.ingresoMinimo * Math.min(jornada / L.jornadaMaximaSemanal, 1));
      if (Number(e.sueldoBase) < minimo) throw new Error(`Sueldo base inferior al ingreso mínimo proporcional ($${minimo})`);
      if (e.tipoContrato === 'plazo_fijo' && !e.fechaTermino) throw new Error('El contrato a plazo fijo requiere fecha de término');
      if (e.tipoContrato === 'plazo_fijo' && diasEntre(e.fechaIngreso, e.fechaTermino) > 365) throw new Error('Plazo fijo no puede exceder 1 año (2 para profesionales/técnicos: registrar como indefinido o validar)');
      if (!AFP[e.afp]) throw new Error('AFP no válida');
      const r = { renovaciones: 0, fechaFirmaContrato: '', fechaTermino: '', salud: 'Fonasa', sexo: '', colacion: 0, movilizacion: 0, extra: {}, ...e, rut: formatearRut(e.rut) };
      ['sueldoBase', 'jornadaSemanal', 'colacion', 'movilizacion', 'renovaciones'].forEach((k) => (r[k] = Number(r[k]) || 0));
      if (e.id) Object.assign(this.buscar('empleados', e.id), r);
      else { r.id = this._id('EMP'); this.d.empleados.push(r); this.d.config.modulos.rrhh = true; }
      this._auditar('rrhh', e.id ? 'Contrato modificado' : 'Trabajador ingresado', `${r.nombre} — ${r.cargo}`);
      this.guardar();
      return r;
    }

    calcularLiquidacion(empleadoId, { horasExtra = 0, bonos = 0 } = {}) {
      const e = this.buscar('empleados', empleadoId);
      if (!e) throw new Error('Trabajador inexistente');
      const L = this.d.config.legal;
      const base = e.sueldoBase;
      const valorHora = (base / 30) * 28 / (e.jornadaSemanal * 4);
      const montoExtras = redondear(valorHora * 1.5 * Number(horasExtra));
      const gratificacion = redondear(Math.min((base + montoExtras + Number(bonos)) * 0.25, (4.75 * L.ingresoMinimo) / 12));
      const imponibleReal = base + montoExtras + Number(bonos) + gratificacion;
      const imponible = Math.min(imponibleReal, redondear(L.topeImponibleUF * L.valorUF));
      const afp = redondear(imponible * (L.tasaAFP + AFP[e.afp]));
      const salud = redondear(imponible * L.tasaSalud);
      const imponibleCesantia = Math.min(imponibleReal, redondear(L.topeCesantiaUF * L.valorUF));
      const cesantia = e.tipoContrato === 'indefinido' ? redondear(imponibleCesantia * L.cesantiaTrabajadorIndefinido) : 0;
      const tributable = imponibleReal - afp - salud - cesantia;
      const enUTM = tributable / L.valorUTM;
      const [, tasa, rebaja] = TRAMOS_IUSC.find(([hasta]) => enUTM <= hasta);
      const impuesto = Math.max(0, redondear((enUTM * tasa - rebaja) * L.valorUTM));
      const noImponibles = e.colacion + e.movilizacion;
      const liquido = imponibleReal - afp - salud - cesantia - impuesto + noImponibles;
      const cesantiaEmpleador = redondear(imponibleCesantia * (e.tipoContrato === 'indefinido' ? L.cesantiaEmpleadorIndefinido : L.cesantiaEmpleadorPlazoFijo));
      const sis = redondear(imponible * L.sis);
      const mutual = redondear(imponible * L.mutualBase);
      const reforma = redondear(imponible * L.aporteEmpleadorReforma);
      const aportesEmpleador = cesantiaEmpleador + sis + mutual + reforma;
      return {
        empleadoId, base, horasExtra: Number(horasExtra), montoExtras, bonos: Number(bonos), gratificacion, imponible: imponibleReal,
        afp, salud, cesantia, impuesto, noImponibles, liquido,
        aportesEmpleador: { cesantiaEmpleador, sis, mutual, reforma, total: aportesEmpleador },
        costoEmpresa: imponibleReal + noImponibles + aportesEmpleador,
      };
    }

    emitirLiquidacion(empleadoId, periodo, extras = {}) {
      periodo = periodo || periodoDe(this.hoy());
      if (this.d.liquidaciones.some((l) => l.empleadoId === empleadoId && l.periodo === periodo)) throw new Error('Ya existe liquidación para ese período');
      const c = this.calcularLiquidacion(empleadoId, extras);
      const liq = { id: this._id('LIQ'), periodo, fecha: this.hoy(), ...c };
      this.d.liquidaciones.push(liq);
      const cotizaciones = c.afp + c.salud + c.cesantia + c.aportesEmpleador.total;
      this._asiento(this.hoy(), `Remuneraciones ${periodo} — ${this.buscar('empleados', empleadoId).nombre}`, { modulo: 'rrhh', ref: liq.id }, [
        { cuenta: '5201', debe: c.costoEmpresa },
        { cuenta: '2104', haber: cotizaciones },
        { cuenta: '2105', haber: c.impuesto },
        { cuenta: '2103', haber: c.liquido },
      ]);
      this._auditar('rrhh', 'Liquidación emitida', `${liq.id} ${periodo} — líquido $${c.liquido}`);
      this.guardar();
      return liq;
    }

    registrarBienestar(b) {
      if (!this.buscar('empleados', b.empleadoId)) throw new Error('Seleccione un trabajador');
      if (!b.detalle) throw new Error('Agregue un detalle');
      const r = { id: this._id('BIE'), fecha: this.hoy(), tipo: 'beneficio', ...b };
      this.d.bienestar.push(r);
      this._auditar('rrhh', 'Registro de bienestar', `${r.tipo}: ${r.detalle}`);
      this.guardar();
      return r;
    }

    // Canal de denuncias Ley Karin (21.643) — reserva: solo se registra el mínimo
    registrarDenunciaKarin({ fecha, tipo = 'acoso_laboral', medidasResguardo = '' }) {
      fecha = fecha || this.hoy();
      const r = { id: this._id('KAR'), fecha, tipo, estado: 'recibida', plazoInvestigacion: sumarDias(fecha, this.d.config.legal.diasInvestigacionKarin), medidasResguardo };
      this.d.denunciasKarin.push(r);
      this._auditar('rrhh', 'Denuncia Ley Karin recibida', r.id); // sin datos personales en el log
      this.guardar();
      return r;
    }

    cambiarEstadoKarin(id, estado) {
      this._transicion('karin', this.buscar('denunciasKarin', id), estado);
      this._auditar('rrhh', 'Denuncia Ley Karin: ' + estado, id);
      this.guardar();
    }

    // --- Finanzas: reportes ----------------------------------------------------
    saldos(hasta) {
      const s = {};
      for (const a of this.d.asientos) {
        if (hasta && a.fecha > hasta) continue;
        for (const l of a.lineas) s[l.cuenta] = (s[l.cuenta] || 0) + (l.debe || 0) - (l.haber || 0);
      }
      return s;
    }

    resumenIVA(periodo) {
      periodo = periodo || periodoDe(this.hoy());
      const docs = this.d.documentos.filter((d) => periodoDe(d.fecha) === periodo);
      const debito = docs.filter((d) => d.clase === 'venta').reduce((s, d) => s + d.iva, 0);
      const credito = docs.filter((d) => d.clase === 'compra' && !d.anulado).reduce((s, d) => s + d.iva, 0);
      const retenciones = docs.filter((d) => d.tipo === 'boleta_honorarios').reduce((s, d) => s + d.retencion, 0);
      const impuestoUnico = this.d.liquidaciones.filter((l) => l.periodo === periodo).reduce((s, l) => s + l.impuesto, 0);
      const ingresos = docs.filter((d) => d.clase === 'venta').reduce((s, d) => s + d.neto, 0);
      const ppm = Math.max(0, redondear(ingresos * this.d.config.legal.ppmTasa));
      const [y, m] = periodo.split('-').map(Number);
      const sig = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      const aPagar = Math.max(debito - credito, 0);
      return { periodo, debito, credito, aPagar, remanente: Math.max(credito - debito, 0), retenciones, impuestoUnico, ppm, totalF29: aPagar + retenciones + impuestoUnico + ppm, vencimientoF29: `${sig}-${String(this.d.config.legal.diaVencimientoF29).padStart(2, '0')}` };
    }

    cuentasPendientes(clase) {
      return this.d.documentos.filter((d) => d.clase === clase && d.total - d.pagado > 0 && !d.anulado)
        .map((d) => ({ ...d, saldo: d.total - d.pagado, diasVencido: Math.max(0, diasEntre(d.vencimiento, this.hoy())) }));
    }

    // --- Dirección: la vista integrada ----------------------------------------
    indicadores(periodo) {
      periodo = periodo || periodoDe(this.hoy());
      const delMes = (d) => periodoDe(d.fecha) === periodo;
      const ventas = this.d.documentos.filter((d) => d.clase === 'venta' && delMes(d));
      const ventasNetas = ventas.reduce((s, d) => s + d.neto, 0);
      const costoVentas = this.d.asientos.filter(delMes).flatMap((a) => a.lineas).filter((l) => l.cuenta === '5101').reduce((s, l) => s + (l.debe || 0) - (l.haber || 0), 0);
      const nomina = this.d.liquidaciones.filter((l) => l.periodo === periodo).reduce((s, l) => s + l.costoEmpresa, 0);
      const gastos = this.d.documentos.filter((d) => d.clase === 'compra' && !['inventario', 'retiro'].includes(d.destino) && !d.anulado && delMes(d)).reduce((s, d) => s + d.neto, 0);
      const porCobrar = this.cuentasPendientes('venta');
      const porPagar = this.cuentasPendientes('compra');
      const s = this.saldos();
      return {
        periodo, ventasNetas, documentosVenta: ventas.filter((d) => d.tipo !== 'nota_credito').length,
        margenBruto: ventasNetas - costoVentas,
        margenPct: ventasNetas ? (ventasNetas - costoVentas) / ventasNetas : null,
        resultadoOperacional: ventasNetas - costoVentas - nomina - gastos,
        nomina, nominaSobreVentas: ventasNetas ? nomina / ventasNetas : null,
        caja: s['1101'] || 0,
        porCobrar: porCobrar.reduce((t, d) => t + d.saldo, 0),
        porCobrarVencido: porCobrar.filter((d) => d.diasVencido > 0).reduce((t, d) => t + d.saldo, 0),
        porPagar: porPagar.reduce((t, d) => t + d.saldo, 0),
        inventarioValorizado: this.d.productos.reduce((t, p) => t + (p.tipo === 'servicio' ? 0 : Math.max(p.stock, 0) * p.costo), 0),
        ticketsAbiertos: this.d.tickets.filter((t) => !['resuelto', 'cerrado'].includes(t.estado) && t.fechaApertura <= this.hoy()).length,
        dotacion: this.d.empleados.length,
        clientes: this.d.terceros.filter((t) => t.tipo !== 'proveedor').length,
        iva: this.resumenIVA(periodo),
      };
    }

    // Qué tan cerca está la empresa de cada obligación que se activa al crecer
    umbrales() {
      const desde = sumarDias(this.hoy(), -365);
      const ventas12m = this.d.documentos.filter((d) => d.clase === 'venta' && d.fecha > desde).reduce((s, d) => s + d.neto, 0);
      const valores = {
        trabajadores: this.d.empleados.length,
        trabajadoras: this.d.empleados.filter((e) => e.sexo === 'F').length,
        ventasUF: Math.round(ventas12m / this.d.config.legal.valorUF),
      };
      return UMBRALES.map((u) => {
        const valor = valores[u.medida];
        const faltan = u.umbral - valor;
        const cerca = u.medida === 'ventasUF' ? valor >= u.umbral * 0.8 : faltan <= 2;
        return { ...u, valor, faltan, estado: faltan <= 0 ? 'activa' : cerca ? 'cerca' : 'lejos' };
      });
    }

    alertas() {
      const hoy = this.hoy();
      const L = this.d.config.legal;
      const A = [];
      const add = (nivel, modulo, mensaje) => A.push({ nivel, modulo, mensaje });

      // RR.HH. — cumplimiento laboral
      for (const e of this.d.empleados) {
        const plazoEscritura = e.tipoContrato !== 'indefinido' && e.fechaTermino && diasEntre(e.fechaIngreso, e.fechaTermino) < 30 ? L.diasEscrituraContratoCorto : L.diasEscrituraContrato;
        if (!e.fechaFirmaContrato) {
          const dias = diasEntre(e.fechaIngreso, hoy);
          if (dias > plazoEscritura) add('critica', 'rrhh', `${e.nombre}: contrato sin firmar hace ${dias} días (plazo legal ${plazoEscritura}).`);
          else add('aviso', 'rrhh', `${e.nombre}: firmar contrato antes de ${sumarDias(e.fechaIngreso, plazoEscritura)}.`);
        }
        if (e.tipoContrato === 'plazo_fijo' && e.fechaTermino) {
          const d = diasEntre(hoy, e.fechaTermino);
          if (d < 0) add('critica', 'rrhh', `${e.nombre}: plazo fijo vencido el ${e.fechaTermino}; si sigue trabajando, el contrato pasa a indefinido.`);
          else if (d <= 15) add('aviso', 'rrhh', `${e.nombre}: plazo fijo vence en ${d} días${e.renovaciones >= 1 ? ' — una segunda renovación lo convierte en indefinido' : ''}.`);
        }
        if (e.jornadaSemanal > L.jornadaMaximaSemanal) add('critica', 'rrhh', `${e.nombre}: jornada (${e.jornadaSemanal} h) sobre el máximo legal vigente (${L.jornadaMaximaSemanal} h).`);
      }
      const periodoAnterior = periodoDe(sumarDias(hoy.slice(0, 8) + '01', -1));
      const sinLiq = this.d.empleados.filter((e) => e.fechaIngreso <= periodoAnterior + '-31' && !this.d.liquidaciones.some((l) => l.empleadoId === e.id && l.periodo === periodoAnterior));
      if (sinLiq.length) add('aviso', 'rrhh', `${sinLiq.length} trabajador(es) sin liquidación de ${periodoAnterior}. Cotizaciones vencen el día 13 (Previred).`);
      for (const k of this.d.denunciasKarin.filter((x) => x.estado !== 'cerrada' && x.estado !== 'informe_enviado')) {
        const d = diasEntre(hoy, k.plazoInvestigacion);
        add(d < 5 ? 'critica' : 'aviso', 'rrhh', `Denuncia Ley Karin ${k.id}: ${d < 0 ? 'plazo de investigación vencido' : `quedan ${d} días de investigación`}.`);
      }

      // Finanzas — tributario
      const ivaAnterior = this.resumenIVA(periodoAnterior);
      if (ivaAnterior.totalF29) {
        const d = diasEntre(hoy, ivaAnterior.vencimientoF29);
        if (d >= 0 && d <= 10) add('aviso', 'finanzas', `F29 de ${periodoAnterior} vence el ${ivaAnterior.vencimientoF29}: total estimado $${ivaAnterior.totalF29.toLocaleString('es-CL')} (IVA, retenciones, impuesto único y PPM).`);
      }
      for (const doc of this.d.documentos.filter((x) => x.tipo === 'factura_compra' && this.estadoAcuse(x) === 'pendiente')) {
        const d = this.diasParaReclamar(doc);
        add(d <= 2 ? 'critica' : 'aviso', 'finanzas', `Factura ${doc.folio} de ${this.buscar('terceros', doc.terceroId)?.nombre}: ${d === 0 ? 'hoy es el último día' : `quedan ${d} días`} para reclamarla en el SII. Después queda aceptada y se puede cobrar judicialmente.`);
      }
      if (this.d.config.opciones.interesMora) {
        const morosas = this.cuentasPendientes('venta').filter((x) => x.tipo === 'factura' && diasEntre(x.fecha, hoy) > 30);
        if (morosas.length) add('info', 'finanzas', `${morosas.length} factura(s) con más de 30 días: puede cobrar interés por mora con nota de débito (Ley 21.131).`);
      }
      const vencidas = this.cuentasPendientes('venta').filter((x) => x.diasVencido > 0);
      if (vencidas.length) add('aviso', 'finanzas', `${vencidas.length} factura(s) de clientes vencidas por $${vencidas.reduce((s, x) => s + x.saldo, 0).toLocaleString('es-CL')}.`);
      const pagosProx = this.cuentasPendientes('compra').filter((x) => diasEntre(hoy, x.vencimiento) <= 7);
      if (pagosProx.length) add('info', 'finanzas', `${pagosProx.length} pago(s) a proveedores vencen esta semana.`);
      if ((this.saldos()['1101'] || 0) < 0) add('critica', 'finanzas', 'Saldo de caja negativo: revisar flujo.');

      // Producción
      for (const p of this.d.productos.filter((p) => p.tipo !== 'servicio' && p.stock <= p.stockMinimo)) {
        add('aviso', 'produccion', `${p.nombre}: stock ${p.stock} bajo el mínimo (${p.stockMinimo}). ${p.tipo === 'insumo' ? 'Generar compra.' : this.d.config.opciones.ordenesProduccion ? 'Planificar producción.' : 'Reponer.'}`);
      }
      for (const p of this.d.productos.filter((p) => p.extra && p.extra.vencimiento && diasEntre(hoy, p.extra.vencimiento) <= 7)) {
        add('aviso', 'produccion', `${p.nombre}: vence el ${p.extra.vencimiento}.`);
      }
      for (const e of this.d.empleados.filter((e) => e.extra && e.extra.manipulador === 'No' && this.d.config.empresa.rubro === 'manufactura')) {
        add('aviso', 'rrhh', `${e.nombre}: sin curso de manipulador de alimentos (exigencia sanitaria).`);
      }

      // Comercial
      for (const t of this.d.tickets.filter((t) => !['resuelto', 'cerrado'].includes(t.estado) && t.plazo < hoy)) {
        add(t.tipo === 'reclamo' || t.tipo === 'garantia' ? 'critica' : 'aviso', 'comercial', `Ticket ${t.id} (${t.tipo}) fuera de plazo desde ${t.plazo}.`);
      }

      // Marketing
      for (const c of this.d.campanas) {
        const r = this.resultadoCampana(c.id);
        if (r.gasto > c.presupuesto) add('aviso', 'marketing', `Campaña "${c.nombre}" sobre presupuesto ($${r.gasto.toLocaleString('es-CL')} de $${c.presupuesto.toLocaleString('es-CL')}).`);
      }
      const sinConsentimiento = this.d.terceros.filter((t) => t.tipo !== 'proveedor' && !t.consentimientoDatos).length;
      if (sinConsentimiento) add('info', 'marketing', `${sinConsentimiento} cliente(s) sin consentimiento de datos: excluidos de campañas (Ley 21.719).`);

      // Crecimiento: obligaciones que se activan por tamaño
      for (const u of this.umbrales()) {
        if (u.estado === 'cerca') add('aviso', u.area, `A ${u.faltan.toLocaleString('es-CL')} ${u.medida === 'ventasUF' ? 'UF de ventas' : u.medida} de una nueva obligación: ${u.obligacion}.`);
      }

      const orden = { critica: 0, aviso: 1, info: 2 };
      return A.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
    }
  }

  const api = { ERP, MODULOS, PLANTILLAS, PLAN_CUENTAS, FLUJOS, AFP, LEGAL_POR_DEFECTO, LEGAL_META, UMBRALES, LIMITE_CAMPOS_PERSONALIZADOS, validarRut, formatearRut, rutDesdeNumero, sumarDias, diasEntre, periodoDe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.NucleoERP = api;
})(typeof window !== 'undefined' ? window : globalThis);
