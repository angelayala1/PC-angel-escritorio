# Análisis de la investigación de Gemini

**Documento revisado:** *Investigación exhaustiva: estándares normativos y operativos para el desarrollo de un ERP orientado a pymes chilenas* (Gemini, octubre 2026, 28 páginas).
**Revisión:** 6 de octubre de 2026.

## 1. Veredicto

La investigación **sirve como base**, pero no se puede cargar tal cual. Aporta hallazgos valiosos que el prototipo no tenía:

- el plazo de 8 días para reclamar facturas recibidas;
- la Ley de Pago a 30 días;
- la retención de honorarios;
- los regímenes Pro Pyme;
- los umbrales por número de trabajadores;
- la escala de madurez.

También tiene **un error grave** en la reforma previsional, varias afirmaciones dudosas y vacíos importantes. La radiografía de las pymes trae pocas cifras y la lista consolidada para cargar al sistema tiene solo 9 obligaciones.

## 2. Errores y correcciones

Verifiqué contra fuentes oficiales y prensa especializada los puntos que más afectan los cálculos.

| Lo que dice el informe | Evaluación | Qué se hizo en el ERP |
|---|---|---|
| El aporte del empleador de la reforma previsional ya es **8,5 %** | **Incorrecto.** Desde agosto de 2026 es **3,5 %**. Sube cada agosto (4,25 % en 2027, 5 % en 2028…) hasta llegar a 8,5 % en 2033 | Se mantiene 3,5 %. Haber cargado 8,5 % habría sobrestimado el costo laboral en 5 puntos de la planilla |
| El tope imponible correcto es **135,2 UF** (el prototipo usaba 87,8) | **Parcial.** 135,2 UF es solo el tope del seguro de cesantía. El de AFP y salud es **90 UF** desde febrero de 2026 | Ahora hay dos topes: 90 UF (AFP, salud, mutual) y 135,2 UF (cesantía) |
| El SIS subió a 1,62 % y desde agosto de 2026 queda absorbido | **Correcto.** El SIS va dentro del 2,5 % que forma parte del 3,5 % | **Error del prototipo corregido:** cobraba el SIS dos veces (1,53 % aparte más el 3,5 %). Ahora el SIS vale 0 por separado |
| La mutual básica es 0,90 %, no 0,93 % | **Dudoso.** 0,93 % = 0,90 % básica + 0,03 % extraordinaria | Se mantiene 0,93 %, marcado "por verificar" |
| Las multas de la Dirección del Trabajo suben al pasar 25.000 UF de ventas | **Dudoso.** Las multas del art. 506 se gradúan por **número de trabajadores**, no por ventas | No se cargó |
| Investigación Ley Karin: 30 días **hábiles** | **Por verificar** | El sistema avisa contando días corridos, que es lo más conservador |
| Bloquear toda factura B2B sin orden de compra | **Demasiado rígido** para pymes | Se implementó por cliente: solo se bloquea si la ficha dice "exige orden de compra" |
| Previred vence el día 13 "a las 13:45" | Sin respaldo en las fuentes citadas | No se usa |

Sobre las fuentes: la mayoría son oficiales (SII, Dirección del Trabajo, Superintendencia de Pensiones, Biblioteca del Congreso), pero algunas son blogs comerciales (licitalab.cl, otecsolutions.cl) o tesis. Los datos que salen solo de esas fuentes quedan como "por verificar".

## 3. Qué se incorporó al ERP

