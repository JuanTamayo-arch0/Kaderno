# PLAN v26: dos espacios, marca propia y una interfaz que se mueva bien

Estado: propuesta. No hay nada construido todavía. Se apoya en v25 (PR #39 a #44), que debe fusionarse antes.

Junto a este plan hay un lienzo con lo visual: el Hoy en los dos espacios (interactivo: se cambia la dirección de marca, el espacio y claro u oscuro), las tres direcciones de marca y el historial de semestres.

## A. Lo que encontré en el código

1. **El modo Trabajo solo cambia nombres.** `lib/mode.ts` cambia el vocabulario (Materias por Áreas, Parcial por Entrega), pero las pantallas compartidas no consultan el modo:
   - La ficha de la materia o área (`app/materia/[id].tsx`) muestra en Trabajo la pestaña Calificaciones, el "Promedio actual", los créditos, "Clase de X ahora · Abrir apuntes de hoy", "Ponte a prueba antes del parcial" y "Próxima clase" en la columna derecha.
   - La lista de Áreas (`app/(tabs)/materias.tsx`) muestra "Promedio del semestre" y "Próxima clase".
   - Crear un área pide "Créditos: se usan para el promedio del semestre".
   - Hoy dice "Siguiente clase" y la invitación a la mascota habla de "compañero de estudio".
   - En "Los dos" no hay cómo saber si un área es una materia o un cliente: todas llevan calificaciones.
2. **Los semestres no existen como dato.** Las materias solo se archivan. El promedio del semestre se calcula con las materias activas, así que al archivarlas se pierde. El ritual "Empieza el semestre" solo guarda una fecha.
3. **No hay una marca fija.**
   - El logo de la barra es el ícono `book` de Ionicons sobre un cuadrado del color del tema, así que cambia con cada tema.
   - El ícono de la app es un libro genérico sobre #6c8cff, el azul por defecto de muchas apps.
   - Hay 11 temas y ninguno es "el de Kaderno".
   - La letra por defecto es la del sistema.
4. **Movimiento.** Hay un buen sistema en CSS (`lib/motion.ts`: entradas, hojas, rebote, salida de tareas), pero:
   - No hay transición al pasar de una lista a su detalle.
   - Al cambiar de tema, la página se recarga.
   - En el celular no hay gestos.
   - Varios estados vacíos son solo un ícono.
5. **Mascotas.** El pixel art de 32 x 32 se ve bien (4 especies, 17 prendas, 5 animaciones), pero:
   - Cada prenda se dibuja en el mismo punto para todas las especies, por ejemplo la gorra del gato y la del loro.
   - Las prendas no se mueven con el cuerpo.
   - Hay pocas expresiones.
   - No hay nada pensado para el trabajo.

## B. La idea central: dos espacios, una marca

En lugar de un modo que cambia nombres, Kaderno tendría dos **espacios**, Estudio y Trabajo. Cada espacio tiene su barra lateral, su Hoy, sus pantallas y su tema. Quien hace las dos cosas cambia de espacio con un control arriba de la barra lateral (como cambiar de cuenta) o con Ctrl+1 y Ctrl+2. "Los dos" deja de ser una mezcla: en el Hoy de un espacio aparece una línea con lo del otro espacio que vence hoy.

- Cada materia o área pertenece a un espacio: `subjects.space` ('estudio' o 'trabajo').
- La migración es así:
  - En modo Estudio, todo pasa a Estudio.
  - En modo Trabajo, todo pasa a Trabajo.
  - En "Los dos" se pregunta una sola vez con una lista. La sugerencia sale de si el área tiene créditos, calificaciones u horario de clase.
- Tareas, notas, Enfoque, Oráculo y Buscar siguen siendo uno solo, pero muestran lo del espacio abierto. Buscar tiene "en todo".

| | Estudio | Trabajo |
| --- | --- | --- |
| Lo principal | Materias: profesor, salón, créditos, calificaciones, parciales, simulacro, plan del parcial | Áreas y clientes: responsable, contacto, tarifa, cliente de Cobrar, horas, presupuesto, proyectos, actas |
| Calendario | Horario de clases | Agenda de reuniones |
| Herramientas | Repaso, Oráculo, Salas de estudio, Historial académico | Proyectos, Horas, Cobrar, Oráculo (con actas) |
| Mascota | Completa: monedas, frases, casa | Discreta por defecto: en una esquina, sin frases de estudio; se puede apagar |
| Ritual | Empezar y cerrar el semestre | Cerrar la semana (horas, cobros pendientes, estado de proyectos) |

Lo que sale de Trabajo:
- La pestaña Calificaciones y el promedio de la ficha del área.
- Los créditos.
- El promedio en Áreas.
- "Ponte a prueba antes del parcial" y el simulacro.
- "Clase de X ahora". Se vuelve "Reunión con X ahora" solo si viene de la Agenda.
- La invitación a la mascota como compañera de estudio.

## C. Historial de semestres (Estudio)

1. **Datos.**
   - Tabla `terms`: nombre (2026-2), inicio, fin, abierto o cerrado, fecha de cierre, resumen guardado (jsonb) y la línea de reflexión.
   - Cada materia queda con `subjects.term_id`.
   - Al crear la primera materia, o en el ritual de inicio, se pregunta qué semestre es. La sugerencia sale de la fecha: enero a junio es -1, julio a diciembre es -2.
2. **Cerrar el semestre** (asistente de 3 pasos):
   - Nota final de cada materia: sale de las calificaciones y se puede corregir. Estado: aprobada, reprobada, homologada o retirada.
   - Resumen automático: promedio ponderado por créditos, créditos aprobados, horas de enfoque por materia, tarjetas repasadas, racha más larga, mejor materia y lo que anotaste en "¿Cómo te fue?".
   - Una línea: "¿Qué te llevas de este semestre?".
   - Al terminar, las materias se archivan, el resumen queda guardado tal cual (no cambia si después borras algo) y se crea el semestre siguiente.
3. **Historial académico:**
   - Lista de semestres con su promedio y el promedio acumulado.
   - Una gráfica del promedio por semestre.
   - El detalle de cada semestre, con acceso a los apuntes y archivos de sus materias.
   - Un PDF sobrio del historial (Times New Roman, todo en negro).
4. **Semestres pasados:** "Agregar un semestre que ya terminó", a mano (materias, créditos y nota final), para que el acumulado esté completo. También se podría pegar el texto del portal de la universidad y que la IA lo ordene, con revisión antes de guardar.
5. Escala de 0 a 5 y aprueba con 3,0 por defecto; se puede cambiar en Ajustes.

## D. Marca

Propongo tres direcciones (están en el lienzo):

- **A. Margen (recomendada).**
  - El logo es la raya roja del margen del cuaderno junto a una K.
  - Colores: tinta #1B1D3A y papel #F7F4EE. El acento es coral #F2674E en Estudio y terracota #A9472F en Trabajo.
  - Letras: Plus Jakarta Sans en Estudio; Newsreader (títulos) e Inter (texto) en Trabajo.
  - Por qué la recomiendo: es la más propia (nadie usa el margen) y cuenta de dónde viene el nombre.
- **B. Renglón.**
  - El logo son renglones cruzados por una K.
  - Colores: índigo #4B47E8 y menta, con todas las letras sin serif.
  - Es la que menos cambia lo de hoy, pero se parece más a otras apps.
- **C. Pliegue.**
  - El logo es una hoja con la esquina doblada.
  - Colores: petróleo y resaltador amarillo, con Fraunces en los títulos.
  - Es la más editorial; el amarillo exige cuidado con el contraste.

Con la dirección elegida:
1. **Logo de verdad en SVG** (con `react-native-svg`, que ya está instalado). Reemplaza el ícono de la librería en la barra, la bienvenida, el inicio de sesión y las páginas públicas.
2. **Íconos de la app:** favicon, apple-touch, el ícono de 192 y 512, el ícono adaptable (maskable), la pantalla de carga y la imagen para cuando se comparte un enlace (los formularios y avances del cliente).
3. **Tokens de marca** en `lib/brand.ts`:
   - Tinta, papel y acento por espacio.
   - Escala de letra.
   - Radios por espacio.
   - Sombras.
   - Duraciones del movimiento.
4. **Personalizar sigue existiendo, por espacio.** La marca fija el logo (forma y colores), la tinta del texto y dónde está cada cosa; lo demás lo elige cada quien:
   - Claro, oscuro o como el sistema.
   - Color de acento. Estudio: coral (el de la marca), lápiz azul, hoja verde, uva, mostaza y rosa. Trabajo: terracota (el de la marca), acero, pino y ciruela. Cada uno trae su versión para claro y para oscuro, ya revisada en contraste.
   - Letra: la de la marca u otras dos por espacio.
   - Fondo de pantalla, solo en Estudio.
   - Los 11 temas actuales quedan en Personalizar > Más colores, solo en Estudio, y quien ya tenga uno elegido lo conserva.
   - El logo no cambia de color con el tema.
5. **Letras de la marca por defecto**, servidas desde el mismo servidor (no desde Google Fonts): carga más rápida y sin terceros.
6. **Documentos y páginas públicas** (cuenta de cobro, informes, solicitudes, avance) con el logo en negro y formato sobrio.
7. Una guía corta en `docs/marca.md`: logo, colores, letras, tono (cercano en Estudio, directo en Trabajo) y qué no hacer.

## E. Que el cambio entre espacios se sienta coherente

- **No cambia:** la forma del logo, la tinta, el espaciado (múltiplos de 4), los íconos, el lugar de cada cosa en la navegación y la forma de moverse.
- **Cambia:**
  - Los neutros: cálidos en Estudio, fríos en Trabajo.
  - El acento: coral en Estudio, terracota en Trabajo.
  - Los radios: 16 en Estudio, 10 en Trabajo.
  - Los títulos: letra redonda en Estudio, serif en Trabajo.
  - La densidad: Trabajo es un poco más compacto.
  - La mascota: visible en Estudio, discreta en Trabajo.
- **La transición:** al cambiar de espacio, los colores se funden en unos 400 ms, el contenido sale y entra escalonado, y la barra cambia sus opciones con un deslizamiento corto. Con "reducir movimiento" el cambio es inmediato.
- **Cómo se hace:**
  - Hoy la paleta `C` es un objeto que se reasigna, y en web se recarga la página al cambiar de tema.
  - En web pasaría a variables CSS (`C.bg = 'var(--kd-bg)'`): el cambio es instantáneo, se puede animar y no recarga.
  - En nativo, un contexto de tema que vuelve a pintar.

## F. Interfaz y movimiento

- **Transiciones entre pantallas:**
  - La tarjeta de una materia crece hasta ser su ficha.
  - La tarea abierta sale de su fila.
  - La nota se abre desde la lista.
  - En web se usa la View Transitions API donde exista, con la entrada actual como respaldo.
- **Listas que se reacomodan suave:** al completar, mover o filtrar, las demás filas se desplazan en vez de saltar (técnica FLIP).
- **Celular:**
  - Deslizar una tarea para completarla o pasarla a mañana.
  - Deslizar una hoja hacia abajo para cerrarla.
  - La barra de abajo con un indicador que se desliza.
  - Vibración corta en nativo al completar.
- **Detalles:**
  - Números que cuentan al cargar (horas, promedio).
  - Estados vacíos con la mascota o una ilustración de la marca.
  - Esqueletos de carga con la forma real de la pantalla.
- **Componentes:** botones, campos, chips, tarjetas y hojas con los tokens nuevos, todo desde `components/ds.tsx`.
- **Pantallas a rehacer primero** (por uso): Hoy, Materia o Área, Proyecto, Nota, Enfoque, Ajustes y Bienvenida.
- **Reglas:**
  - Solo se anima transform y opacidad.
  - Nada dura más de 300 ms, salvo el cambio de espacio.
  - Nada se mueve solo sin que la persona haga algo, menos la mascota.
  - Se prueba en un celular de gama media.

## G. Mascotas

- **Animación:**
  - Respiración y parpadeo al azar cuando está quieta.
  - Caminar en 6 cuadros (hoy 4).
  - Cola y orejas con movimiento propio.
  - Se encoge un poco al saltar y al aterrizar.
  - Mira hacia lo que señalas.
  - Expresiones nuevas: concentrada (en Enfoque), cansada (después de 2 horas seguidas), contenta (al terminar algo) y sorprendida (con un logro).
- **Prendas:**
  - Cada prenda tendrá un punto de apoyo por especie y por cuadro, así queda bien puesta en cada animal y se mueve con él.
  - Bufandas y capas con un leve retraso.
  - Capas delante y detrás del cuerpo.
  - Dos ranuras nuevas: espalda (mochila, capa) y mano (lápiz, taza).
  - Un juego de Trabajo (corbata, audífonos con micrófono, carné, taza, maletín) y uno de Estudio (birrete, mochila, lentes de lectura, lápiz en la oreja).
  - Las de temporada se rehacen con los puntos de apoyo.
- **Arte:**
  - Las 4 especies se repasan con la paleta nueva: contorno de tinta en vez de negro y sombra cálida.
  - Los muebles de la casa también.
- **En Trabajo:** modo discreto. La mascota se sienta en una esquina de la barra, no habla salvo al cerrar el día, y no gana ni gasta monedas allí.

## H. Fases (una PR cada una)

1. **Marca base:** tokens, logo en SVG, íconos de la app, favicon, pantalla de carga, letras propias, temas Kaderno claro y oscuro.
2. **Espacios:**
   - `subjects.space` y el selector de espacio.
   - La navegación por espacio.
   - La limpieza de todo lo de la sección B.
   - La migración con la pregunta única.
   - El tema de Trabajo.
   - Los colores en variables CSS con la transición entre espacios.
3. **Semestres:** `terms`, Cerrar el semestre, Historial académico, semestres pasados y el PDF.
4. **Movimiento e interfaz:** transiciones entre pantallas, listas que se reacomodan, gestos en el celular, estados vacíos, contadores y repaso de componentes.
5. **Mascotas:** puntos de apoyo, movimiento propio, animaciones nuevas, prendas de Estudio y de Trabajo, y el modo discreto.
6. **Pulido:**
   - Páginas públicas, documentos y Bienvenida con la marca.
   - Contraste de cada tema nuevo (4,5:1 en texto).
   - Prueba de rendimiento.

La fase 1 se ve de inmediato y no cambia datos. La 2 es la más grande y la que más arregla.

## I. Lo que no conviene

- Dos apps separadas: se perderían las tareas, notas y enfoque compartidos, y habría que mantener todo dos veces.
- Animar todo: cansa y gasta batería. El movimiento acompaña lo que la persona hace.
- Fondos con degradados en Trabajo: los fondos de pantalla actuales se quedan solo en Estudio.
- Cambiar el nombre: Kaderno ya tiene historia; lo que falta es la marca alrededor.

## J. Decisiones (22 de noviembre)

1. Marca: el estilo A (tinta, papel y margen). El logo está por elegir entre seis ideas en ese estilo (lienzo: "Seis logos en el estilo A").
2. Los 11 temas de colores quedan en "Más colores", solo en Estudio. Personalizar sigue existiendo en los dos espacios, como se describe en D.4.
3. Escala de notas: la ajusta cada persona según su institución (nota máxima, nota para aprobar y decimales). Se pregunta al crear el primer semestre, con 0 a 5 y 3,0 como sugerencia.
4. Mascota en Trabajo: discreta.
5. Orden de las fases: el de H.

## K. Decisiones tomadas al construir

1. (Fase 1) Logo: Margen (la idea 1 del lienzo).
2. (Fase 1) El cuadro del logo es de tinta sobre fondos claros y claro sobre fondos oscuros; la raya siempre es coral (terracota o cobre en Trabajo). No sigue al acento.
3. (Fase 1) Los errores usan un rojo distinto al coral (#FF5C70 en oscuro, #D6334A en claro) y siempre van con ícono o palabra.
4. (Fase 1) El paso a la marca es una sola vez y solo toca los valores de fábrica de antes (Medianoche y letra del sistema). Se marca con `brandV: 26` en los ajustes.
5. (Fase 1) La letra se sirve desde el mismo servidor y la página la precarga; las otras letras de Personalizar siguen viniendo de Google Fonts.
6. (Fase 1) Los íconos salen del mismo dibujo que la app (`lib/brand.ts`) con `scripts/brand-icons.ts`, para que nunca se desalineen.
