# ERP Pyme Chile: brief del proyecto y encargo de investigación

**Versión:** 1.0 · octubre 2026
**Uso de este archivo:** entregarlo completo a Gemini (modo Deep Research) con la instrucción:
*"Lee la Parte A como contexto y ejecuta el encargo de la Parte B, entregando el resultado en el formato de la Parte C."*

---

# PARTE A · El proyecto

## A1. Qué queremos hacer

Un **ERP sencillo y adaptable para pymes chilenas**. Debe ordenar la gestión de seis áreas y hacer que la información pase sola de un área a otra:

| Área | Qué cubre |
|---|---|
| Dirección | Visión general, indicadores, metas, decisiones y cumplimiento legal |
| Comercial | Clientes y proveedores, ventas, compras, atención al cliente y postventa |
| Finanzas | Contabilidad, impuestos, cobros, pagos y flujo de caja |
| Marketing | Campañas, captación y fidelización de clientes, retorno de la inversión |
| Recursos Humanos | Contratos, remuneraciones, bienestar, capacitación y prevención (Ley Karin) |
| Producción | Inventario, compras de insumos, fabricación o prestación del servicio, calidad |

### El problema

Las pymes chilenas suelen operar con desorden:

- Usan cuadernos, planillas Excel sueltas, WhatsApp y la memoria del dueño.
- Mezclan las finanzas personales con las de la empresa.
- El dueño hace casi todo y no tiene información para decidir.
- Delegan lo legal (impuestos, contratos, cotizaciones) en un contador externo y no lo controlan.
- Se enteran de los incumplimientos cuando llega la multa: SII, Dirección del Trabajo, SERNAC, SEREMI de Salud.

### La propuesta

1. **Registrar cada dato una sola vez.** Una venta genera sola el asiento contable, el IVA, la rebaja de stock, el seguimiento de postventa y el resultado de la campaña que trajo al cliente.
2. **Tener un núcleo legal fijo.** Lo que la ley exige no se puede desactivar: documentos tributarios, contratos, cotizaciones, plazos.
3. **Permitir una flexibilidad acotada.** Cada empresa se adapta con plantillas por rubro, módulos activables y hasta 8 campos propios por ficha. No se pueden romper los procesos estándar.
4. **Estandarizar los procesos.** Cada proceso tiene pasos y estados definidos, y todo queda en una bitácora de auditoría.
5. **Generar alertas de cumplimiento.** El sistema avisa antes del vencimiento: contrato sin firmar, F29, Previred, plazo fijo por vencer, reclamo fuera de plazo.

### Para quién

Micro, pequeñas y medianas empresas según el Estatuto Pyme (Ley 20.416), medidas por ventas anuales en UF. Para el piloto se priorizarán empresas de **1 a 50 trabajadores** en rubros con operación física: comercio, alimentos y gastronomía, servicios y manufactura liviana.

## A2. Cómo lo queremos hacer

### Principios de diseño

- **Adopción por niveles de madurez.** Una pyme desordenada no puede partir con todo. Hay que definir un nivel básico (lo mínimo legal y operativo) y niveles siguientes.
- **Primero lo obligatorio, después lo deseable.** Cada función debe clasificarse como *obligación legal*, *buena práctica* u *opcional*.
- **Umbrales automáticos.** Muchas obligaciones dependen del tamaño: número de trabajadores, ventas, rubro. El sistema debe activarlas cuando la empresa cruza el umbral.
- **Parámetros legales editables.** Tasas, montos y plazos cambian por ley o reajuste. Se configuran y no se programan fijos.
- **Lenguaje simple.** Se nombra lo que el usuario reconoce: "factura", "sueldo", "reclamo". No se usa jerga técnica.

### Cómo se traduce la investigación al ERP

