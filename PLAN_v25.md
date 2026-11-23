# PLAN v25: potenciar el modo Trabajo (análisis de apps de trabajo)

Estado: aprobado el sábado 21 de noviembre de 2026 ("implementa como lo desees"). Se construyen las fases 1 a 6, una PR por fase; la 7 queda para después salvo compartir por WhatsApp. Parte de lo que ya trae la versión 24 (modo Trabajo, actas de reunión, registro de horas, planes y Wompi).

---

## A. Qué hacen las apps de trabajo que la gente ya paga

Se revisaron cuatro familias: proyectos y tareas, planear el día, registro de horas y notas de reunión. Precios en dólares, por persona al mes, pagando el año.

| Familia | Apps | Lo que las hace valiosas | Precio |
|---|---|---|---|
| Proyectos | Asana, ClickUp, Linear, Notion | Vistas (tablero, lista, cronograma, calendario), dependencias, automatizaciones ("cuando pasa X, haz Y"), formularios de solicitud, metas, carga del equipo, IA que redacta el estado del proyecto | ClickUp desde 10, Asana desde 13,49 (con IA); la IA de ClickUp cuesta 14 aparte |
| Planear el día | Sunsama, Akiflow, Motion | Ritual de la mañana (traer tareas, estimar tiempo, comprometerse con una lista realista), cierre del día, bandeja única que junta correo, chat y tareas, bloques en el calendario; Motion agenda solo | Sunsama ~16, Akiflow y Motion ~19; ninguna tiene plan gratis |
| Horas | Toggl Track, Clockify, Harvest | Cronómetro de un clic, hoja semanal, tarifas, presupuesto por proyecto con alertas, aprobación de horas, facturas desde las horas, aviso de inactividad y recordatorios | Clockify desde 3,99, Toggl desde 9, Harvest desde 9 |
| Reuniones | Fathom, Otter, Fireflies, Granola, Fellow | Acta con tareas, buscar y preguntar en todas las reuniones, plantillas, mandar las tareas a otras apps; Granola graba sin bot y mejora las notas que uno escribe; Fellow arrastra los pendientes a la siguiente reunión | Otter 8,33, Fireflies 10, Fathom 15 a 16, Fellow 7 |

Lo que se repite en todas:
1. **Capturar sin fricción**: el trabajo llega por correo, chat o reuniones, y la app lo convierte en tareas sin copiar y pegar.
2. **Ver el día real**: tareas con duración puestas sobre el calendario, no una lista infinita.
3. **Cerrar el ciclo**: lo hecho se reporta solo (estado del proyecto, informe semanal, horas, factura).
4. **Conectarse**: Slack y Teams en Estados Unidos; en Colombia el canal de trabajo es WhatsApp.

## B. Dónde está Kaderno hoy

Kaderno ya tiene, en un solo lugar y en pesos, piezas que en otras apps se pagan por separado:

| Ya tenemos | Equivale a |
|---|---|
| Proyectos con tablero, lista, calendario y línea de tiempo, archivos, comentarios con menciones, carga del equipo, informe semanal | Asana o ClickUp básico |
| Hoy con "Mi día", planear con hora, cerrar el día y ritual semanal | Sunsama |
| Enfoque por proyecto, horas a mano, tarifa, CSV y PDF, horas del equipo | Toggl o Clockify básico |
| Grabar la reunión sin bot, acta con tareas y responsables, publicar en el proyecto | Granola o Fellow |
| Oráculo (preguntar a tus notas), captura de fotos, repaso, mascota | No existe junto en ninguna |

Lo que falta frente a ellas, ordenado por cuánto lo nota alguien que trabaja:

1. **Cobrar**: con las horas no se puede sacar una cuenta de cobro, ni avisar cuando un proyecto se pasa de las horas presupuestadas.
2. **Cronómetro libre**: para contar horas hay que usar pomodoro; Toggl y Clockify tienen un botón de iniciar y parar en cada tarea.
3. **Proyectos de trabajo**: no hay prioridad, etiquetas, "bloqueada por", tareas que se repiten en el proyecto ni reglas automáticas.
4. **Entradas**: el cliente o el jefe no tiene cómo pedir algo sin cuenta (formulario) ni cómo ver el avance (enlace de solo lectura).
5. **Reuniones encadenadas**: el acta no se conecta con la siguiente reunión ni se puede preguntar "¿qué decidimos sobre el precio?" en todas a la vez.
6. **Conexiones**: no hay avisos a WhatsApp, Slack o Teams, ni tareas desde el correo.
7. **El día de trabajo**: el ritual de la mañana no pregunta cuánto dura cada tarea y el cierre no anota horas.

