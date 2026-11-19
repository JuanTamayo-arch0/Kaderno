# PLAN v23: lo pendiente, cobrar suscripciones y Kaderno para el trabajo

Estado: propuesta del domingo 15 de noviembre de 2026. Parte A: fase 1 construida (rama v23-proyecto); se construye una PR por fase. Las partes B y C esperan tus decisiones (sección D).

---

## A. Lo pendiente de planes anteriores (se construye ya)

| Fase | Qué | De dónde viene |
|---|---|---|
| 1 | Ordenar la pantalla de proyecto (hoy un solo archivo de unas 1600 líneas) en partes, sin cambiar lo que hace | Deuda técnica (v12) |
| 2 | Comentarios en tareas de proyecto, @menciones y aviso cuando te asignan o te mencionan | F11 de v12 |
| 3 | Calendario del proyecto: mes y línea de tiempo con inicio y entrega de cada tarea, cruces y camino a la entrega final | F12 de v12 |
| 4 | Ropa de temporada para las mascotas y abrir la fuente de una cita de PDF en la misma pestaña | v17 y v22 |

Se quedan fuera por ahora, con razón:
- **Transcripción pagada**: cuesta plata cada mes; se activa cuando decidas (ver `PLAN_v22.md`).
- **Repaso ajustado a ti (FSRS con tus datos)**: necesita unos meses de respuestas guardadas para que valga la pena.
- **Sonidos grabados**: opcionales; los generados funcionan y no pesan.
- **Push en la app nativa**: solo sirve si se publica en las tiendas.

---

## B. Cobrar suscripciones

### B.1 Opciones desde Colombia

| Opción | Qué es | Costo por cobro (aprox.) | A favor | En contra |
|---|---|---|---|---|
| **Wompi** (Bancolombia) | Pasarela colombiana. "Fuentes de pago": guardas la tarjeta, Nequi, Daviplata o el botón Bancolombia una vez y cobras cada mes desde el servidor | 2,65 % + $700 + IVA | Nequi y Daviplata (lo que más usan los estudiantes), pesos, plata a tu cuenta Bancolombia, tarifa baja | La lógica de cobrar cada mes, reintentar y cancelar la hacemos nosotros (ya tenemos pg_cron y funciones) |
| **Mercado Pago** | Suscripciones listas: creas el plan, el cliente acepta una vez y Mercado Pago cobra solo y reintenta | 2,79 % a 3,29 % + $800 + IVA | Lo más rápido de montar: ellos cobran y reintentan; prueba gratis incluida | Sin Nequi ni Daviplata; la plata queda en la cuenta de Mercado Pago |
| **Paddle / Polar** (vendedor registrado, "merchant of record") | Ellos venden en tu nombre en todo el mundo y se encargan de impuestos y facturas | 5 % + US$0,50 | Para vender fuera de Colombia sin preocuparte por impuestos de cada país | Caro para precios en pesos; pagan en dólares por transferencia internacional; hay que confirmar con ellos que aceptan vendedores en Colombia |
| **Stripe** | Procesador de pagos | No aplica | No aplica | No está disponible para negocios en Colombia (solo con una empresa en otro país) |

### B.2 Recomendación

1. **Ahora: Wompi.** Los estudiantes pagan con Nequi mucho más que con tarjeta, y la tarifa es la más baja. Montarlo es de una o dos fases: guardar la fuente de pago con el widget de Wompi, una función que cobra cada mes (pg_cron, como los avisos) y un webhook que confirma cada pago.
2. **Si quieres salir antes**: Mercado Pago, porque ellos manejan el cobro mensual. Se puede empezar ahí y pasar a Wompi después sin cambiar la app (todo pasa por una tabla de suscripciones propia).
3. **Si algún día vendes fuera de Colombia**: Paddle o Polar, solo para esos clientes.

### B.3 Cómo quedaría en Kaderno

- **Planes** (precios a decidir; propuesta):
  - **Gratis**: todo lo de hoy, con topes bajos de IA (por ejemplo 5 resúmenes, 2 simulacros y 20 páginas leídas por día).
  - **Pro**: unos $12.900 al mes o $99.000 al año (con descuento de estudiante). Topes altos de IA, transcripción de clase con servicio pagado, calendarios externos ilimitados, más temas y prendas.
  - **Equipo** (para el trabajo, parte C): por persona al mes, con espacios compartidos.
