# PLAN v12: revisión de diseño, experiencia de uso y nuevas funciones

Estado: propuesta para aprobar. No se ha cambiado código de la app; este documento, las capturas y los bocetos de `docs/revision-v12/` son lo único nuevo en la rama.

## 0. Resumen

Se revisaron las 17 pantallas de la app en computador (1440 px) y en celular (390 px), con tema oscuro y claro, usando datos de ejemplo realistas, y se leyó el código de cada pantalla y de los componentes compartidos.

Conclusiones principales:

1. Hay errores que ya afectan a quien usa la versión web: en el navegador no aparecen los avisos ni las confirmaciones hechos con `Alert.alert` (45 llamadas en 10 archivos). Por eso borrar una nota, un archivo de materia o un adjunto no hace nada, y muchos errores pasan en silencio.
2. Faltan acciones básicas: no hay forma de cerrar sesión ni de borrar una materia.
3. La app se ve como varias apps distintas: tres estilos de encabezado, botones y campos redefinidos en cada pantalla, texto blanco o negro sobre el color de marca según el archivo, y siete pantallas que en computador pierden la barra lateral.
4. "Hoy" intenta mostrar todo a la vez. En el celular la primera tarea aparece después de casi tres pantallas de desplazamiento (resumen, aviso de examen, seis accesos rápidos, semana y calendario abierto).
5. La navegación tiene seis pestañas, más de lo recomendado, y deja Proyectos (que ya es una de las funciones más completas) escondido.

Se propone trabajar en cinco fases: primero los arreglos que se notan, luego un sistema de diseño común y la nueva navegación, después pantalla por pantalla, y por último funciones nuevas. Al final hay seis decisiones que necesito que tomes antes de empezar.

## 1. Cómo se hizo la revisión

- Lectura del código de todas las pantallas (`app/`) y componentes (`components/`, `lib/theme.ts`).
- Capturas automáticas con Playwright contra un Supabase simulado con 4 materias, 10 tareas, notas, calificaciones, sesiones de enfoque, flashcards, horario, conversación del Oráculo y 2 proyectos.
- Cálculo del contraste de color (norma WCAG) de los 10 temas.
- Las capturas usadas en este documento están en `docs/revision-v12/` con el prefijo `antes-`. Los bocetos de la propuesta tienen el prefijo `propuesta-`.

## 2. Hallazgos

### 2.1 Errores que el usuario ya puede estar sufriendo

| # | Problema | Dónde | Efecto |
|---|----------|-------|--------|
| E1 | `Alert.alert` no hace nada en el navegador (react-native-web lo deja vacío) | nota/[id], materia/[id], materias, capturar, oraculo, repaso, Hoy, TaskModal, SubjectFiles, NoteAttachments | Borrar nota, archivo o adjunto no funciona en la web. "Ponle un título", "Guardado", errores de red y de IA no se muestran. |
| E2 | No existe botón para cerrar sesión | Toda la app | En un computador compartido no hay manera de salir. |
| E3 | No se puede borrar ni archivar una materia | Materias | `deleteSubject` existe en `lib/db.ts` pero ninguna pantalla lo usa. |
| E4 | Siete pantallas sin barra lateral en computador | Buscar, Repaso, Materia, Nota, Tipos, Personalizar, Visor | Buscar deja una franja vacía de 232 px. En las demás la única salida es la flecha. Ver `antes-buscar-escritorio.png`, `antes-repaso-escritorio.png`. |
| E5 | La flecha "volver" usa `router.back()` sin comprobar si hay a dónde volver | Repaso, Nota, Materia, Buscar | Si se recarga la página o se entra por un enlace, la flecha no hace nada y el usuario queda atrapado. |
| E6 | Etiquetas de la barra inferior cortadas | Celular | "Hoy", "Materias" y las demás se ven recortadas por abajo. Ver `antes-hoy-celular.png`. |
| E7 | Borrar una tarea es inmediato, sin confirmar ni deshacer | Hoy, Materias | Un toque en la papelera junto al lápiz borra la tarea para siempre. |
| E8 | Al tocar "Nuevo tipo" dentro de "Nueva tarea" se cierra el formulario | TaskModal | Se pierde lo que se había escrito. |
| E9 | Recordatorios incompletos | lib/notifications.ts | Solo existen en la app nativa (en la web no hay ninguno), solo se programan al crear (no al editar la fecha) y no se cancelan al completar o borrar la tarea. |
| E10 | El temporizador de Enfoque se atrasa | Enfoque | Resta 1 segundo con `setInterval`; el navegador frena los intervalos en pestañas de fondo y el celular los detiene al bloquearse. Al terminar no suena ni avisa. |
| E11 | Pantallas sin control de sesión | Repaso, Materia, Nota, Visor | Abiertas sin sesión muestran una pantalla vacía en lugar de llevar al inicio de sesión. |
| E12 | El calendario de una materia muestra las tareas de todas las materias | Materias (computador) y Materia | Confunde: los puntos de colores no corresponden a la materia abierta. Ver `antes-materias-escritorio.png`. |
| E13 | Promedio "0.0" en materias sin calificaciones | Materias | Parece que se va perdiendo la materia. Debería decir "Sin notas". |
| E14 | Mensajes técnicos al estudiante | Oráculo, Nota, Capturar | "¿Desplegaste la función oracle y corriste la migración v3?" no le sirve a quien usa la app. |

