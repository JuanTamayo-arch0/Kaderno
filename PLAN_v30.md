# PLAN v30: Kaderno en inglés y en español

Pedido: que Kaderno también lo usen personas que hablan inglés. Hay que poder escoger entre inglés y español, traducir absolutamente todos los textos y comprobarlo.

## A. Decisiones (23 de noviembre)
1. **Idioma al abrir:** el del dispositivo. Si el celular o el navegador está en inglés, abre en inglés; con cualquier otro idioma, en español. Se cambia en Ajustes y en el login.
2. **IA:** responde en el idioma de la app, aunque las notas estén en otro.
3. **Cobrar:** la pantalla se traduce. El PDF de la cuenta de cobro sale bilingüe: el texto legal en español con la traducción al lado, para que siga valiendo en Colombia.
4. **Después del inglés:** un selector de proveedor de IA (Claude o Gemini), en PR aparte.

## B. Tamaño
- 284 archivos y 45.000 líneas en la app.
- Unos 3.000 textos: pantallas, avisos, errores, mensajes de la mascota, plantillas de proyecto y correcciones de la IA.
- Fuera de las pantallas:
  - las funciones de Supabase: IA, Oráculo, digitalizar, avisos, calendario y nota compartida;
  - el lector de "parcial cálculo viernes 10am";
  - fechas y números;
  - `index.html` y el manifiesto.

## C. Cómo
1. **El texto en español es la llave.** `t('Nueva tarea')` devuelve "New task" en inglés y lo mismo en español.
   - El código sigue en español y no hay que inventar 3.000 nombres de llaves.
   - Las traducciones viven en `lib/i18n/en/*.ts`, por área.
   - Variables: `t('Hola, {name}', { name })`.
   - Plurales: `tp(n, '{n} tarea', '{n} tareas')`.
   - Un mismo texto con dos sentidos (por ejemplo "Mar", el día o el sonido) se distingue con `tc('sonido', 'Mar')`.
2. **Al cambiar de idioma la app se recarga**, igual que al cambiar la apariencia. Así también salen bien los textos que se arman al cargar cada archivo.
3. **Fechas y números** con `locale()`: `es-CO` o `en-US`. Los días y los meses vienen del navegador (`weekdayNames`, `monthNames`).
4. **Envolver a mano 3.000 textos es lento y propenso a errores.** Un script (`scripts/i18n-wrap.ts`, con el analizador de TypeScript) envuelve lo seguro:
   - el texto entre etiquetas;
   - las props de texto (`label`, `title`, `placeholder`, `accessibilityLabel`...);
   - los textos con tildes o palabras en español;
   - las plantillas con variables.
   Lo dudoso lo marca el revisor para hacerlo a mano.
5. **Revisor** (`npm run i18n`, también en `npm test`), que falla si:
   - un texto envuelto no tiene traducción al inglés;
   - queda un texto en español sin envolver en la app. Lo que debe quedar en español (palabras que entiende el lector de tareas, texto legal del PDF) se marca con `// i18n-ok`.
6. **Mientras se traduce por fases**, el inglés queda escondido (`I18N_READY = false`): nadie ve la app a medias. La última fase lo prende.

## D. Fases (una PR por fase)
1. **Base:**
   - `lib/i18n.ts`, el revisor y el script que envuelve;
   - el selector de idioma (escondido);
   - todos los textos de la app envueltos, sin cambiar el español;
   - fechas con `locale()`.
2. **Inglés de:** inicio de sesión, Bienvenida, navegación, sistema de diseño, avisos y errores; Hoy, Mi día, Matriz, tareas, Agregar, búsqueda, rituales y cerrar el día.
3. **Inglés de:** Materias, materia, notas, digitalizar, archivos, horario, calificaciones, historial y semestres.
4. **Inglés de:** Estudiar, enfoque, repaso y tarjetas, Oráculo, simulacros, salas, rachas, metas y la mascota (incluidas sus frases).
5. **Inglés de:** Proyectos, Trabajo (horas, cobrar con PDF bilingüe, plan y pagos), Ajustes, Personalizar y las páginas públicas.
6. **Fuera de las pantallas:**
   - el lector de tareas en inglés ("exam friday 10am");
   - la IA en el idioma de la app;
   - los avisos push en el idioma de cada persona;
   - el calendario y la nota compartida;
   - `index.html` y el manifiesto.
7. **Prender el inglés:** el idioma del dispositivo y el selector visible. Recorrido con capturas de todas las pantallas en inglés a 320, 390 y 1440 px, y arreglo de lo que se corte (el inglés suele ser más corto, pero no siempre).

Después: selector de proveedor de IA (Claude o Gemini).

## E. Lo que no se traduce
- Lo que escribe cada persona: tareas, notas, materias.
- Los nombres propios: Kaderno, Pomodoro, Wompi, DIAN.
- El texto legal de la cuenta de cobro, que va en español con la traducción al lado.