| Si la investigación encuentra… | En el ERP se convierte en… |
|---|---|
| Una obligación legal con plazo | Una **alerta** con fecha y nivel de gravedad |
| Un monto, tasa o tope legal | Un **parámetro legal** configurable con su fuente |
| Un dato mínimo exigido (p. ej. contenido del contrato) | Un **campo obligatorio** en el formulario |
| Un procedimiento con pasos | Un **flujo con estados** que no permite saltarse pasos |
| Una obligación que depende del tamaño o rubro | Una **regla de activación** por umbral o una **plantilla de rubro** |
| Una práctica común no obligatoria | Un **módulo u opción** activable |
| Un indicador que usan las pymes | Un **indicador** en el panel de Dirección |
| Un documento que se debe guardar | Un **registro con respaldo** y su plazo de conservación |

### Estado actual

Ya existe un **prototipo funcional** (HTML y JavaScript, sin servidor) en la carpeta `erp-pyme/`:

- `index.html`: el ERP con las seis áreas conectadas y datos de ejemplo.
- `flujos.html`: diagramas de flujo de los procesos estándar de cada área.
- `nucleo.js`: lógica de negocio y parámetros legales.
- `pruebas.js`: 11 pruebas automáticas.

El prototipo **ya asume** los valores de la sección B6. La investigación debe confirmarlos o corregirlos.

### Etapas

| Etapa | Objetivo | Resultado |
|---|---|---|
| 0. Investigación | Entender a las pymes y sus obligaciones | Informe de Gemini (este encargo) + revisión del equipo |
| 1. Validación | Contrastar con 10 a 15 pymes reales y un contador | Entrevistas y lista priorizada de funciones |
| 2. Producto mínimo | Pasar el prototipo a una aplicación con servidor, base de datos y usuarios | Versión usable por una pyme |
| 3. Piloto | 3 a 5 pymes usándolo de verdad durante 2 o 3 meses | Ajustes y casos de éxito |
| 4. Lanzamiento | Modelo de precios, soporte y ventas | Producto comercial |

## A3. Qué se necesita

### Conocimiento (lo que debe aportar la investigación)

- Una caracterización de las pymes chilenas: tamaño, rubros, formalidad, digitalización y dolores.
- Las obligaciones legales por área, con umbrales, plazos, sanciones y fuentes oficiales.
- Las buenas prácticas mínimas por área, realistas para una pyme desordenada.
- Las herramientas que ya usan y por qué las adoptan o las abandonan.

### Equipo

- Desarrollo de software (aplicación web, base de datos, integraciones).
- Contador o asesor tributario, para validar la contabilidad y los impuestos.
- Abogado laboral, para validar contratos, remuneraciones y Ley Karin.
- Diseño de experiencia de usuario, para que lo use alguien sin formación contable.
- Ventas y acompañamiento de clientes, para la puesta en marcha de cada pyme.

### Tecnología

- Servidor y base de datos con respaldos.
- Usuarios con roles: dueño, contador, ventas, RR.HH., bodega.
- Integración con un proveedor de documentos tributarios electrónicos (facturación electrónica ante el SII).
- Generación de archivos para Previred y del Libro de Remuneraciones Electrónico.
- Conciliación bancaria (cartolas o conexión con bancos).
- Seguridad y protección de datos conforme a la Ley 21.719.

### Aspectos legales del propio proyecto

- Términos de uso y política de privacidad.
- Contrato de tratamiento de datos con cada pyme cliente.
- Registro de marca (INAPI).
- Definir si el sistema emite documentos tributarios directamente (certificación ante el SII) o lo hace a través de un proveedor.

---

# PARTE B · Encargo de investigación para Gemini

## B1. Tu rol

Actúa como **analista de investigación** especializado en pymes chilenas, normativa tributaria, laboral y comercial de Chile, y gestión empresarial. Tu trabajo servirá para **definir los estándares mínimos que un ERP debe incluir por área** para una pyme chilena.

## B2. Objetivo

Responder con evidencia y fuentes:

1. **¿Cómo son y cómo operan hoy** las pymes chilenas, y qué tan ordenadas están?
2. **¿Qué es obligatorio por ley** en cada área, desde qué umbral, con qué plazo y con qué sanción?
3. **¿Qué buenas prácticas mínimas** son realistas para una pyme con poco orden?
4. **¿Qué datos y documentos** debe manejar un sistema para cumplir lo anterior?

