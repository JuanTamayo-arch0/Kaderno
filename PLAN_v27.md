# PLAN v27: herramientas para organizar el tiempo

Pregunta: qué métodos de organización del tiempo existen (como la matriz de Eisenhower), cuáles ya tiene Kaderno y cuáles conviene agregar.

## A. Lo que Kaderno ya tiene

Kaderno ya cubre varios métodos conocidos, aunque en la app no aparecen con su nombre:

| Método | Dónde está en Kaderno |
|---|---|
| Pomodoro (25/5, pausa larga cada 4) | Enfoque, con pausas guiadas |
| Lista de pendientes para después (parking lot) | "Anotar para después" durante el enfoque |
| Bloques de tiempo (time blocking) | Mi día: línea de tiempo, franjas mañana, tarde y noche, y "Acomodar" |
| Intenciones de implementación ("cuándo y dónde") | "¿Cuándo lo haces?", con hora y lugar, prefiriendo tus horas de enfoque |
| Captura rápida de GTD | Bandeja: lo que no tiene fecha ni materia |
| Revisión semanal | Ritual del lunes, con las prioridades de la semana |
| Ritual de cierre (shutdown) | Cerrar el día: lo hecho, lo movido y una línea |
| WOOP (deseo, resultado, obstáculo, plan) | Metas del semestre |
| Regla de los 2 minutos | La mascota la sugiere en una tarea que no avanza |
| Falacia de planificación | "Tu tiempo real": corrige los estimados con lo que de verdad tardas |
| Sobrecarga del día | Aviso cuando lo planeado no cabe y sugerencia de qué mover |
| Kanban | Tablero de cada proyecto |
| Prioridad | Solo en tareas de proyecto: urgente, alta, normal, baja |
| Cadena de días (Seinfeld) | Rachas de estudio |
| Repetición espaciada | Repaso con FSRS |
| Registro de tiempo | Horas, cronómetro y hoja semanal |

Lo que falta es una forma de separar lo **importante** de lo **urgente** en las tareas personales. Hoy todo se ordena por fecha, así que lo que vence mañana siempre le gana a lo que importa pero no tiene fecha cerca.

## B. Métodos que faltan

1. **Matriz de Eisenhower.** Cuatro cuadrantes según urgente e importante:
   - Hacer ya.
   - Planear.
   - Delegar o hacer rápido.
   - Soltar.

   Sirve para ver de un vistazo si la semana se va en apagar incendios.
2. **Comerse la rana** (Brian Tracy). La tarea más importante y pesada se hace primero en el día.
3. **Método Ivy Lee.** Al terminar el día se escogen hasta 6 tareas para mañana, en orden, y se hacen en ese orden.
4. **Regla 1-3-5.** Un día realista tiene 1 cosa grande, 3 medianas y 5 pequeñas.
5. **52/17 y Flowtime.** Otras formas de enfoque, aparte del Pomodoro:
   - 52/17: 52 minutos de trabajo y 17 de pausa.
   - Flowtime: trabajas hasta que se te acaba el impulso y la pausa es proporcional, más o menos un quinto de lo trabajado.

   A muchas personas el Pomodoro les corta en mitad de algo.
6. **Ley de Parkinson y timeboxing.** El trabajo se estira hasta llenar el tiempo que tiene. Un bloque con hora de fin, y un aviso cuando se pasa, ayuda a cerrarlo.
7. **"Algún día / tal vez" de GTD.** Un lugar para ideas sin compromiso, para que no ensucien la bandeja ni Hoy.
8. **Agrupar tareas parecidas (batching).** Por ejemplo, correos o trámites juntos en un mismo bloque.
9. **Pareto (80/20).** No es una herramienta en sí. Queda cubierto por la matriz: lo importante es lo que da el 80 %.

## C. Propuesta para v27 (una PR por fase)

### Fase 1: Importante y la matriz de Eisenhower
- **Importante en las tareas personales.** Una marca de sí o no (estrella), con un toque desde la fila, el menú o la tarea abierta.
  - Columna `assignments.important`.
  - En las tareas de proyecto, la importancia sale de la prioridad que ya existe (alta o urgente).
- **Urgente se calcula solo**, sin pedirle nada a la persona: vencida, o vence en los próximos 2 días. El número de días se cambia en Ajustes.
- **Vista "Matriz" en Hoy**, junto a Lista y Mi día.
  - Cuatro cuadrantes con sus tareas.
  - Arrastrar entre arriba y abajo cambia "importante".
  - Arrastrar a "no urgente" ofrece mover la fecha.
- **Nombres de cuadrante según el espacio:**

  | | Estudio | Trabajo |
  |---|---|---|
  | Urgente e importante | Hacer ya | Hacer ya |
  | Importante, no urgente | Planear | Planear |
  | Urgente, no importante | Hacer rápido (regla de 2 minutos) | Delegar (asignar en el proyecto) |
  | Ni lo uno ni lo otro | Soltar | Soltar |

  "Planear" lleva a "¿Cuándo lo haces?". "Soltar" mueve a "Algún día" o a la papelera.
- **En el ritual del lunes:** "Esta semana pasaste X % en lo urgente que no era importante", con lo hecho la semana anterior.

### Fase 2: La rana y la lista para mañana
- **La rana:** en Mi día se marca una tarea como la rana (solo una por día). Va primero en la mañana y la mascota la recuerda.
  - Se sugiere una: importante, larga y la que más días lleva sin tocarse.
