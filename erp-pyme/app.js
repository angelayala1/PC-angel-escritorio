/* Interfaz del ERP Pyme. Toda la lógica vive en nucleo.js; aquí solo se dibuja. */
(function () {
  'use strict';
  const { ERP, MODULOS, PLANTILLAS, PLAN_CUENTAS, FLUJOS, AFP, LEGAL_POR_DEFECTO, LEGAL_META, LIMITE_CAMPOS_PERSONALIZADOS, periodoDe } = window.NucleoERP;

  const almacen = {
    leer: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    escribir: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: queda en memoria */ } },
  };
  let erp;
  try { erp = new ERP({ almacen }); } catch { erp = new ERP(); }

  // ---------------------------------------------------------------------------
  // Utilidades de presentación
  // ---------------------------------------------------------------------------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (n) => '$' + Math.round(n || 0).toLocaleString('es-CL');
  const pct = (n) => (n === null || n === undefined ? '—' : (n * 100).toFixed(1) + '%');
  const fecha = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');
  const nombreTercero = (id) => erp.buscar('terceros', id)?.nombre || 'Consumidor final';
  const nombreProducto = (id) => erp.buscar('productos', id)?.nombre || '—';
  const nombreEmpleado = (id) => erp.buscar('empleados', id)?.nombre || '—';
  const etiquetaEstado = (e) => String(e).replace(/_/g, ' ');
  const chip = (texto, tono = '') => `<span class="chip ${tono}">${esc(texto)}</span>`;
  const MOD_CORTO = { direccion: 'Dirección', comercial: 'Comercial', finanzas: 'Finanzas', rrhh: 'RR.HH.', produccion: 'Producción', marketing: 'Marketing', configuracion: 'Config.', apertura: 'Finanzas' };
  const chipModulo = (m) => `<span class="mod mod-${esc(m)}">${esc(MOD_CORTO[m] || m)}</span>`;

  const estado = {
    vista: 'direccion',
    sub: { comercial: 'ventas', finanzas: 'iva', marketing: 'campanas', rrhh: 'trabajadores', produccion: 'inventario', configuracion: 'empresa' },
    edicion: {}, lineas: { venta: 2, compra: 2 }, periodo: periodoDe(erp.hoy()), liquidacion: null, confirmarReinicio: false, respaldo: '',
  };

  // ---------------------------------------------------------------------------
  // Formularios y tablas genéricos
  // ---------------------------------------------------------------------------
  function campo(c, valor) {
    const id = 'f-' + c.form + '-' + c.k.replace(/\./g, '-');
    const req = c.req ? ' required' : '';
    if (c.tipo === 'hidden') return `<input type="hidden" name="${c.k}" value="${esc(valor)}">`;
    let input;
    if (c.tipo === 'select') {
      input = `<select id="${id}" name="${c.k}"${req}>${c.vacio ? `<option value="">${esc(c.vacio)}</option>` : ''}${c.opciones.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(valor ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    } else if (c.tipo === 'checkbox') {
      return `<label class="check" for="${id}"><input type="checkbox" id="${id}" name="${c.k}"${valor ? ' checked' : ''}> ${esc(c.label)}</label>`;
    } else if (c.tipo === 'textarea') {
      input = `<textarea id="${id}" name="${c.k}" rows="2"${req}>${esc(valor)}</textarea>`;
    } else {
      input = `<input id="${id}" name="${c.k}" type="${c.tipo || 'text'}"${c.tipo === 'number' ? ` step="${c.paso || 'any'}"` : ''} value="${esc(valor)}"${req}${c.ph ? ` placeholder="${esc(c.ph)}"` : ''}>`;
    }
    return `<label class="campo${c.ancho ? ' ancho' : ''}" for="${id}"><span>${esc(c.label)}${c.req ? ' *' : ''}</span>${input}${c.ayuda ? `<small>${esc(c.ayuda)}</small>` : ''}</label>`;
  }

  // Los campos personalizados del rubro se agregan solos a los formularios
  function camposExtra(entidad) {
    return erp.d.config.camposPersonalizados[entidad].map((c) => ({
      k: 'extra.' + c.clave, label: c.etiqueta,
      tipo: c.tipo === 'numero' ? 'number' : c.tipo === 'fecha' ? 'date' : c.tipo === 'lista' ? 'select' : 'text',
      opciones: (c.opciones || []).map((o) => [o, o]), vacio: c.tipo === 'lista' ? '—' : undefined, personalizado: true,
    }));
  }

  function formulario(nombre, accion, campos, valores = {}, boton = 'Guardar', extraHtml = '') {
    const val = (k) => k.split('.').reduce((o, p) => (o ? o[p] : undefined), valores);
    const base = campos.filter((c) => !c.personalizado), pers = campos.filter((c) => c.personalizado);
    const editando = valores.id ? `<input type="hidden" name="id" value="${esc(valores.id)}">` : '';
    return `<form class="formulario" data-accion="${accion}" novalidate>
      ${editando}
      <div class="rejilla">${base.map((c) => campo({ ...c, form: nombre }, val(c.k))).join('')}</div>
      ${pers.length ? `<fieldset class="personalizados"><legend>Campos de tu rubro</legend><div class="rejilla">${pers.map((c) => campo({ ...c, form: nombre }, val(c.k))).join('')}</div></fieldset>` : ''}
      ${extraHtml}
      <div class="acciones-form"><button class="btn primario" type="submit">${esc(boton)}</button>${valores.id ? `<button class="btn" type="button" data-accion="cancelarEdicion" data-entidad="${nombre}">Cancelar</button>` : ''}</div>
    </form>`;
  }

  function leerFormulario(form) {
    const o = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim();
      const partes = el.name.split('.');
      if (partes.length === 2) (o[partes[0]] = o[partes[0]] || {})[partes[1]] = v;
      else o[el.name] = v;
    }
    return o;
  }

  function tabla(columnas, filas, vacio = 'Sin registros todavía.') {
    if (!filas.length) return `<p class="vacio">${esc(vacio)}</p>`;
    return `<div class="tabla-wrap"><table><thead><tr>${columnas.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.t)}</th>`).join('')}</tr></thead>
      <tbody>${filas.map((f) => `<tr>${columnas.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.v(f)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  const btn = (texto, accion, datos = {}, tono = '') =>
    `<button type="button" class="btn mini ${tono}" data-accion="${accion}"${Object.entries(datos).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}>${esc(texto)}</button>`;

  const seccion = (titulo, cuerpo, nota = '') => `<section class="bloque"><header><h3>${esc(titulo)}</h3>${nota ? `<p class="nota">${nota}</p>` : ''}</header>${cuerpo}</section>`;

  function pestañas(vista, opciones) {
    return `<nav class="pestanas" aria-label="Secciones">${opciones.map(([k, l]) => `<button type="button" class="${estado.sub[vista] === k ? 'activa' : ''}" data-accion="sub" data-vista="${vista}" data-sub="${k}">${esc(l)}</button>`).join('')}</nav>`;
  }

  // ---------------------------------------------------------------------------
  // Vistas
  // ---------------------------------------------------------------------------
  const opcionesTerceros = (tipo) => erp.d.terceros.filter((t) => t.tipo === tipo || t.tipo === 'ambos').map((t) => [t.id, `${t.nombre} · ${t.rut}`]);
  const opcionesProductos = (filtro) => erp.d.productos.filter(filtro).map((p) => [p.id, `${p.sku} · ${p.nombre}`]);
  const opcionesCampanas = () => erp.d.campanas.map((c) => [c.id, c.nombre]);

  const VISTAS = {
    direccion() {
      const i = erp.indicadores(estado.periodo);
      const alertas = erp.alertas().filter((a) => erp.moduloActivo(a.modulo));
      const periodos = [...new Set([periodoDe(erp.hoy()), ...erp.d.documentos.map((d) => periodoDe(d.fecha))])].sort().reverse();
      const tile = (t, v, sub = '', tono = '') => `<div class="kpi ${tono}"><span class="kpi-t">${t}</span><strong>${v}</strong>${sub ? `<span class="kpi-s">${sub}</span>` : ''}</div>`;
      const conteo = { critica: 0, aviso: 0, info: 0 };
      alertas.forEach((a) => conteo[a.nivel]++);
      return `
        <div class="cabecera-vista">
          <div><h2>Panel de dirección</h2><p class="lead">Lo que pasa en cada área, leído en un solo lugar.</p></div>
          <label class="campo compacto" for="f-periodo"><span>Período</span><select id="f-periodo" data-accion="periodo">${periodos.map((p) => `<option${p === estado.periodo ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
        </div>
        <div class="kpis">
          ${tile('Ventas netas', $(i.ventasNetas), `${i.documentosVenta} documento(s)`)}
          ${tile('Margen bruto', $(i.margenBruto), pct(i.margenPct))}
          ${tile('Resultado operacional', $(i.resultadoOperacional), 'ventas − costo − nómina − gastos', i.resultadoOperacional < 0 ? 'malo' : '')}
          ${tile('Caja', $(i.caja), 'saldo contable', i.caja < 0 ? 'malo' : '')}
          ${tile('Por cobrar', $(i.porCobrar), `vencido ${$(i.porCobrarVencido)}`, i.porCobrarVencido ? 'atencion' : '')}
          ${tile('Por pagar', $(i.porPagar), 'proveedores')}
          ${tile('F29 estimado', $(i.iva.totalF29), `IVA ${$(i.iva.aPagar)} · vence ${fecha(i.iva.vencimientoF29)}`)}
          ${tile('Nómina', $(i.nomina), `${pct(i.nominaSobreVentas)} de ventas · ${i.dotacion} pers.`)}
        </div>
        <div class="dos-col">
          <section class="bloque">
            <header><h3>Alertas de gestión y cumplimiento</h3><p class="nota">${conteo.critica} críticas · ${conteo.aviso} avisos · ${conteo.info} informativas</p></header>
            <ul class="alertas">${alertas.map((a) => `<li class="alerta ${a.nivel}"><span class="nivel">${a.nivel === 'critica' ? 'Crítica' : a.nivel === 'aviso' ? 'Aviso' : 'Info'}</span>${chipModulo(a.modulo)}<span class="msg">${esc(a.mensaje)}</span></li>`).join('') || '<li class="vacio">Sin alertas. Todo en regla.</li>'}</ul>
          </section>
          <section class="bloque">
            <header><h3>Cómo conversan los módulos</h3><p class="nota">Últimas operaciones y su efecto en otras áreas</p></header>
            ${mapaFlujo()}
            <ol class="bitacora">${erp.d.auditoria.slice(0, 8).map((a) => `<li>${chipModulo(a.modulo)}<div><b>${esc(a.accion)}</b><span>${esc(a.detalle)}</span></div></li>`).join('')}</ol>
          </section>
        </div>
        ${seccion('Obligaciones que llegan al crecer', tablaUmbrales(), 'Se activan por número de trabajadores o por ventas de los últimos 12 meses. El sistema avisa antes de cruzar cada umbral.')}
        ${erp.moduloActivo('marketing') ? seccion('Retorno de campañas', tablaCampanas()) : ''}`;
    },

    comercial() {
      const sub = estado.sub.comercial;
      let cuerpo = '';
      if (sub === 'ventas') {
        const filas = Array.from({ length: estado.lineas.venta }, (_, n) => `<div class="linea">
          ${campo({ form: 'venta', k: `linea_producto_${n}`, label: `Ítem ${n + 1}`, tipo: 'select', vacio: 'Seleccionar…', opciones: opcionesProductos((p) => p.tipo !== 'insumo').map(([id, l]) => { const p = erp.buscar('productos', id); return [id, `${l} · ${$(p.precioNeto)}${p.tipo !== 'servicio' ? ` · stock ${p.stock}` : ''}`]; }) })}
          ${campo({ form: 'venta', k: `linea_cantidad_${n}`, label: 'Cantidad', tipo: 'number' })}</div>`).join('');
        cuerpo = seccion('Emitir documento de venta', formulario('venta', 'emitirVenta', [
          { k: 'tipo', label: 'Documento', tipo: 'select', opciones: [['factura', 'Factura electrónica'], ['boleta', 'Boleta electrónica']] },
          { k: 'terceroId', label: 'Cliente', tipo: 'select', vacio: 'Consumidor final (solo boleta)', opciones: opcionesTerceros('cliente') },
          { k: 'fecha', label: 'Fecha', tipo: 'date' },
          { k: 'diasCredito', label: 'Días de crédito', tipo: 'number', ayuda: 'Solo facturas' },
          { k: 'ordenCompra', label: 'N° orden de compra', ayuda: 'Obligatoria si el cliente la exige' },
        ], { fecha: erp.hoy(), diasCredito: 30 }, 'Emitir', `<div class="lineas">${filas}</div><button type="button" class="btn mini" data-accion="masLinea" data-doc="venta">+ Agregar ítem</button>`),
        'Al emitir: folio correlativo, IVA, asiento contable, rebaja de stock y seguimiento de postventa.')
          + seccion('Libro de ventas', tabla([
            { t: 'Doc.', v: (d) => `${esc(d.tipo.replace('_', ' '))} <b>${d.folio}</b>${d.anulado ? ' ' + chip('anulada', 'malo') : ''}` },
            { t: 'Fecha', v: (d) => fecha(d.fecha) },
            { t: 'Cliente', v: (d) => esc(nombreTercero(d.terceroId)) + (d.ordenCompra ? `<br><small>OC ${esc(d.ordenCompra)}</small>` : '') },
            { t: 'Neto', num: true, v: (d) => $(d.neto) }, { t: 'IVA', num: true, v: (d) => $(d.iva) }, { t: 'Total', num: true, v: (d) => $(d.total) },
            { t: 'Saldo', num: true, v: (d) => (d.total - d.pagado ? $(d.total - d.pagado) : chip('pagado', 'bueno')) },
            { t: '', v: (d) => d.tipo === 'nota_credito' || d.anulado ? '' : (d.total - d.pagado > 0 ? btn('Cobrar saldo', 'pagar', { id: d.id }) : '') + btn('Anular (NC)', 'pedirMotivo', { tipo: 'nc', id: d.id }, 'peligro') },
          ], erp.d.documentos.filter((d) => d.clase === 'venta').slice().reverse()));
      }
      if (sub === 'compras') {
        const filas = Array.from({ length: estado.lineas.compra }, (_, n) => `<div class="linea">
          ${campo({ form: 'compra', k: `linea_producto_${n}`, label: `Ítem ${n + 1}`, tipo: 'select', vacio: 'Seleccionar…', opciones: opcionesProductos((p) => p.tipo !== 'servicio') })}
          ${campo({ form: 'compra', k: `linea_cantidad_${n}`, label: 'Cantidad', tipo: 'number' })}
          ${campo({ form: 'compra', k: `linea_costo_${n}`, label: 'Costo neto unit.', tipo: 'number' })}</div>`).join('');
        cuerpo = seccion('Registrar documento de proveedor', formulario('compra', 'registrarCompra', [
          { k: 'terceroId', label: 'Proveedor', tipo: 'select', req: true, vacio: 'Seleccionar…', opciones: opcionesTerceros('proveedor') },
          { k: 'folioProveedor', label: 'Folio del documento', req: true },
          { k: 'fecha', label: 'Fecha de emisión', tipo: 'date' },
          { k: 'fechaRecepcion', label: 'Recibida en el SII el', tipo: 'date', ayuda: 'Desde aquí corren los 8 días para reclamar' },
          { k: 'diasCredito', label: 'Días de crédito', tipo: 'number' },
          { k: 'destino', label: 'Destino', tipo: 'select', opciones: Object.entries(DESTINOS) },
          { k: 'campanaId', label: 'Campaña (si es marketing)', tipo: 'select', vacio: '—', opciones: opcionesCampanas() },
          { k: 'montoNeto', label: 'Monto (gastos: neto; honorarios: bruto)', tipo: 'number' },
          { k: 'glosa', label: 'Glosa', ancho: true },
        ], { fecha: erp.hoy(), fechaRecepcion: erp.hoy(), diasCredito: 30 }, 'Registrar compra', `<p class="nota">Ítems (solo para destino inventario): actualizan stock y costo promedio.</p><div class="lineas">${filas}</div><button type="button" class="btn mini" data-accion="masLinea" data-doc="compra">+ Agregar ítem</button>`),
        'Marketing alimenta el retorno de la campaña. Honorarios retiene el impuesto. El gasto personal del dueño se registra como retiro: no es gasto de la empresa ni da derecho a IVA crédito.')
          + seccion('Libro de compras', tabla([
            { t: 'Folio', v: (d) => `<b>${esc(d.folio)}</b>` }, { t: 'Fecha', v: (d) => fecha(d.fecha) },
            { t: 'Proveedor', v: (d) => esc(nombreTercero(d.terceroId)) },
            { t: 'Destino', v: (d) => chip(DESTINOS[d.destino] || d.destino) + (d.campanaId ? '<br><small>' + esc(erp.buscar('campanas', d.campanaId)?.nombre || '') + '</small>' : '') },
            { t: 'Neto', num: true, v: (d) => $(d.neto) }, { t: 'IVA', num: true, v: (d) => $(d.iva) },
            { t: 'Total', num: true, v: (d) => $(d.total) + (d.retencion ? `<br><small>ret. ${$(d.retencion)}</small>` : '') },
            { t: 'Acuse SII', v: celdaAcuse },
            { t: 'Saldo', num: true, v: (d) => (d.anulado ? chip('reclamada', 'malo') : d.total - d.pagado ? $(d.total - d.pagado) : chip('pagado', 'bueno')) },
            { t: '', v: (d) => (!d.anulado && d.total - d.pagado > 0 ? btn('Pagar', 'pagar', { id: d.id }) : '') },
          ], erp.d.documentos.filter((d) => d.clase === 'compra').slice().reverse()));
      }
      if (sub === 'terceros') {
        const ed = estado.edicion.tercero ? erp.buscar('terceros', estado.edicion.tercero) : { tipo: 'cliente' };
        cuerpo = seccion(ed.id ? 'Editar ' + ed.nombre : 'Nuevo cliente o proveedor', formulario('tercero', 'guardarTercero', [
          { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: [['cliente', 'Cliente'], ['proveedor', 'Proveedor'], ['ambos', 'Ambos']] },
          { k: 'rut', label: 'RUT', req: true, ph: '12.345.678-5' },
          { k: 'nombre', label: 'Nombre o razón social', req: true, ancho: true },
          { k: 'email', label: 'Correo', tipo: 'email' }, { k: 'telefono', label: 'Teléfono' },
          { k: 'origenCampanaId', label: 'Llegó por campaña', tipo: 'select', vacio: 'Sin campaña / no sabe', opciones: opcionesCampanas() },
          { k: 'consentimientoDatos', label: 'Autoriza uso de datos para comunicaciones (Ley 21.719)', tipo: 'checkbox' },
          { k: 'medioConsentimiento', label: 'Cómo autorizó', ph: 'Formulario web, firma en tienda…' },
          { k: 'bajaComunicaciones', label: 'Pidió no recibir comunicaciones', tipo: 'checkbox' },
          { k: 'exigeOC', label: 'Exige orden de compra para facturarle', tipo: 'checkbox' },
          ...camposExtra('tercero'),
        ], ed))
          + seccion('Cartera', tabla([
            { t: 'Nombre', v: (t) => `<b>${esc(t.nombre)}</b><br><small>${esc(t.rut)}</small>` },
            { t: 'Tipo', v: (t) => chip(t.tipo) },
            { t: 'Contacto', v: (t) => esc(t.email) + (t.telefono ? '<br><small>' + esc(t.telefono) + '</small>' : '') },
            { t: 'Ventas', num: true, v: (t) => $(erp.d.documentos.filter((d) => d.clase === 'venta' && d.terceroId === t.id).reduce((s, d) => s + d.neto, 0)) },
            { t: 'Tickets', num: true, v: (t) => erp.d.tickets.filter((x) => x.terceroId === t.id).length },
            { t: 'Datos personales', v: (t) => (t.datosSuprimidos ? chip('suprimidos', 'malo') + `<br><small>${fecha(t.datosSuprimidos)}</small>`
              : (t.consentimientoDatos ? chip('consentido', 'bueno') + `<br><small>${fecha(t.fechaConsentimiento)} · ${esc(t.medioConsentimiento)}</small>` : chip('sin consentimiento', 'atencion'))
                + (t.bajaComunicaciones ? '<br>' + chip('no contactar', 'malo') : '')) },
            ...erp.d.config.camposPersonalizados.tercero.map((c) => ({ t: c.etiqueta, v: (t) => esc(t.extra?.[c.clave]) })),
            { t: '', v: (t) => btn('Editar', 'editar', { entidad: 'tercero', id: t.id }) + (t.tipo !== 'proveedor' && !t.datosSuprimidos ? btn('Suprimir datos', 'pedirMotivo', { tipo: 'supresion', id: t.id }, 'peligro') : '') },
          ], erp.d.terceros), 'Suprimir datos borra contacto y campos propios. Nombre y RUT se conservan porque las boletas y facturas deben guardarse 6 años.');
      }
      if (sub === 'postventa') {
        const docsVenta = erp.d.documentos.filter((d) => d.clase === 'venta' && d.tipo !== 'nota_credito').map((d) => [d.id, `${d.tipo} ${d.folio} · ${fecha(d.fecha)} · ${nombreTercero(d.terceroId)}`]);
        cuerpo = seccion('Nueva solicitud', formulario('ticket', 'crearTicket', [
          { k: 'terceroId', label: 'Cliente', tipo: 'select', req: true, vacio: 'Seleccionar…', opciones: opcionesTerceros('cliente') },
          { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: [['consulta', 'Consulta'], ['reclamo', 'Reclamo'], ['garantia', 'Garantía legal'], ['retracto', 'Retracto (compra a distancia)'], ['postventa', 'Seguimiento postventa']] },
          { k: 'documentoId', label: 'Documento asociado', tipo: 'select', vacio: '—', opciones: docsVenta },
          { k: 'descripcion', label: 'Descripción', tipo: 'textarea', req: true, ancho: true },
        ], {}, 'Abrir ticket'), `Plazos de respuesta (SLA) según tipo; las garantías se verifican contra los ${erp.d.config.legal.mesesGarantiaLegal} meses de la Ley 19.496 y los retractos contra sus ${erp.d.config.legal.diasRetracto} días.`)
          + seccion('Tickets', tabla([
            { t: 'Ticket', v: (t) => `<b>${t.id}</b><br>${chip(t.tipo)}` },
            { t: 'Cliente', v: (t) => esc(nombreTercero(t.terceroId)) },
            { t: 'Detalle', v: (t) => esc(t.descripcion) + (t.observacion ? `<br><small class="obs">${esc(t.observacion)}</small>` : '') },
            { t: 'Abre', v: (t) => fecha(t.fechaApertura) },
            { t: 'Plazo', v: (t) => fecha(t.plazo) + (!['resuelto', 'cerrado'].includes(t.estado) && t.plazo < erp.hoy() ? ' ' + chip('vencido', 'malo') : '') },
            { t: 'Estado', v: (t) => chip(etiquetaEstado(t.estado), t.estado === 'cerrado' || t.estado === 'resuelto' ? 'bueno' : '') },
            { t: '', v: (t) => FLUJOS.ticket[t.estado].map((e) => btn(etiquetaEstado(e), 'estadoTicket', { id: t.id, estado: e })).join('') },
          ], erp.d.tickets.slice().reverse()));
      }
      return cabecera('Comercial', 'Clientes, proveedores, ventas, compras y la atención antes y después de vender.')
        + pestañas('comercial', [['ventas', 'Ventas'], ['compras', 'Compras'], ['terceros', 'Clientes y proveedores'], ['postventa', 'Atención y postventa']]) + cuerpo;
    },

    finanzas() {
      const sub = estado.sub.finanzas;
      let cuerpo = '';
      if (sub === 'iva') {
        const periodos = [...new Set([periodoDe(erp.hoy()), ...erp.d.documentos.map((d) => periodoDe(d.fecha))])].sort().reverse();
        cuerpo = seccion('Propuesta de F29 por mes', tabla([
          { t: 'Período', v: (r) => `<b>${r.periodo}</b>` }, { t: 'Débito fiscal', num: true, v: (r) => $(r.debito) }, { t: 'Crédito fiscal', num: true, v: (r) => $(r.credito) },
          { t: 'IVA a pagar', num: true, v: (r) => $(r.aPagar) }, { t: 'Retención honorarios', num: true, v: (r) => $(r.retenciones) },
          { t: 'Impuesto único', num: true, v: (r) => $(r.impuestoUnico) }, { t: 'PPM', num: true, v: (r) => $(r.ppm) },
          { t: 'Total F29', num: true, v: (r) => `<b>${$(r.totalF29)}</b>` }, { t: 'Remanente IVA', num: true, v: (r) => $(r.remanente) }, { t: 'Vence', v: (r) => fecha(r.vencimientoF29) },
        ], periodos.map((p) => erp.resumenIVA(p))), `La declaración real se hace en sii.cl; esta tabla prepara los montos. PPM a ${(erp.d.config.legal.ppmTasa * 100).toFixed(3)} % de las ventas netas (confirmar con el contador según régimen).`);
      }
      if (sub === 'cuentas') {
        const cols = (accion) => [
          { t: 'Documento', v: (d) => `${esc(d.tipo.replace('_', ' '))} <b>${esc(d.folio)}</b>` }, { t: 'Tercero', v: (d) => esc(nombreTercero(d.terceroId)) },
          { t: 'Vence', v: (d) => fecha(d.vencimiento) + (d.diasVencido ? ' ' + chip(d.diasVencido + ' días', 'malo') : '') },
          { t: 'Saldo', num: true, v: (d) => $(d.saldo) }, { t: '', v: (d) => btn(accion, 'pagar', { id: d.id }) },
        ];
        cuerpo = seccion('Cuentas por cobrar', tabla(cols('Cobrar'), erp.cuentasPendientes('venta'), 'Nada pendiente de cobro.'))
          + seccion('Cuentas por pagar', tabla(cols('Pagar'), erp.cuentasPendientes('compra'), 'Nada pendiente de pago.'));
      }
      if (sub === 'balance') {
        const s = erp.saldos();
        const filas = Object.keys(PLAN_CUENTAS).filter((c) => s[c]).map((c) => ({ c, n: PLAN_CUENTAS[c], v: s[c] }));
        cuerpo = seccion('Balance de comprobación', tabla([
          { t: 'Cuenta', v: (r) => `<span class="mono">${r.c}</span> ${esc(r.n)}` },
          { t: 'Deudor', num: true, v: (r) => (r.v > 0 ? $(r.v) : '') }, { t: 'Acreedor', num: true, v: (r) => (r.v < 0 ? $(-r.v) : '') },
        ], filas) + `<p class="cuadre">Diferencia debe − haber: <b>${$(Object.values(s).reduce((a, b) => a + b, 0))}</b> ${Object.values(s).reduce((a, b) => a + b, 0) === 0 ? chip('cuadrado', 'bueno') : chip('descuadrado', 'malo')}</p>`,
        'Plan de cuentas estándar mínimo: igual para todas las empresas, para comparar y auditar.');
      }
      if (sub === 'diario') {
        cuerpo = seccion('Libro diario', `<div class="tabla-wrap"><table><thead><tr><th>N°</th><th>Fecha</th><th>Glosa / cuenta</th><th>Origen</th><th class="num">Debe</th><th class="num">Haber</th></tr></thead><tbody>${erp.d.asientos.slice().reverse().map((a) => `<tr class="asiento"><td class="mono">${a.id}</td><td>${fecha(a.fecha)}</td><td><b>${esc(a.glosa)}</b></td><td>${chipModulo(a.origen.modulo)}</td><td></td><td></td></tr>${a.lineas.map((l) => `<tr class="linea-asiento"><td></td><td></td><td>${l.haber ? '&emsp;' : ''}<span class="mono">${l.cuenta}</span> ${esc(PLAN_CUENTAS[l.cuenta])}</td><td></td><td class="num">${l.debe ? $(l.debe) : ''}</td><td class="num">${l.haber ? $(l.haber) : ''}</td></tr>`).join('')}`).join('')}</tbody></table></div>`,
        'Ningún asiento se escribe a mano: todos nacen de una operación de otro módulo.');
      }
      return cabecera('Finanzas', 'Contabilidad automática, impuestos y flujo de caja.')
        + pestañas('finanzas', [['iva', 'IVA y F29'], ['cuentas', 'Cobros y pagos'], ['balance', 'Balance'], ['diario', 'Libro diario']]) + cuerpo;
    },

    marketing() {
      const sub = estado.sub.marketing;
      let cuerpo = '';
      if (sub === 'campanas') {
        const ed = estado.edicion.campana ? erp.buscar('campanas', estado.edicion.campana) : { inicio: erp.hoy(), fin: erp.hoy() };
        cuerpo = seccion(ed.id ? 'Editar campaña' : 'Nueva campaña', formulario('campana', 'guardarCampana', [
          { k: 'nombre', label: 'Nombre', req: true, ancho: true },
          { k: 'canal', label: 'Canal', tipo: 'select', opciones: ['Redes sociales', 'Buscadores', 'Correo', 'Eventos', 'Prensa / radio', 'Referidos', 'Otro'].map((x) => [x, x]) },
          { k: 'presupuesto', label: 'Presupuesto neto', tipo: 'number' },
          { k: 'inicio', label: 'Inicio', tipo: 'date' }, { k: 'fin', label: 'Término', tipo: 'date' },
        ], ed)) + seccion('Resultados', tablaCampanas(true), 'Gasto = facturas de proveedores imputadas a la campaña. Ventas = compras de clientes que llegaron por ella.');
      }
      if (sub === 'audiencia') {
        const dias = Number(estado.inactivos || 0);
        const lista = erp.audiencia({ soloInactivosDias: dias });
        cuerpo = seccion('Audiencia para comunicaciones', `
          <div class="fila-filtro"><label class="campo compacto" for="f-inactivos"><span>Segmento</span><select id="f-inactivos" data-accion="inactivos">
            ${[[0, 'Todos los clientes con consentimiento'], [30, 'Sin compras hace 30+ días'], [90, 'Sin compras hace 90+ días']].map(([v, l]) => `<option value="${v}"${v === dias ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
            ${lista.length ? btn('Copiar correos', 'copiarCorreos', { correos: lista.map((t) => t.email).join(', ') }) : ''}</div>
          ${tabla([{ t: 'Cliente', v: (t) => esc(t.nombre) }, { t: 'Correo', v: (t) => `<span class="mono">${esc(t.email)}</span>` }, { t: 'Origen', v: (t) => esc(erp.buscar('campanas', t.origenCampanaId)?.nombre || '—') }], lista, 'Ningún cliente cumple el segmento.')}`,
        'Solo aparecen clientes que autorizaron el uso de sus datos. Los demás quedan fuera automáticamente.');
      }
      return cabecera('Marketing', 'Campañas medidas con datos reales de ventas y gastos.')
        + pestañas('marketing', [['campanas', 'Campañas'], ['audiencia', 'Audiencias']]) + cuerpo;
    },

    rrhh() {
      const sub = estado.sub.rrhh;
      let cuerpo = '';
      const L = erp.d.config.legal;
      if (sub === 'trabajadores') {
        const ed = estado.edicion.empleado ? erp.buscar('empleados', estado.edicion.empleado) : { tipoContrato: 'indefinido', jornadaSemanal: L.jornadaMaximaSemanal, afp: 'Uno', salud: 'Fonasa', fechaIngreso: erp.hoy() };
        cuerpo = seccion(ed.id ? 'Editar contrato de ' + ed.nombre : 'Ingresar trabajador', formulario('empleado', 'guardarEmpleado', [
          { k: 'rut', label: 'RUT', req: true }, { k: 'nombre', label: 'Nombre completo', req: true, ancho: true },
          { k: 'cargo', label: 'Cargo / funciones', req: true },
          { k: 'tipoContrato', label: 'Tipo de contrato', tipo: 'select', opciones: [['indefinido', 'Indefinido'], ['plazo_fijo', 'Plazo fijo'], ['obra', 'Obra o faena']] },
          { k: 'fechaIngreso', label: 'Fecha de ingreso', tipo: 'date', req: true },
          { k: 'fechaTermino', label: 'Fecha de término', tipo: 'date', ayuda: 'Plazo fijo / obra' },
          { k: 'renovaciones', label: 'Renovaciones', tipo: 'number', paso: 1 },
          { k: 'fechaFirmaContrato', label: 'Contrato firmado el', tipo: 'date', ayuda: `Plazo legal: ${L.diasEscrituraContrato} días` },
          { k: 'sueldoBase', label: 'Sueldo base', tipo: 'number', req: true, ayuda: `Mínimo ${$(L.ingresoMinimo)} (jornada completa)` },
          { k: 'jornadaSemanal', label: 'Horas semanales', tipo: 'number', req: true, ayuda: `Máximo legal ${L.jornadaMaximaSemanal} h` },
          { k: 'afp', label: 'AFP', tipo: 'select', opciones: Object.keys(AFP).map((a) => [a, a]) },
          { k: 'salud', label: 'Salud', tipo: 'select', opciones: [['Fonasa', 'Fonasa'], ['Isapre', 'Isapre (7% referencial)']] },
          { k: 'sexo', label: 'Sexo registral', tipo: 'select', vacio: '—', opciones: [['F', 'Femenino'], ['M', 'Masculino'], ['X', 'No binario']], ayuda: 'Se usa para el umbral de sala cuna' },
          { k: 'colacion', label: 'Colación', tipo: 'number' }, { k: 'movilizacion', label: 'Movilización', tipo: 'number' },
          ...camposExtra('empleado'),
        ], ed, ed.id ? 'Guardar cambios' : 'Ingresar'), 'Campos mínimos del contrato según el art. 10 del Código del Trabajo.')
          + seccion('Dotación', tabla([
            { t: 'Trabajador', v: (e) => `<b>${esc(e.nombre)}</b><br><small>${esc(e.rut)} · ${esc(e.cargo)}</small>` },
            { t: 'Contrato', v: (e) => chip(etiquetaEstado(e.tipoContrato)) + (e.fechaTermino ? `<br><small>hasta ${fecha(e.fechaTermino)}</small>` : '') },
            { t: 'Firma', v: (e) => (e.fechaFirmaContrato ? fecha(e.fechaFirmaContrato) : chip('pendiente', 'malo')) },
            { t: 'Jornada', num: true, v: (e) => e.jornadaSemanal + ' h' }, { t: 'Sueldo base', num: true, v: (e) => $(e.sueldoBase) },
            ...erp.d.config.camposPersonalizados.empleado.map((c) => ({ t: c.etiqueta, v: (e) => esc(e.extra?.[c.clave]) })),
            { t: '', v: (e) => btn('Editar', 'editar', { entidad: 'empleado', id: e.id }) },
          ], erp.d.empleados));
      }
      if (sub === 'liquidaciones') {
        const c = estado.liquidacion;
        const filaLiq = (t, v, fuerte) => `<tr${fuerte ? ' class="total"' : ''}><td>${t}</td><td class="num">${v}</td></tr>`;
        cuerpo = seccion('Calcular liquidación', formulario('liq', 'calcularLiquidacion', [
          { k: 'empleadoId', label: 'Trabajador', tipo: 'select', req: true, vacio: 'Seleccionar…', opciones: erp.d.empleados.map((e) => [e.id, e.nombre]) },
          { k: 'periodo', label: 'Período', tipo: 'month' },
          { k: 'horasExtra', label: 'Horas extra', tipo: 'number' }, { k: 'bonos', label: 'Bonos imponibles', tipo: 'number' },
        ], c ? c.entrada : { periodo: periodoDe(erp.hoy()) }, 'Calcular') + (c ? `
          <div class="liquidacion">
            <table><tbody>
              ${filaLiq('Sueldo base', $(c.base))}${c.montoExtras ? filaLiq(`Horas extra (${c.horasExtra} h al 50%)`, $(c.montoExtras)) : ''}${c.bonos ? filaLiq('Bonos', $(c.bonos)) : ''}
              ${filaLiq('Gratificación legal (25%, con tope)', $(c.gratificacion))}${filaLiq('Total imponible', $(c.imponible), true)}
              ${filaLiq('AFP ' + esc(erp.buscar('empleados', c.empleadoId).afp), '−' + $(c.afp))}${filaLiq('Salud 7%', '−' + $(c.salud))}${filaLiq('Seguro de cesantía', '−' + $(c.cesantia))}${filaLiq('Impuesto único', '−' + $(c.impuesto))}
              ${filaLiq('Colación y movilización (no imponible)', $(c.noImponibles))}${filaLiq('Líquido a pagar', $(c.liquido), true)}
            </tbody></table>
            <table><tbody>
              ${filaLiq('Cesantía empleador', $(c.aportesEmpleador.cesantiaEmpleador))}${filaLiq('SIS', $(c.aportesEmpleador.sis))}${filaLiq('Mutual (ley 16.744)', $(c.aportesEmpleador.mutual))}${filaLiq('Aporte empleador reforma previsional', $(c.aportesEmpleador.reforma))}
              ${filaLiq('Costo total empresa', $(c.costoEmpresa), true)}
            </tbody></table>
            <div class="acciones-form">${btn('Emitir liquidación y contabilizar', 'emitirLiquidacion', {}, 'primario')}</div>
          </div>` : ''), 'Tasas referenciales editables en Configuración. Validar con Previred antes de pagar.')
          + seccion('Liquidaciones emitidas', tabla([
            { t: 'Período', v: (l) => `<b>${l.periodo}</b>` }, { t: 'Trabajador', v: (l) => esc(nombreEmpleado(l.empleadoId)) },
            { t: 'Imponible', num: true, v: (l) => $(l.imponible) }, { t: 'Líquido', num: true, v: (l) => $(l.liquido) }, { t: 'Costo empresa', num: true, v: (l) => $(l.costoEmpresa) },
          ], erp.d.liquidaciones.slice().reverse()));
      }
      if (sub === 'bienestar') {
        cuerpo = seccion('Registrar', formulario('bienestar', 'registrarBienestar', [
          { k: 'empleadoId', label: 'Trabajador', tipo: 'select', req: true, vacio: 'Seleccionar…', opciones: erp.d.empleados.map((e) => [e.id, e.nombre]) },
          { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: [['capacitacion', 'Capacitación'], ['beneficio', 'Beneficio'], ['evaluacion', 'Evaluación de desempeño'], ['vacaciones', 'Vacaciones'], ['licencia', 'Licencia médica']] },
          { k: 'fecha', label: 'Fecha', tipo: 'date' }, { k: 'detalle', label: 'Detalle', req: true, ancho: true },
        ], { fecha: erp.hoy() }, 'Registrar'))
          + seccion('Historial de bienestar', tabla([
            { t: 'Fecha', v: (b) => fecha(b.fecha) }, { t: 'Trabajador', v: (b) => esc(nombreEmpleado(b.empleadoId)) }, { t: 'Tipo', v: (b) => chip(b.tipo) }, { t: 'Detalle', v: (b) => esc(b.detalle) },
          ], erp.d.bienestar.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1))))
          + seccion('Canal de denuncias Ley Karin', formulario('karin', 'registrarDenunciaKarin', [
            { k: 'fecha', label: 'Fecha de recepción', tipo: 'date' },
            { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: [['acoso_laboral', 'Acoso laboral'], ['acoso_sexual', 'Acoso sexual'], ['violencia', 'Violencia en el trabajo']] },
            { k: 'medidasResguardo', label: 'Medidas de resguardo adoptadas', ancho: true },
          ], { fecha: erp.hoy() }, 'Registrar denuncia') + tabla([
            { t: 'Folio', v: (k) => `<b>${k.id}</b>` }, { t: 'Tipo', v: (k) => esc(etiquetaEstado(k.tipo)) }, { t: 'Recibida', v: (k) => fecha(k.fecha) },
            { t: 'Plazo investigación', v: (k) => fecha(k.plazoInvestigacion) }, { t: 'Estado', v: (k) => chip(etiquetaEstado(k.estado)) },
            { t: '', v: (k) => FLUJOS.karin[k.estado].map((e) => btn(etiquetaEstado(e), 'estadoKarin', { id: k.id, estado: e })).join('') },
          ], erp.d.denunciasKarin, 'Sin denuncias registradas.'), `Se registra solo lo mínimo, sin identificar personas en el sistema. Plazo de investigación: ${L.diasInvestigacionKarin} días.`);
      }
      return cabecera('Recursos Humanos', 'Contratos, remuneraciones y bienestar con los mínimos legales incorporados.')
        + pestañas('rrhh', [['trabajadores', 'Trabajadores'], ['liquidaciones', 'Liquidaciones'], ['bienestar', 'Bienestar y Ley Karin']]) + cuerpo;
    },

    produccion() {
      const sub = estado.sub.produccion;
      const conOrdenes = erp.d.config.opciones.ordenesProduccion;
      let cuerpo = '';
      if (sub === 'inventario' || !conOrdenes) {
        const ed = estado.edicion.producto ? erp.buscar('productos', estado.edicion.producto) : { tipo: 'producto' };
        cuerpo = seccion(ed.id ? 'Editar ' + ed.nombre : 'Nuevo producto, insumo o servicio', formulario('producto', 'guardarProducto', [
          { k: 'sku', label: 'SKU', req: true }, { k: 'nombre', label: 'Nombre', req: true, ancho: true },
          { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: [['producto', 'Producto terminado'], ['insumo', 'Insumo / materia prima'], ['servicio', 'Servicio']] },
          { k: 'precioNeto', label: 'Precio venta neto', tipo: 'number' }, { k: 'costo', label: 'Costo unitario', tipo: 'number' },
          { k: 'stock', label: 'Stock', tipo: 'number' }, { k: 'stockMinimo', label: 'Stock mínimo', tipo: 'number' },
          ...camposExtra('producto'),
        ], ed))
          + seccion('Inventario', tabla([
            { t: 'Producto', v: (p) => `<b>${esc(p.nombre)}</b><br><small class="mono">${esc(p.sku)}</small>` }, { t: 'Tipo', v: (p) => chip(p.tipo) },
            { t: 'Precio', num: true, v: (p) => (p.precioNeto ? $(p.precioNeto) : '—') }, { t: 'Costo', num: true, v: (p) => $(p.costo) },
            { t: 'Stock', num: true, v: (p) => (p.tipo === 'servicio' ? '—' : `${p.stock} ${p.stock <= p.stockMinimo ? chip('bajo mínimo', 'malo') : ''}`) },
            { t: 'Valorizado', num: true, v: (p) => (p.tipo === 'servicio' ? '—' : $(Math.max(p.stock, 0) * p.costo)) },
            ...erp.d.config.camposPersonalizados.producto.map((c) => ({ t: c.etiqueta, v: (p) => esc(p.extra?.[c.clave]) })),
            { t: '', v: (p) => btn('Editar', 'editar', { entidad: 'producto', id: p.id }) },
          ], erp.d.productos));
      } else {
        const terminados = opcionesProductos((p) => p.tipo === 'producto');
        const rec = estado.receta || terminados[0]?.[0];
        const receta = erp.d.recetas[rec] || [];
        const filasRec = Array.from({ length: Math.max(receta.length + 1, 2) }, (_, n) => `<div class="linea">
          ${campo({ form: 'receta', k: `ins_producto_${n}`, label: `Insumo ${n + 1}`, tipo: 'select', vacio: '—', opciones: opcionesProductos((p) => p.tipo === 'insumo') }, receta[n]?.productoId)}
          ${campo({ form: 'receta', k: `ins_cantidad_${n}`, label: 'Cantidad por unidad', tipo: 'number' }, receta[n]?.cantidad)}</div>`).join('');
        cuerpo = seccion('Nueva orden de producción', formulario('orden', 'crearOrden', [
          { k: 'productoId', label: 'Producto', tipo: 'select', req: true, vacio: 'Seleccionar…', opciones: terminados },
          { k: 'cantidad', label: 'Cantidad', tipo: 'number', req: true }, { k: 'fecha', label: 'Fecha', tipo: 'date' },
        ], { fecha: erp.hoy() }, 'Planificar'), 'Al terminar una orden se descuentan los insumos según receta y se suma el producto al stock.')
          + seccion('Órdenes', tabla([
            { t: 'Orden', v: (o) => `<b>${o.id}</b>` }, { t: 'Producto', v: (o) => esc(nombreProducto(o.productoId)) }, { t: 'Cantidad', num: true, v: (o) => o.cantidad },
            { t: 'Insumos', v: (o) => o.insumos.map((i) => `${i.cantidad} × ${esc(nombreProducto(i.productoId))}`).join('<br>') || '—' },
            { t: 'Estado', v: (o) => chip(etiquetaEstado(o.estado), o.estado === 'terminada' ? 'bueno' : '') },
            { t: '', v: (o) => FLUJOS.orden[o.estado].map((e) => btn(etiquetaEstado(e), 'estadoOrden', { id: o.id, estado: e }, e === 'anulada' ? 'peligro' : '')).join('') },
          ], erp.d.ordenes.slice().reverse()))
          + seccion('Receta (lista de materiales)', `<div class="fila-filtro"><label class="campo compacto" for="f-receta"><span>Producto</span><select id="f-receta" data-accion="receta">${terminados.map(([v, l]) => `<option value="${v}"${v === rec ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
            <form class="formulario" data-accion="guardarReceta" data-producto="${esc(rec || '')}" novalidate><div class="lineas">${filasRec}</div><div class="acciones-form"><button class="btn primario" type="submit">Guardar receta</button></div></form>`);
      }
      return cabecera('Producción e inventario', 'Stock, costos y fabricación conectados a ventas y compras.')
        + (conOrdenes ? pestañas('produccion', [['inventario', 'Inventario'], ['ordenes', 'Órdenes de producción']]) : '') + cuerpo;
    },

    configuracion() {
      const sub = estado.sub.configuracion;
      const cfg = erp.d.config;
      let cuerpo = '';
      if (sub === 'empresa') {
        cuerpo = seccion('Datos de la empresa', formulario('empresa', 'guardarEmpresa', [
          { k: 'razonSocial', label: 'Razón social', req: true, ancho: true }, { k: 'rut', label: 'RUT', req: true }, { k: 'giro', label: 'Giro', ancho: true },
          { k: 'regimen', label: 'Régimen tributario', tipo: 'select', opciones: [['pro_pyme_general', 'Pro Pyme General (14 D N°3)'], ['pro_pyme_transparente', 'Pro Pyme Transparente (14 D N°8)'], ['general', 'Régimen general']], ayuda: 'Ajusta la tasa de PPM en Parámetros legales según indique el contador' },
        ], cfg.empresa))
          + seccion('Plantilla por rubro', `<div class="plantillas">${Object.entries(PLANTILLAS).map(([k, p]) => `<div class="plantilla${cfg.empresa.rubro === k ? ' activa' : ''}"><b>${esc(p.nombre)}</b>
            <small>${p.opciones.ordenesProduccion ? 'Con órdenes de producción' : 'Sin órdenes de producción'} · postventa a ${p.opciones.diasPostventa} días · ${Object.values(p.campos).flat().length} campos propios</small>
            ${cfg.empresa.rubro === k ? chip('en uso', 'bueno') : btn('Aplicar', 'plantilla', { rubro: k })}</div>`).join('')}</div>`,
          'Una plantilla ajusta módulos, opciones y campos de partida. Los datos ya cargados no se borran.')
          + seccion('Módulos', `<div class="modulos">${Object.entries(MODULOS).map(([k, m]) => `<label class="check modulo" for="f-mod-${k}"><input type="checkbox" id="f-mod-${k}" data-accion="modulo" data-modulo="${k}"${erp.moduloActivo(k) ? ' checked' : ''}${m.obligatorio ? ' disabled' : ''}> ${esc(m.nombre)} ${m.obligatorio ? chip('núcleo legal') : ''}</label>`).join('')}
            <label class="check modulo" for="f-op-ordenes"><input type="checkbox" id="f-op-ordenes" data-accion="opcion" data-opcion="ordenesProduccion"${cfg.opciones.ordenesProduccion ? ' checked' : ''}> Órdenes de producción</label>
            <label class="check modulo" for="f-op-postventa"><input type="checkbox" id="f-op-postventa" data-accion="opcion" data-opcion="postventaAutomatica"${cfg.opciones.postventaAutomatica ? ' checked' : ''}> Seguimiento postventa automático</label>
            <label class="check modulo" for="f-op-mora"><input type="checkbox" id="f-op-mora" data-accion="opcion" data-opcion="interesMora"${cfg.opciones.interesMora ? ' checked' : ''}> Avisar cobro de interés por mora (Ley 21.131)</label></div>`,
          'Dirección, Comercial y Finanzas no se apagan: sostienen las obligaciones tributarias. RR.HH. queda obligatorio si hay trabajadores.');
      }
      if (sub === 'campos') {
        cuerpo = ['tercero', 'producto', 'empleado'].map((ent) => {
          const lista = cfg.camposPersonalizados[ent];
          const nombre = { tercero: 'Clientes y proveedores', producto: 'Productos', empleado: 'Trabajadores' }[ent];
          return seccion(`${nombre} · ${lista.length}/${LIMITE_CAMPOS_PERSONALIZADOS}`, `<ul class="campos-lista">${lista.map((c) => `<li><b>${esc(c.etiqueta)}</b> ${chip(c.tipo)}${c.opciones ? ` <small>${esc(c.opciones.join(' · '))}</small>` : ''} ${btn('Quitar', 'quitarCampo', { entidad: ent, clave: c.clave }, 'peligro')}</li>`).join('') || '<li class="vacio">Sin campos propios.</li>'}</ul>`
            + (lista.length < LIMITE_CAMPOS_PERSONALIZADOS ? formulario('campo-' + ent, 'agregarCampo', [
              { k: 'etiqueta', label: 'Nombre del campo', req: true }, { k: 'tipo', label: 'Tipo', tipo: 'select', opciones: [['texto', 'Texto'], ['numero', 'Número'], ['fecha', 'Fecha'], ['lista', 'Lista de opciones']] },
              { k: 'opciones', label: 'Opciones (separadas por coma)', ph: 'Solo para listas' }, { k: 'entidad', label: '', tipo: 'hidden' },
            ], { entidad: ent }, 'Agregar campo') : ''));
        }).join('');
        cuerpo = `<p class="nota bloque-nota">Cada empresa agrega lo propio de su mercado, con un límite de ${LIMITE_CAMPOS_PERSONALIZADOS} campos por ficha para que el sistema siga siendo comparable y simple.</p>` + cuerpo;
      }
      if (sub === 'legal') {
        const etiquetas = {
          iva: 'Tasa IVA', diaVencimientoF29: 'Día vencimiento F29', ingresoMinimo: 'Ingreso mínimo mensual', jornadaMaximaSemanal: 'Jornada máxima semanal (h)',
          valorUF: 'Valor UF', valorUTM: 'Valor UTM', topeImponibleUF: 'Tope imponible (UF)', tasaAFP: 'Cotización AFP obligatoria', tasaSalud: 'Cotización salud',
          cesantiaTrabajadorIndefinido: 'Cesantía trabajador (indefinido)', cesantiaEmpleadorIndefinido: 'Cesantía empleador (indefinido)', cesantiaEmpleadorPlazoFijo: 'Cesantía empleador (plazo fijo)',
          sis: 'SIS (empleador)', mutualBase: 'Mutual cotización básica', aporteEmpleadorReforma: 'Aporte empleador reforma previsional', diasEscrituraContrato: 'Días para escriturar contrato',
          diasEscrituraContratoCorto: 'Días escritura (contratos < 30 días)', mesesGarantiaLegal: 'Meses garantía legal', diasInvestigacionKarin: 'Días investigación Ley Karin',
          topeImponibleUF: 'Tope imponible AFP y salud (UF)', topeCesantiaUF: 'Tope imponible seguro de cesantía (UF)', retencionHonorarios: 'Retención boletas de honorarios',
          ppmTasa: 'Tasa de PPM', diasReclamoFactura: 'Días para reclamar factura recibida', diasRetracto: 'Días de retracto (compra a distancia)',
        };
        const ESTADO = { confirmado: 'Confirmado', verificar: 'Por verificar', actualizar: 'Actualizar seguido' };
        const ayuda = (k) => { const m = LEGAL_META[k]; return m ? `${ESTADO[m.estado]} · ${m.fuente}${m.nota ? ' · ' + m.nota : ''}` : ''; };
        cuerpo = seccion('Parámetros legales', formulario('legal', 'guardarLegal', Object.keys(LEGAL_POR_DEFECTO).map((k) => ({ k, label: etiquetas[k] || k, tipo: 'number', ayuda: ayuda(k) })), cfg.legal, 'Guardar parámetros'),
          'Valores para Chile revisados en octubre de 2026 contra el informe de investigación y fuentes oficiales. Bajo cada valor está su fuente y si falta confirmarlo con el contador.');
      }
      if (sub === 'respaldo') {
        cuerpo = seccion('Respaldo', `<div class="acciones-form">${btn('Generar respaldo', 'exportar')}${estado.respaldo ? btn('Copiar', 'copiarRespaldo') : ''}</div>
          ${estado.respaldo ? `<textarea id="f-respaldo" class="respaldo" rows="8" readonly>${esc(estado.respaldo)}</textarea>` : ''}
          <label class="campo" for="f-importar"><span>Restaurar desde archivo .json</span><input type="file" id="f-importar" accept="application/json,.json" data-accion="importar"></label>`,
          'Los datos viven en este navegador. Genera un respaldo y guárdalo en un archivo para no perderlos.')
          + seccion('Reiniciar', estado.confirmarReinicio
            ? `<p>Esto reemplaza todos los datos. ¿Continuar?</p><div class="acciones-form">${btn('Sí, cargar datos de ejemplo', 'reiniciar', { vacio: '' }, 'peligro')}${btn('Sí, empezar en blanco', 'reiniciar', { vacio: '1' }, 'peligro')}${btn('Cancelar', 'cancelarReinicio')}</div>`
            : btn('Reiniciar datos…', 'pedirReinicio', {}, 'peligro'));
      }
      return cabecera('Configuración', 'Adapta el sistema a la empresa sin salir del estándar.')
        + pestañas('configuracion', [['empresa', 'Empresa y módulos'], ['campos', 'Campos propios'], ['legal', 'Parámetros legales'], ['respaldo', 'Respaldo']]) + cuerpo;
    },

    auditoria() {
      return cabecera('Auditoría', 'Registro de todo lo que ocurre en el sistema. No se puede editar.')
        + seccion('Bitácora', tabla([
          { t: 'Fecha', v: (a) => `<span class="mono">${esc(a.fecha.slice(0, 16).replace('T', ' '))}</span>` },
          { t: 'Área', v: (a) => chipModulo(a.modulo) }, { t: 'Acción', v: (a) => `<b>${esc(a.accion)}</b>` }, { t: 'Detalle', v: (a) => esc(a.detalle) },
        ], erp.d.auditoria));
    },
  };

  const cabecera = (t, s) => `<div class="cabecera-vista"><div><h2>${esc(t)}</h2><p class="lead">${esc(s)}</p></div></div>`;

  const DESTINOS = { inventario: 'Inventario', marketing: 'Gasto de marketing', general: 'Gasto general', honorarios: 'Boleta de honorarios', retiro: 'Gasto personal del dueño' };

  function celdaAcuse(d) {
    const e = erp.estadoAcuse(d);
    if (e === 'pendiente') {
      const n = erp.diasParaReclamar(d);
      return chip(n === 0 ? 'último día' : `quedan ${n} días`, n <= 2 ? 'malo' : 'atencion') + '<br>' + btn('Aceptar', 'aceptarCompra', { id: d.id }) + btn('Reclamar', 'pedirMotivo', { tipo: 'reclamo', id: d.id }, 'peligro');
    }
    return { aceptada: chip('aceptada', 'bueno'), aceptada_tacita: chip('aceptada sola', 'atencion'), reclamada: chip('reclamada', 'malo'), no_aplica: '—' }[e] || '—';
  }

  function tablaUmbrales() {
    const nombre = { trabajadores: 'trabajadores', trabajadoras: 'trabajadoras', ventasUF: 'UF de ventas' };
    return tabla([
      { t: 'Obligación', v: (u) => `<b>${esc(u.obligacion)}</b>` },
      { t: 'Área', v: (u) => chipModulo(u.area) },
      { t: 'Hoy / umbral', num: true, v: (u) => `${u.valor.toLocaleString('es-CL')} / ${u.umbral.toLocaleString('es-CL')} <small>${nombre[u.medida]}</small>` },
      { t: 'Avance', v: (u) => `<span class="barra ${u.estado}" role="img" aria-label="${Math.min(100, Math.round((u.valor / u.umbral) * 100))} %"><span style="width:${Math.min(100, (u.valor / u.umbral) * 100)}%"></span></span>` },
      { t: 'Estado', v: (u) => chip(u.estado === 'activa' ? 'ya aplica' : u.estado === 'cerca' ? 'se acerca' : 'lejos', u.estado === 'activa' ? 'bueno' : u.estado === 'cerca' ? 'atencion' : '') },
    ], erp.umbrales());
  }

  function tablaCampanas(conEditar) {
    return tabla([
      { t: 'Campaña', v: (c) => `<b>${esc(c.nombre)}</b><br><small>${esc(c.canal)} · ${fecha(c.inicio)} → ${fecha(c.fin)}</small>` },
      { t: 'Presupuesto', num: true, v: (c) => $(c.presupuesto) },
      { t: 'Gasto real', num: true, v: (c) => { const r = erp.resultadoCampana(c.id); return $(r.gasto) + (r.gasto > c.presupuesto ? ' ' + chip('excedido', 'malo') : ''); } },
      { t: 'Clientes', num: true, v: (c) => erp.resultadoCampana(c.id).clientes },
      { t: 'Costo por cliente', num: true, v: (c) => { const r = erp.resultadoCampana(c.id); return r.cac === null ? '—' : $(r.cac); } },
      { t: 'Ventas atribuidas', num: true, v: (c) => $(erp.resultadoCampana(c.id).ventas) },
      { t: 'ROI', num: true, v: (c) => { const r = erp.resultadoCampana(c.id).roi; return r === null ? '—' : `<span class="${r < 0 ? 'neg' : 'pos'}">${pct(r)}</span>`; } },
      ...(conEditar ? [{ t: '', v: (c) => btn('Editar', 'editar', { entidad: 'campana', id: c.id }) }] : []),
    ], erp.d.campanas, 'Sin campañas.');
  }

  // Diagrama de conexiones entre áreas (estático, describe las integraciones del núcleo)
  function mapaFlujo() {
    const N = { comercial: [70, 40], finanzas: [250, 40], produccion: [70, 150], marketing: [250, 150], rrhh: [430, 150], direccion: [430, 40] };
    const aristas = [['comercial', 'finanzas', 'asientos, IVA'], ['comercial', 'produccion', 'stock'], ['marketing', 'comercial', 'origen cliente'], ['marketing', 'finanzas', 'gasto'], ['rrhh', 'finanzas', 'nómina'], ['finanzas', 'direccion', 'indicadores']];
    return `<div class="mapa"><svg viewBox="0 0 500 190" role="img" aria-label="Conexiones entre módulos">
      ${aristas.map(([a, b, t]) => { const [x1, y1] = N[a], [x2, y2] = N[b]; return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="arista"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" class="arista-t">${t}</text>`; }).join('')}
      ${Object.entries(N).filter(([m]) => erp.moduloActivo(m)).map(([m, [x, y]]) => `<g class="nodo mod-${m}"><rect x="${x - 52}" y="${y - 15}" width="104" height="30" rx="15"/><text x="${x}" y="${y + 4}">${MOD_CORTO[m]}</text></g>`).join('')}
    </svg></div>`;
  }

  // ---------------------------------------------------------------------------
  // Render y navegación
  // ---------------------------------------------------------------------------
  const NAV = [['direccion', 'Dirección'], ['comercial', 'Comercial'], ['finanzas', 'Finanzas'], ['marketing', 'Marketing'], ['rrhh', 'Recursos Humanos'], ['produccion', 'Producción'], ['configuracion', 'Configuración'], ['auditoria', 'Auditoría']];

  function render() {
    if (!['configuracion', 'auditoria'].includes(estado.vista) && !erp.moduloActivo(estado.vista)) estado.vista = 'direccion';
    const criticas = erp.alertas().filter((a) => a.nivel === 'critica' && erp.moduloActivo(a.modulo));
    const porModulo = {};
    criticas.forEach((a) => (porModulo[a.modulo] = (porModulo[a.modulo] || 0) + 1));
    document.getElementById('empresa').innerHTML = `<b>${esc(erp.d.config.empresa.razonSocial || 'Mi empresa')}</b><small>${esc(erp.d.config.empresa.rut)} · ${esc(PLANTILLAS[erp.d.config.empresa.rubro]?.nombre || 'sin rubro')}</small>`;
    document.getElementById('nav').innerHTML = NAV.filter(([k]) => ['configuracion', 'auditoria'].includes(k) || erp.moduloActivo(k))
      .map(([k, l]) => `<a href="#${k}" class="${estado.vista === k ? 'activa' : ''} navmod-${k}"${estado.vista === k ? ' aria-current="page"' : ''}><span>${l}</span>${porModulo[k] ? `<em title="Alertas críticas">${porModulo[k]}</em>` : ''}</a>`).join('');
    document.getElementById('vista').innerHTML = VISTAS[estado.vista]();
  }

  let temporizador;
  function aviso(texto, tipo = 'ok') {
    const t = document.getElementById('toast');
    t.textContent = texto; t.className = 'toast ' + tipo; t.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => (t.hidden = true), tipo === 'error' ? 6000 : 3200);
  }

  function ejecutar(fn, exito) {
    try { const r = fn(); if (exito) aviso(typeof exito === 'function' ? exito(r) : exito); render(); return r; }
    catch (e) { aviso(e.message, 'error'); }
  }

  function leerLineas(datos, prefijo, campos) {
    const out = [];
    for (let n = 0; datos[`${prefijo}_${campos[0]}_${n}`] !== undefined; n++) {
      const l = {};
      campos.forEach((c) => (l[c === 'producto' ? 'productoId' : c] = datos[`${prefijo}_${c}_${n}`]));
      if (l.productoId) out.push(l);
    }
    return out;
  }

  const MOTIVOS = {
    nc: { etiqueta: 'Motivo de anulación', boton: 'Emitir nota de crédito', fn: (id, m) => erp.emitirNotaCredito(id, m), ok: (nc) => `Nota de crédito N° ${nc.folio} emitida. Stock y contabilidad revertidos.` },
    reclamo: { etiqueta: 'Motivo del reclamo', boton: 'Reclamar factura', fn: (id, m) => erp.acusarCompra(id, 'reclamar', m), ok: 'Factura reclamada: se revirtieron la deuda, el IVA crédito y el stock. Regístralo también en el SII.' },
    supresion: { etiqueta: 'Cómo llegó la solicitud', boton: 'Suprimir datos', fn: (id, m) => erp.suprimirDatosPersonales(id, m), ok: 'Datos personales suprimidos. El cliente queda excluido de toda comunicación.' },
  };

  const ACCIONES_FORM = {
    emitirVenta: (d) => ejecutar(() => erp.emitirVenta({ tipo: d.tipo, terceroId: d.terceroId, fecha: d.fecha, diasCredito: d.diasCredito, ordenCompra: d.ordenCompra, lineas: leerLineas(d, 'linea', ['producto', 'cantidad']) }), (doc) => `${doc.tipo} N° ${doc.folio} emitida por ${$(doc.total)}. Stock, contabilidad y postventa actualizados.`),
    registrarCompra: (d) => ejecutar(() => erp.registrarCompra({ ...d, lineas: leerLineas(d, 'linea', ['producto', 'cantidad', 'costo']) }), (doc) => doc.retencion ? `Boleta registrada: retención de ${$(doc.retencion)} va al F29.` : doc.estadoAcuse === 'pendiente' ? `Compra registrada. Tienes hasta el ${fecha(window.NucleoERP.sumarDias(doc.fechaRecepcion, erp.d.config.legal.diasReclamoFactura))} para aceptarla o reclamarla.` : 'Registrado y contabilizado.'),
    guardarTercero: (d) => ejecutar(() => { erp.guardarTercero(d); estado.edicion.tercero = null; }, 'Ficha guardada.'),
    crearTicket: (d) => ejecutar(() => erp.crearTicket(d), (t) => `Ticket ${t.id} abierto. Plazo de respuesta: ${fecha(t.plazo)}.`),
    guardarCampana: (d) => ejecutar(() => { erp.guardarCampana(d); estado.edicion.campana = null; }, 'Campaña guardada.'),
    guardarEmpleado: (d) => ejecutar(() => { erp.guardarEmpleado(d); estado.edicion.empleado = null; }, 'Contrato guardado.'),
    calcularLiquidacion: (d) => ejecutar(() => { estado.liquidacion = { ...erp.calcularLiquidacion(d.empleadoId, { horasExtra: d.horasExtra || 0, bonos: d.bonos || 0 }), entrada: d }; }),
    registrarBienestar: (d) => ejecutar(() => erp.registrarBienestar(d), 'Registro guardado.'),
    registrarDenunciaKarin: (d) => ejecutar(() => erp.registrarDenunciaKarin(d), (k) => `Denuncia ${k.id} registrada. Investigación hasta ${fecha(k.plazoInvestigacion)}.`),
    guardarProducto: (d) => ejecutar(() => { erp.guardarProducto(d); estado.edicion.producto = null; }, 'Producto guardado.'),
    crearOrden: (d) => ejecutar(() => erp.crearOrden(d), (o) => `Orden ${o.id} planificada.`),
    guardarEmpresa: (d) => ejecutar(() => {
      if (!window.NucleoERP.validarRut(d.rut)) throw new Error('RUT de la empresa no válido');
      Object.assign(erp.d.config.empresa, { ...d, rut: window.NucleoERP.formatearRut(d.rut) }); erp.guardar();
    }, 'Datos de la empresa guardados.'),
    agregarCampo: (d) => ejecutar(() => erp.agregarCampo(d.entidad, { etiqueta: d.etiqueta, tipo: d.tipo, opciones: String(d.opciones || '').split(',') }), 'Campo agregado: ya aparece en los formularios.'),
    guardarLegal: (d) => ejecutar(() => erp.actualizarLegal(d), 'Parámetros actualizados.'),
  };

  const ACCIONES_CLICK = {
    sub: (b) => { estado.sub[b.dataset.vista] = b.dataset.sub; render(); },
    masLinea: (b) => { estado.lineas[b.dataset.doc]++; render(); },
    editar: (b) => { estado.edicion[b.dataset.entidad] = b.dataset.id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    cancelarEdicion: (b) => { estado.edicion[b.dataset.entidad] = null; render(); },
    pagar: (b) => ejecutar(() => erp.registrarPago(b.dataset.id), (d) => `${d.clase === 'venta' ? 'Cobro' : 'Pago'} registrado en caja.`),
    // Acciones que piden un motivo antes de ejecutarse: se abre una fila bajo el registro
    pedirMotivo: (b) => {
      const tr = b.closest('tr');
      if (tr.nextElementSibling?.classList.contains('motivo')) return;
      const m = MOTIVOS[b.dataset.tipo];
      tr.insertAdjacentHTML('afterend', `<tr class="motivo"><td colspan="12"><form class="motivo-form" data-accion="confirmarMotivo" data-tipo="${esc(b.dataset.tipo)}" data-id="${esc(b.dataset.id)}"><label class="campo" for="f-motivo"><span>${esc(m.etiqueta)}</span><input id="f-motivo" name="motivo" required></label><button class="btn mini peligro" type="submit">${esc(m.boton)}</button>${btn('Cancelar', 'cerrarFila')}</form></td></tr>`);
      document.getElementById('f-motivo').focus();
    },
    aceptarCompra: (b) => ejecutar(() => erp.acusarCompra(b.dataset.id, 'aceptar'), 'Factura aceptada.'),
    cerrarFila: (b) => b.closest('tr').remove(),
    estadoTicket: (b) => ejecutar(() => erp.cambiarEstadoTicket(b.dataset.id, b.dataset.estado), 'Ticket actualizado.'),
    estadoOrden: (b) => ejecutar(() => erp.cambiarEstadoOrden(b.dataset.id, b.dataset.estado), b.dataset.estado === 'terminada' ? 'Orden terminada: insumos descontados y stock actualizado.' : 'Orden actualizada.'),
    estadoKarin: (b) => ejecutar(() => erp.cambiarEstadoKarin(b.dataset.id, b.dataset.estado), 'Estado actualizado.'),
    emitirLiquidacion: () => ejecutar(() => { const c = estado.liquidacion; const l = erp.emitirLiquidacion(c.empleadoId, c.entrada.periodo, { horasExtra: c.horasExtra, bonos: c.bonos }); estado.liquidacion = null; return l; }, (l) => `Liquidación ${l.periodo} emitida y contabilizada.`),
    plantilla: (b) => ejecutar(() => erp.aplicarPlantilla(b.dataset.rubro), 'Plantilla aplicada.'),
    quitarCampo: (b) => ejecutar(() => erp.quitarCampo(b.dataset.entidad, b.dataset.clave), 'Campo quitado.'),
    copiarCorreos: (b) => copiar(b.dataset.correos),
    exportar: () => { estado.respaldo = erp.exportar(); render(); },
    copiarRespaldo: () => copiar(estado.respaldo, 'f-respaldo'),
    pedirReinicio: () => { estado.confirmarReinicio = true; render(); },
    cancelarReinicio: () => { estado.confirmarReinicio = false; render(); },
    reiniciar: (b) => ejecutar(() => { erp.reiniciar(!!b.dataset.vacio); estado.confirmarReinicio = false; estado.vista = 'direccion'; location.hash = 'direccion'; }, 'Datos reiniciados.'),
  };

  function copiar(texto, idSeleccion) {
    const fallback = () => { const el = idSeleccion && document.getElementById(idSeleccion); if (el) { el.select(); aviso('Texto seleccionado: cópialo con Ctrl+C.'); } else aviso(texto); };
    try { navigator.clipboard.writeText(texto).then(() => aviso('Copiado.'), fallback); } catch { fallback(); }
  }

  document.addEventListener('submit', (ev) => {
    const f = ev.target;
    ev.preventDefault();
    if (f.dataset.accion === 'confirmarMotivo') {
      const m = MOTIVOS[f.dataset.tipo];
      return ejecutar(() => m.fn(f.dataset.id, f.elements.motivo.value.trim()), m.ok);
    }
    if (f.dataset.accion === 'guardarReceta') {
      const d = leerFormulario(f);
      return ejecutar(() => erp.guardarReceta(f.dataset.producto, leerLineas(d, 'ins', ['producto', 'cantidad'])), 'Receta guardada.');
    }
    const fn = ACCIONES_FORM[f.dataset.accion];
    if (fn) fn(leerFormulario(f));
  });

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-accion]');
    if (b && ACCIONES_CLICK[b.dataset.accion]) ACCIONES_CLICK[b.dataset.accion](b);
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    const a = el.dataset.accion;
    if (a === 'periodo') { estado.periodo = el.value; render(); }
    if (a === 'inactivos') { estado.inactivos = el.value; render(); }
    if (a === 'receta') { estado.receta = el.value; render(); }
    if (a === 'modulo') ejecutar(() => erp.activarModulo(el.dataset.modulo, el.checked), 'Módulos actualizados.');
    if (a === 'opcion') ejecutar(() => { erp.d.config.opciones[el.dataset.opcion] = el.checked; erp.guardar(); }, 'Opción actualizada.');
    if (a === 'importar' && el.files[0]) {
      const lector = new FileReader();
      lector.onload = () => ejecutar(() => erp.importar(lector.result), 'Respaldo restaurado.');
      lector.readAsText(el.files[0]);
    }
  });

  function desdeHash() {
    const h = location.hash.slice(1);
    if (VISTAS[h]) estado.vista = h;
    render();
    document.getElementById('vista').focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', desdeHash);
  desdeHash();
})();