| Hallazgo | Cambio en el ERP | Dónde se ve |
|---|---|---|
| 8 días corridos para reclamar una factura recibida; después queda aceptada y se puede cobrar judicialmente | Cada factura de compra tiene **acuse**: pendiente, aceptada, reclamada o aceptada sola. Hay alerta crítica cuando quedan 2 días o menos. Reclamar revierte la deuda, el IVA crédito y el stock | Comercial › Compras · Dirección › Alertas |
| Retención de boletas de honorarios: 15,25 % en 2026 | Nuevo destino **Boleta de honorarios**: retiene el impuesto y lo suma al F29 | Comercial › Compras · Finanzas › F29 |
| PPM según régimen Pro Pyme | Régimen tributario en la ficha de la empresa y **propuesta de F29** con IVA, retenciones, impuesto único y PPM | Configuración › Empresa · Finanzas › F29 · KPI "F29 estimado" |
| Separar el patrimonio del dueño | Nuevo destino **Gasto personal del dueño**: va a "Retiros", no a gastos ni a IVA crédito | Comercial › Compras |
| Obligaciones que aparecen al crecer | Panel **Obligaciones que llegan al crecer**: libro de remuneraciones (5), reglamento interno (10), sala cuna (20 trabajadoras), comité paritario (más de 25), Ley de Inclusión (100), prevención de riesgos (más de 100) y tramos de ventas en UF. Avisa antes de llegar | Dirección |
| Sala cuna se cuenta por trabajadoras | Campo **sexo registral** en la ficha del trabajador | RR.HH. › Trabajadores |
| Ley 21.719 desde el 1 de diciembre de 2026: consentimiento demostrable, derechos de las personas, no contactar | El consentimiento guarda **fecha y medio**. Hay casilla "pidió no recibir comunicaciones" y botón **Suprimir datos**: borra el contacto y conserva nombre y RUT por obligación tributaria | Comercial › Clientes y proveedores · Marketing › Audiencias |
| Retracto de 10 días en ventas a distancia | Nuevo tipo de ticket **Retracto**, que valida el plazo | Comercial › Atención y postventa |
| Discrepancia entre orden de compra y factura bloquea pagos | Campo **N° orden de compra** en la factura; es obligatorio si el cliente lo exige | Comercial › Ventas |
| Ley de Pago a 30 días | Aviso opcional de interés por mora (apagado por defecto, ver punto 6) | Configuración › Módulos |
| Parámetros que cambian por ley | Cada parámetro muestra su **fuente** y si está *confirmado*, *por verificar* o hay que *actualizarlo seguido* | Configuración › Parámetros legales |

Todo está cubierto por pruebas: 18 pruebas automáticas (`node pruebas.js`), 7 de ellas nuevas para estos cambios.

## 4. Qué queda para la etapa con servidor

Estos puntos del informe necesitan integraciones o especificaciones técnicas. No caben en un prototipo sin servidor:

- Descarga diaria del Registro de Compras y Ventas desde el SII, y reclamo o aceptación directo en el SII.
- Archivo de Previred y archivo del Libro de Remuneraciones Electrónico. Sus formatos cambian con la reforma, así que conviene construirlos con el formato oficial vigente.
- Conciliación bancaria con cartolas o conexión con el banco.
- Nota de débito automática por intereses de la Ley 21.131.
- Flujo cotización → orden de trabajo → factura.
- Firma electrónica de liquidaciones y finiquito electrónico.
- Reporte anual de envases para la Ley REP; lotes y rotación FIFO.
- Valores diarios de UF y UTM desde una fuente oficial.

## 5. Lo que la investigación no respondió

- **Radiografía de la pyme:**
  - faltan cifras de empresas por tamaño y rubro, empleo, ventas y digitalización;
  - no hay análisis de la competencia (Bsale, Nubox, Defontana, Laudus, Relbase, Buk, Talana);
  - las razones de abandono de software son genéricas;
  - casi no describe el papel del contador externo.
- **RR.HH.:** registro electrónico de asistencia, término de contrato y finiquito, vacaciones, licencias médicas, cómo se adecuan las pymes a las 40 horas.
- **Finanzas:** contabilidad completa frente a simplificada, plan de cuentas recomendado por el SII, plazos de conservación de documentos, detalle de las declaraciones juradas.
- **Comercial:** información de precios, plazos para responder reclamos, obligaciones del despacho.
- **Marketing:** bases de promociones y sorteos, canales y presupuestos reales de las pymes.
- **Producción:** resolución sanitaria, curso de manipulación de alimentos, etiquetado (Ley 20.606), permisos municipales.
- **Lista consolidada:** se pidió una fila por obligación y entregó 9.

## 6. Decisiones abiertas para validar con pymes y contador