## B3. Reglas de la investigación

1. **Prioriza fuentes oficiales:**
   - SII (sii.cl)
   - Dirección del Trabajo (dt.gob.cl)
   - Biblioteca del Congreso Nacional, para el texto de las leyes (bcn.cl/leychile)
   - Previred
   - Superintendencia de Pensiones
   - Superintendencia de Seguridad Social (SUSESO)
   - SERNAC
   - Ministerio de Economía
   - Encuesta Longitudinal de Empresas (ELE)
   - INE, CORFO, Sercotec, SENCE, Ministerio de Salud y SEREMI, Banco Central

   Usa gremios, estudios universitarios y prensa económica solo como complemento.
2. **Cita cada dato** con el enlace y la fecha de publicación o vigencia.
3. **Indica la vigencia a octubre de 2026.** Si una norma cambia de forma gradual (jornada de 40 horas, reforma previsional, protección de datos, retención de boletas de honorarios), entrega el calendario completo de cambios.
4. **No inventes cifras.** Si no encuentras un dato, escribe "sin dato confiable" y sugiere dónde obtenerlo.
5. **Distingue siempre** entre *Obligatorio (ley)*, *Buena práctica* y *Opcional*.
6. **Señala los umbrales:** número de trabajadores, ventas en UF, rubro, régimen tributario o tipo de sociedad.
7. **Marca con [VERIFICAR]** todo lo que tenga incertidumbre o interpretaciones distintas.

## B4. Preguntas transversales: las pymes chilenas

1. ¿Cuántas empresas hay por tamaño (micro, pequeña, mediana) y en qué rubros se concentran? ¿Cuánto empleo y cuántas ventas representan?
2. ¿Qué nivel de **formalidad** tienen? ¿Cuántas emiten documentos electrónicos, llevan contabilidad completa o simplificada, o tienen trabajadores con contrato?
3. ¿Qué nivel de **digitalización** tienen y qué herramientas usan para gestionarse? Incluye Excel, cuaderno, WhatsApp y software como Bsale, Defontana, Nubox, Laudus, Softland, Relbase, Odoo, Buk o Talana.
4. ¿Cuáles son sus **principales dolores de gestión**? Por ejemplo: flujo de caja, morosidad de clientes, cumplimiento tributario y laboral, rotación de personal, control de inventario.
5. ¿Cuáles son las **causas más frecuentes de multas, cierre o fracaso**?
6. ¿Por qué **adoptan o abandonan** un software de gestión? Considera precio, complejidad, contador externo y falta de tiempo.
7. ¿Qué rol cumple el **contador externo** y qué información le entregan las pymes?
8. Propón una **escala de madurez de gestión** en 3 o 4 niveles, con señales concretas para reconocer en qué nivel está una pyme.

## B5. Preguntas por área

Para cada área, investiga las obligaciones legales, las buenas prácticas mínimas, los datos y documentos que se deben registrar, los plazos, las sanciones y los indicadores típicos.

### Dirección y constitución de la empresa
- Formas jurídicas habituales (EIRL, SpA, Ltda., persona natural con giro) y sus obligaciones de mantención.
- Inicio de actividades, patente municipal, permisos según rubro.
- Regímenes tributarios para pymes (Pro Pyme General, Pro Pyme Transparente, régimen general) y qué cambia en la gestión de cada uno.
- Obligación o recomendación de separar el patrimonio personal del de la empresa.
- Indicadores básicos que debería mirar un dueño de pyme cada semana y cada mes.

### Finanzas y tributación
- Documentos tributarios electrónicos obligatorios (factura, boleta, guía de despacho, notas de crédito y débito) y sus reglas: folios, plazos, anulación, comprobantes de pago electrónico.
- Registro de Compras y Ventas, F29, PPM, F22, declaraciones juradas: fechas y quién está obligado.
- Retención de boletas de honorarios: tasa vigente y calendario.
- Contabilidad completa frente a simplificada: requisitos, libros obligatorios, plazos de conservación de documentos.
- ¿Existe un plan de cuentas estándar o recomendado por el SII?
- Ley de pago a 30 días (Ley 21.131) y prácticas de cobranza, factoring y financiamiento (FOGAPE, CORFO).
- Buenas prácticas mínimas: conciliación bancaria, flujo de caja, presupuesto.

