# PLAN v24: planes, pagos con Wompi y Kaderno para el trabajo

Estado: en construcción desde el domingo 15 de noviembre de 2026. Decisiones de Juan José: pagos con Wompi, precios según el mercado, todavía sin RUT. Todo se construye y se prueba en el modo de pruebas de Wompi (sandbox); para cobrar de verdad faltan el RUT y la cuenta de comercio (sección D). Una PR por fase, en orden.

---

## A. Precios

| Plan | Mensual | Anual | Para quién |
|---|---|---|---|
| Gratis | $0 | $0 | Todo lo de estudiar y organizarse, con topes diarios de IA |
| Pro | $9.900 | $89.000 (25 % menos, unos $7.400 al mes) | Quien usa la IA a diario, graba clases o reuniones, o lleva horas |
| Equipo | $14.900 por persona | $149.000 por persona | Un solo pago para varias personas (mínimo 2) |

Prueba gratis de Pro: 7 días, una vez por cuenta, sin tarjeta. Al terminar vuelve a Gratis solo, sin cobrar.

Por qué estos precios:
1. Spotify Premium Estudiantes cuesta $10.100 al mes en Colombia (spotify.com, noviembre de 2026). Es el precio que un estudiante ya paga sin pensarlo mucho; Pro queda justo por debajo.
2. Wompi cobra unos 2,65 % + $700 + IVA por pago. En $9.900 eso es cerca de $1.150 (12 %); en $89.000 es cerca de $3.600 (4 %). Por eso el anual tiene descuento fuerte y es el que se muestra primero.
3. Equipo cuesta menos que Notion o Todoist por persona (más de US$8 al mes) y sirve para equipos pequeños y empresas en Colombia.
4. Los topes de Pro están pensados para que ni el más intenso cueste más de lo que paga en IA: un simulacro cuesta unos US$0,10 y una página leída unos US$0,02.

Los precios son finales. Si te registras como responsable de IVA, hay que sumar el IVA o absorberlo: revísalo con un contador.

## B. Qué cambia con cada plan

| | Gratis | Pro y Equipo |
|---|---|---|
| Resúmenes al día | 10 | 60 |
| Creaciones de tarjetas | 8 | 40 |
| Simulacros | 2 | 8 |
| Pruebas de notas | 5 | 25 |
| Correcciones | 10 | 50 |
| Páginas leídas (fotos) | 20 | 80 |
| Resúmenes de clase | 2 | 8 |
| Actas de reunión | 2 | 8 |
| Divisiones en pasos | 15 | 80 |
| Calendarios externos | 2 | 10 |
| Informe de horas en PDF | No (CSV sí) | Sí |
| Horas de todo el equipo por proyecto | No | Solo Equipo |

Nada de lo que existe se quita: materias, tareas, notas, horario, enfoque, repaso, proyectos en grupo, comentarios, calendario y mascota siguen gratis. A quien ya tenga más de 2 calendarios no se le borra ninguno.

## C. Fases

1. **Planes y topes** (PR 34): tabla `subscriptions`, `plan_of()`, `my_plan()`, prueba de 7 días, topes de IA por plan, calendarios por plan, pantalla "Tu plan" (en Ajustes) y el botón "Ver planes" cuando se acaba el cupo.
2. **Cobro con Wompi** (PR 35): pagar un mes o un año con cualquier medio de Wompi (Nequi, tarjeta, PSE, Bancolombia, Daviplata) por su Web Checkout; renovación automática con tarjeta o Nequi (fuentes de pago); webhook firmado; cobro diario de lo que vence con 3 reintentos en 7 días; cancelar y reanudar; historial de pagos; puestos de Equipo por correo.
3. **Modo Trabajo** (PR 36): Estudio, Trabajo o los dos, al registrarse o en Ajustes. Cambia los nombres (materias por áreas o clientes, parcial por entrega, clase por reunión, semestre por trimestre) y trae plantillas de trabajo (acta, uno a uno, retrospectiva, propuesta, informe).
4. **Grabar la reunión** (PR 37): la grabación de la clase, pensada para reuniones; la IA arma el acta (asistentes, decisiones, tareas con responsable y fecha, pendientes) y se publica en un proyecto: las tareas quedan asignadas y el acta queda en los archivos del proyecto.
5. **Registro de horas e informes** (PR 38): el enfoque cuenta por proyecto y por área o cliente; horas a mano; informe por semana o mes con tarifa por hora; exportar CSV (gratis) y PDF (Pro); horas de todo el equipo en un proyecto (Equipo); informe semanal del proyecto (hecho, lo que viene, atrasado) listo para mandar.