### 2.2 Consistencia visual

- **Texto sobre el color de marca.** En 24 lugares es blanco y en 35 casi negro. El blanco no cumple el contraste mínimo (4.5) en ninguno de los 10 temas:

  | Tema | Blanco sobre marca | Oscuro sobre marca |
  |------|-------------------|--------------------|
  | Medianoche | 3.1 | 6.1 |
  | Carbón | 2.6 | 7.2 |
  | Bosque | 1.9 | 9.8 |
  | Océano | 2.1 | 8.8 |
  | Vino | 2.6 | 7.1 |
  | Papel | 4.3 | 4.4 |
  | Crema | 3.9 | 4.8 |
  | Cielo | 3.8 | 5.0 |
  | Rosa | 3.6 | 5.3 |
  | Menta | 3.4 | 5.6 |

  Propuesta: un color `onBrand` por tema, calculado y probado, y un solo componente de botón que lo use.
- **Verde y amarillo como texto en temas claros** quedan entre 3.1 y 3.6 (por ejemplo la etiqueta "Hoy" en amarillo). Hace falta una variante más oscura solo para texto.
- **Encabezados.** Hay tres versiones: el `Header` de celular (58 px arriba), el título de computador (26 px, márgenes 36/44) y el de pantallas de detalle (22 px con flecha). Oráculo en computador usa el de celular y queda desalineado (`antes-oraculo-escritorio.png`).
- **Estilos repetidos.** Materias, Enfoque y Capturar definen su propio `input`, `btn` y `lbl`. Se usan radios de 7, 9, 10, 11, 12, 14, 16, 18 y 20 px sin regla.
- **Emojis mezclados con íconos.** Hay emojis en títulos ("📸 Digitalizar apunte"), botones ("✨ Resumir", "🔮") y etiquetas. Se ven distinto en cada sistema y no toman el color del tema. Propuesta: íconos para la interfaz y emojis solo donde los elige el usuario (ícono de materia o proyecto).
- **Foco del teclado.** Aparece el contorno por defecto del navegador (amarillo o blanco) en campos y botones (`antes-bienvenida-celular.png`). Debe haber un anillo de foco propio, visible solo al usar teclado.
- **Fechas.** Materias en computador muestra "2026-10-14" mientras el resto dice "Ayer" o "En 2 días". Las tareas sin fecha muestran una etiqueta vacía (círculo sin texto, `antes-hoy-celular-abajo.png`).
- **Pestañas de materia.** En computador son subrayadas; en la pantalla de materia son botones grandes con "Calif." abreviado (`antes-materia-escritorio.png`).
- **Textos.** "1 notas", "Pendiente s hoy" (la palabra se parte en la tarjeta de resumen del celular).