- **Base**: tabla `subscriptions` (plan, estado, fin del periodo, proveedor e id de la fuente de pago) que solo escribe el servidor; una función `plan_of(user)` que usan los topes de IA (`ai_take` ya existe: el tope pasa a depender del plan).
- **Pantallas**: Ajustes → "Tu plan" (plan actual, próximo cobro, cambiar medio de pago, cancelar) y un aviso amable cuando llegas a un tope ("Con Pro tienes 40 al día").
- **Funciones**: `billing-checkout` (crea la suscripción), `billing-charge` (cobra lo que vence, con 3 reintentos en 7 días y aviso antes de bajar a Gratis) y `billing-webhook` (Wompi confirma cada pago; se verifica la firma con el secreto de eventos).
- **Lo legal**: necesitas RUT, cuenta de Wompi (puede ser como persona natural independiente), términos y condiciones, política de reembolso y factura electrónica según tu régimen ante la DIAN. Esto último conviene revisarlo con un contador antes de cobrar.

---

## C. Kaderno para el trabajo

La idea: el mismo Kaderno, con un **modo Trabajo** que cambia nombres y agrega lo que un equipo necesita. Casi todo ya existe con otro nombre.

| Estudio | Trabajo | Qué cambia |
|---|---|---|
| Materias | Áreas o clientes | Solo el nombre y el ícono |
| Horario de clases | Horario laboral y reuniones fijas | Igual, con la línea de tiempo de "Mi día" |
| Parcial y plan del parcial | Entrega o hito, con plan hacia atrás | Mismo motor de sesiones |
| Grabar la clase | **Grabar la reunión** | Resumen con **decisiones** y **tareas con responsable** que se crean en el proyecto |
| Ritual del semestre | Ritual del trimestre (objetivos y resultados clave) | Mismas metas WOOP |
| Enfoque | **Registro de horas** por proyecto o cliente | Exportar a CSV o PDF para cobrar o reportar |
| Proyectos en grupo | **Espacios de equipo** | Con comentarios, menciones y calendario (fases 2 y 3 de la parte A) |

Funciones nuevas para el trabajo, por orden de valor:
1. **Modo Trabajo** al registrarse o en Ajustes (Estudio, Trabajo o los dos): cambia los nombres, las plantillas y lo que muestra Hoy.
2. **Grabar la reunión**: acta automática (asistentes, decisiones, tareas con responsable y fecha) que se publica en el proyecto.
3. **Registro de horas**: el enfoque cuenta por proyecto y cliente; informe semanal o mensual exportable.
4. **Carga del equipo**: quién tiene qué esta semana y quién está sobrecargado (usa los estimados y "tu tiempo real").
5. **Informe semanal automático** para tu jefe o cliente: lo hecho, lo que viene y lo bloqueado, armado con las tareas del proyecto.
6. **Plantillas de trabajo**: acta de reunión, uno a uno, retrospectiva, propuesta, informe.
7. **Integraciones**: avisos a Slack o Teams, y reenviar un correo a Kaderno para crear una tarea.

Encaja con el plan **Equipo** de la parte B: el modo Trabajo personal es gratis o Pro, y los espacios de equipo con varias personas son de pago por persona.

---

## D. Decisiones que necesito

1. **Pagos**: ¿Wompi (recomendado), Mercado Pago, o los dos?
2. **Precios y qué es Pro**: ¿te sirven los de B.3?
3. **Lo legal**: ¿ya tienes RUT y cuenta de Wompi o Mercado Pago? (sin eso se puede construir todo y probarlo en modo de pruebas, pero no cobrar de verdad).
4. **Trabajo**: ¿empezamos por modo Trabajo + grabar la reunión + registro de horas (lo más rápido de hacer con lo que ya existe)?

Fuentes de la parte B (noviembre de 2026): documentación de fuentes de pago de Wompi, página de suscripciones de Mercado Pago Colombia, comparación de pasarelas de Rebill (julio de 2026), comparación de merchant of record de Alex Cloudstar (2026), ayuda de pagos de Paddle.
