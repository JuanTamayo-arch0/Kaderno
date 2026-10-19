# PLAN v21: Organizar el día y notas conectadas

Estado: fase 1 construida (lunes 19 de octubre, rama v21-dia). Se hace después de la versión 20 (`PLAN_v20.md`) y se apoya en ella: usa los planes con hora (`plan_at`), el ritual del lunes y la hoja "Revisa tus tarjetas".

Este plan sale de revisar apps de notas (Notion, Obsidian, Notability, Goodnotes, RemNote) y de organización del día (Todoist, TickTick, Things, Structured, Sunsama, Microsoft To Do), y de compararlas con lo que ya tiene Kaderno.

---

## 0. Qué aprendimos de otras apps

| App | Qué hace bien | Qué tomamos |
|---|---|---|
| Todoist | Fechas que se repiten escritas en lenguaje natural ("every monday", "every other fri"), y repetir desde la fecha fijada o desde que la terminas | Tareas que se repiten (1) |
| Structured | Línea de tiempo del día que se arma arrastrando, bandeja para capturar rápido y ordenar después | Línea de tiempo (3) y bandeja (2) |
| Sunsama | Ritual para planear el día, ritual de cierre, y poner cada tarea con su duración en el calendario | Cierre del día (4) y aviso de sobrecarga (3) |
| Microsoft To Do | "Mi día": una lista que se vacía cada noche; lo que no se hizo vuelve como sugerencia | Cierre del día (4) |
| Things | Separar Hoy y Esta noche; diferencia entre "cuándo empiezo" y "cuándo vence" | Franjas mañana, tarde y noche en la línea de tiempo (3) |
| TickTick | Cuenta regresiva para fechas importantes, hábitos, varias vistas de calendario | Cuenta regresiva de exámenes (5) |
| Obsidian | Enlaces entre notas, "mencionada en" (backlinks), nota del día y plantillas | Enlaces y notas relacionadas (6), nota de clase con plantillas (7) |
| RemNote | Crear tarjetas mientras escribes, con `pregunta :: respuesta` | Tarjetas desde la nota (8) |
| Notability y Goodnotes | Grabar audio sincronizado con lo que escribes (tocas una línea y suena ese momento), anotar PDFs, quizzes desde las notas | Grabar la clase (11) y anotar PDFs (12), como fase opcional |
| Notion | Compartir una página con un enlace; calendario conectado | Compartir una nota (10) y ver tu Google Calendar en Hoy (9) |

Lo que Kaderno ya tiene y no hace falta copiar: agregar en lenguaje natural, Hoy con agenda, horario, calendario, proyectos con tablero, editor con fórmulas, digitalizar apuntes, buscador con Ctrl K, Oráculo sobre tus notas, Pomodoro.

Lo que falta y casi todas tienen: **tareas que se repiten** (Kaderno no las tiene) y **una forma de armar el día con horas**.

---

## 1. Tareas que se repiten

- Escritas en el campo rápido, en español:
  - "lab de física cada martes"
  - "quiz de inglés cada viernes 8am"
  - "leer 20 páginas cada día"
  - "cada día hábil"
  - "cada 2 semanas"
  - "cada mes el 15"
  - "cada lunes y miércoles hasta el 5 dic"
- También desde el editor de la tarea: "Repetir" con opciones (diaria, días de la semana, cada N semanas, mensual) y "hasta" una fecha.
- **Desde la fecha o desde que la terminas** (como Todoist): por defecto se repite según el calendario; con "cada! 3 días" (o la opción "contar desde que la termino") la siguiente sale a partir del día en que la marcas hecha.
- Al marcarla hecha se crea la siguiente con la misma materia, tipo, pasos (desmarcados), estimado y plan de hora. Si estaba atrasada, la siguiente no nace vencida: se salta a la próxima fecha futura.
- En la lista se ve un ícono de repetición y el texto "cada martes".
- "Saltar esta vez" en el menú de la tarea.
- Base: `assignments.repeat_rule jsonb` (`{ freq: 'day'|'week'|'month', interval, days: [0..6], monthDay, until, fromDone: bool }`) y `assignments.repeat_parent_id uuid`. La siguiente instancia la crea una función de la base al completar (así no se duplica si se marca dos veces o desde dos dispositivos).
- Lógica pura `lib/repeat.ts` (texto → regla, regla → siguiente fecha, regla → texto) con pruebas, y extensión de `lib/quickAdd.ts`.