### 2.3 Navegación y organización

- **Seis pestañas abajo.** Las guías de Apple y Google recomiendan entre 3 y 5. Capturar es una acción (tomar una foto), no un lugar al que se vuelve. Proyectos no tiene pestaña y solo se llega desde los accesos rápidos de Hoy.
- **Barra lateral invertida.** Arriba están Tipos de tarea y Personalizar (ajustes que se usan una vez) y abajo las secciones de todos los días.
- **Accesos rápidos de Hoy duplicados.** Capturar y Oráculo ya son pestañas, Buscar ya está en el encabezado y Nueva tarea ya es el botón flotante.
- **Hoy sobrecargado.** Promedio y racha no ayudan a decidir qué hacer hoy. La semana y el calendario muestran lo mismo dos veces. Las tareas completadas ocupan tarjetas completas al final.
- **El botón flotante tapa contenido** (la papelera de la última tarea en `antes-hoy-celular-abajo.png`).

### 2.4 Formularios e interacción

- Las tareas personales solo tienen fecha; las de proyecto ya tienen hora desde v11. La lista de Hoy agrupa por día y no puede ordenar por hora.
- No hay una forma rápida de anotar una tarea; siempre se abre el formulario completo.
- Cada tarjeta muestra lápiz y papelera, lo que añade ruido y facilita borrar por error. Tocar la tarjeta ya abre la edición.
- Capturar en computador pone "Tomar foto" como botón principal aunque casi ningún computador tiene cámara a mano; no se puede arrastrar ni pegar una imagen.
- Personalizar obliga a "Guardar y aplicar" y luego recarga toda la app y vuelve al inicio; no hay vista previa en vivo.
- Las notas en computador ocupan todo el ancho (más de 1300 px por línea), incómodo para leer (`antes-nota-escritorio.png`).
- Repaso en computador estira la tarjeta a todo el ancho y no tiene atajos de teclado (`antes-repaso-escritorio.png`).
- En Buscar las tareas encontradas no se pueden abrir y no se buscan las tareas de proyectos.
- No hay estados de carga (la lista aparece de golpe) ni pantallas de error con "Reintentar".

### 2.5 Accesibilidad

- Íconos de 17 a 18 px con margen de toque de 8 px dan unos 34 px; el mínimo recomendado es 44 px.
- Contraste ya descrito en 2.2.
- Varios botones no tienen `accessibilityLabel` ni rol (chips de filtro, tarjetas de proyecto).
- El tamaño de interfaz se aplica con `zoom` del documento, lo que funciona en web pero no respeta el tamaño de letra del sistema en el celular.

### 2.6 Técnica que afecta el diseño

- Hoy, Materias, Enfoque y Capturar tienen dos versiones completas (computador y celular). Los arreglos se hacen en una y se olvidan en la otra: los puntos de ciclo del Pomodoro solo están en celular, las capturas recientes solo en computador.
- Hoy define componentes dentro de la función de render, que se vuelven a crear en cada cambio.
- `app/proyectos/[id].tsx` tiene 1516 líneas.
- La web no es instalable: no hay favicon, ícono, `manifest` ni color de tema. En el celular se ve como una página y no como una app.
- `app.json` todavía tiene `com.tuusuario.kaderno` como identificador.

## 3. Propuesta: sistema de diseño común

Una sola fuente de verdad en `components/ui/` y `lib/theme.ts`:

- **Colores semánticos nuevos:** `onBrand`, `onBad`, `focus`, `overlay`, `goodText`, `warnText`, `badText` por tema, con una prueba automática que exige contraste mínimo de 4.5 en cada tema.
- **Tipografía:** 12, 13, 15, 17, 22 y 28 px, con pesos 500, 600 y 800. Números tabulares en horas y contadores.
- **Espaciado:** 4, 8, 12, 16, 24, 32 (ya existe `S`, se haría obligatorio).
- **Radios:** 8 controles, 12 tarjetas, 16 hojas y diálogos, redondo para etiquetas.
- **Componentes:** `Button` (principal, secundario, discreto, peligro), `IconButton` con área de 44 px, `Field` (etiqueta, ayuda y error), `Card`, `ListRow`, `Badge`, `SegmentedTabs`, `EmptyState`, `Skeleton`, `PageHeader` y `Screen`.
- **Diálogos y avisos propios** (`Dialog`, `Sheet`, `Toast` con "Deshacer") que funcionan igual en web y celular y reemplazan todos los `Alert.alert` y `window.confirm`.
- **`Screen`** monta la barra lateral en computador en todas las pantallas (incluidas las de detalle), limita el ancho de lectura y pone el encabezado correcto según el tamaño.
- **Íconos:** Ionicons en versión contorno para la interfaz.