## C. Propuesta (una PR por fase, en este orden)

### Fase 1. Cobrar con lo que ya registras (la más diferente para Colombia)
- **Cuenta de cobro** desde el registro de horas o desde un proyecto: número consecutivo, ciudad y fecha, tus datos (nombre, cédula, teléfono, cuenta bancaria), los del cliente (nombre y NIT o cédula), concepto, periodo y valor. PDF sobrio, listo para firmar y mandar.
- **Clientes**: nombre, NIT o cédula, correo y tarifa por defecto; un proyecto o un área pueden tener cliente.
- **Presupuesto por proyecto** en horas o en pesos, con aviso al 80 % y al 100 % (a ti y al dueño del proyecto).
- Aviso: la cuenta de cobro sirve solo a quien no está obligado a facturar; la pantalla lo dice y, si eres responsable de IVA, sugiere factura electrónica.

### Fase 2. Cronómetro y hoja semanal
- **Iniciar y parar** en cualquier tarea (personal o de proyecto), en Hoy, en el tablero y en la barra; uno a la vez y sigue corriendo entre pantallas.
- **Hoja semanal**: filas por proyecto, columnas por día, se edita como Excel.
- **Aviso de cronómetro olvidado**: si pasa de 3 horas sin tocar la app, pregunta si sigues.
- **Aprobación de horas** (plan Equipo): el dueño del proyecto aprueba o devuelve la semana de cada integrante.

### Fase 3. Proyectos de trabajo
- **Prioridad** (urgente, alta, normal, baja) y **etiquetas** por proyecto, con filtros.
- **Bloqueada por**: una tarea espera a otra; se ve en el tablero y la línea de tiempo, y avisa a quien la tiene cuando se desbloquea.
- **Tareas que se repiten** dentro del proyecto (informe del lunes, cierre de mes).
- **Reglas simples**: "cuando una tarea pasa a Revisión, asignarla a X", "cuando se vence, avisar al dueño", "cuando se termina, mover a Hecho y anotar la fecha". Sin editor complejo: frases para escoger.
- **Estado del proyecto** cada semana (en curso, en riesgo, atrasado) con una línea; la IA propone el texto con el informe semanal, como el de Linear.

### Fase 4. Entradas y clientes
- **Formulario de solicitudes**: enlace público por proyecto; el cliente escribe qué necesita y para cuándo, y entra a una columna "Solicitudes" para revisar. Con límite y verificación para evitar spam.
- **Vista para el cliente**: enlace de solo lectura con el avance, lo que viene y lo entregado; sin comentarios internos ni horas.
- **Compartir por WhatsApp** el informe semanal, el acta o el avance (texto listo, sin costo).

### Fase 5. Reuniones encadenadas
- **Agenda antes de la reunión**: la nota de la reunión arranca con los pendientes y tareas abiertas de la anterior del mismo proyecto o área (como Fellow).
- **Preguntar a todas las reuniones** desde el Oráculo: "¿qué decidimos del precio?" responde citando el acta y el minuto.
- **Plantillas de acta propias** (por ejemplo, comité, uno a uno, cliente) que la IA respeta.
- **Mandar el acta** por correo o WhatsApp a los asistentes.

### Fase 6. Planear el día de trabajo
- El ritual de la mañana pregunta **cuánto dura** cada tarea, suma contra las horas libres del calendario y avisa si no cabe (como Sunsama).
- **Sugerir horario**: la IA propone en qué bloque va cada tarea según fechas y reuniones; tú aceptas o mueves (más simple y barato que agendar solo como Motion).
- El **cierre del día** muestra las horas registradas y, si no anotaste nada, recuerda anotar lo que faltó.

### Fase 7. Conexiones
- **Avisos a WhatsApp, Slack o Teams** por proyecto: tareas nuevas, vencidas, terminadas y el informe semanal. Slack y Teams con un enlace de webhook (gratis); WhatsApp por la API de WhatsApp Business, que cobra por mensaje, así que sería de Equipo.
- **Tareas desde el correo**: una dirección personal (por ejemplo, `tu-codigo@tareas.kaderno.app`); lo que reenvíes llega a la bandeja con el adjunto. Requiere un servicio que reciba correo (por ejemplo, Cloudflare Email Routing).
- **Google Calendar de doble vía** (hoy solo se importa): las tareas con hora aparecen en tu calendario. Requiere la verificación de Google.