### Comercial (clientes, proveedores, atención y postventa)
- Ley del Consumidor (19.496) y sus modificaciones (incluida la Ley 21.398 Pro Consumidor):
  - Garantía legal y sus plazos
  - Derecho a retracto en ventas a distancia
  - Información de precios
  - Atención de reclamos y plazos de respuesta
  - Comunicaciones comerciales
- Obligaciones en ventas por internet y despacho.
- Gestión de proveedores: registro, compras, recepción y validación de facturas.
- Buenas prácticas mínimas: ficha de cliente, cotizaciones, condiciones de crédito, seguimiento postventa.

### Marketing
- Ley 21.719 de protección de datos personales:
  - Fecha de entrada en vigencia
  - Obligaciones para pymes: consentimiento, finalidad, derechos de las personas, seguridad, registro
  - Sanciones y criterios por tamaño
- Reglas para correos, mensajes y llamadas comerciales (desuscripción o "no molestar").
- Publicidad engañosa y promociones: requisitos de bases y sorteos.
- Canales y presupuestos que usan realmente las pymes, y cómo miden resultados.

### Recursos Humanos
- Contrato de trabajo:
  - Contenido mínimo (art. 10 del Código del Trabajo)
  - Plazo para escriturarlo
  - Tipos de contrato y reglas de renovación del plazo fijo
- Jornada (Ley 21.561, 40 horas): calendario de reducción y adecuaciones de pymes.
- Registro electrónico de asistencia: quién está obligado y desde cuándo.
- Remuneraciones:
  - Ingreso mínimo
  - Gratificación legal
  - Horas extra
  - Cotizaciones (AFP, salud, seguro de cesantía, SIS, mutual)
  - Aporte del empleador de la reforma previsional (Ley 21.735) con su calendario
  - Impuesto único
- Previred (fecha de pago) y Libro de Remuneraciones Electrónico (umbral de obligatoriedad).
- Obligaciones por número de trabajadores:
  - Reglamento interno
  - Comité paritario
  - Departamento de prevención
  - Sala cuna
  - Ley de Inclusión
  - Ley Karin
- Ley Karin (21.643): protocolo de prevención, procedimiento de denuncia, plazos de investigación.
- Seguridad laboral (Ley 16.744 y su reglamentación vigente): afiliación a mutual, información de riesgos.
- Término del contrato: causales, finiquito electrónico, plazos y pagos.
- Bienestar: capacitación con franquicia SENCE, beneficios habituales, vacaciones y licencias médicas.

### Producción, inventario y operaciones
- Valorización de inventarios aceptada por el SII y tratamiento de mermas y castigos.
- Normativa sectorial frecuente en pymes:
  - Alimentos: Reglamento Sanitario de los Alimentos, resolución sanitaria, curso de manipulación, etiquetado según la Ley 20.606
  - Ley REP (20.920) y envases
  - Permisos municipales y sanitarios
- Trazabilidad mínima: lotes y vencimientos.
- Buenas prácticas mínimas: stock mínimo, conteos periódicos, órdenes de producción, control de calidad.

## B6. Valores que el prototipo ya usa: confírmalos o corrígelos

Para cada fila indica el **valor vigente a octubre de 2026**, la **fuente** y si **cambia** en una fecha próxima.

