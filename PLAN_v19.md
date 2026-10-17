# PLAN v19: Materias y notas

Estado: propuesta, sin construir. Diseño en el canvas "Materias y notas de Kaderno" (4 pantallas).

## 1. Qué está mal hoy

| Dónde | Problema |
|---|---|
| Página de la materia | Lo útil (promedio, próxima evaluación, próxima clase) solo aparece en su pestaña. Al cambiar de pestaña desaparece. |
| Página de la materia | En pantallas anchas el contenido ocupa la esquina de arriba a la izquierda y el resto queda vacío. |
| Página de la materia | No guarda datos básicos de la materia: profesor, salón, enlace del aula virtual. |
| Notas | Hay que elegir entre "Ver" y "Editar". Editar muestra el Markdown en bruto (asteriscos, numerales) y en letra de máquina de escribir. |
| Notas | La barra de formato son botones sueltos que se ven pesados; no hay fórmulas, tablas ni imágenes dentro del texto. |
| Notas | Adjuntos y "Estudiar con IA" quedan debajo de la nota: hay que bajar hasta el final para verlos. |
| Notas | Para pasar de una nota a otra hay que volver a la materia. |

## 2. Lo que se propone

### 2.1 Ficha fija de la materia (pantalla 1)

- Encabezado grande: icono, nombre y una fila de datos: profesor, salón, días de clase (sacados del horario), créditos y enlace al aula virtual. Los datos que falten se muestran como "Agregar profesor" y se llenan con un toque.
- Cuatro indicadores que se quedan en todas las pestañas: promedio (con lo que necesitas), próxima evaluación (con cuántos días faltan y cuánto vale), pendientes, y estudio (minutos de enfoque de la semana y tarjetas de repaso de hoy).
- Acciones arriba: "Enfocar en esta materia" (empieza un enfoque ya ligado a ella), Oráculo, Nueva y el menú.
- Columna derecha fija en el computador, igual en todas las pestañas: próxima clase, calendario del mes con las fechas de la materia, notas recientes (con "Nota rápida") y archivos.
- Tareas agrupadas por "Esta semana" y "Más adelante", con un campo para escribir la tarea en una línea (usa el mismo lector de fechas de Agregar).

### 2.2 Notas con lista al lado (pantalla 2)

- Al entrar a Notas la ficha se encoge a una barra delgada (icono, nombre, promedio y próxima evaluación, pestañas) para dejar espacio al texto.
- Tres columnas en el computador: lista de notas de la materia (con buscador, fijadas y recientes), la nota en el centro y a la derecha el índice de la nota y el bloque "Estudiar esta nota" (resumen, flashcards, Oráculo) y la foto original si la nota viene de digitalizar.
- Lectura cómoda: ancho máximo de unos 700 px, letra de lectura propia (Source Serif por defecto, elegible en Personalizar), títulos con jerarquía clara, cajas de aviso, fórmulas bien dibujadas.
- Fijar notas, contador de palabras y tiempo de lectura.

### 2.3 Editar en el mismo lugar (pantalla 3)

- Se acaba el "Ver / Editar": la nota se edita donde se lee y el formato se ve mientras escribes (sin asteriscos a la vista), como en Notion u Obsidian.
- Una sola barra de formato delgada, pegada arriba al hacer scroll.
- Al seleccionar texto aparece una barra flotante: negrita, cursiva, resaltar, "Crear flashcard" con lo seleccionado y "Explicar" (Oráculo).
- Escribir "/" abre el menú de bloques: subtítulo, lista de tareas, aviso, fórmula, tabla, imagen o diagrama, pregunta de repaso.
- Atajos de Markdown al escribir: "# " título, "- " lista, "[ ] " tarea, "$x^2$" fórmula.
- Las imágenes se pegan o arrastran y quedan dentro del texto (hoy van aparte en "Diagramas y adjuntos").
- "Listo" vuelve a la vista de lectura; en el computador también se puede editar directo con un clic.

### 2.4 Celular (pantalla 4)

- Misma ficha en pequeño; los indicadores pasan a una fila deslizable.
- Pestañas en control segmentado; botón flotante para nueva tarea.
- Notas: lista a pantalla completa; al abrir una, lectura primero y lápiz para editar; la barra de formato va pegada encima del teclado.

## 3. Cómo se construye

- Editor: TipTap (ProseMirror) solo en web, que es donde vive Kaderno (PWA). Se guarda en Markdown como hoy, así que el resumen, las flashcards, la búsqueda del Oráculo, el PDF y las notas viejas siguen funcionando sin migrar nada. Se carga diferido (como el lector de Markdown actual) para no subir el peso inicial.
- Fórmulas con KaTeX, cargado solo cuando una nota tiene fórmulas.
- En nativo se queda el editor actual mejorado (sin cambiar el formato guardado).
- Base de datos (`schema_v18.sql`, todo opcional y con `if not exists`):
  - `subjects`: `teacher text`, `room text`, `link text`.
  - `notes`: `pinned boolean default false`, `updated_at timestamptz` con trigger, para ordenar por última edición.
- Las imágenes dentro del texto reutilizan `note_images` y el bucket actual; en el Markdown quedan como `![](kd-img:<id>)` y se resuelven a URL firmada al mostrar.

## 4. Fases

1. Ficha fija, indicadores, columna derecha, datos nuevos de la materia y tareas agrupadas.
2. Notas en tres columnas con lista, índice, panel de estudio y letra de lectura.
3. Editor en el mismo lugar: barra delgada, barra al seleccionar, menú "/", fórmulas, tablas, imágenes dentro del texto.
4. Celular: ajustes de la ficha, lista de notas y barra encima del teclado.

## 5. Por decidir

- Nombre de la pestaña "Calificaciones": en Colombia "notas" también son calificaciones; se podría renombrar la pestaña de apuntes a "Apuntes" para evitar la confusión.
- Letra de lectura por defecto: serif (Source Serif) o la misma de la app.
- Si la columna derecha se queda también en Calificaciones y Archivos o solo en Tareas.
