# PLAN v22: Grabar la clase, anotar PDFs, ¿Cómo te fue? y Capturar nueva

Estado: aprobado el martes 20 de octubre. Las cuatro fases construidas (ramas v22-clase, v22-pdf, v22-parcial y v22-captura). Se construye por fases, una PR por fase, sobre la versión 21 (`PLAN_v21.md`).

Recoge la fase 4 de la versión 21 (grabar la clase y anotar PDFs), ya decidida, y suma dos pedidos nuevos: revisar cómo te fue en un parcial frente al esfuerzo que le pusiste, y una pantalla de Capturar mejor.

---

## Decisiones de partida

1. **Transcripción con el navegador** (gratis): Web Speech API en Chrome, Edge y Safari. En Firefox no existe; ahí se avisa y se ofrece escribir normal. El código queda separado por "proveedor" para poder pasar luego a un servicio pagado (AssemblyAI desde unos US$0,15 la hora; ver la tabla de precios en el mensaje del 20 de octubre) sin rehacer la pantalla.
2. **El audio nunca se guarda.** Solo queda el texto de la clase con sus tiempos.
3. **Anotar PDFs se aprueba**: el visor pasa a pdf.js con capa de texto (solo en web, que es donde vive Kaderno; en la app nativa sigue el visor de siempre).
4. Capturar: se hacen los cuatro paquetes (lectura más fiel, menos pasos, más cosas para capturar, foto más limpia).

---

## Fase 1. Grabar la clase

**Cómo se usa**
- En una nota, editando: botón **Grabar clase** (micrófono). La primera vez sale un recordatorio: "Pide permiso al profesor. El audio no se guarda: Kaderno solo escribe lo que se dice".
- Mientras graba, una barra fija con punto rojo, el tiempo, la última frase que entendió y los botones Pausar y Terminar. La pantalla no se apaga (Wake Lock) y si el navegador corta el reconocimiento tras un silencio, se vuelve a encender solo.
- Cada párrafo que escribes durante la clase queda marcado con el minuto. Después, en la nota, **"¿Qué se decía aquí?"** sobre un párrafo abre la transcripción en ese minuto. Es el equivalente de Notability sin audio.
- Al terminar: la **Transcripción de la clase** queda en un panel plegable debajo de la nota (con buscador y minutos). Desde ahí:
  - **Resumir con IA**: ideas principales, fórmulas y tareas que dijo el profesor ("para el viernes…"), con "Insertar en la nota" y "Crear tarea" para lo que suene a entrega.
  - **Crear tarjetas** desde la transcripción (pasa por "Revisa tus tarjetas").
  - Borrar la transcripción.
- Idioma de la clase: español (Colombia) por defecto; se puede cambiar a inglés por nota.

**Base**: `note_transcripts (id, note_id, user_id, started_at, duration_s, lang, segments jsonb, marks jsonb, summary jsonb, created_at)`. `segments` son `{ t, text }` (segundos desde el inicio) y `marks` son `{ t, line }` (la línea de la nota escrita en ese momento). Tope de 4 horas y 300 mil caracteres por transcripción. RLS: solo el dueño.

**IA**: tarea `class_summary` en la función `ai` con tope de 10 por día.

## Fase 2. Anotar PDFs

**Cómo se usa**
- Los PDF de Archivos de la materia y de los proyectos abren en un visor nuevo: páginas que cargan al bajar, zoom, ir a una página y texto seleccionable.
- Al seleccionar texto aparece una barra: **4 colores de resaltado**, **Comentar**, **Enviar a una nota** y **Hacer tarjeta**.
- **Enviar a una nota**: elige la nota de la clase de hoy, otra nota (buscador) o una nueva. Entra como cita con la fuente: "Guía 3.pdf, pág. 4", y esa fuente es un enlace que abre el PDF en esa página.
- **Hacer tarjeta**: crea tarjetas con IA desde lo seleccionado (como ya pasa al seleccionar texto en una nota).
- Panel **Resaltados** del archivo (al lado en computador, hoja abajo en el celular): tocar uno lleva a su página; se puede cambiar el color, editar el comentario o borrarlo.
- Los resaltados son tuyos aunque el archivo sea de un proyecto en grupo.

**Base**: `file_highlights (id, user_id, file_kind 'subject'|'project', file_id, page, rects jsonb, text, color, comment, created_at)`. `rects` va en proporciones de la página (0 a 1) para que no dependa del zoom. Se borran solos si se borra el archivo. RLS: solo el dueño, y solo sobre archivos que puede ver.

## Fase 3. ¿Cómo te fue?

