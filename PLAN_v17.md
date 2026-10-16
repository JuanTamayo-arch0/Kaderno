# PLAN v17: Mascotas de estudio

Estado: diseño listo para revisar (canvas "Mascotas de Kaderno"). Arte en `lib/pets/art.ts`. Falta aprobar para construir.

## 1. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Especies iniciales | Pingüino, gato, perro y loro |
| Moneda | Una por especie: pescados, ovillos, huesos y semillas |
| Cuánto habla | "Solo cuando importa" por defecto; "Conversador" como opción |
| Varias mascotas | Se elige una gratis al empezar; las demás se adoptan con monedas y se cambia entre ellas |
| Arte | Propio, en SVG por capas (no se parece a mascotas conocidas) |

Consecuencia de "una moneda por especie": cada mascota tiene su propio saldo, nivel y ropa. Lo que se gana lo gana la mascota activa. La ropa se compra con la moneda de la mascota que la va a usar y es solo suya. Adoptar se paga con la moneda de la mascota activa.

## 2. La mascota en pantalla

- Vive en una esquina: abajo a la derecha en computador; en el celular, sobre la barra de abajo. Se puede arrastrar a otra esquina y se recuerda.
- Nunca tapa botones: deja libre el botón + y los avisos (toasts suben por encima de ella).
- Al cambiar de pantalla da un saltito hasta su lugar (sensación de que "se mueve" por la app).
- Respira y parpadea sola; cambia de ánimo según lo que pasa:

| Ánimo | Cuándo |
|---|---|
| Normal | En reposo |
| Feliz | Terminas una tarea, un pomodoro o todo lo del día |
| Concentrado | Durante un enfoque (y no habla) |
| Preocupado | Hay vencidas o un parcial en menos de 2 días sin repaso |
| Dormido | Después de las 11 pm o tras 10 min sin actividad |

- Tocarla abre su globo: el mensaje actual y accesos rápidos ("¿Qué hago ahora?", "Empezar enfoque", "Preguntarle al Oráculo", "Tienda").

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
- Una frase del día al primer arranque (banco de unas 120 frases cortas, sin repetir en 30 días).
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

## 5. Arte

- `lib/pets/art.ts`: cada especie en un lienzo de 160 × 160 con tres anclajes (cabeza, ojos, cuello). La ropa se dibuja centrada en (0, 0) y se coloca en el anclaje; la misma prenda le sirve a las cuatro.
- Salida como texto SVG: en web se inyecta tal cual; en celular, con `SvgXml`.
- Animaciones en CSS (`lib/motion.ts`): respirar (escala 1 a 1,03 cada 3,2 s), parpadear (cada 4 a 6 s), saltito al cambiar de pantalla, salto al celebrar, "z z" al dormir. Con "reducir movimiento", quieta.
- Peso: unos 2 KB por mascota; el módulo se carga después del arranque (no suma al tiempo de carga).

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

- `components/pets/PetBuddy.tsx`: la mascota flotante, su globo y su menú. Montada una vez en el layout raíz.
- `lib/pets/brain.ts`: decide ánimo y mensaje a partir de eventos (tareas, enfoque, navegación) con los límites de frecuencia. Puro y probado.
- `lib/pets/lines.ts`: frases por situación y especie, y el banco de frases del día.
- `app/mascota.tsx`: la mascota en grande, nombre, nivel, saldo, vestir (prendas compradas) y tienda (ropa y adoptar).
- Bienvenida: paso nuevo "Elige tu compañero" (opcional, se puede saltar).
- Ajustes: mascota activada, cuánto habla, silenciar por hoy, cambiar nombre.
- Oráculo (fase 3): la mascota como avatar y su tono en las respuestas.

## 8. Fases

1. **Compañero**: elegir mascota y nombre, mascota en pantalla con ánimos y animaciones, mensajes por eventos, frase del día, ajustes.
2. **Progreso**: monedas, nivel, tienda con las 10 prendas, vestir, adoptar y cambiar de mascota.
3. **Más**: Oráculo con la cara de la mascota, logros ("una semana sin vencidas"), prendas de temporada.

## 9. Pruebas

- Unitarias: `brain.ts` (qué dice en cada situación, límites de frecuencia, silencio durante enfoque), cálculo de nivel, precios.
- SQL: `pet_award` no paga dos veces la misma tarea, respeta el tope diario, no deja comprar sin saldo o sin nivel, una sola mascota activa, RLS entre usuarios.
- Navegador: la mascota no tapa el botón + ni los avisos, se arrastra y recuerda la esquina, se calla en enfoque.