## 2. Bandeja y captura rápida

- **Bandeja**: lo que capturas sin fecha ni materia cae ahí (no ensucia Hoy). En Hoy aparece "Bandeja: 4 por ordenar" y en la barra lateral un contador.
- **Ordenar la bandeja**: una por una, con botones grandes: ponerle fecha o "¿cuándo?", asignar materia, convertir en nota, a "algún día", borrar. Atajos de teclado en computador.
- **Captura por voz**: botón de micrófono en Agregar; dictas "parcial de cálculo el viernes a las 10" y pasa por el mismo lector de fechas. Usa el reconocimiento de voz del navegador donde exista; si no existe, el botón no aparece.
- **Accesos directos** desde el ícono de la app instalada: Nueva tarea, Enfoque, Repaso, Capturar (ya hay `shortcuts` en el manifest; se revisan y se agregan los que falten).
- **Compartir hacia Kaderno** (Android): con Web Share Target, desde otra app (un enlace, un texto, una foto del tablero) se comparte a Kaderno y cae en la bandeja o se digitaliza. En iPhone Safari no lo soporta todavía (el pedido sigue abierto en WebKit), así que allá no aparece.
- Base: `assignments.inbox boolean default false` (o regla: sin fecha, sin materia y creada desde captura).

## 3. Línea de tiempo del día

Hoy pasa de lista con agenda a una vista que se puede armar:

- **Columna de horas** (de 6 am a 11 pm, ajustable) con las clases del horario, los planes con hora (v20), los eventos de tu calendario (sección 9) y los bloques de enfoque hechos.
- **Al lado, lo pendiente de hoy sin hora**. Se arrastra a una hora y queda planeado (`plan_at`) con su duración (el estimado, o 30 min). En el celular: tocar la tarea y elegir hora (no se depende de arrastrar).
- Bloques que se pueden estirar para cambiar la duración y mover a otra hora.
- **Franjas** Mañana, Tarde y Noche para quien no quiere poner hora exacta (como "Esta noche" de Things).
- **Aviso de sobrecarga**: "Planeaste 7 h y te quedan 4 h libres hoy" (estimados corregidos con "tu tiempo real" de v20). Sugiere mover lo de menor prioridad a mañana.
- La línea roja de "ahora" y el bloque actual resaltado; un toque para "Empezar enfoque" en ese bloque.
- Vista de semana en el computador con las mismas reglas (arrastrar tareas entre días).
- Funciones puras en `lib/timeline.ts` (acomodar bloques que se cruzan, horas libres, sobrecarga) con pruebas.

## 4. Cierre del día

- Por la noche (desde las 6 pm, o a la hora que elijas) aparece en Hoy "Cerrar el día" (1 minuto, opcional):
  1. **Lo que hiciste**: tareas, minutos de enfoque, tarjetas. Se celebra sin exagerar.
  2. **Lo que quedó**: cada pendiente de hoy con "Mañana", "Elegir día" o "A la bandeja". Nada queda vencido en silencio.
  3. **Una línea**: "¿Qué aprendiste hoy?" (opcional). Se guarda como diario y aparece en el ritual del lunes.
- Aviso opcional a la hora del cierre.
- "Mi día" se reinicia: al día siguiente, lo que no se hizo y no se movió aparece como sugerencia arriba de Hoy (no como vencido).
- Base: `day_reviews (user_id, day, done jsonb, moved jsonb, note text, primary key (user_id, day))`.
- Cuenta como día de estudio solo si hubo estudio (no por cerrar el día), para no premiar clics.

## 5. Cuenta regresiva de exámenes

- En Hoy y en Estudiar, una tira con los próximos exámenes: "Parcial 3 de Física · 13 días", "Quiz de inglés · mañana". Color según cercanía.
- Tocarla abre el examen con su plan de repaso (v20).
- En la ficha de la materia ya se ve la próxima evaluación (v19); aquí se juntan todas.

## 6. Enlaces entre notas y notas relacionadas