| Parámetro | Valor usado en el prototipo |
|---|---|
| Tasa de IVA | 19 % |
| Vencimiento del F29 (facturador electrónico) | Día 20 del mes siguiente |
| Vencimiento del pago de cotizaciones en Previred | Día 13 del mes siguiente |
| Ingreso mínimo mensual | $539.000 |
| Jornada máxima semanal | 42 horas (desde abril de 2026); 40 horas desde abril de 2028 |
| Valor UF / UTM de referencia | $39.500 / $69.000 |
| Tope imponible mensual | 87,8 UF |
| Cotización AFP obligatoria | 10 % + comisión de cada AFP |
| Comisiones de las AFP | Capital 1,44 %, Cuprum 1,44 %, Habitat 1,27 %, Modelo 0,58 %, PlanVital 1,16 %, Provida 1,45 %, Uno 0,46 % |
| Cotización de salud | 7 % |
| Seguro de cesantía, contrato indefinido | Trabajador 0,6 %, empleador 2,4 % |
| Seguro de cesantía, plazo fijo | Empleador 3,0 % |
| SIS (seguro de invalidez y sobrevivencia) | 1,53 % |
| Cotización básica de mutual (Ley 16.744) | 0,93 % |
| Aporte del empleador, reforma previsional (Ley 21.735) | 3,5 % [VERIFICAR] |
| Gratificación legal (art. 50) | 25 % de la remuneración con tope de 4,75 ingresos mínimos al año |
| Tramos del impuesto único de segunda categoría | Exento hasta 13,5 UTM; 4 %, 8 %, 13,5 %, 23 %, 30,4 %, 35 % y 40 % |
| Plazo para escriturar el contrato | 15 días (5 días si el contrato dura menos de 30) |
| Duración máxima del plazo fijo | 1 año (2 años para profesionales y técnicos); la segunda renovación lo convierte en indefinido |
| Garantía legal del consumidor | 6 meses |
| Plazo de investigación de la Ley Karin | 30 días |
| Vigencia de la Ley 21.719 de datos personales | Diciembre de 2026 [VERIFICAR] |

---

# PARTE C · Formato de entrega

Entrega el informe con esta estructura, en español:

### 1. Resumen ejecutivo
Una página como máximo. Contiene los 10 hallazgos más importantes para diseñar el ERP.

### 2. Radiografía de la pyme chilena
Responde las preguntas de B4 con cifras y fuentes. Incluye la **escala de madurez** propuesta.

### 3. Estándares por área
Una sección por cada área de B5. Cada sección tiene tres partes:

**a) Tabla de requisitos**

| Requisito | Tipo | Aplica a | Frecuencia o plazo | Dato o documento que el sistema debe manejar | Riesgo o sanción | Fuente |
|---|---|---|---|---|---|---|
| … | Obligatorio / Buena práctica / Opcional | Tamaño, n.º de trabajadores, rubro | … | … | … | Enlace y fecha |

**b) Dolores típicos y cómo los resuelven hoy las pymes**

**c) Estándar mínimo del área.** Las 5 a 8 cosas que toda pyme debería tener resueltas en el nivel básico.

### 4. Validación de parámetros
La tabla de B6 completada, con columnas: *Parámetro · Valor del prototipo · Valor vigente · ¿Correcto? · Cambios programados · Fuente*.

### 5. Calendario de obligaciones
Tabla con las fechas recurrentes (mensuales y anuales) que debe vigilar una pyme. Columnas: *Fecha · Obligación · Área · Quién está obligado · Fuente*.

### 6. Umbrales por tamaño
Tabla de obligaciones que se activan al crecer. Ejemplo: "desde 10 trabajadores: reglamento interno". Columnas: *Umbral · Obligación · Área · Fuente*.

### 7. Lista consolidada para cargar en el sistema
Una tabla final con **una fila por obligación**, sin texto adicional, para copiarla a una planilla:

| id | area | obligacion | tipo | umbral | frecuencia | plazo | dato_erp | sancion | fuente |
|---|---|---|---|---|---|---|---|---|---|
| RRHH-01 | rrhh | Escriturar contrato de trabajo | Obligatorio | Todo trabajador | Por ingreso | 15 días desde el ingreso | Fecha de firma del contrato | Multa DT [monto] | Enlace |

### 8. Vacíos y dudas
Lo que no pudiste confirmar, lo que necesita revisión de un contador o abogado, y las preguntas que conviene hacer a pymes reales en entrevistas.

### 9. Fuentes
Lista de todas las fuentes, con enlace, institución y fecha de consulta.
