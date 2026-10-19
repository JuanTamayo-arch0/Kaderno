# PLAN v20: Estudiar mejor y crear el hábito

Estado: B, C y L construidas (domingo 18 de octubre). A, D, E, F, G, H e I construidas (lunes 19 de octubre, ramas v20-repaso, v20-rachas y v20-parcial). El resto se implementa por fases.
Diseño en el canvas "Estudio y hábitos de Kaderno". Base: la versión 19 (PR #12) ya fusionada.

Este plan junta las 12 ideas que salieron de la investigación (sonidos, repaso espaciado, simulacros, rachas, planes "si-entonces", etc.) y una revisión completa de las tarjetas de Repaso: cómo entran, cómo se programan y cómo se ven.

---

## 0. Resumen

| # | Qué | Fase |
|---|---|---|
| A | Repaso nuevo: tarjetas revisadas antes de guardarse, sin duplicados, con fórmulas, FSRS, sesión y mazos rediseñados | 1 |
| B | Sonidos ambiente en Enfoque con mezclador | 1 |
| C | Pausas guiadas y "Anotar para después" durante el enfoque | 1 |
| D | Días de estudio, rachas amables (meta semanal, escudos, reparar) | 2 |
| E | "¿Cuándo lo vas a hacer?" (plan si-entonces al crear una tarea) | 2 |
| F | Tu tiempo real (lo estimado contra lo que de verdad tardas) | 2 |
| G | Plan de repaso del parcial (sesiones repartidas antes del examen) | 3 |
| H | Simulacro (quiz mezclado de la materia, con nota y errores a tarjetas) | 3 |
| I | "Ponme a prueba" en cada nota (escribir lo que recuerdas) | 3 |
| J | Ritual del lunes y del semestre | 4 |
| K | Metas WOOP por materia | 4 |
| L | Enfocar juntos (salas con compañeros) | 5 |

Principios que guían todo (de la investigación):

- Ponerse a prueba y repartir el estudio en el tiempo es lo que más funciona; releer y resumir ayudan poco a recordar.
- Mezclar temas en la práctica rinde más que practicar por bloques.
- Las pausas fijas cansan menos que decidir cuándo parar.
- Saltarse un día no daña el hábito; ser muy irregular sí. Romper una racha desmotiva: hay que dar formas de protegerla y repararla.
- Decidir de antemano cuándo y dónde hacer algo aumenta mucho la probabilidad de hacerlo.
- Los sonidos de naturaleza de buena calidad ayudan a la atención; la música con letra y las voces estorban.

---

## A. Repaso nuevo (tarjetas)

### A.1 Qué está mal hoy (revisión del código)

| Problema | Dónde | Efecto |
|---|---|---|
| Las tarjetas de IA se guardan directo, sin verlas | `NoteDocument.makeFlashcards` → `addFlashcards` | Entran tarjetas malas o repetidas y no hay cómo elegir |
| Tocar "Crear flashcards" dos veces duplica todo | No hay comparación con lo existente | Mazos llenos de repetidas |
| Todas las tarjetas nuevas vencen hoy | `due_date default current_date` | Si haces 3 notas, mañana tienes 30 tarjetas de golpe y abandonas |
| No hay límite de tarjetas nuevas por día | `getDueFlashcards` trae todo | Avalancha, igual que arriba |
| Solo texto plano | `repaso.tsx` muestra `card.front` como `Text` | Las fórmulas de Física salen como `\frac{1}{2}mv^2` |
| No se sabe de qué nota viene | `note_id` se guarda pero no se muestra | Sin contexto para entender la respuesta |
| La IA siempre hace 4 a 8 preguntas, solo de pregunta y respuesta | `functions/ai` | Notas largas quedan cortas; no hay tarjetas de completar |
| Algoritmo SM-2 | `lib/srs.ts` | Más repasos de los necesarios; maneja mal los atrasos |
| "Otra vez" la manda al final de la cola, sin pasos cortos | `Review.answer` | Si eran pocas tarjetas, vuelve de inmediato |
| No se puede deshacer, editar ni suspender en plena sesión | `Review` | Un toque equivocado no tiene arreglo |
| "Mis tarjetas" muestra la fecha cruda ("2026-10-17"), sin buscador ni orden por nota | `Manage` | Difícil de mantener |
| No hay estadísticas ni pronóstico | | No se ve el avance ni cuánto viene mañana |
| No hay modo antes del parcial | | Para un examen hay que repasar todo, no solo lo que vence |
| El trigger de monedas cuenta repasos por cambio de `due_date` | `schema_v16 flashcards_pet_trg` | Con pasos cortos (mismo día) no contaría |

### A.2 Cómo entran las tarjetas (nuevo flujo)

1. En la nota: "Crear flashcards" (o seleccionar texto → "Flashcards").
2. La IA propone tarjetas: cantidad según el largo (palabras / 80, entre 4 y 12; con selección, entre 1 y 4). Mezcla dos tipos:
   - **Pregunta**: anverso y reverso.
   - **Completar**: una frase con un espacio, por ejemplo "La unidad {{FRL}} filtra, regula y lubrica el aire". Un solo espacio por tarjeta.
   - Puede usar fórmulas con `$...$` y `$$...$$`.
3. Se abre la hoja **"Revisa tus tarjetas"** (no se guarda nada todavía):
   - Cada tarjeta es editable en el sitio (anverso y reverso), con casilla "Guardar" marcada por defecto.
   - Las que se parecen a una que ya existe (misma materia) salen desmarcadas con la etiqueta "Ya tienes una parecida" y un enlace para verla.
   - Botones por tarjeta: cambiar tipo (Pregunta / Completar), "Rehacer esta" (pide una sola a la IA), quitar.
   - Abajo: "Agregar una a mano" y "Guardar 7 tarjetas".
4. Al guardar: quedan como **nuevas** (no vencen hoy) en el mazo de la materia, con enlace a la nota y al título donde estaba el texto.
5. Toast: "7 tarjetas guardadas. Entran poco a poco: 15 nuevas por día" + "Repasar ahora".

Otras formas de crear:
- A mano en Repaso → "Nueva tarjeta" (como hoy, con vista previa de fórmulas y tipo).
- Errores del simulacro y de "Ponme a prueba" (secciones H e I): pasan por la misma hoja de revisión.

Duplicados: se normaliza el texto (minúsculas, sin tildes ni signos, espacios simples) y se compara por palabras (Jaccard ≥ 0,7) contra las tarjetas de la misma materia. Función pura `lib/cards.ts › similarCard()` con pruebas.

### A.3 Programación: FSRS

- Librería `ts-fsrs` 5.4.2 (MIT). Retención deseada por defecto 90%, configurable: 85%, 90%, 95% (con el texto "Más alto = recuerdas más, pero repasas más").
- Estados: nueva, aprendiendo, repaso, reaprendiendo. Pasos cortos de aprendizaje: 1 min y 10 min (por defecto de FSRS).
- **Nuevas por día**: 15 por defecto (0 a 100). Orden de entrada: primero las de materias con examen en los próximos 14 días, luego las más antiguas.
- Los repasos vencidos no tienen tope, pero la sesión se puede cortar (ver A.4).
- Cada respuesta queda en `flashcard_reviews` (para estadísticas y, más adelante, ajustar FSRS a cada usuario).
- Migración de las tarjetas existentes:
  - Sin repasos (`reps = 0` y sin `last_reviewed_at`): pasan a **nuevas**.
  - Con repasos: estado "repaso", estabilidad = `max(interval_days, 1)`, dificultad = `clamp(1, 10, 5 + (2,5 − ease) × 4)`, vence en su `due_date` actual. Así nadie pierde su avance ni recibe una avalancha.
- `lib/srs.ts` se mantiene solo para la app vieja; lo nuevo va en `lib/fsrs.ts` (envoltorio puro con pruebas: estados, intervalos de cada botón, migración).

### A.4 Pantalla Repaso (rediseño)

**Inicio de Repaso**
- Arriba, tres números: Nuevas (máx. las del día), Para repasar, Aprendiendo. Debajo, tiempo estimado ("unos 6 min"), calculado con la mediana de segundos por tarjeta de tus últimos 200 repasos (10 s si no hay datos).
- Botones: **Empezar** y **Solo 5 minutos** (al pasar 5 min deja de sacar tarjetas nuevas y termina las que estaban en curso).
- Aviso de examen: "Parcial 3 de Física Moderna en 4 días" → **Repaso intensivo**: todas las tarjetas de esa materia, aunque no venzan. No cambia su programación salvo las que fallas, que pasan a reaprender.
- Mazos por materia (color, contador de nuevas y para repasar, barra de retención de los últimos 30 días); tocar uno repasa solo ese mazo.
- Pronóstico: barras de los próximos 7 días ("mañana 12, jueves 20…").
- Si no hay nada: "Al día. Mañana te tocan 12" y acceso a crear tarjetas desde tus notas recientes.

**Sesión**
- Barra de progreso con los tres estados por color y "12 de 40".
- La tarjeta muestra Markdown con fórmulas KaTeX (componente nuevo `CardText`: en web usa `marked` + `katex`; en nativo, texto plano).
- Completar: la frase con `[ … ]` en el espacio; al voltear se muestra la palabra resaltada.
- Arriba a la derecha de la tarjeta: materia, y "Ver en la nota" (abre la nota en el título de origen).
- Opción "Escribir antes de ver" (Ajustes de Repaso, apagada por defecto): campo para escribir la respuesta; al voltear se muestra al lado de la correcta.
- Botones de respuesta: Otra vez, Difícil, Bien, Fácil, cada uno con el intervalo que da FSRS ("10 min", "2 días", "6 días", "15 días"). Atajos: espacio voltea, 1 a 4 responden.
- Acciones: **Deshacer** (Z), **Editar** (E, abre la tarjeta en hoja sin salir de la sesión), **No mostrar más** (suspender), **Saltar**.
- Al final: resumen con tarjetas, tiempo, porcentaje recordado hoy, lo que viene mañana y si sumó a la racha. La mascota reacciona al terminar.

**Mis tarjetas (Mazos)**
- Agrupadas por materia y luego por nota, con buscador.
- Filtros: Nuevas, Difíciles (falladas 3 o más veces), Suspendidas.
- Cada fila: anverso con fórmulas, tipo, "En 6 días" en vez de la fecha cruda, y retención.
- Selección múltiple: mover de materia, suspender, borrar.
- Pestaña **Estadísticas**: retención de 30 días, repasos por día (mapa de calor de 12 semanas), pronóstico de 30 días.

**Ajustes de Repaso** (en Ajustes → Estudio): nuevas por día, retención deseada, escribir antes de ver.

**Hoy**: la tarjeta de repaso pasa a "Repaso: 18 tarjetas, unos 4 min" con el tiempo real estimado.

### A.5 IA (función `ai`, tarea `flashcards`)

Entrada: `{ task: 'flashcards', content, count, existing: string[] (anversos existentes de la materia, máx. 60), mode: 'note' | 'selection' }`.
Instrucciones al modelo:
- Una idea por tarjeta, en español, preguntas que obliguen a recordar (no de sí o no), respuestas de máximo 25 palabras.
- Mezclar "pregunta" y "completar"; completar solo para definiciones, términos y fórmulas.
- Usar `$...$` para fórmulas.
- No repetir lo que ya está en `existing`.
- Devolver JSON `[{ "kind": "basic" | "cloze", "front": "...", "back": "..." }]`.
Validación en la función: arreglo de 1 a 12, `kind` válido, textos de 1 a 400 caracteres; las de completar deben tener exactamente un `{{…}}`. Lo inválido se descarta.

### A.6 Base de datos (`schema_v19.sql`)

```sql
alter table flashcards
  add column kind text not null default 'basic' check (kind in ('basic','cloze')),
  add column fsrs_state smallint not null default 2,   -- 0 nueva, 1 aprendiendo, 2 repaso, 3 reaprendiendo
  add column stability real, add column difficulty real,
  add column due_at timestamptz,                       -- con hora, para los pasos cortos
  add column suspended boolean not null default false,
  add column source_heading text,                      -- título de la nota de donde salió
  add column created_from text default 'manual';       -- ai | selection | manual | quiz | recall
create table flashcard_reviews (
  id bigserial primary key, user_id uuid not null references auth.users on delete cascade,
  card_id uuid not null references flashcards on delete cascade,
  reviewed_at timestamptz not null default now(), rating smallint not null check (rating between 1 and 4),
  state_before smallint, elapsed_days real, scheduled_days real, duration_ms integer
);
```
- Migración de estado como en A.3, en el mismo archivo e idempotente.
- RLS: cada usuario solo ve y escribe lo suyo.
- El trigger de monedas pasa a dispararse al insertar en `flashcard_reviews` (una por tarjeta y día, igual que antes).
- Índices: `flashcards (user_id, suspended, fsrs_state, due_at)`, `flashcard_reviews (user_id, reviewed_at)`.

---

## B. Sonidos ambiente en Enfoque

### B.1 Sonidos

| Sonido | Origen | Notas |
|---|---|---|
| Lluvia | Grabación CC0 | Lluvia suave, sin truenos fuertes |
| Mar | Grabación CC0 | Olas lejanas |
| Bosque | Grabación CC0 | Viento en hojas y pájaros suaves |
| Río | Grabación CC0 | Arroyo continuo |
| Viento | Grabación CC0 o generado | |
| Fuego | Grabación CC0 | Chimenea, crepitar suave |
| Ruido blanco, rosa y café | Generados en el navegador | Sin descarga |

- **Sin café con voces ni música con letra**: las voces y la letra empeoran la lectura. Se explica en una línea si alguien lo busca.
- Grabaciones: buena calidad (la mejora de atención apareció con sonidos ricos, no con versiones degradadas). Bucles sin corte de 60 a 90 s, en AAC (`.m4a`, funciona en iPhone) a 96 kbps, unos 0,8 a 1 MB cada uno.
- Licencia: solo CC0, cada archivo con su página de origen anotada en `public/sounds/CREDITOS.md`. Si no se consigue alguno con licencia clara, ese sonido se genera (lluvia, viento y mar tienen versión generada aceptable) y queda marcado para reemplazarlo.
- Se descargan solo al elegirlos y quedan guardados por el service worker.

### B.2 Motor (`lib/ambient.ts`, solo web)

- Web Audio: un `AudioContext`, una ganancia por sonido y una ganancia general. Los ruidos se generan en un búfer de 4 s (blanco directo, rosa con el filtro de Paul Kellet, café integrando el blanco).
- Entradas y salidas suaves: 3 s al empezar, 2 s al parar o al cambiar de mezcla.
- Se arranca con el toque de "Empezar" (los navegadores exigen un gesto para sonar).
- iPhone: `navigator.audioSession.type = 'playback'` cuando exista, para que suene aunque el interruptor de silencio esté activo; si la pantalla se bloquea en la app instalada puede pararse (se avisa una vez).
- Controles en la pantalla de bloqueo con Media Session ("Kaderno · Lluvia", pausa).
- La campana de fin de pomodoro baja el ambiente un momento mientras suena.

### B.3 Pantalla

- En la tarjeta del reloj, fila **"Sonido de fondo"** con chips: Silencio, Lluvia, Mar, Bosque, Río, Fuego, Ruido rosa, Ruido café, y "Mezclar".
- **Mezclador** (hoja): un deslizador por sonido, volumen general, "En el descanso": Silencio (por defecto), Pájaros, Igual. Guardar hasta 3 mezclas con nombre.
- Volumen inicial 35%.
- Al pausar el reloj se pausa el sonido; al terminar el enfoque se desvanece y aplica lo elegido para el descanso.
- La píldora del reloj en la barra lateral muestra una nota musical y un botón de silenciar.
- La mascota, durante el enfoque con sonido, muestra una nota musical flotando.
- Preferencias en el estado del enfoque (`ambient: { mix, master, onBreak, presets }`), guardadas en el dispositivo y en `user_prefs`.

---

## C. Pausas guiadas y "Anotar para después"

### C.1 Pausa guiada
- En el descanso, el reloj muestra una sugerencia (rotan sin repetir en el día):
  - Pausa corta: pararse y estirar 1 min; tomar agua; mirar algo lejano 20 s; respirar despacio 1 min; dejar el celular boca abajo; ordenar el escritorio.
  - Pausa larga: salir a caminar 10 min; comer algo; tomar aire afuera.
- Botón "Hecho" (opcional, solo para la sensación de cierre; no da monedas para no premiar clics).
- La mascota dice la sugerencia al empezar la pausa (evento nuevo `pausa` en `lib/pets/brain.ts`, respetando su silencio).

### C.2 Anotar para después
- Durante el enfoque, botón "Anotar para después" (atajo D en computador): campo de una línea, Enter guarda y vuelve.
- La lista se guarda en el estado del enfoque (en el dispositivo).
- En la pausa o al terminar: "Anotaste 2 cosas" con acciones por línea: convertir en tarea (abre el campo rápido con el texto), borrar.
- El resumen de la sesión muestra cuántas veces te distrajiste (lo que anotaste), para que lo veas sin juzgar.

---

## D. Días de estudio y rachas amables

### D.1 Un solo "día de estudio"
Hoy hay dos rachas distintas: la de Enfoque (días con enfoque, calculada en el navegador) y la de la mascota (días ganando monedas). Se unifican en una sola.

- Tabla `study_days (user_id, day, focus_min, tasks_done, cards, tests, protected, primary key (user_id, day))`, llenada por disparadores al guardar un enfoque, completar una tarea, repasar (en `flashcard_reviews`) y terminar un simulacro o un "Ponme a prueba". Se rellena hacia atrás con `focus_sessions` y `assignments.completed_at`.
- Un día **cuenta** si: 10 min o más de enfoque, o 1 tarea hecha, o 10 tarjetas, o 1 simulacro o prueba.
- Funciona sin mascota. El premio de racha de la mascota pasa a usar esta tabla.

### D.2 Meta semanal (racha principal)
- "Estudiar N días por semana", N por defecto 4 (de 2 a 7). Semana de lunes a domingo en la zona horaria del usuario.
- **Racha semanal**: semanas seguidas cumpliendo la meta. Es la que se muestra en grande.
- La racha diaria se sigue mostrando, más pequeña.
- Progreso con siete puntos (L M M J V S D) en Hoy, Estudiar y Enfoque.

### D.3 Escudos y reparar
- **Escudo**: protege un día sin estudio. Se gana uno cada 7 días seguidos (máximo 2 guardados). Con mascota también se compra por 80 monedas.
- Se usa solo: cuando registras el siguiente día de estudio, si ayer faltó y tienes escudo, ese día queda `protected`. Dos escudos cubren dos días seguidos.
- **Reparar**: si la racha se rompió hace 1 o 2 días y no había escudo, aparece "Reparar racha: haz hoy el doble (50 min de enfoque o 30 tarjetas)". Al cumplirlo, el día perdido queda protegido.
- Mensaje al romperse, sin culpa: "Te saltaste un día: no pasa nada. Lo importante es no saltarse dos."
- Funciones en la base (`study_streaks()`, `study_buy_shield()`), nunca desde el navegador.

---

## E. "¿Cuándo lo vas a hacer?"

- Al crear o editar una tarea que vence mañana o después: fila "¿Cuándo lo haces?" con 3 sugerencias de horario libre (por ejemplo "Hoy 4:00 pm", "Mañana 10:00 am", "Jue 2:00 pm"), "Otro" y chips de lugar (Casa, Biblioteca, Universidad y los que escribas).
- Huecos libres: entre 7:00 y 21:00, fuera de tus clases y de otros planes, de 50 min, prefiriendo tus horas habituales de enfoque (las más frecuentes en `focus_sessions`). Función pura `lib/planSlots.ts › freeSlots()` con pruebas.
- Se muestra como frase: "Si son las 4:00 pm del jueves, empiezo el informe en la biblioteca."
- En Hoy aparece en la agenda del día como bloque "Plan".
- Aviso a esa hora (cola de avisos, tipo `plan`): "Son las 4: toca el informe en la biblioteca" con acción "Empezar enfoque" (abre Enfoque con la tarea elegida).
- Si pasan 30 min sin enfoque en esa tarea: en Hoy, "No arrancó el informe. ¿Lo movemos?" con 3 horarios.
- Base: `assignments.plan_at timestamptz`, `assignments.plan_place text`. Lugares guardados en `user_prefs.places`.

---

## F. Tu tiempo real

- Kaderno ya guarda lo estimado (`estimate_min`) y los minutos de enfoque por tarea.
- Cálculo: mediana de (enfocado / estimado) en tus últimas 20 tareas hechas con estimado de 10 min o más y 5 min o más de enfoque. Se necesitan al menos 5. Si da entre 0,8 y 1,2, no se dice nada.
- Al poner un estimado: "Sueles tardar 1,6 veces lo que calculas. ¿Pongo 50 min?" (redondeado a 5 min), un toque para aceptar.
- Al completar una tarea con estimado: el toast dice "Te tomó 50 min (calculaste 30)".
- En el ritual del lunes: "La semana pasada planeaste 6 h y estudiaste 4 h 30".
- Función pura `lib/estimate.ts` con pruebas.

---

## G. Plan de repaso del parcial

- Se ofrece al guardar una tarea de tipo examen o quiz con fecha a 3 días o más (también al importar el cronograma, una vez por examen): "¿Armo tu plan de repaso para el Parcial 3?".
- Sesiones según los días que faltan (D):
  - Días antes del examen: 14, 7, 4, 2 y 1, quedándose con los menores que D. Máximo 5.
  - Si D es 1 o 2: solo "Simulacro rápido" y "Repaso ligero".
- Tipo de cada sesión, en orden:
  1. Primera: "Preparar: repasa tus notas y crea tarjetas".
  2. Intermedias: "Tarjetas y ejercicios mezclados".
  3. Penúltima (D-2 o la que corresponda): "Simulacro".
  4. Última (D-1): "Repaso ligero, 20 min, y descansa".
- Duración: 50 min (2 pomodoros); la última 20 min. Hora: un hueco libre de ese día (misma función que E).
- Se guardan como tareas de un tipo nuevo **Repaso** ligadas al examen (`assignments.parent_id`) con `plan_at`. Salen en Hoy, en el calendario y en la ficha de la materia.
- Desde la sesión: "Empezar" abre Enfoque con la tarea; la del simulacro abre el simulacro. Se marcan hechas al terminar.
- En el examen: "Plan de repaso: 2 de 4 sesiones hechas", con "Ver", "Rehacer" y "Quitar".
- Si cambia la fecha del examen: "¿Muevo las sesiones que faltan?".
- Función pura `lib/examPlan.ts › planSessions(exam, now, slots)` con pruebas.

---

## H. Simulacro

- Se abre desde la sesión de simulacro, la ficha de la materia ("Hacer simulacro") o el inicio de Repaso.
- Paso 1, configurar:
  - Notas: todas las de la materia por defecto, o las que elijas.
  - Preguntas: 5, 10 (por defecto) o 20.
  - "Con tiempo" (1,5 min por pregunta).
- Tipos de pregunta, mezclados entre notas:
  - Opción múltiple (4 opciones, una correcta), cerca de la mitad.
  - Respuesta corta.
  - Problema numérico, si la materia lo permite (la IA lo decide).
- Paso 2, responder: una pregunta por pantalla, barra de avance, fórmulas con KaTeX, "Saltar".
- Paso 3, resultado:
  - Nota en la escala de la materia (por ejemplo 3,8 / 5) y porcentaje.
  - Desglose por nota de origen.
  - Lista de errores con la explicación y "Ver en la nota".
  - "Convertir errores en tarjetas" (pasa por la hoja de revisión de A.2).
- Corrección: la opción múltiple se corrige en el navegador. La respuesta corta y los problemas los corrige la IA (correcta, parcial o incorrecta, con una frase de explicación); el usuario puede cambiar el veredicto.
- La ficha de la materia gana el indicador "Preparación: último simulacro 3,8 (antes 3,1)".
- Historial: tabla `quizzes (id, user_id, subject_id, exam_task_id, created_at, questions jsonb, answers jsonb, score numeric, scale numeric, duration_sec int)`.
- IA: tareas nuevas `quiz` y `grade` en la función `ai`. Se envían como máximo 12.000 caracteres de notas (las elegidas, de la más reciente a la más vieja). JSON validado en la función.
- Límite: 5 simulacros por día por usuario (tabla `ai_usage (user_id, day, task, count)`, sumada por una función de la base).

---

## I. "Ponme a prueba" en cada nota

- En "Estudiar esta nota", primer botón: **Ponme a prueba**. "Resumir" baja al final, con la nota "Resumir ayuda a ordenar; para recordar, ponte a prueba".
- Paso 1: se oculta la nota y se pide "Escribe todo lo que recuerdas" (sugerencia de 3 min, contador visible).
- Paso 2: la IA compara con la nota y devuelve:
  - Lo que recordaste (marcas verdes).
  - Lo que faltó, con enlace al título.
  - Lo que quedó mal.
- Paso 3: "Hacer tarjetas de lo que faltó" (hoja de revisión de A.2).
- Se guarda en la nota `last_recall_at` y `last_recall_score` (porcentaje). La lista de notas muestra "Probada hace 3 días · 70%".
- Alternativa rápida en el mismo panel: "3 preguntas rápidas" (mini simulacro de esa nota, sin guardarse).
- IA: tarea `recall`. Límite: 10 por día.

---

## J. Ritual del lunes y del semestre

### J.1 Ritual del lunes (3 minutos)
- Se ofrece el lunes al abrir la app (o el domingo después de las 6 pm), una vez por semana, como tarjeta en Hoy ("Planea tu semana"). Opcional; se puede posponer al día siguiente.
- Pasos en una hoja:
  1. **Tu semana**: entregas y exámenes de esta semana y la siguiente, clases y cómo te fue la semana pasada (meta cumplida, horas, lo estimado contra lo real).
  2. **Lo importante**: elegir hasta 3 prioridades (de tus tareas o escritas).
  3. **¿Cuándo?**: para cada una, un horario (como en E).
  4. **Meta**: confirmar la meta semanal (días).
- Las prioridades quedan fijadas arriba en Hoy toda la semana.
- Aviso opcional el lunes a las 8 am (Ajustes → Avisos).
- Tabla `week_plans (user_id, week_start date, priorities jsonb, goal_days int, done_at, primary key (user_id, week_start))`.

### J.2 Ritual del semestre
- Se ofrece al crear 3 o más materias en 7 días, o desde Ajustes → "Empezar semestre".
- Pasos: nota que quieres sacar en cada materia (alimenta "Quiero sacar" y el simulacro), meta semanal y una meta WOOP del semestre (sección K).

---

## K. Metas WOOP por materia

- En la ficha de la materia, chip "Meta" (si no hay: "Ponerte una meta").
- Hoja de 4 pasos:
  1. Deseo, con ejemplo: "Pasar Física Moderna con 4.0".
  2. Mejor resultado: imaginarlo en una frase.
  3. Obstáculo interno principal, con ejemplos en chips: "me distraigo con el celular", "dejo todo para el final", "no entiendo y no pregunto".
  4. Plan "Si…, entonces…".
- Se muestra en la ficha (la meta y el plan) y en el ritual del lunes. La mascota lo recuerda una vez al mes o cuando hay un examen cerca.
- La nota objetivo reemplaza el valor por defecto de "Quiero sacar".
- Tabla `goals (id, user_id, subject_id, wish, outcome, obstacle, plan, target_grade numeric, status text, created_at)`.

---

## L. Enfocar juntos

- Salas: una por proyecto (miembros del proyecto) o una sala con código para amigos.
- Presencia en tiempo real con Supabase Realtime (canales de presencia, sin escribir en la base cada segundo): nombre, mascota y estado (Enfocado, Descanso, Fuera) con el tiempo que le queda.
- "Empezar juntos": quien inicia propone un pomodoro y los demás aceptan; los relojes arrancan a la vez.
- Meta de grupo del día: "Juntos: 6 de 8 pomodoros", con la suma de sesiones hechas en la sala (competir con colaboración funciona mejor que solo competir).
- Privacidad: no se muestra en qué tarea está cada uno, salvo que lo active.
- Tablas `study_rooms (id, owner_id, project_id, name, code, created_at)` y `study_room_members (room_id, user_id, joined_at)`; las sesiones de enfoque guardan `room_id`.
- Es la fase más pesada; va al final.

---

## Ajustes nuevos (Ajustes → Estudio)

| Ajuste | Por defecto |
|---|---|
| Tarjetas nuevas por día | 15 |
| Retención deseada | 90% |
| Escribir antes de ver | Apagado |
| Meta semanal | 4 días |
| Ritual del lunes | Encendido |
| Aviso del lunes | Apagado |
| Sonido de fondo por defecto | Silencio |
| En el descanso | Silencio |

---

## Base de datos: `supabase/schema_v19.sql` (versión 20 de la app)

Requiere schema_v14, v16 y v18. Idempotente.

- `flashcards`: columnas de A.6 y migración de estados.
- `flashcard_reviews`: nueva.
- `study_days`: nueva, con disparadores y relleno hacia atrás.
- `study_shields (user_id pk, count int, updated_at)`: nueva; solo funciones.
- `assignments`: `plan_at`, `plan_place`, `parent_id`; tipo nuevo `repaso` en los tipos de siempre.
- `notes`: `last_recall_at`, `last_recall_score`.
- `quizzes`, `ai_usage`, `week_plans`, `goals`: nuevas.
- `study_rooms`, `study_room_members`, `focus_sessions.room_id`: fase 5.
- Funciones: `study_streaks()`, `study_buy_shield()`, `ai_take(task, limit)` (cuenta y frena el uso diario de IA).
- Cola de avisos: tipos `plan` y `semana`.
- RLS en todo; lo que da monedas o escudos solo desde funciones `security definer`.
- Sin la migración la app sigue funcionando: Repaso usa SM-2 como hoy y las secciones nuevas avisan que falta.

## Función `ai` (desplegar de nuevo)

Tareas: `flashcards` (nuevo formato), `quiz`, `grade`, `recall`. Todas devuelven JSON validado; si el modelo responde mal, error claro ("La IA no devolvió preguntas, intenta de nuevo"). Límites diarios con `ai_take`.

## Archivos nuevos o cambiados (principales)

- `lib/fsrs.ts`, `lib/cards.ts`, `lib/ambient.ts`, `lib/planSlots.ts`, `lib/examPlan.ts`, `lib/estimate.ts`, `lib/streaks.ts` (puros salvo `ambient`).
- `app/repaso.tsx` (inicio, sesión, mazos, estadísticas), `components/cards/CardText.tsx`, `components/cards/ReviewSheet.tsx` (hoja "Revisa tus tarjetas"), `components/cards/CardEditor.tsx`.
- `app/(tabs)/enfoque.tsx` y `components/focus/AmbientMixer.tsx`, `components/focus/BreakCoach.tsx`, `components/focus/ParkingLot.tsx`.
- `app/simulacro.tsx`, `components/notes/RecallTest.tsx`.
- `components/plan/WhenPicker.tsx` (en TaskModal y campo rápido), `components/plan/ExamPlanSheet.tsx`.
- `components/ritual/WeekRitual.tsx`, `components/goals/WoopSheet.tsx`.
- `app/sala/[id].tsx` (fase 5).
- `public/sounds/*.m4a` y `CREDITOS.md`.

## Pruebas

- `tests/v20.test.ts`: FSRS (estados, botones, migración desde SM-2), orden y tope de nuevas, duplicados, huecos libres, plan del parcial, tiempo real, rachas (escudos, reparar, meta semanal), generación de ruido (que el búfer no se sature).
- `tests/sql/19_pruebas.sql`: migración de tarjetas sin perder avance, `flashcard_reviews` y monedas una vez por día, `study_days` desde cada fuente, escudos (ganar, comprar, usar, tope 2), reparar, límites de IA, RLS en todas las tablas.
- QA con Playwright: crear tarjetas con revisión, sesión completa con deshacer y editar, intensivo, sonidos (que arranque con el toque y se desvanezca), pausa guiada, plan del parcial en Hoy, simulacro con corrección simulada, ritual del lunes; computador y celular.

## Fases y orden de trabajo

| Fase | Contenido | Estimado |
|---|---|---|
| 1 | A (Repaso nuevo), B (sonidos), C (pausas y anotar) | 1 a 2 días |
| 2 | D (días de estudio y rachas), E (cuándo), F (tiempo real) | 1 día |
| 3 | G (plan del parcial), H (simulacro), I (ponme a prueba) | 1 a 2 días |
| 4 | J (rituales), K (WOOP) | 1 día |
| 5 | L (enfocar juntos) | 1 a 2 días |

Cada fase va en su propio PR, con su parte de `schema_v19.sql` (el archivo crece por fases y siempre se puede correr completo).

## Decisiones tomadas (se pueden cambiar)

1. Sin sonido de café con voces ni música con letra.
2. 15 tarjetas nuevas por día y retención del 90%.
3. El plan del parcial se ofrece con un toque, no se crea solo.
4. Escudo: uno gratis cada 7 días seguidos, o 80 monedas; máximo 2.
5. Límites de IA por día: 5 simulacros, 10 "Ponme a prueba", 30 creaciones de tarjetas.
6. Las pausas guiadas no dan monedas.
7. La racha principal es la semanal (meta de días); la diaria queda como dato secundario.
8. (Cambio al construir B) Todos los sonidos se generan en el navegador en vez de usar grabaciones CC0: pesan cero, no dependen de licencias ni de descargas y el volumen quedó medido y parejo. Las grabaciones quedan como mejora opcional.
9. (Al construir L) La sala del proyecto la puede abrir cualquier miembro y no tiene código. Las salas de amigos tienen código de 6 letras, máximo 30 personas. Un pomodoro cuenta para la meta si dura 10 min o más.
10. (Al construir D) Los días protegidos con escudo cuentan también para la meta semanal: la racha principal es la semanal y el escudo debe servirle.
11. (Al construir E) El aviso del plan sale con la revisión de avisos de cada 10 minutos, así que puede llegar hasta 10 minutos tarde.
12. (Al construir G) Las sesiones guardan su tipo en `assignments.session_kind` (preparar, mezclar, simulacro, ligero) para que la de simulacro abra el simulacro. Con solo 2 sesiones (examen a 3 días) son simulacro y repaso ligero.
13. (Al construir H e I) "3 preguntas rápidas" cuenta en el tope de pruebas de notas (10), no en el de simulacros (5). Las correcciones con IA tienen su propio tope (25 al día).
