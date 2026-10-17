# PLAN v17: Mascotas de estudio

Estado: fases 1, 2 y 3 construidas (rama `v17-mascotas`, PR #8). De la fase 3 queda pendiente solo la ropa de temporada. Diseño en el canvas "Mascotas de Kaderno" y el prototipo "Mascotas pixel de Kaderno".

## 1. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Especies iniciales | Pingüino, gato, perro y loro |
| Moneda | Una por especie: pescados, ovillos, huesos y semillas |
| Cuánto habla | "Solo cuando importa" por defecto; "Conversador" como opción |
| Varias mascotas | Se elige una gratis al empezar; las demás se adoptan con monedas y se cambia entre ellas |
| Arte | Pixel art propio de 32 x 32 (no se parece a mascotas conocidas) |
| Movimiento | Se mueve por la pantalla: camina, salta, se puede arrastrar y soltar |

Consecuencia de "una moneda por especie": cada mascota tiene su propio saldo, nivel y ropa. Lo que se gana lo gana la mascota activa. La ropa se compra con la moneda de la mascota que la va a usar y es solo suya. Adoptar se paga con la moneda de la mascota activa.

## 2. La mascota en pantalla

- Camina sola por el borde de abajo: en el celular, sobre la barra de abajo; en el computador, al pie de la pantalla (a la derecha del menú lateral).
- Pasea a ratos: camina, se detiene, mira a los lados, a veces se sienta. Nunca se queda parada encima del botón +; cuando lo tiene en el camino, lo salta.
- Se puede agarrar y arrastrar. Al soltarla cae con gravedad (y se aplasta un poco al llegar). Si cae sobre una tarjeta, se queda arriba paseando por el borde y después se baja de un salto. Al hacer scroll, salta al piso.
- Los avisos (toasts), menús y diálogos quedan siempre por encima de ella.
- Al cambiar de pantalla sigue donde estaba (es la misma mascota, no se vuelve a montar).
- Ajuste "Movimiento": "Pasea" (por defecto) o "Quieta en su esquina". Con "reducir movimiento" del sistema empieza quieta y solo cambia de cara.
- Cambia de ánimo según lo que pasa:

| Ánimo | Cuándo |
|---|---|
| Normal | En reposo |
| Feliz | Terminas una tarea, un pomodoro o todo lo del día (da dos saltitos) |
| Concentrado | Durante un enfoque: se va a su esquina y no habla |
| Preocupado | Hay vencidas o un parcial en menos de 2 días sin repaso |
| Dormido | Después de las 11 pm o tras 10 min sin actividad; se despierta al tocar algo |

- Tocarla abre su globo: el mensaje actual y accesos rápidos ("¿Qué hago ahora?", "Empezar enfoque", "Preguntarle al Oráculo", "Tienda"). El globo la sigue mientras camina.

## 3. Qué dice y cuándo

Habla por algo que pasó, nunca por un temporizador al azar. El contenido es el mismo para las cuatro; cambia el tono.

| Situación (disparador) | Pingüino | Gato | Perro | Loro |
|---|---|---|---|---|
| Abres la app con vencidas | "Hay 1 vencida. Empecemos por ahí." | "Esa tarea ya venció. Ella no se va a hacer sola." | "¡Una vencida! ¡La sacamos ya!" | "¿Vencida? ¿Vencida? ¿La hacemos?" |
| Paseas por pantallas sin hacer nada (3 cambios en 2 min sin acción) | "Elige una sola. La más corta es el quiz, 20 min." | "Mucho mirar, poco hacer. ¿El quiz? Son 20 min." | "¡Vamos con la más fácil! ¡El quiz!" | "¿El quiz? ¿20 minutos? ¿20 minutos?" |
| Tarea sin tocar hace 3 días | "Dividámosla en pasos." | "Lleva 3 días mirándote." | "¡Partámosla en pedacitos!" | "¿Pasos? ¿Hacemos pasos?" |
| Terminas todo lo de hoy | "Día completo. Bien hecho." | "No está mal. Nada mal." | "¡LO LOGRASTE!" | "¡Listo! ¡Listo!" |
| Parcial en 3 días | "El parcial es el lunes. 15 min de repaso hoy." | "El lunes hay parcial. Solo digo." | "¡Repasemos para el lunes!" | "¿Parcial? ¿Repasamos?" |
| Racha en riesgo (después de las 8 pm) | "Faltan 10 min para no perder la racha." | "Tu racha cuelga de un hilo." | "¡No perdamos la racha!" | "¿Racha? ¿10 minutos?" |
| Muy tarde | "Ya es tarde. Mañana seguimos." | "Hasta yo tengo sueño." | "¡A dormir, campeón!" | "¿Dormir? Dormir." |

Además:
- Una frase del día al primer arranque (banco de 60 frases cortas, sin repetir en 30 días).
- Técnicas contra la procrastinación cuando se detecta el paseo sin acción: regla de los 2 minutos, empezar por lo más pequeño, pomodoro corto de 10 min.
- "¿Qué hago ahora?" elige con reglas simples: vencidas primero, luego lo que vence hoy, luego lo de mayor peso; si hay parcial cerca, repaso.

Reglas para que no moleste:
- Solo cuando importa: máximo un mensaje espontáneo cada 45 min. Conversador: cada 20 min, con más frases.
- Nunca durante un enfoque ni con un diálogo abierto.
- Silenciar por hoy, o apagar la mascota del todo, en su menú y en Ajustes.
- Sin culpa: la mascota no se enferma ni se muere; si no estudias, solo se duerme.

## 4. Progreso

### Ganancias (para la mascota activa)

| Acción | Monedas |
|---|---|
| Minuto de enfoque completado | 1 |
| Tarea terminada a tiempo | 5 |
| Tarea terminada tarde | 2 |
| 10 tarjetas de repaso | 3 |
| Todo lo de hoy listo | 10 |
| Racha diaria | 5 por día de racha, hasta 35 |

Contra trampas:
- Tope de 300 por día.
- Cada tarea paga una sola vez en la vida (desmarcar y marcar no vuelve a pagar).
- Una tarea creada y marcada en menos de un minuto no paga.
- Saltar un pomodoro a mitad guarda solo los minutos hechos.
- Las ganancias las registra la base con funciones del servidor a partir de lo que ya guarda (sesiones de enfoque, `completed_at`, repasos); el navegador no puede sumarse monedas.

### Nivel

- La experiencia es todo lo ganado por esa mascota (gastar no la baja).
- Nivel n necesita 50 × n × (n − 1) de experiencia acumulada: 2 = 100, 3 = 300, 4 = 600, 5 = 1.000, 6 = 1.500, 10 = 4.500.
- El nivel desbloquea prendas de la tienda.

### Tienda (primera tanda)

| Prenda | Lugar | Precio | Nivel |
|---|---|---|---|
| Gorro de lana | Cabeza | 60 | 1 |
| Corbatín | Cuello | 80 | 1 |
| Collar con placa | Cuello | 100 | 1 |
| Gafas de estudio | Ojos | 120 | 1 |
| Bufanda | Cuello | 150 | 2 |
| Boina de artista | Cabeza | 200 | 2 |
| Audífonos | Cabeza | 250 | 3 |
| Gafas de sol | Ojos | 300 | 4 |
| Birrete | Cabeza | 500 | 6 |
| Corona | Cabeza | 1.000 | 10 |

Adoptar: la segunda 600, la tercera 1.000, la cuarta 1.500 (moneda de la mascota activa).

Ritmo esperado: con 1 hora diaria de enfoque y 2 tareas, unas 80 monedas por día. Primera prenda el día 1, segunda mascota en una semana y media, corona en unos dos meses.

## 5. Arte y animación

- Pixel art en `lib/pets/art.ts`: cada mascota es una cuadrícula de 32 x 32. Se dibuja la mitad izquierda y se refleja; encima van capas para lo que no es simétrico (cola del gato y del perro, mancha del perro, cresta, pico y cola del loro), los ojos según el ánimo, las patas y la ropa.
- La ropa son cuadrículas pequeñas que se colocan en tres anclajes (cabeza, ojos y cuello); la misma prenda le sirve a las cuatro.
- Cuadros: quieto, respira, parpadeo, 4 de caminar, salto, agarrado, cae y 2 de dormir. `petSheet` los pone en fila para animarlos con CSS `steps()`.
- Salida como texto SVG (un trazo por color, `crispEdges`): unos 3 a 4 KB por cuadro, nítido en tamaños múltiplos de 32 (64, 96, 160). En web se usa como imagen de fondo; en celular, con `SvgXml`.
- Para mirar a un lado se voltea la imagen y las pupilas se corren un píxel.

### Motor de movimiento (`lib/pets/motion.ts`)

- Estados: quieto, camina, en el aire (salto o caída), agarrado, duerme.
- Física simple: gravedad, velocidad de caminar de unos 36 px/s, salto calculado para pasar el botón + con margen.
- Superficies: el piso (borde de abajo) y las tarjetas marcadas como "se puede pisar". Las tarjetas son de un solo sentido: se sube cayendo desde arriba y se baja atravesándolas.
- Rendimiento: un solo `requestAnimationFrame` que solo mueve `transform` (sin recalcular la página); camina un rato y descansa; se detiene del todo cuando la app no está a la vista o la mascota está quieta en su esquina.
- El prototipo "Mascotas pixel de Kaderno" tiene este motor funcionando y sirve de referencia.

## 6. Datos (schema_v16.sql)

```sql
pets (id, user_id, species, name, outfit jsonb, coins int, xp int, active bool, created_at)
  -- unique (user_id, species); un solo active por usuario
pet_ledger (id, user_id, pet_id, delta int, reason text, ref text, created_at)
  -- unique (user_id, reason, ref): una misma tarea o sesión no paga dos veces
pet_items (user_id, pet_id, item text, bought_at)  -- unique (pet_id, item)
```

Funciones del servidor (security definer, con RLS):
- `pet_adopt(species, name)`: la primera gratis; las siguientes descuentan de la mascota activa.
- `pet_award(reason, ref)`: calcula cuánto corresponde según la regla, valida tope diario y duplicados, suma monedas y experiencia a la mascota activa.
- `pet_buy(item)`: valida nivel y saldo, descuenta y guarda.
- `pet_wear(slot, item)` y `pet_activate(pet_id)`.

Disparadores que llaman `pet_award`: al cerrar una sesión de enfoque, al pasar una tarea a hecha (por primera vez), al registrar repasos.

## 7. Pantallas y componentes

- `components/pets/PetBuddy.tsx`: la mascota, su globo y su menú. Montada una vez en el layout raíz, en una capa encima del contenido que solo captura toques sobre la mascota.
- `lib/pets/motion.ts`: el motor de movimiento (puro, sin React) para poder probarlo.
- `lib/pets/brain.ts`: decide ánimo y mensaje a partir de eventos (tareas, enfoque, navegación) con los límites de frecuencia. Puro y probado.
- `lib/pets/lines.ts`: frases por situación y especie, y el banco de frases del día.
- `app/mascota.tsx`: la mascota en grande, nombre, nivel, saldo, vestir (prendas compradas) y tienda (ropa y adoptar).
- Bienvenida: paso nuevo "Elige tu compañero" (opcional, se puede saltar).
- Ajustes: mascota activada, cuánto habla, silenciar por hoy, cambiar nombre.
- Oráculo (fase 3): la mascota como avatar y su tono en las respuestas.

## 8. Fases

1. **Compañero**: elegir mascota y nombre, mascota que camina y se arrastra, ánimos y animaciones, mensajes por eventos, frase del día, ajustes (incluido "Movimiento").
2. **Progreso**: monedas, nivel, tienda con las 10 prendas, vestir, adoptar y cambiar de mascota.
3. **Más**: Oráculo con la cara y el tono de la mascota, 14 logros calculados por la base (`pet_achievements`), la mascota se sube sola a las tareas. Pendiente: prendas de temporada.

## 9. Pruebas

- Unitarias: `brain.ts` (qué dice en cada situación, límites de frecuencia, silencio durante enfoque), `motion.ts` (salta el botón +, aterriza en tarjetas, se baja, no sale de la pantalla), arte (cada especie y prenda cabe en 32 x 32), cálculo de nivel, precios.
- SQL: `pet_award` no paga dos veces la misma tarea, respeta el tope diario, no deja comprar sin saldo o sin nivel, una sola mascota activa, RLS entre usuarios.
- Navegador: la mascota no se queda sobre el botón + ni tapa los avisos, se arrastra y cae, se calla en enfoque, se queda quieta con "reducir movimiento".