**Cuándo aparece**
- Desde el día siguiente a un parcial o quiz (y hasta 3 semanas después), en Hoy: **"¿Cómo te fue en Parcial 2 de Física?"** con un campo para la nota. También desde el detalle de la tarea y desde Calificaciones de la materia.

**Qué pide**
- La nota (escala de la materia, 5,0 por defecto) y, si no estaba en Calificaciones, cuánto vale (%). Se guarda también en Calificaciones, así el promedio se actualiza.
- Cómo te sentiste preparado (1 a 5).

**Qué muestra**
- **El esfuerzo**: horas de enfoque para ese parcial (las de la tarea, las de sus sesiones de repaso y las de la materia en las 3 semanas antes), en cuántos días distintos, cuándo empezaste y cuánto quedó para las últimas 48 horas. Sesiones del plan hechas, tarjetas repasadas de la materia, simulacros y su mejor resultado, y "Ponme a prueba" de las notas de la materia.
- **La comparación**: contra la nota que querías en la materia (meta del semestre) o, si no hay, contra 3,0. Y contra tus otros parciales: una gráfica pequeña de horas contra nota ("con 6 h sacaste 3,2; con 11 h, 4,1").
- **El veredicto**: "El esfuerzo alcanzó" o "No alcanzó", con las razones que se ven en los datos, por ejemplo:
  - Empezaste 2 días antes (lo que mejor funciona es repartir en una o dos semanas).
  - El 70 % del estudio fue en las últimas 48 horas.
  - Menos horas que en tus parciales donde te fue bien.
  - No hiciste simulacro, o en el simulacro sacaste 55 % y era una alerta.
  - 2 de 5 sesiones del plan sin hacer.
  - Si alcanzó: qué funcionó (repartir, simulacros, repaso al día).
- **Tus razones**: chips para lo que los datos no ven: no entendía algunos temas, el examen fue distinto a lo que estudié, nervios, errores por descuido, me faltó tiempo en el examen, estudié teoría pero no practiqué ejercicios, dormí poco, otra.
- **Qué harás distinto**: una frase, con sugerencias según las razones ("Empezar el plan 14 días antes", "Hacer al menos un simulacro", "Practicar ejercicios tipo examen"). Esa frase aparece cuando planees el siguiente parcial de la materia ("La última vez dijiste: …").

**Base**: `exam_results (id, user_id, task_id unique, subject_id, score, max_score, felt, reasons text[], change text, grade_id, focus_min, created_at)`. `focus_min` guarda la foto de las horas al momento de responder (para la gráfica, aunque después se borren sesiones). RLS: solo el dueño. Todo el análisis es de la app y no gasta IA.

## Fase 4. Capturar nueva

**Lectura más fiel**
- La lectura de la foto devuelve Markdown: títulos, listas, tablas y fórmulas en LaTeX (que se ven bien en la nota). Lo dudoso queda marcado con [?] y resaltado para revisarlo.
- Dibujos y diagramas: se recortan de la foto (aproximado) y entran como imagen en su lugar dentro de la nota.
- Revisión lado a lado en computador (foto con zoom a la izquierda, texto a la derecha con "Ver cómo queda"); en el celular, pestañas Foto y Texto.
- Texto por página, con **Leer de nuevo** en una sola página.

**Menos pasos**
- Materia elegida sola según la clase de ahora (horario) o la última que usaste; título sugerido con el primer título de la foto o "Clase del 20 oct".
- Destino: **nota nueva**, **agregar a la clase de hoy** (la misma nota de "Apuntes de hoy") o **agregar a otra nota** (buscador).
- Lo que llevas no se pierde: las páginas y el texto quedan guardados en el dispositivo hasta que guardes o descartes ("Tienes una captura sin guardar, 3 páginas. Seguir o Descartar").

**Más cosas para capturar** (selector arriba: Apuntes, Pizarra, PDF, Cronograma)
- **Pizarra**: la foto se limpia y entra como imagen en la nota (con el texto que se lea debajo, si quieres).
- **PDF**: hasta 20 páginas. Si el PDF ya trae texto, se toma directo (sin IA); si es escaneado, se lee como fotos.
- **Cronograma o tarea**: la foto del cronograma pasa a Importar cronograma ya con el texto; la foto de un enunciado abre Nueva tarea con el título y la descripción llenos.

**Foto más limpia**
- Antes de leer: girar, recortar (arrastrando las esquinas) y **modo escáner** (gris, fondo blanco y más contraste). El modo escáner se puede dejar siempre activo.

**Seguridad**
- La función `ocr` hoy no revisa la sesión: cualquiera con la llave pública podría gastar créditos de IA. Pasa a exigir sesión y a tener tope diario (80 páginas por persona). Lo mismo para `ai` en resumen y microtareas (hoy sin tope).