## 4. Propuesta: navegación

Celular, cinco pestañas (ver `propuesta-hoy-celular.png`):

| Pestaña | Contenido |
|---------|-----------|
| Hoy | Agenda del día, tareas por vencer, clase actual |
| Materias | Lista de materias y, como segunda vista, el Horario |
| + (centro) | Hoja para agregar: tarea rápida, digitalizar apunte, nota en blanco, importar del sílabo |
| Estudiar | Enfoque, Repaso y Oráculo en un solo lugar |
| Proyectos | Lista y tableros |

Computador (ver `propuesta-hoy-escritorio.png`): Hoy, Materias, Horario y Proyectos arriba; sección "Estudiar" con Enfoque, Repaso, Oráculo y Capturar; abajo el usuario con Ajustes (personalización, tipos de tarea, cuenta y cerrar sesión). Buscar con atajo Ctrl K.

## 5. Cambios por pantalla

**Hoy.** Encabezado con la fecha y una línea de resumen ("2 para hoy · 1 vencida · Parcial de Cálculo en 2 días"). Tarjeta "Ahora" con la clase actual y la siguiente, tomadas del horario, y botón para empezar a enfocarse. Semana como filtro de una sola fila. Lista agrupada (Vencidas, Hoy, Mañana, Esta semana, Más adelante, Sin fecha) con filas compactas: materia, tipo, hora y avance de pasos. Las tareas de proyecto en la misma lista con su responsable. Completadas plegadas. Sin lápiz ni papelera en cada fila: tocar abre la tarea; deslizar o el menú "⋯" ofrece completar, mover de fecha y borrar con deshacer. En computador, columna derecha con agenda del día, repaso pendiente y enfoque. Promedio y racha pasan a Estudiar y a Materias.

**Agregar (+).** Campo que entiende texto simple ("parcial cálculo viernes 10am" se convierte en examen de Cálculo II el viernes a las 10). Se resuelve en el teléfono sin IA, con reglas para materias, días, horas y tipos; si no entiende algo lo deja en el título.

**Formulario de tarea.** Hora opcional. Materia preseleccionada si se abre desde una materia o con un filtro activo. Recordatorio con opciones según la hora ("1 hora antes", "la noche anterior", "2 días antes"). Crear un tipo nuevo dentro del mismo formulario sin cerrarlo.

**Materias y Materia.** Una sola pantalla de detalle para computador y celular, con pestañas iguales (Tareas, Notas, Calificaciones, Archivos). Calendario filtrado por la materia. Fechas relativas. "Sin notas" en lugar de 0.0. Menú con editar, archivar y exportar. Horario como segunda vista de Materias en el celular.

**Nota.** Ancho de lectura máximo de unos 720 px, barra lateral en computador, guardado automático con indicador ("Guardado hace 5 s"), y acciones de IA (resumir, flashcards, preguntar al Oráculo) en una barra fija.

**Capturar.** En computador: arrastrar o pegar una imagen o un PDF como acción principal. Varias fotos por nota (un capítulo de varias páginas). Capturas recientes también en el celular.

**Estudiar (nuevo centro).** Enfoque con el temporizador basado en la hora real (no se atrasa), sonido y notificación al terminar, y elección de una tarea para sumarle el tiempo. Repaso con tarjetas de ancho limitado, atajos (espacio para voltear, 1 y 2 para responder) y conteo por materia. Oráculo con un historial por alcance y mensajes de error entendibles.

