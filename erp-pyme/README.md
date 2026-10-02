# ERP Pyme — prototipo

ERP básico y adaptable para pymes, donde la información de cada área **conversa** con las demás.
Marco legal de referencia: **Chile**.

Abrir `index.html` en el navegador (no requiere instalación). Los datos se guardan en el navegador.
Viene cargado con una empresa de ejemplo (*Panadería Los Aromos SpA*) para ver los cruces funcionando.

```
erp-pyme/
├── nucleo.js    lógica de negocio, sin interfaz (reutilizable en un servidor más adelante)
├── app.js       interfaz: vistas, formularios y tablas genéricos
├── index.html   página
├── estilos.css  estilos (tema claro/oscuro, móvil)
└── pruebas.js   pruebas del núcleo:  node pruebas.js
```

## Cómo conversan los módulos

Un único modelo de datos y un bus de eventos. Ningún asiento contable se escribe a mano: todos nacen de una operación.

| Operación (dónde ocurre) | Efecto automático en otras áreas |
|---|---|
| Emitir factura/boleta (Comercial) | Folio correlativo + IVA · asiento de venta y de costo (Finanzas) · rebaja de stock y alerta de reposición (Producción) · ticket de seguimiento postventa (Comercial) · ventas atribuidas a la campaña que trajo al cliente (Marketing) |
| Nota de crédito (Comercial) | Revierte stock, venta, IVA y cobro. Los documentos nunca se borran |
| Factura de proveedor (Comercial) | Inventario y costo promedio (Producción) **o** gasto de campaña (Marketing) · IVA crédito y cuenta por pagar (Finanzas) |
| Cobro / pago (Finanzas) | Caja, cuentas por cobrar/pagar, indicadores de Dirección |
| Liquidación de sueldo (RR.HH.) | Asiento de remuneraciones, cotizaciones e impuesto por pagar (Finanzas) · nómina sobre ventas (Dirección) |
| Orden de producción terminada (Producción) | Consume insumos por receta, suma producto terminado, recalcula costo |
| Cliente con consentimiento de datos (Comercial) | Solo esos clientes entran a audiencias de Marketing |

**Dirección** lee todo: ventas, margen, resultado, caja, por cobrar/pagar, IVA, nómina, ROI de campañas y una lista única de **alertas de gestión y cumplimiento**.

## Flexible, pero dentro de un margen

| Se adapta por empresa | Queda fijo (estándar) |
|---|---|
| Plantilla por rubro: comercio, servicios, manufactura | Plan de cuentas mínimo |
| Activar/desactivar Marketing, RR.HH., Producción, órdenes, postventa automática | Dirección, Comercial y Finanzas siempre activos (núcleo legal); RR.HH. obligatorio si hay trabajadores |
| Hasta **8 campos propios** por ficha (clientes, productos, trabajadores) | Flujos de estado: tickets, órdenes, denuncias (no se saltan pasos) |
| Parámetros legales editables (tasas, UF, UTM, jornada) | Folios correlativos, documentos inanulables sin nota de crédito, bitácora de auditoría |

## Cumplimiento legal incorporado (referencial)

- **Tributario (SII):** validación de RUT, IVA 19 %, factura exige cliente con RUT, libro de ventas y compras, resumen para el F29 con fecha de vencimiento.
- **Laboral (Código del Trabajo):** datos mínimos del contrato (art. 10), plazo para escriturarlo (15 días / 5 días), jornada máxima (42 h desde abril 2026, Ley 21.561), ingreso mínimo proporcional, plazo fijo con tope de 1 año y aviso de conversión a indefinido, gratificación legal, liquidación con AFP, salud, seguro de cesantía, impuesto único, SIS, mutual y aporte de la reforma previsional.
- **Ley Karin (21.643):** canal de denuncias con plazo de investigación de 30 días, sin datos personales en la bitácora.
- **Consumidor (Ley 19.496):** garantía legal de 6 meses verificada al abrir un ticket de garantía; plazos de respuesta por tipo de solicitud.
- **Datos personales (Ley 21.719):** consentimiento por cliente; quienes no lo dieron quedan fuera de las campañas.

> Las tasas y montos son **referenciales** (oct-2026) y se editan en *Configuración → Parámetros legales*. Antes de uso real hay que validarlos con contador/abogado, Previred y el SII. El prototipo **no** emite DTE ante el SII ni declara impuestos.

## Siguientes pasos sugeridos

1. Validar con 2–3 pymes reales qué campos y alertas usan de verdad.
2. Llevar `nucleo.js` a un servidor con base de datos y usuarios con roles (dueño, contador, ventas, RR.HH.).
3. Integraciones: facturación electrónica (proveedor DTE), Previred, banco (conciliación).
4. Más plantillas de rubro (gastronomía, construcción, salud) y reportes exportables.