- **Cerrar el día con Ivy Lee:** después de lo hecho, "Escoge hasta 6 para mañana, en orden".
  - Esas tareas quedan planeadas para mañana, en ese orden.
  - La primera queda como la rana.
- **Límite 1-3-5 (opcional en Ajustes):** Mi día avisa si lo planeado pasa de 1 grande, 3 medianas y 5 pequeñas. El tamaño sale del estimado: más de 90 min, de 30 a 90, y menos de 30.

### Fase 3: Más formas de enfocarse
- **En Enfoque, tres modos:** Pomodoro (como hoy), 52/17 y Flujo.
  - Flujo cuenta hacia arriba.
  - Al parar, propone una pausa de un quinto de lo trabajado (mínimo 5 minutos, máximo 20).
  - Las monedas de la mascota cuentan igual en los tres modos.
- **Bloque que se pasa (Parkinson):** si una tarea de Mi día tiene hora y estimado, y el enfoque en ella pasa de su hora de fin, aparece un aviso discreto: "Se acabó el bloque: ¿cierras, sigues 15 min o la mueves?".

### Fase 4: Algún día y tandas
- **"Algún día"** dentro de la bandeja.
  - Lo que se suelta en la matriz va ahí.
  - El ritual del lunes muestra 3 al azar para rescatar o borrar.
- **Tandas (batching):** en Mi día, "Agrupar" junta en un solo bloque las tareas cortas que tienen la misma etiqueta o el mismo tipo (correos, trámites, lecturas).

## D. Lo que no conviene
- **Obligar a marcar la importancia de cada tarea.** Lo que no está marcado cuenta como no importante y la matriz igual sirve. Pedirlo siempre volvería lento el agregar.
- **Tener dos escalas en las tareas personales** (prioridad de 4 niveles y además "importante"). Con una estrella basta. Los proyectos conservan su prioridad, porque es del equipo.
- **Una pantalla nueva por cada método.** Todo entra en lo que ya existe: Hoy (vista Matriz), Mi día, Cerrar el día, Enfoque y el ritual del lunes.
- **Nombrar los métodos en la interfaz** ("Eisenhower", "Ivy Lee"). Se usan palabras simples, y el nombre del método va solo en la ayuda.

## E. Para decidir
1. **Importancia:** ¿estrella simple (sí o no), o la misma prioridad de 4 niveles que en los proyectos?
2. **La matriz:** ¿vista dentro de Hoy, o pantalla propia en la barra lateral?
3. **Urgente:** ¿2 días por defecto está bien?
4. **Alcance:** ¿las 4 fases o solo algunas? La fase 1 es la que más cambia el día a día; la 4 es la menos necesaria.

## F. Decisiones (23 de noviembre)
1. **Importancia:** estrella de sí o no. Urgente ya sale de la fecha, y una prioridad de 4 niveles la repetiría ("Urgente" es uno de sus niveles).
2. **La matriz:** vista dentro de Hoy, junto a Lista y Mi día.
3. **Urgente:** 2 días por defecto, y se cambia en Ajustes (1, 2, 3 o 5).
4. **Alcance:** las 4 fases, una PR cada una.

## G. Decisiones tomadas al construir
1. (Fase 1) Arrastrar entre cuadrantes solo cambia la estrella. Si la tarea cambia de fila (urgente o no), se ofrece mover la fecha en el aviso, pero no se cambia sola: la fecha suele ser real (una entrega).
2. (Fase 1) Arrastrar funciona en el computador. En el teléfono se cambia con la estrella de la fila y con la fecha.
3. (Fase 1) Las tareas de proyecto entran en la matriz con su prioridad (alta o urgente cuenta como importante) y no se arrastran: su prioridad es del equipo.
4. (Fase 1) El ritual del lunes pone primero lo que tiene estrella entre las sugerencias, y dice cuánto de lo terminado la semana anterior era importante (desde 5 tareas terminadas).
5. (Fase 2) La rana es una por día y se guarda en la tarea (`frog` con su `plan_day`). La base impide dos en el mismo día. La lista de Ivy Lee guarda el orden en `plan_order` (1 a 6) y la primera queda como la rana. Las que tenían hora otro día la pierden: el orden reemplaza la hora.
6. (Fase 2) Arreglo de paso: una tarea planeada para un día sin hora ni franja (por ejemplo "Pasarla a mañana" en Mi día) no aparecía en ninguna parte de Mi día. Ahora va en "Sin hora".
7. (Fase 2) La regla 1-3-5 viene apagada; se prende en Ajustes. Mide por el estimado (corregido con tu tiempo real) y solo avisa, no mueve nada.
8. (Fase 2) En Trabajo la tarjeta se llama "Lo primero de hoy" y la mascota no recuerda la rana (está en modo discreto).
9. (Fase 3) Flujo usa el mismo reloj (con tope de 90 min) pero muestra el tiempo hacia arriba. Así las salas, la mascota y los sonidos de fondo siguen funcionando sin cambios. "Terminar y descansar" guarda lo trabajado y da una pausa de un quinto (entre 5 y 20 min).
10. (Fase 3) La forma de enfocarse se cambia solo con el reloj quieto. Al volver a Pomodoro se recuperan los tiempos que tenías.
11. (Fase 3) El aviso del bloque que se pasa solo existe cuando el enfoque se empieza desde una tarea con hora (Mi día o Hoy). Usa la hora más el estimado (30 min si no tiene) y se repite cada 15 min mientras sigas. No mueve la tarea: eso queda en Mi día.