**Horario.** Se mantiene casi igual (es la pantalla mejor resuelta). Se agrega la línea de "ahora" y la exportación al calendario del teléfono.

**Proyectos.** Se mantiene la estructura de v11. Se alinea el encabezado con el resto, la caja de código para unirse pasa a un botón "Unirme con código" y el menú de acciones de celular se ordena igual que en computador.

**Buscar.** Barra lateral en computador, resultados que se pueden abrir (incluidas tareas personales y de proyecto), y paleta de comandos con Ctrl K que también permite saltar a cualquier pantalla o crear una tarea.

**Ajustes (nuevo).** Junta Personalizar (con vista previa en vivo, sin recargar), Tipos de tarea, preferencias de Hoy, cuenta (nombre, contraseña, exportar mis datos, borrar cuenta) y Cerrar sesión.

**Inicio de sesión y bienvenida.** El inicio de sesión ya está bien resuelto. La bienvenida se cambia por tres pasos cortos que piden lo mínimo para que Hoy no quede vacío: crear las primeras materias, cargar el horario (o saltarlo) y anotar la primera entrega.

## 6. Funciones nuevas propuestas

Tamaño: P pequeño (1 a 2 días), M mediano (3 a 5 días), G grande (más de una semana).

| # | Función | Por qué | Tamaño |
|---|---------|---------|--------|
| F1 | App instalable (PWA): ícono, pantalla completa, carga sin conexión de la carcasa | Hoy la app vive en la web; instalarla en el celular la hace sentir nativa sin pasar por tiendas | P |
| F2 | Recordatorios reales en web y celular (notificaciones push con Supabase y un aviso diario opcional por correo) | Hoy en la web no llega ningún aviso | M |
| F3 | Hora en tareas personales y agenda del día que mezcla clases, entregas y bloques de estudio | Es lo que permite la tarjeta "Ahora" y ordenar el día | M |
| F4 | Agregar con texto simple ("parcial cálculo viernes 10am") | Anotar una entrega en 3 segundos, en clase | M |
| F5 | Importar entregas del sílabo: pegar el cronograma o subir CSV, revisar y confirmar | Reutiliza el importador y el prompt para IA de v11, ahora para tareas personales | M |
| F6 | Suscripción de calendario (.ics) para ver entregas y clases en Google Calendar o Apple | Muchos estudiantes ya viven en su calendario | M |
| F7 | Pomodoro ligado a una tarea, con tiempo estimado contra real | Saber cuánto toma de verdad un taller o un informe | P |
| F8 | Plan de estudio para un examen: reparte sesiones en los días previos según los temas | Convierte "Parcial en 2 días" en bloques concretos en la agenda | G |
| F9 | Repaso con repetición espaciada (SM-2 en lugar de cajas simples), crear y editar tarjetas a mano, mazos por materia | Las tarjetas solo se crean con IA y no se pueden corregir | M |
| F10 | Promedio del semestre ponderado por créditos y simulador "¿qué necesito en el final?" para todas las materias | Ya existe por materia; falta la vista global | P |
| F11 | Comentarios y menciones en tareas de proyecto, aviso cuando te asignan algo | El trabajo en grupo hoy se coordina por fuera de la app | M |
| F12 | Vista de calendario del proyecto con inicio y entrega (aprovecha `start_at` y `due_at` de v11) | Ver solapamientos y el camino a la entrega final | M |
| F13 | Papelera de 30 días para tareas, notas y materias | Borrar sin miedo | P |
| F14 | Resumen semanal (domingo): tareas hechas, horas de enfoque, lo que viene | Hábito y sensación de avance | P |

Propuesta de alcance para v12: F1, F2, F3, F4, F7 y F13 junto con las fases 1 a 3. F5, F6, F9 y F10 en v13. F8, F11, F12 y F14 después.

## 7. Hoja de ruta