1. **Interés por mora (Ley 21.131).** Es un derecho, pero las pymes temen perder clientes si lo cobran. Quedó como aviso opcional y apagado. ¿Debe venir encendido?
2. **Orden de compra.** ¿Basta con exigirla solo a los clientes que la piden?
3. **Quién acusa las facturas recibidas.** ¿Bodega, el dueño o el contador? Define quién recibe la alerta de los 8 días.
4. **Escala de madurez.** ¿Usarla para activar módulos por etapas al incorporar una pyme nueva?
5. **Con el contador:** tasa de PPM según régimen, mutual (básica, extraordinaria y adicional), y días hábiles o corridos en Ley Karin.

## 7. Próximos pasos

1. Hacer **una segunda ronda de investigación** solo sobre los vacíos del punto 5. Se puede usar el texto de abajo con Gemini.
2. Que un contador revise los parámetros marcados "por verificar".
3. Hacer entrevistas a 10–15 pymes con las preguntas del punto 6.

### Texto para la segunda ronda (Gemini, modo Deep Research)

> Continúa la investigación anterior sobre estándares para un ERP de pymes chilenas, vigentes a octubre de 2026. Usa solo fuentes oficiales (SII, Dirección del Trabajo, Superintendencia de Pensiones, SUSESO, SERNAC, MINSAL, Ministerio de Economía y su Encuesta Longitudinal de Empresas, INE, Biblioteca del Congreso). Cita enlace y fecha de cada dato y marca [VERIFICAR] lo incierto. No repitas lo ya entregado.
>
> 1. Cifras de pymes chilenas: número por tamaño y rubro, empleo, ventas, uso de facturación electrónica, digitalización y uso de software de gestión.
> 2. Competencia: Bsale, Nubox, Defontana, Laudus, Relbase, Buk y Talana. Para cada uno: qué cubren, precio aproximado, a quién apuntan y principales quejas de usuarios.
> 3. RR.HH.: registro electrónico de asistencia (quién está obligado), finiquito electrónico, vacaciones, licencias médicas, causales de término con sus plazos y pagos, y adecuaciones de la Ley 40 horas para pymes.
> 4. Finanzas: contabilidad completa frente a simplificada por régimen, plan de cuentas del SII, plazos de conservación de documentos, declaraciones juradas de una pyme típica con sus fechas.
> 5. Comercial y marketing: información de precios, plazos para responder reclamos, bases de promociones y sorteos.
> 6. Producción: resolución sanitaria, curso de manipulación de alimentos, etiquetado según la Ley 20.606 y permisos municipales.
> 7. Confirma: (a) si la investigación de la Ley Karin se cuenta en días hábiles o corridos; (b) la composición actual de la cotización a la mutual; (c) las tasas de PPM vigentes para Pro Pyme General y Pro Pyme Transparente; (d) si los tramos de multas de la Dirección del Trabajo dependen del número de trabajadores.
> 8. Entrega al final una tabla con **una fila por obligación** (id, área, obligación, tipo, umbral, frecuencia, plazo, dato que debe manejar el ERP, sanción, fuente). Debe tener al menos 40 filas.

## Fuentes usadas en la verificación

- [Asociación de AFP: cotización adicional de 3,5 % desde agosto de 2026](https://www.aafp.cl/noticias/reforma-previsional-cotizacion-adicional-35-agosto-2026/)
- [BioBioChile: qué cambia en agosto con la reforma (desglose 0,1 % + 0,9 % + 2,5 % con SIS incluido)](https://www.biobiochile.cl/noticias/economia/actualidad-economica/2026/07/30/a-partir-de-agosto-sube-la-cotizacion-previsional-quien-paga-el-aumento-y-que-cambia-con-la-reforma.shtml)
- [Ministerio de Hacienda: implementación de la nueva cotización del empleador](https://www.hacienda.cl/noticias-y-eventos/noticias/implementacion-de-la-reforma-previsional-nueva-cotizacion-del-empleador-regira)
- [Asociación de AFP: alza de topes imponibles 2026 a 90 UF](https://www.aafp.cl/noticias/alza-topes-imponibles-2026-90-uf/)
- [AFP Habitat: tope imponible febrero 2026](https://www.afphabitat.cl/noticias/tope-imponible-febrero-2026/)
- [ChileAtiende: Seguro de Invalidez y Sobrevivencia](https://www.chileatiende.gob.cl/fichas/145651-seguro-de-invalidez-y-sobrevivencia-sis)
