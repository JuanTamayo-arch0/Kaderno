# PLAN v29: Kaderno en el celular

Pedido: revisar a fondo la versión para celular, porque puede ser donde más se use, y dejarla linda, fácil y cómoda.

## A. Cómo se revisó

- Las 31 pantallas, en Estudio y en Trabajo, a 390 px (iPhone 14/15), 360 px (Android común) y 320 px (iPhone SE de primera generación, el caso más angosto), con toque activado.
- Un script mide en cada pantalla:
  - lo que se sale por la derecha;
  - los botones con menos de 40 px de alto o de ancho;
  - los campos con letra menor de 16 px (el iPhone hace zoom al tocarlos);
  - los textos de menos de 12 px.
- Capturas desplazando cada pantalla hasta abajo, y de las hojas y menús (Agregar, Editar tarea, menú de una tarea, Oráculo, tablero, lista, calendario y equipo de un proyecto).

## B. Buenas prácticas que se tomaron como regla

1. **Tamaño de lo que se toca:**
   - Apple pide 44 x 44 pt y Material Design 48 x 48 dp.
   - WCAG 2.2 (2.5.8) exige como mínimo 24 x 24 px, o el espacio equivalente.
   - Regla para Kaderno: 44 px de área en celular, aunque el dibujo sea más pequeño.
2. **Campos de 16 px o más.** Con menos, Safari en iPhone acerca la pantalla al escribir y no vuelve sola.
3. **No bloquear el zoom con dos dedos** (accesibilidad). En el iPhone `maximum-scale=1` solo quita el zoom automático, porque iOS ignora ese límite para el zoom con dedos; en Android sí lo bloquea, así que va solo en iPhone.
4. **Áreas seguras:** `viewport-fit=cover` y `env(safe-area-inset-*)` en barras de arriba y abajo. Kaderno ya lo hace en la barra inferior y en las hojas.
5. **Alto de pantalla con `dvh`** en lugar de `vh`, que en el celular cuenta la barra del navegador.
6. **Teclado:**
   - `interactive-widget=resizes-content` para que en Android el contenido se acomode encima del teclado.
   - Mientras se escribe se esconde la barra de pestañas, como en las apps nativas.
   - Usar `inputmode` y `enterkeyhint` para que salga el teclado adecuado.
7. **Toque sin demora y con respuesta:**
   - `touch-action: manipulation` quita la espera del doble toque.
   - Se quita el recuadro gris de Android al tocar.
   - Lo tocado se ve presionado.
8. **Desplazamiento:** `overscroll-behavior: contain` en hojas y diálogos, para que al llegar al final no se mueva lo de atrás.
9. **Pulgar:** las acciones frecuentes abajo y al alcance. Kaderno ya tiene el botón + en el centro de la barra.
10. **Pistas de desplazamiento:** una fila que se desliza de lado debe dejar ver que hay más, con un borde que se desvanece.
11. **PWA:**
    - El manifiesto lleva `id`, categorías y capturas de pantalla, para la instalación enriquecida de Android.
    - `theme-color` sigue el tema. Esto ya existía.

## C. Lo que ya estaba bien

- Nada se sale por la derecha en ninguna pantalla, ni a 320 px.
- Barra inferior con el + al centro, áreas seguras y la rayita que sigue a la pestaña.
- Hojas que se cierran arrastrando hacia abajo (las de tarjetas), menú de tarea abajo y Agregar como hoja.
- Sin errores de consola en ninguna pantalla.

## D. Hallazgos

### Base (afecta a todas las pantallas)
1. 23 de las 31 pantallas tienen botones de menos de 40 px. Los peores son de 16 a 19 px:
   - "Mover a otra columna" y "Agregar tarjeta" en el tablero;
   - subir, bajar, editar y restablecer en Tipos;
   - borrar un registro en Horas;
   - mostrar la contraseña;
   - "Volver" en el proyecto (26 x 28).
2. 16 campos tienen letra de 14 o 15 px (correo y contraseña, buscar, Oráculo, nombre, minutos de Enfoque, solicitud pública...). En el iPhone hacen zoom.
3. Al tocar no hay respuesta visual en muchas filas y aparece el recuadro gris de Android.
4. Con el teclado abierto, la barra de pestañas ocupa lugar encima de él.

### Pantallas
5. **Horario:** la cuadrícula usa celdas de 24 px y deja la mitad de la pantalla vacía. Es difícil tocar la celda correcta.
6. **Encabezados con botones** (Tipos de tarea, Horas, Cobrar, Proyectos): a 320 px el título se corta ("Tipos de ...") o el subtítulo se recorta.
7. **Hoy, tarjeta de la mascota a 320 px:** el título se parte a mitad de palabra ("compañe ro").
8. **Cifras cortadas:** "0 sem..." en la racha semanal (Estudiar y Enfoque).
9. **Materias y Materia:** la fila de resúmenes corta la tarjeta de la derecha y los textos de ayuda ("Agrega tus evaluaciones con s...").
10. **Enfoque en pantallas bajas** (568 px): el reloj ocupa todo y "Empezar" queda debajo del borde.
11. **Estudiar a 320 px:** el botón de enviar del Oráculo se sale de su tarjeta.
12. **Horas a 320 px:** Semana o Mes y la semana elegida se aprietan en una sola línea.
13. **Tablero de proyecto:** las columnas no se acomodan al deslizar (sin "snap"). Los botones de mover y agregar son diminutos.
14. **Filas de chips que se deslizan** (Horas, Oráculo, filtros del proyecto): no se nota que hay más a la derecha.
15. **Login en pantallas bajas:** la franja de arriba ocupa casi media pantalla. En la app instalada en iPhone, el logo puede quedar debajo de la hora.
16. **Textos diminutos:** iniciales de avatar a 8,5 px, letras del mapa de la semana a 9,2 px y chips a 10,5 px.

## E. Fases (una PR por fase)

### Fase 1: base táctil
- Área de toque mínima de 44 px en pantallas táctiles, sin cambiar el dibujo.
- Sin zoom al escribir en iPhone, y campos de 16 px en celular.
- Toque sin demora, sin recuadro gris y con estado presionado.
- Barra de pestañas escondida mientras el teclado está abierto. `interactive-widget=resizes-content`.
- `dvh` en el contenedor principal y `overscroll-behavior: contain` en hojas y diálogos.
- Manifiesto con `id`, categorías y capturas para la instalación.

### Fase 2: pantallas
Arreglar los hallazgos 5 a 16.

### Fase 3: sensación de app
- La hoja de editar tarea y el menú de tarea se cierran arrastrando hacia abajo, como las demás hojas.
- Vibración corta al completar una tarea en Android (el iPhone no la permite en la web). Respeta "reducir movimiento".
- Desplazamiento con "snap" en filas de tarjetas.

## F. Lo que no conviene
- **Bloquear el zoom con dos dedos** en todos los equipos. Afecta a personas con baja visión.
- **Esconder la barra inferior al desplazar:** confunde y la barra tiene el +.
- **Hacer todos los botones de 44 px de dibujo.** Las pantallas se volverían pesadas. Se agranda el área, no el dibujo.