- En el editor, escribir `[[` abre un buscador de notas; al elegir una, queda un enlace con su título (se guarda como `[Título](kd-note:<id>)`, así no se rompe si cambias el título; al mostrarla se usa el título actual).
- Al final de cada nota (o en la columna de la derecha): **"Mencionada en"** con las notas que enlazan a esta.
- **"Notas relacionadas"**: las 3 a 5 notas más parecidas por contenido, usando los vectores que el Oráculo ya guarda (`note_embeddings`). Sale aunque no las hayas enlazado; sirve para conectar temas de distintas clases.
- Buscar dentro de la materia y en Ctrl K muestra también los enlaces.
- Base: tabla `note_links (from_note, to_note, user_id)` que se actualiza al guardar (se parsean los `kd-note:`), para que "Mencionada en" sea rápido.

## 7. Nota de clase y plantillas

- **Nota de la clase de hoy**: mientras dura una clase (según el horario), en Hoy y en la ficha aparece "Clase de Física Moderna ahora · Abrir apuntes de hoy". Crea, o abre si ya existe, la nota "Clase del 23 oct" en esa materia, con la plantilla de la materia.
- **Plantillas**:
  - Apuntes de clase (Cornell): Ideas clave, Notas, Preguntas, Resumen.
  - Laboratorio: Objetivo, Materiales, Procedimiento, Datos (tabla), Análisis, Conclusiones.
  - Capítulo de libro: Conceptos, Fórmulas, Ejemplos, Dudas.
  - Ejercicio resuelto: Enunciado, Datos, Planteamiento, Solución, Verificación.
- Se eligen al crear una nota ("Nueva nota" muestra las plantillas) y cada materia puede tener una por defecto.
- Plantillas propias: "Guardar esta nota como plantilla".
- Base: `note_templates (id, user_id, name, content, created_at)` y `subjects.default_template_id`. Las de fábrica viven en el código.

## 8. Tarjetas desde la nota

- Mientras escribes: una línea `pregunta :: respuesta` se marca como tarjeta (se ve con un ícono al lado). Un texto entre `{{ }}` es una tarjeta de completar.
- Al salir de editar, si hay tarjetas nuevas en la nota: "Encontré 3 tarjetas en tu nota" y se abre la hoja "Revisa tus tarjetas" de v20.
- Si luego cambias la línea en la nota, la tarjeta se actualiza (se enlazan por un id oculto en el Markdown, `<!--kd:card:<id>-->`).
- En la vista de lectura se ven limpias (sin los `::`), con un ícono que lleva a la tarjeta.

## 9. Tu calendario en Hoy

- En Ajustes → Calendarios: pegar la "dirección secreta en formato iCal" de Google Calendar (u Outlook). Kaderno la lee cada 15 min desde el servidor y muestra esos eventos en Hoy y en la línea de tiempo (solo lectura, con su color).
- Así se ven el trabajo, el gimnasio o las citas al planear el día, sin pedir permisos de Google.
- La dirección es privada: se guarda en una tabla solo del usuario, la lee una función del servidor y nunca se manda a otros. Se puede quitar cuando quieras.
- Kaderno ya publica su propio calendario hacia afuera (v12); esto es el camino contrario.
- Base: `external_calendars (id, user_id, name, color, url, last_sync, last_error)` y `external_events (calendar_id, uid, start_at, end_at, title, all_day)` llenada por la función `ical-import` con pg_cron.

## 10. Compartir una nota

- En el menú de la nota: "Compartir con un enlace". Crea un enlace de solo lectura (con fórmulas, tablas e imágenes) que puedes mandar a tus compañeros. Se puede desactivar cuando quieras; al desactivarlo deja de funcionar.
- "Copiar a un proyecto": manda la nota a un proyecto en grupo para que los miembros la vean.
- Base: `notes.share_token uuid`, una página pública `/compartida/<token>` y una función `get_shared_note(token)` que solo devuelve esa nota (sin datos del usuario).

## 11. Grabar la clase (opcional, fase 4)