## D. Lo que no conviene hacer

1. **Un chat tipo Slack**: en Colombia el trabajo ya vive en WhatsApp, y los comentarios con menciones cubren lo de cada tarea. Mejor conectarse que competir.
2. **Un bot que entre a Zoom, Meet o Teams**: cuesta servidores y transcripción por minuto, y pide permisos de cada plataforma. La grabación en el navegador, sin bot, ya es lo que vende Granola.
3. **Agendar todo solo como Motion**: es lo más caro de construir y lo que más quejas recibe cuando reprograma sin avisar. La sugerencia que uno acepta da casi lo mismo.
4. **Gantt completo y automatizaciones con diagramas**: para equipos pequeños es ruido; la línea de tiempo y las reglas por frases bastan.

## E. Qué cambia en los planes

| | Gratis | Pro | Equipo |
|---|---|---|---|
| Cuenta de cobro | 2 al mes | Sin límite | Sin límite |
| Cronómetro y hoja semanal | Sí | Sí | Sí |
| Presupuesto y alertas | 1 proyecto | Sin límite | Sin límite |
| Prioridad, etiquetas, bloqueada por, repetir | Sí | Sí | Sí |
| Reglas automáticas | 2 por proyecto | 20 | 20 |
| Formulario y vista para el cliente | 1 proyecto | Sin límite | Sin límite |
| Aprobación de horas | No | No | Sí |
| Avisos a Slack o Teams | No | Sí | Sí |
| Avisos por WhatsApp Business | No | No | Sí |
| Preguntar a todas las reuniones | Con el tope del Oráculo | Más usos | Más usos |

Con esto, Pro reemplaza Toggl, Sunsama y un tomador de actas, que juntos pasan de 30 dólares al mes, por $9.900 pesos.

## F. Decisiones que necesito

1. **Orden**: propongo 1, 2, 3, 4 primero (cobrar, cronómetro, proyectos y clientes); 5, 6 y 7 después.
2. **Cuenta de cobro**: ¿tus datos de cobro (cédula, cuenta bancaria) se guardan en la cuenta para no escribirlos cada vez? Propongo que sí, visibles solo para ti (Supabase los guarda cifrados en disco).
3. **WhatsApp Business**: ¿lo dejamos para cuando haya clientes de Equipo (cuesta por mensaje y pide verificar el negocio) y empezamos con compartir por WhatsApp, que es gratis?
4. **Correo entrante y Google Calendar**: los dos piden servicios externos (dominio de correo, verificación de Google). ¿Los dejamos para la fase 7?

## G. Decisiones tomadas al construir

1. Orden: fases 1 a 6. De la fase 7 solo entra compartir por WhatsApp (gratis, con texto listo); los avisos a Slack, Teams y WhatsApp Business, el correo entrante y Google Calendar quedan para después.
2. (Fase 1) Los datos de cobro se guardan en la cuenta, en una tabla que solo lee su dueño. Cada cuenta de cobro guarda una copia de tus datos y los del cliente, para que no cambie si después editas algo.
3. (Fase 1) El total lo calcula el servidor con las líneas (horas por tarifa, redondeado), no la app. El consecutivo no se repite; anular no libera el número.
4. (Fase 1) Un cliente agrupa proyectos y áreas; de un área solo cuentan las horas sin proyecto (las del proyecto van con el cliente del proyecto).
5. (Fase 1) El presupuesto es de horas por proyecto, con las de todo el equipo. Avisa una sola vez al 80 % y una al 100 % por cada presupuesto (si lo cambias, vuelve a avisar).
6. (Fase 2) El cronómetro vive en el dispositivo hasta que se para; si falla al guardar, sigue corriendo para no perder el tiempo. Máximo 12 horas por tramo.
7. (Fase 2) El tiempo del cronómetro cuenta también como tiempo de enfoque en las rachas y estadísticas (es tiempo trabajado).
8. (Fase 2) La hoja semanal solo crea, recorta o borra horas a mano; nunca toca lo del enfoque o el cronómetro sin que la persona lo borre a mano.
9. (Fase 2) Aprobar horas es del plan Equipo (de quien manda o del dueño del proyecto). Las semanas empiezan el lunes, en la hora local de cada persona.