| Fase | Contenido | Tamaño |
|------|-----------|--------|
| 1. Arreglos visibles | E1 a E14, color `onBrand`, `Dialog` y `Toast` con deshacer, `Screen` con barra lateral en todas las pantallas, cerrar sesión, archivar materia, barra inferior sin recortes | M |
| 2. Sistema y navegación | Componentes de la sección 3, cinco pestañas, Ajustes, nuevo Hoy, una sola versión adaptable de Hoy, Materias, Enfoque y Capturar | G |
| 3. Pantallas | Materia y Nota unificadas, Estudiar, Capturar con arrastrar y pegar, Buscar con Ctrl K, bienvenida en tres pasos | G |
| 4. Funciones v12 | F1, F2, F3, F4, F7, F13 | G |
| 5. Siguiente versión | F5, F6, F9, F10 y luego F8, F11, F12, F14 | G |

Cada fase se entrega como una rama y un PR separados, con capturas antes y después, para que puedas probarla en el droplet antes de seguir.

## 8. Decisiones que necesito

1. **Navegación.** (a) Cinco pestañas como en la sección 4 (recomendado). (b) Mantener las seis actuales y solo agregar Proyectos a la barra lateral y a Hoy.
2. **Emojis.** (a) Íconos en toda la interfaz y emojis solo en materias y proyectos (recomendado). (b) Dejar los emojis como están.
3. **Resumen de Hoy.** (a) Quitar promedio y racha de Hoy y llevarlos a Estudiar y Materias (recomendado). (b) Dejarlos en Hoy en una fila más pequeña.
4. **Notificaciones push.** Requieren crear un par de llaves (VAPID) como secreto en Supabase, una función programada y pedir permiso al usuario. ¿Las incluimos en v12?
5. **Alcance de funciones.** ¿Estás de acuerdo con el alcance de la sección 6 para v12 o quieres mover alguna?
6. **Temas.** Se ajustarán los colores de los 10 temas para que cumplan el contraste. Los cambios serán leves (sobre todo verde y amarillo en temas claros). ¿De acuerdo, o prefieres reducir el número de temas?

## 9. Cómo se va a probar

- Prueba automática de contraste para todos los temas (falla si algún par baja de 4.5).
- Pruebas visuales con Playwright de cada pantalla en 1440 y 390 px, con el Supabase simulado usado en esta revisión.
- Prueba del intérprete de texto simple (F4) con casos reales en español: "mañana", "el viernes", "10am", "a las 6 de la tarde", nombres de materias abreviados.
- Las pruebas existentes (`npm test` y `tests/run_sql.sh`) deben seguir pasando.

## Anexo: capturas

| Archivo | Qué muestra |
|---------|-------------|
| antes-hoy-escritorio.png | Hoy en computador |
| antes-hoy-celular.png | Hoy en celular: primera pantalla sin tareas y etiquetas cortadas abajo |
| antes-hoy-celular-abajo.png | Etiqueta vacía en "Sin fecha" y botón flotante sobre la papelera |
| antes-hoy-claro-celular.png | Tema Papel |
| antes-materias-escritorio.png | Calendario de materia con tareas de otras materias y fechas en formato técnico |
| antes-materia-escritorio.png | Pantalla de materia sin barra lateral y con otras pestañas |
| antes-nota-escritorio.png | Nota a todo el ancho y sin barra lateral |
| antes-buscar-escritorio.png | Franja vacía donde debería estar la barra lateral |
| antes-repaso-escritorio.png | Tarjeta estirada y sin barra lateral |
| antes-oraculo-escritorio.png | Encabezado de celular en computador |
| antes-enfoque-escritorio.png | Enfoque en computador |
| antes-horario-celular.png | Horario en celular |
| antes-proyecto-celular.png | Tablero en celular |
| antes-nueva-tarea-celular.png | Formulario de tarea |
| antes-bienvenida-celular.png | Bienvenida con contorno de foco del navegador |
| antes-personalizar-escritorio.png | Personalizar sin barra lateral |
| propuesta-hoy-celular.png | Boceto del nuevo Hoy y de la hoja "Agregar" |
| propuesta-hoy-escritorio.png | Boceto del nuevo Hoy en computador con la nueva barra lateral |