Queda para después: avisos a Slack o Teams y crear tareas reenviando un correo.

## D. Para cobrar de verdad (lo que te toca)

1. **RUT** en la DIAN como persona natural (gratis, en línea). Actividad sugerida: 6201 (desarrollo de software) o 6312 (portales web). Pregunta a un contador si te conviene el régimen simple.
2. **Cuenta de comercio en Wompi** (comercios.wompi.co) con cédula, RUT y una cuenta bancaria a tu nombre (Bancolombia es lo más rápido). Mientras la aprueban, el sandbox ya funciona con las llaves de prueba.
3. **Llaves**: en el panel de Wompi, Desarrolladores: llave pública, llave privada, secreto de integridad y secreto de eventos. Van como secretos de Supabase (RUNBOOK, versión 24); nunca en el repositorio ni en el droplet.
4. **URL de eventos** en Wompi: la de la función `billing-webhook` (una para sandbox y otra para producción).
5. **Términos, privacidad y reembolsos**: Kaderno ya enlaza los de Wompi al pagar; falta una página tuya con términos y política de reembolso (propuesta: reembolso completo en los primeros 7 días de un pago).
6. **Factura electrónica**: según tu régimen ante la DIAN puede ser obligatoria; Kaderno guarda cada pago con su referencia para que la puedas emitir.

## E. Decisiones tomadas al construir (se pueden cambiar)

1. (Fase 1) La prueba gratis no pide tarjeta y no se convierte en cobro: al terminar vuelve a Gratis.
2. (Fase 1) Si la base no tiene schema_v23, la IA usa los topes de Pro (nadie se queda sin IA por una migración pendiente).
3. (Fase 1) El cupo se cuenta por día local, como antes; los topes nuevos aplican desde el día en que se despliega.
4. (Fase 1) Equipo: quien paga cuenta como un puesto; los demás se agregan por correo y tienen Pro mientras el plan esté vigente.
5. (Fase 2) Dos formas de pagar: "una vez" por el checkout web de Wompi (todos los medios, sin renovación; avisamos 3 días antes de que termine) y "renovar solo" con tarjeta o Nequi guardados en Wompi. PSE y Bancolombia no se pueden cobrar solos, por eso existe la primera.
6. (Fase 2) La renovación se cobra un día antes del fin. Si falla, reintentos 1, 2 y 4 días después, conservando el plan hasta 7 días después del fin; al tercer fallo se apaga la renovación (no se borra nada).
7. (Fase 2) Pagar otro periodo antes de que termine se suma al final. No se cambia de Pro a Equipo (ni al revés) con un periodo pagado vigente; la prueba gratis sí se puede pagar en cualquier momento.
8. (Fase 2) Puestos extra de Equipo a mitad de periodo: la parte proporcional de lo que falta, mínimo $2.000 por puesto. Desde la siguiente renovación se cobran con el resto.
9. (Fase 2) Apagar la renovación olvida el medio de pago en Kaderno (la tarjeta queda en Wompi, que no la vuelve a cobrar sin nosotros).
10. (Fase 2) Los datos de la tarjeta van de la app directo a Wompi con la llave pública; el servidor solo recibe el token. El webhook verifica la firma con el secreto de eventos y aplicar un pago es idempotente.