---

## Base de datos: `supabase/schema_v21.sql` (versión 22 de la app)

Requiere schema_v20 (v21). Idempotente, crece por fases: fase 1 `note_transcripts`, fase 2 `file_highlights`, fase 3 `exam_results`. La fase 4 no agrega tablas (los topes usan `ai_usage` de schema_v19).

## Pruebas

- `tests/v22.test.ts`: armar segmentos y marcas de la transcripción, buscar el minuto de un párrafo, rectángulos de resaltado en proporciones, cita con fuente, análisis del parcial (horas, días, reparto, últimas 48 h, razones y veredicto), filtro de escáner y recorte, elegir materia y destino, Markdown de la lectura.
- `tests/sql/21_pruebas.sql` (y siguientes por fase): transcripciones y resaltados solo del dueño, resaltados se borran con el archivo, un resultado por parcial y se guarda en Calificaciones.
- QA con Playwright en computador y celular por fase.

## Fases

| Fase | Contenido |
|---|---|
| 1 | Grabar la clase (transcripción del navegador, sin audio) |
| 2 | Anotar PDFs |
| 3 | ¿Cómo te fue? después del parcial |
| 4 | Capturar nueva y lectura de fotos segura |

## Decisiones tomadas al construir (se pueden cambiar)

1. (Fase 1) "¿Qué se decía aquí?" sale al seleccionar texto de la nota (junto a Flashcards y Explicar) y abre la transcripción en ese minuto, con 20 segundos de margen antes. La transcripción se muestra con tus apuntes intercalados por minuto ("Escribiste").
2. (Fase 1) La transcripción se guarda cada 20 segundos mientras se graba (si se cierra la pestaña no se pierde casi nada). Cambiar de nota termina la grabación.
3. (Fase 1) Chrome en Android repite la frase anterior alargada: si una frase nueva empieza igual que la última de hace menos de 30 segundos, la reemplaza.
4. (Fase 1) Las tareas del resumen no se crean solas: cada una tiene "Crear tarea", que abre Agregar con el texto y la fecha dicha ("Taller 3 el viernes").
5. (Fase 2) pdf.js 4.10 (versión legacy, para Safari viejo) se copia a `public/pdfjs` con `node scripts/copy-pdfjs.mjs` y se carga solo al abrir un PDF; no entra en el paquete de la app.
6. (Fase 2) Las fuentes de las citas abren el PDF en otra pestaña del navegador (la nota queda abierta al lado). El visor ocupa toda la pantalla, sin la barra lateral.
7. (Fase 2) "Enviar a una nota" también deja el texto resaltado en amarillo, para encontrarlo después en la lista. Al compartir una nota o copiarla a un proyecto, las fuentes quedan como texto (el PDF es privado).
8. (Fase 2) Los miembros de un proyecto que solo pueden ver (rol lector) también pueden resaltar los PDF del proyecto: los resaltados son de cada quien.
9. (Fase 3) El esfuerzo cuenta el enfoque de la tarea del parcial, de sus sesiones de repaso y de la materia en las 3 semanas antes (hasta la hora del examen), sin contar dos veces. "Empezaste" es el primer día con enfoque en esa ventana.
10. (Fase 3) Sin meta del semestre para la materia, la comparación es contra aprobar (60 % de la escala, 3,0 sobre 5). La nota se puede escribir en la escala de la materia o con la suya ("38/50").
11. (Fase 3) "Ahora no" esconde la pregunta solo en ese dispositivo; "No lo presenté" queda guardado y no vuelve a preguntar. También se puede responder desde el detalle del parcial.
12. (Fase 3) Si ya hay una calificación con el mismo nombre en la materia, se le pone la nota; si no, se crea con el peso que digas (o 0 %).
13. (Fase 4) Los dibujos se recortan con la caja aproximada que da la lectura y se pueden quitar uno por uno antes de guardar. Si la caja no es válida, el marcador se quita y queda solo el texto.
14. (Fase 4) El modo escáner invierte los tableros oscuros (tiza clara sobre verde o negro) para que queden como tinta oscura sobre blanco.
15. (Fase 4) "Clase de hoy" usa la misma nota que "Apuntes de hoy" (la crea con la plantilla de la materia si no existe) y agrega al final.
16. (Fase 4) En Apuntes se guardan las fotos con la nota (la primera como original y las demás adjuntas); en PDF no, porque el archivo ya existe; en Pizarra la foto va dentro de la nota.
17. (Fase 4) La función `ai` también exige sesión para todo (antes el resumen y las microtareas no la pedían) y tiene tope para el resumen (40) y los pasos (40) por día.