- En la nota, botón "Grabar": graba el audio mientras escribes y guarda en qué momento escribiste cada párrafo. Después, tocar un párrafo reproduce desde ese momento (como Notability).
- Transcripción y resumen con IA al terminar, como sección plegada al final de la nota, con "Crear tarjetas" desde la transcripción.
- Antes de decidir:
  - **Costo y proveedor de transcripción**: Claude no transcribe audio; hace falta un servicio de voz a texto (con costo por minuto) o el reconocimiento del navegador (gratis, pero menos preciso y solo en algunos navegadores).
  - **Almacenamiento**: una clase de 2 h en audio comprimido son unos 30 MB; el plan gratuito de Supabase tiene poco espacio. Opción: guardar solo la transcripción y borrar el audio a los 30 días.
  - **Permiso**: al grabar se muestra un recordatorio para pedir permiso al profesor.
- Base (si se aprueba): `note_audio (id, note_id, user_id, path, duration_s, marks jsonb, transcript jsonb, created_at)` y un bucket privado.

## 12. Anotar los PDFs del curso (opcional, fase 4)

- En el visor de Archivos de la materia: resaltar texto y dejar comentarios en los PDFs (guías, diapositivas).
- "Enviar a una nota" (el resaltado entra como cita con enlace a la página) y "Hacer tarjeta" (pasa por la hoja de revisión).
- Lista de resaltados por archivo.
- Base: `file_highlights (id, file_id, user_id, page, rects jsonb, text, color, comment, created_at)`.
- Requiere pasar el visor a pdf.js con capa de texto; es la parte más pesada.

---

## Fases

| Fase | Contenido | Estimado |
|---|---|---|
| 1 | Organizar el día: tareas que se repiten (1), bandeja y voz (2), línea de tiempo y sobrecarga (3), cierre del día (4), cuenta regresiva (5) | 2 días |
| 2 | Notas conectadas: enlaces y relacionadas (6), nota de clase y plantillas (7), tarjetas desde la nota (8) | 1 a 2 días |
| 3 | Afuera de Kaderno: tu calendario en Hoy (9), compartir una nota (10) | 1 día |
| 4 | Opcional, a decidir: grabar la clase (11), anotar PDFs (12) | 2 a 3 días |

## Base de datos: `supabase/schema_v20.sql` (versión 21 de la app)

Requiere schema_v19 (v20). Idempotente, crece por fases.
- `assignments`: `repeat_rule`, `repeat_parent_id`, `inbox`; función que crea la siguiente repetición al completar.
- `day_reviews`, `note_links`, `note_templates`, `subjects.default_template_id`.
- `external_calendars`, `external_events` y la función `ical-import`.
- `notes.share_token` y `get_shared_note(token)`.
- Fase 4, si se aprueba: `note_audio`, `file_highlights`.
- RLS en todo; lo público (nota compartida) solo por función que devuelve lo mínimo.

## Pruebas

- `tests/v21.test.ts`: lector de repeticiones en español y siguiente fecha (incluye fin de mes, "hasta", atrasadas y "desde que la termino"), acomodo de bloques y sobrecarga, parseo de `[[enlaces]]` y `::`, plantillas.
- `tests/sql/20_pruebas.sql`: siguiente repetición una sola vez aunque se complete dos veces, bandeja, `note_links`, nota compartida sin filtrar datos de otros, calendarios externos aislados por usuario.
- QA con Playwright: escribir una tarea repetida, arrastrar a la línea de tiempo (y elegir hora en el celular), cerrar el día, enlazar notas, nota de clase desde Hoy, tarjetas con `::`.

## Decisiones tomadas (se pueden cambiar)

1. Las repeticiones se crean al completar (una a la vez), no todas por adelantado.
2. La bandeja solo recibe lo capturado sin fecha ni materia; lo demás va directo a su lugar.
3. Calendario externo por dirección iCal secreta (sin pedir permisos de Google); solo lectura.
4. Grabar la clase y anotar PDFs quedan como fase opcional hasta decidir costo y espacio.
5. El cierre del día no da monedas ni cuenta para la racha por sí solo.
6. (Al construir 3) Las franjas Mañana, Tarde y Noche se guardan en `assignments.plan_day` y `plan_band` (sin hora). Arrastrar desde la lista a la línea solo existe en computador; en celular se toca "Poner hora" y luego la hora.
7. (Al construir 2) Compartir hacia Kaderno recibe texto, enlaces y fotos (las fotos van a Capturar).
