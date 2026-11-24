# 🚀 Runbook — De cero a Kaderno corriendo en tu celular

Guía paso a paso para dejar el **MVP completo funcionando en tu teléfono**. Está pensada para que la sigas de arriba a abajo sin saltarte nada. Al final tienes la app corriendo en Expo Go y las instrucciones para compilarla como app instalable.

**Qué vas a tener al terminar:** login, materias, tareas con fecha y recordatorios, vista "Hoy" unificada, captura de fotos con OCR (texto editable), horario editable y Pomodoro — todo con datos reales guardados de forma segura en Supabase.

**Tiempo estimado:** 45–90 min la primera vez (la mayoría es crear cuentas y esperar instalaciones).

---

## 0. El mapa

```
[App Expo en tu celular]  ──►  [Supabase]
   · React Native / Expo         · Postgres (con RLS: cada quien ve solo lo suyo)
   · corre vía Expo Go           · Auth (email + contraseña)
                                  · Storage privado (fotos de apuntes)
                                  · Edge Function "ocr" ──► modelo de visión (Claude)
```

---

## 1. Prerequisitos (instala/crea esto primero)

1. **Node.js LTS** (v20 o superior). Verifica en tu terminal:
   ```bash
   node -v
   ```
   Si no lo tienes, instálalo desde nodejs.org.

2. **La app Expo Go** en tu celular (App Store / Google Play). Es lo que te deja ver la app al instante escaneando un QR.

3. **Cuenta en Supabase** (gratis) → https://supabase.com

4. **(Para el OCR) Cuenta en Anthropic** con una API key → https://console.anthropic.com
   > El OCR es opcional para arrancar: si no lo configuras, la app te deja escribir el texto a mano. Puedes activarlo después (paso 6).

5. **Git** (opcional pero recomendado).

> Tu celular y tu computador deben estar en la **misma red WiFi** para que Expo Go conecte.

---

## 2. Usa el proyecto (ya viene armado — NO uses create-expo-app)

> **Sobre el error que viste** (`Invalid response from npm`): es un bug conocido del descargador de plantillas de `create-expo-app`, no de tu código. Además, la plantilla nueva (SDK 57) reorganiza todo dentro de una carpeta `src/`. Por eso este paquete **ya trae el proyecto completo, listo para instalar** — te saltas `create-expo-app` por completo. (Si algún día quieres generarlo tú, mira el Anexo A al final.)

Descomprime el ZIP. Ya tiene todo: `package.json`, `app.json`, `babel.config.js`, `tsconfig.json`, y las carpetas `app/`, `lib/` y `supabase/`. Estructura:

```
cuaderna-mvp/
├─ package.json        ← dependencias base (Expo SDK 57)
├─ app.json            ← config de la app (permisos de cámara, etc.)
├─ babel.config.js
├─ tsconfig.json
├─ .env.example        ← lo usarás en el paso 5
├─ app/                ← interfaz y navegación (Expo Router)
│  ├─ _layout.tsx  index.tsx  login.tsx
│  ├─ (tabs)/  (index, materias, capturar, horario, enfoque, _layout)
│  └─ materia/[id].tsx
├─ lib/                ← supabase, auth, db, notifications, theme
├─ supabase/           ← schema.sql y functions/ocr (para el backend)
└─ instalar-dependencias.sh
```

Entra a la carpeta:

```bash
cd cuaderna-mvp
```

---

## 3. Instala las dependencias

Desde `cuaderna-mvp`, un solo comando (el `package.json` ya trae TODAS las dependencias fijadas al SDK 57):

```bash
npm install
```

Si en algún momento ves un error de versiones o de plugin que "no se resuelve", corre el salvavidas:

```bash
bash instalar-dependencias.sh   # hace npm install + npx expo install --fix
```

> ⚠️ **Al actualizar el proyecto con un ZIP nuevo:** descomprimir reemplaza `package.json`. Después de descomprimir, corre `npm install` otra vez para reinstalar cualquier dependencia. Tu `.env` no se toca.

---

## 4. Configura Supabase (backend + seguridad)

1. Entra a https://supabase.com → **New project**. Ponle nombre, contraseña de base de datos y región cercana. Espera ~2 min a que aprovisione.

2. **Crea las tablas y la seguridad:** ve a **SQL Editor → New query**, abre el archivo `supabase/schema.sql` de este paquete, **pega todo su contenido** y dale **Run**. Esto crea las tablas, activa Row Level Security (cada usuario ve solo lo suyo) y crea el bucket privado de fotos.

3. **Verifica el bucket:** ve a **Storage** y confirma que existe un bucket llamado `notes` (privado). El SQL ya lo creó.

4. **Facilita el registro en desarrollo:** ve a **Authentication → Providers → Email** y, para probar rápido, **desactiva "Confirm email"**. Así puedes crear cuenta y entrar sin ir al correo. (Actívalo de nuevo antes de publicar.)

5. **Copia tus llaves:** ve a **Project Settings → API** y ten a mano:
   - `Project URL`
   - `anon public` key

---

## 5. Conecta la app con Supabase (.env)

En la raíz de `cuaderna`, crea un archivo llamado **`.env`** (copia el `.env.example`) y pon tus valores reales:

```
EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...tu-anon-key
```

> El prefijo `EXPO_PUBLIC_` es obligatorio para que la app las lea. Reinicia el servidor de Expo si ya estaba corriendo.

---

## 6. (Opcional pero recomendado) Activa el OCR real

El OCR corre en una **Edge Function** para que tu API key nunca esté en la app.

1. Instala la CLI de Supabase e inicia sesión:
   ```bash
   npm install -g supabase
   supabase login
   ```

2. Enlaza tu proyecto (el "ref" está en la URL del dashboard):
   ```bash
   supabase link --project-ref TU-PROJECT-REF
   ```

3. Guarda tu API key como secreto del servidor y despliega la función:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-tu-key
   supabase functions deploy ocr
   ```

La función (`supabase/functions/ocr/index.ts`) recibe la foto, la manda a un modelo de visión y devuelve el texto transcrito.

> Si te saltas este paso, la app funciona igual: al capturar una foto podrás escribir/pegar el texto a mano.

---

## 7. ▶️ Corre la app en tu celular

Desde `cuaderna`:

```bash
npx expo start
```

Aparece un **código QR** en la terminal.

- **Android:** ábrelo con la app **Expo Go** → *Scan QR code*.
- **iPhone:** escanéalo con la **cámara** y toca la notificación para abrir en Expo Go.

La app carga en tu teléfono en unos segundos. Cada vez que guardes un cambio en el código, se recarga sola (fast refresh). 🎉

---

## 8. Prueba el flujo completo

1. **Regístrate** con un correo y contraseña (paso 4.4 permite entrar sin confirmar).
2. Ve a **Materias → ＋ Nueva materia** y crea "Física", "Cálculo"…
3. En **Hoy**, toca el botón **＋** y crea una tarea con fecha y recordatorio.
4. Marca una tarea como hecha; bórrala; filtra por materia.
5. Ve a **Capturar**, toma una foto de una hoja → revisa el texto extraído → guárdalo como nota.
6. Abre esa materia y verás la tarea y la nota.
7. Arma tu **Horario** tocando celdas.
8. Prueba el **Pomodoro** en Enfoque.

Si algo falla, mira la sección 10.

---

## 9. Compila la app como instalable (cuando ya te guste)

Expo Go es para desarrollar. Para tener un **APK/AAB (Android)** o subir a **TestFlight (iOS)** usa EAS Build (nube de Expo, plan gratis para empezar):

```bash
npm install -g eas-cli
eas login
eas build:configure

# Android: genera un APK que puedes instalar en tu teléfono
eas build -p android --profile preview

# iOS (requiere cuenta de Apple Developer, USD 99/año)
eas build -p ios --profile preview
```

Al terminar te da un enlace para descargar el APK e instalarlo directo en tu Android. Para publicar en las tiendas: `eas submit`.

> Recuerda cambiar en `app.json` el `bundleIdentifier`/`package` (`com.tuusuario.kaderno`) por algo tuyo antes de compilar.

---

## 10. Problemas comunes y solución

- **"No arranca / pantalla en blanco":** confirma que existe `.env` con las dos variables y que reiniciaste `npx expo start` (para `.env` a veces ayuda `npx expo start -c` para limpiar caché).
- **El QR no conecta:** celular y PC en la misma WiFi. Si tu red los aísla, corre `npx expo start --tunnel`.
- **"Invalid login credentials":** revisa que desactivaste la confirmación de correo (paso 4.4) o confirma el email.
- **No guarda datos / error de permisos:** casi siempre es que no corriste el `schema.sql` completo o falta RLS. Vuelve a ejecutarlo.
- **La foto no sube:** el bucket `notes` debe existir y ser privado (lo crea el SQL). Verifica en Storage.
- **OCR falla:** revisa que desplegaste la función y pusiste `ANTHROPIC_API_KEY`. Mientras tanto, escribe el texto a mano.
- **Notificaciones:** en Expo Go pueden ser limitadas; funcionan mejor en un build de EAS (paso 9).
- **Vuelve a ver el error `Invalid response from npm`:** es de `create-expo-app`, que este paquete ya no usa. Si aun así quieres generarlo tú, mira el Anexo A.

---

## 11. Checklist final

- [ ] Node y Expo Go instalados
- [ ] Carpeta `cuaderna-mvp` descomprimida
- [ ] `npm install` y `bash instalar-dependencias.sh` sin errores
- [ ] `schema.sql` ejecutado en Supabase (tablas + RLS + bucket)
- [ ] Confirmación de correo desactivada (dev)
- [ ] `.env` con URL y anon key
- [ ] (Opcional) Edge Function `ocr` desplegada con su secreto
- [ ] `npx expo start` → QR → app abierta en el celular
- [ ] Flujo probado (registro, materia, tarea, captura, horario, pomodoro)

---

## 12. Siguiente nivel (v2, cuando el MVP ya te sirva)

- 🔑 Login con **magic link** o Google (más cómodo que contraseña).
- 🧠 **Resúmenes y flashcards con IA** desde tus notas + repaso espaciado.
- 📊 **Calificaciones y promedio** por materia ("qué necesito para pasar").
- 🔎 **Búsqueda global** en todas tus notas (el OCR ya deja el texto listo).
- ⏱️ **Estadísticas** de Pomodoro por materia.
- 📄 **Exportar a PDF** una materia o rango de notas.

---

## Anexo B — Activar las funciones nuevas (v2)

Si actualizaste el proyecto con la versión que incluye calificaciones, búsqueda, Pomodoro con estadísticas, resúmenes y flashcards con IA, y exportar a PDF, haz esto una sola vez:

1. **Nuevas tablas en Supabase.** Ve a **SQL Editor → New query**, pega todo el contenido de `supabase/schema_v2.sql` y dale **Run**. Es seguro aunque ya tengas la v1 (usa `IF NOT EXISTS`).

2. **Nuevas dependencias** (PDF). Dentro del proyecto:
   ```bash
   npx expo install expo-print expo-sharing
   ```
   (o vuelve a correr `bash instalar-dependencias.sh`, que ya las incluye).

3. **Edge Function de IA** (para resúmenes y flashcards). Usa la misma API key que ya configuraste:
   ```bash
   npx supabase functions deploy ai
   ```

4. Reinicia Expo (`npx expo start -c`) y listo. Encontrarás: búsqueda (lupa en Hoy), editar tarea (tócala), calificaciones y exportar PDF dentro de cada materia, materia + estadísticas en Enfoque, y en cada nota los botones ✨ Resumir y 🃏 Flashcards. El repaso aparece como tarjeta en Hoy cuando tengas flashcards para el día.

---

## Anexo C — Activar el Oráculo (chat IA sobre tus notas) y el buscador

El Oráculo responde preguntas usando tus apuntes. Funciona con **degradación elegante**: aunque no completes la parte semántica, responde mandando tus notas relevantes como contexto. Para la versión completa (búsqueda semántica entre muchas notas):

1. **Base de datos:** en Supabase → SQL Editor, pega y corre `supabase/schema_v3.sql`. Activa `pgvector`, crea la tabla de embeddings, la función de búsqueda y el historial del Oráculo. Corre también `supabase/schema_v4.sql` (adjuntos/diagramas), `supabase/schema_v5.sql` (archivos por materia) y `supabase/schema_v6.sql` (tipo de tarea) y `supabase/schema_v7.sql` (créditos por materia).

2. **Clave de embeddings (OpenAI).** La búsqueda semántica necesita embeddings, que Anthropic no ofrece; se usa OpenAI (cuesta centavos). Saca una API key en platform.openai.com y guárdala como secreto:
   ```bash
   npx supabase secrets set OPENAI_API_KEY=sk-...tu-key
   ```
   > Si te la saltas, el Oráculo igual funciona (modo respaldo con notas recientes); solo no habrá búsqueda semántica.

3. **Despliega la función:**
   ```bash
   npx supabase functions deploy oracle
   ```

4. **Indexa tus notas existentes:** abre la pantalla **Oráculo** en la app y toca **"⟳ Indexar mis notas"** una vez. Las notas nuevas se indexan solas al guardarlas.

Listo: tendrás la pestaña **Oráculo** (chat con alcance Todo / Materia / Nota y atajos Explícame, Quiz, Resumen, Conecta), el botón **"Preguntar al Oráculo"** dentro de cada nota, y el **buscador dedicado** (lupa/"Buscar…") que busca en notas, tareas, materias y flashcards.

---

## Anexo A — Si prefieres generar el proyecto con create-expo-app

No es necesario (este paquete ya es un proyecto completo), pero si quieres partir de la plantilla oficial y tuviste el error `Invalid response from npm`, prueba en este orden:

1. **Limpia la caché de npx y usa la última versión:**
   ```bash
   npx clear-npx-cache
   npx create-expo-app@latest cuaderna
   ```
2. **Actualiza npm** (el error suele venir de una versión vieja):
   ```bash
   npm install -g npm@latest
   ```
3. **Revisa que no tengas un registro personalizado** en `~/.npmrc` (una línea `registry=...` que apunte a un espejo/proxy corporativo). Debe ser el oficial:
   ```bash
   npm config get registry   # debe devolver https://registry.npmjs.org/
   ```
4. **O usa yarn**, que a veces evita el bug:
   ```bash
   yarn create expo-app cuaderna
   ```

Ojo: la plantilla del SDK 57 coloca el código en `src/app` (no en `app/` a la raíz). Si generas así, copia mis carpetas `app/` y `lib/` **dentro de `src/`** (quedan `src/app` y `src/lib`). Los imports relativos de mi código siguen funcionando sin cambios porque apuntan a `../lib`.

---

¡Éxitos, Tamayo! Si te trabas en cualquier paso, mándame el error exacto y lo resolvemos.

---

## Configurar Supabase en el servidor web (sin recompilar)

El build web carga `/kaderno-config.js` ANTES del bundle. Si ese archivo tiene
valores, ganan sobre los del `.env` con el que se compiló.

En el droplet:

```bash
nano /var/www/kaderno/kaderno-config.js
```

```js
window.KADERNO_CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...tu-anon-key',
};
```

Guarda y recarga con Ctrl+Shift+R (el navegador suele cachear ese archivo).
Si lo dejas vacío, la app usa lo que venía del `.env` al compilar.

Síntoma de que está mal configurado: al iniciar sesión sale
`CORS request did not succeed` apuntando a `placeholder.supabase.co`.
La pantalla de login ahora muestra además un aviso naranja/rojo explicándolo.

## Migraciones pendientes

Corre en Supabase → SQL Editor, en orden: `schema_v8.sql` (columna `type` en
assignments, arregla el 400 al crear tareas) y `schema_v9.sql` (tabla
`user_prefs` para sincronizar la personalización entre dispositivos).

**Para esta entrega hay que correr tres más** (los v8 y v9 ya los corriste):

1. `supabase/schema_v10.sql` — microtareas (`assignment_steps`), la columna
   `description` de las tareas y el bucket público `wallpapers` con sus
   políticas. Sin esto no se pueden crear microtareas ni subir el fondo propio.
2. `supabase/schema_v11.sql` — tabla `task_types` para los tipos de tarea
   propios. Sin esto la pantalla «Tipos de tarea» no puede guardar nada.
3. `supabase/schema_v12.sql` — **todo el módulo de Proyectos**: perfiles
   públicos, proyectos con columnas configurables, integrantes con rol,
   tarjetas, microtareas de tarjeta, bitácora de movimientos, el bucket
   `project-files` y las funciones `join_project` / `peek_project` /
   `regen_join_code`. Sin esto la pantalla «Proyectos» no carga nada.

Los tres son idempotentes: si los corres dos veces no pasa nada. Córrelos **en
orden** (v10 → v11 → v12).

> Después de correr el v12, la primera vez que cada quien abra la app se le
> crea su perfil público (nombre y correo) para que sus compañeros lo vean en
> el tablero. Las cuentas que ya existían se rellenan solas dentro del mismo
> script.

## Lo nuevo de esta entrega (Entrega A)

- **Colores por materia en «Hoy»**: cada tarea lleva el color de su materia.
- **Calendario dentro de «Hoy»**: la pantalla suelta de calendario desapareció.
  El punto de cada día ahora es por **materia**, y crece según cuántas tareas
  haya ese día.
- **Descripción y microtareas** en cada tarea, con barra de progreso porcentual.
- **Tipos de tarea propios** (menú lateral → «Tipos de tarea», o el acceso
  rápido «Tipos» en «Hoy»): crea, renombra, reordena, cámbiale ícono y color.
  Los cuatro originales (Tarea, Examen, Quiz, Proyecto) no se borran, pero se
  les puede cambiar nombre/ícono/color y volver al original con ↺.
  Al borrar un tipo propio, sus tareas pasan a «Tarea» (no se pierde ninguna).
- **Horario configurable** («Horario» → «Ajustar bloques»): tú defines los
  rangos de hora, cuántos días de la semana (Lun–Vie / Lun–Sáb / toda) y si
  quieres ver 12 h o 24 h. Hay un generador automático (de tal hora a tal hora,
  en bloques de 45/50/60/90/120 min) y también se pueden editar bloque por
  bloque. Las clases que ya tienes se mueven con su bloque; si quitas un bloque
  o días, la app te dice cuántas clases se van a perder antes de aplicar.
- **El fondo de pantalla propio ahora vive en Supabase Storage**: antes se
  guardaba la foto entera (base64) dentro de las preferencias, lo que hacía
  lenta cada carga. Ahora se sube al bucket `wallpapers` y sólo se guarda la
  URL, así se ve igual en el celular y en la web. Si ya tenías una foto
  guardada a la vieja usanza, se migra sola la primera vez que abras
  «Personalizar».
- Arreglos: los selectores de fecha/hora del navegador ya se leen bien en los
  temas claros (Papel, Crema, Cielo, Rosa, Menta), y los diálogos de confirmar
  en web ya muestran los botones (antes `Alert` los tragaba).

---

## Lo nuevo de esta entrega (Entrega B) — Proyectos

Proyectos es trabajo en grupo de verdad: un tablero compartido donde cada quien
ve qué le toca, en qué va el resto y qué falta para entregar. Se llega desde la
barra lateral («Proyectos») en escritorio, o desde los accesos rápidos de «Hoy»
en el celular.

**Entrar a un proyecto.** Cada proyecto tiene un **código de 6 letras** que se
dicta en voz alta (el alfabeto no usa 0/O ni 1/I/L para que nadie se equivoque).
Quien lo tenga lo escribe en «Proyectos» y entra como editor. El dueño puede
cambiar el código cuando quiera desde «Equipo», y el viejo deja de servir al
instante.

**Tablero kanban con columnas configurables.** Las columnas NO son fijas: cada
equipo arma las suyas desde el botón «Columnas» (agregar, renombrar, reordenar,
cambiar color, borrar). Una de ellas lleva la bandera **«Termina aquí»**: es la
que cuenta como terminado, y de ahí sale el porcentaje de avance y el panel de
carga. En escritorio las tarjetas se arrastran con el ratón; en el celular cada
tarjeta trae el botón ⇄ para mandarla a otra columna (el arrastre con el dedo no
existe en los navegadores móviles), y también se puede cambiar desde la tarjeta
abierta.

**Tarjetas.** Título, detalle, responsable, fecha de entrega y microtareas con
barra de progreso — igual que las tareas personales. Las tarjetas vencidas se
marcan en rojo y las de hoy en ámbar.

**Tres vistas.** *Tablero* (kanban), *Lista* (todo junto, ordenable por fecha,
responsable o columna, con filtro «Solo lo mío») y *Equipo*.

**Equipo** reúne cuatro cosas: el código de invitación, el **panel de carga**
(cuánto le tocó a cada quien, quién va atrasado, quién no tiene nada y cuántas
tarjetas están sin dueño), la administración de integrantes (pasar a solo mirar
o sacar del proyecto) y los **movimientos recientes**, que es la bitácora de
quién movió, terminó o creó qué.

**Roles.** El dueño manda; los editores mueven y crean tarjetas; quien está en
«solo mirar» ve todo pero no toca nada (la app se lo dice en el encabezado:
«· solo lectura»).

**Proyectos dentro de «Hoy».** Las tarjetas de equipo asignadas a ti aparecen en
los mismos grupos de urgencia que tus tareas personales (Vencidas, Hoy, Mañana,
Esta semana), con el color y el ícono de su proyecto, y llevan al tablero de un
toque. También cuentan en «Pendientes hoy» y en los puntitos de la semana. Si te
estorba, se apaga en **Personalizar → Pantalla de Hoy → «Mostrar tareas de
proyectos»**; esa preferencia se guarda en tu cuenta y viaja a tus otros
dispositivos.

**Proyecto ligado a una materia.** Al crear el proyecto puedes elegir a qué
materia pertenece: las tarjetas heredan ese color y el nombre de la materia sale
en el encabezado.

**Plantillas.** Al crear un proyecto puedes partir de una plantilla (por ejemplo
trabajo escrito o exposición) y el tablero nace con las tarjetas típicas ya
puestas, en vez de con una columna vacía.

**La barra lateral ahora también está fuera de las pestañas.** Antes, al entrar
a Proyectos, Buscar, Tipos o Personalizar, la barra de escritorio desaparecía y
quedaba una franja gris sin salida. Ahora Proyectos monta la misma barra, y en
celular tiene su flecha de volver.

**Y esas mismas cuatro pantallas ahora piden sesión.** Proyectos, Proyectos/[id],
Buscar, Tipos y Personalizar viven fuera del grupo `(tabs)`, así que no heredaban
el candado que sí tenían las pestañas: si se te vencía la sesión estando ahí (o
alguien abría el enlace directo sin haber entrado), la pantalla se pintaba vacía
y los botones fallaban en silencio, sin decir que el problema era la sesión.
Ahora las cinco pasan por `components/RequireAuth.tsx` y mandan al login.

### Cómo sincroniza (y qué falta para la v2)

Esta versión **no usa websockets**. El tablero se recarga solo cada vez que
vuelves a la pantalla (al cambiar de vista, al volver del navegador, al abrir la
app). En la práctica: si tu compañero mueve una tarjeta, la ves al volver a
entrar, no en el mismo segundo. El tiempo real queda para la v2.

También queda para después la **subida de archivos**: la tabla `project_files` y
el bucket `project-files` ya existen desde el v12 (así no hay que volver a tocar
la base), pero todavía no hay pantalla para usarlos.

---

## Probar Proyectos de verdad (receta con dos cuentas)

El módulo sólo se prueba bien con dos usuarios. Se puede hacer en un solo
computador: una cuenta en tu navegador normal y la otra en una **ventana de
incógnito** (son sesiones separadas).

1. **Ventana normal — cuenta A.** Entra a https://testssecurelocal.website/ con
   tu cuenta de siempre. Ve a **Proyectos → Nuevo proyecto**. Ponle nombre,
   ícono, color, elige una materia y una plantilla. Entra al proyecto.
2. En **Equipo**, copia el **código de 6 letras**.
3. **Ventana de incógnito — cuenta B.** Regístrate con otro correo (si tienes
   Gmail te sirve `tucorreo+prueba@gmail.com`, llega al mismo buzón). Entra a
   **Proyectos**, escribe el código y dale **Entrar**.
4. **Comprueba que B entró:** en la ventana de A, entra a **Equipo** y refresca
   (F5). Debe aparecer B en «Integrantes» y en el panel de carga con 0
   pendientes, y en «Movimientos recientes» un «se unió al proyecto».
5. **Reparte trabajo (A).** Crea dos o tres tarjetas y asígnale una a B con
   fecha de mañana. Fíjate en el panel de carga: mientras todo sea de A, debe
   avisar que **el reparto está disparejo**; al repartir, cambia a «El trabajo
   está bastante parejo».
6. **Comprueba en B.** Refresca la ventana de incógnito: en **Hoy** debe salir
   la tarjeta del proyecto dentro del grupo «Mañana», con el color y el ícono
   del proyecto. Tócala: te lleva al tablero.
7. **Mueve una tarjeta desde B** (arrastrando en escritorio, o con ⇄ en el
   celular) hasta la columna marcada «Termina aquí». En A, refresca: el
   contador del encabezado («2/7 hechas») sube, la tarjeta sale tachada y en
   «Movimientos recientes» aparece «B terminó "…"».
8. **Cambia las columnas (A).** Botón **Columnas** → agrega una llamada
   «Revisión del profe», muévela antes de «Hecho» y guarda. Las tarjetas se
   quedan donde estaban; ninguna se pierde. Mueve la bandera «Termina aquí» a
   otra columna y mira cómo cambia el porcentaje de avance.
9. **Prueba los roles (A).** En **Equipo**, ponle a B **«Pasar a solo mirar»**.
   Refresca en B: el encabezado dice «· solo lectura», desaparecen los botones
   de agregar y ya no se puede arrastrar nada.
10. **Cambia el código (A)** con «Cambiar código» y verifica que el anterior ya
    no deja entrar a nadie más.
11. **Saca a B del proyecto (A)** con la ✕. Refresca en B: sale la pantalla
    «Este proyecto ya no está disponible» con el botón para volver.

Si algo de esto no pasa, casi siempre es que **falta correr `schema_v12.sql`**
(síntoma típico: «Proyectos» carga vacío o suelta un error de permisos).

### Probar en el celular

Abre la misma dirección desde el navegador del teléfono. Cosas que conviene
mirar ahí: que Proyectos tenga su flecha de volver arriba a la izquierda, que el
tablero se deslice de lado y se asome la siguiente columna, y que cada tarjeta
tenga el botón ⇄ para moverla (con el dedo no se puede arrastrar; eso es del
navegador, no de la app).

---

## Entrega v11: importar, exportar y editar en masa (Proyectos)

### Antes de usarla: una migración

Corre `supabase/schema_v13.sql` en Supabase → SQL Editor. Necesita que el v12 ya esté corrido y, como los anteriores, se puede correr dos veces sin problema.

Si todavía no la corres, la app sigue funcionando igual; solo los botones nuevos avisan «Falta correr supabase/schema_v13.sql».

### Dónde está

Dentro de cada proyecto, arriba a la derecha: **Seleccionar**, **Importar** y **Exportar**. En el celular están en el botón **···**.

### Importar tareas

- Desde un **CSV** (Excel o Google Sheets, separado por `,` o `;`) o un **JSON**. También se puede **pegar el texto** directamente, por ejemplo la respuesta de una IA.
- Cada tarea puede traer título, descripción, columna, responsable (correo o nombre), inicio y entrega **con hora**, y checklist (ítems separados por `|`; `[x]` adelante marca un ítem como hecho).
- Antes de guardar se ve una **vista previa** fila por fila: errores en rojo (esas filas no se importan), avisos en amarillo, y un lápiz para corregir cada fila ahí mismo.
- Si una tarea ya existe (mismo título y misma entrega) se puede omitir, actualizar o crear igual.
- **Planéalo con IA**: copia un prompt que ya trae los integrantes, la materia, las columnas del tablero y la entrega final. Se pega en la IA con el enunciado y lo que devuelve se pega en el importador.
- Plantillas para descargar en CSV y JSON dentro de la misma ventana (también están en la carpeta `plantillas/`).

### Editar en masa

**Seleccionar** (o mantener presionada una tarjeta) y luego, en la barra de abajo: mover de columna, cambiar responsable, poner una entrega, **correr fechas** N días (inicio y entrega, o solo entrega; la hora se conserva) o borrar.

### Actualizar por archivo

**Exportar** baja el proyecto en CSV (se abre directo en Excel en español) o JSON, con una columna `id`. Se edita y se vuelve a subir con **Importar**: las tareas con `id` se actualizan, las filas sin `id` se crean. Nada se borra por faltar en el archivo; para borrar una tarea hay que escribir `sí` en la columna `eliminar`.

### Deshacer

Después de cada importación o cambio masivo aparece un aviso con **Deshacer** durante 20 segundos. Solo se puede deshacer el último cambio masivo del proyecto, y hasta 7 días después. Todo queda en «Movimientos recientes» (pestaña Equipo).

### Hora de entrega

Las tareas de proyecto ahora guardan la hora (`due_at`). En el computador, la ventana de cada tarea tiene un campo de hora junto a la fecha, y las tarjetas muestran la hora cuando no es la de por defecto (11:59 p. m.). La columna `due_date` sigue existiendo y se mantiene sincronizada, así que «Hoy» y lo demás no cambian.

### Pruebas

- `npm test`: lectura de archivos, fechas, columnas, checklist, exportar y volver a subir, correr fechas y el prompt.
- `bash tests/run_sql.sh`: corre `schema_v13.sql` sobre el `schema_v12.sql` real en un Postgres local, con cuatro usuarios (dueña, editor, viewer y alguien externo), y prueba permisos, deshacer y bitácora.

## Versión 12: nuevo diseño, avisos, calendario y más

### 1. Migración de la base de datos

Corre `supabase/schema_v14.sql` en Supabase, SQL Editor. Necesita los anteriores (incluido `schema_v13.sql`) y se puede correr dos veces.

Mientras no la corras, la app funciona como antes: sin hora en las tareas personales, sin papelera (borrar elimina de verdad), sin avisos y con el repaso de cajas. Ajustes y la Papelera lo indican.

### 2. Notificaciones push (opcional, pero recomendado)

1. Genera las llaves en tu computador (una sola vez):

   ```bash
   npx web-push generate-vapid-keys
   ```

2. En Supabase, Edge Functions, Secrets, crea:
   - `VAPID_PUBLIC_KEY`: la llave pública.
   - `VAPID_PRIVATE_KEY`: la llave privada (nunca en el repositorio ni en el droplet).
   - `VAPID_SUBJECT`: `mailto:tu-correo@ejemplo.com`.
   - `NOTIFY_CRON_SECRET`: un texto largo al azar (por ejemplo `openssl rand -hex 32`).

3. Despliega las funciones:

   ```bash
   npx supabase functions deploy notify --no-verify-jwt
   npx supabase functions deploy ical --no-verify-jwt
   ```

4. Programa el envío cada 10 minutos. En Supabase, Database, Extensions, activa `pg_cron` y `pg_net`, y corre en el SQL Editor (cambia `TU-PROYECTO` y el secreto):

   ```sql
   select cron.schedule('kaderno-notify', '*/10 * * * *', $$
     select net.http_post(
       url := 'https://TU-PROYECTO.supabase.co/functions/v1/notify',
       headers := jsonb_build_object('x-cron-secret', 'EL-MISMO-NOTIFY_CRON_SECRET')
     );
   $$);
   ```

5. En el droplet, agrega la llave **pública** a la configuración (la privada no va ahí):

   ```bash
   sudo nano /var/www/kaderno-app/shared/kaderno-config.js
   ```

   ```js
   window.KADERNO_CONFIG = {
     SUPABASE_URL: '...',
     SUPABASE_ANON_KEY: '...',
     VAPID_PUBLIC_KEY: 'la-llave-publica',
   };
   ```

Cada persona activa las notificaciones en **Ajustes, Avisos**. En iPhone primero hay que instalar Kaderno en la pantalla de inicio (Safari, Compartir, Agregar a inicio). Sin el paso 2 a 4 los avisos igual aparecen en la campana de la app, pero no llegan al celular.

Qué se avisa:
- El recordatorio que se elige en cada tarea (a la hora, 1 o 3 horas antes, la noche anterior, 1 o 2 días antes, 1 semana antes).
- Un resumen cada mañana (7 am por defecto, se cambia en Ajustes) cuando hay entregas o tareas vencidas.
- Un resumen el domingo a las 7 pm.
- Cuando te asignan una tarea en un proyecto y cuando una tarea de proyecto tuya vence en 24 horas.

### 3. Nginx: que el service worker no quede en caché

Para que las versiones nuevas lleguen sin tener que borrar la caché del navegador, agrega en el bloque `server` de Kaderno (junto a lo de `kaderno-config.js`):

```nginx
location = /sw.js              { add_header Cache-Control "no-cache"; }
location = /manifest.webmanifest { add_header Cache-Control "no-cache"; }
location = /index.html         { add_header Cache-Control "no-cache"; }
location = /kaderno-config.js  { add_header Cache-Control "no-cache"; }
```

Luego `sudo nginx -t && sudo systemctl reload nginx`.

### 4. Qué cambió en la app

- **Navegación**: en el celular, cinco botones abajo (Hoy, Materias, +, Estudiar, Proyectos). Horario está dentro de Materias; Enfoque, Repaso, Oráculo y Capturar dentro de Estudiar. En el computador, barra lateral con todo y la persona abajo (Ajustes).
- **Botón +**: agrega una tarea escribiendo ("parcial cálculo viernes 10am"), o abre una tarea completa, digitalizar, nota en blanco, importar del sílabo, proyecto o enfoque. Atajo: tecla `N`.
- **Ctrl K** (o `/`): busca en todo y salta a cualquier pantalla.
- **Hoy**: resumen del día, clase de ahora y siguiente, semana como filtro, tareas por cuándo vencen (las de proyectos incluidas), agenda del día, repaso y enfoque. Mantener presionada una tarea o tocar `···`: mover a hoy, mañana o la próxima semana, enfocarse o borrar.
- **Tareas**: hora opcional, aviso exacto, tiempo estimado, pasos, y crear un tipo nuevo sin salir del formulario. Borrar manda a la papelera con **Deshacer**.
- **Importar del sílabo** (botón + o Ajustes): pega el cronograma, una tabla de Excel o un CSV; si el sílabo está desordenado, copia el prompt para IA. Se revisa y se confirma; se puede deshacer todo.
- **Enfoque**: el reloj ya no se atrasa en segundo plano, sigue corriendo al cambiar de pantalla, suena al terminar, tiene descanso largo y se puede ligar a una tarea (el tiempo se suma a la tarea).
- **Repaso**: repetición espaciada con cuatro respuestas (Otra vez, Difícil, Bien, Fácil), atajos de teclado y "Mis tarjetas" para crear y corregir tarjetas a mano.
- **Materias**: tarjetas con pendientes, próxima entrega y promedio ("Sin notas" si no hay). La materia tiene simulador ("quiero sacar 4.0") y se puede archivar.
- **Estudiar**: promedio del semestre ponderado por créditos.
- **Notas**: se guardan solas mientras escribes; se pueden mover de materia.
- **Capturar**: varias páginas por nota; en el computador, arrastrar o pegar (Ctrl V) una imagen.
- **Ajustes**: nombre, contraseña, avisos, calendario (.ics), instalar la app, descargar tus datos, papelera y **cerrar sesión**.
- **Calendario**: Ajustes, Calendario, "Obtener mi enlace". Se pega en Google Calendar (Otros calendarios, Desde URL) o en el iPhone.
- **App instalable**: ícono propio, pantalla completa y carga sin conexión de la carcasa.
- **Accesibilidad**: todos los temas cumplen contraste 4.5 (prueba automática), botones de 44 px, anillo de foco al usar teclado.

### 5. Pruebas

- `npm test`: además de lo de v11, contraste de los 10 temas, agregar con texto, sílabo, recordatorios, fechas, agenda, promedios, SM-2 y el calendario .ics.
- `bash tests/run_sql.sh`: ahora también corre `schema_v14.sql` y prueba recordatorios, resúmenes, avisos de proyecto, papelera, permisos de la bandeja y el enlace de calendario.

## Versión 13: pasos sugeridos, archivos con versiones, calendario y ocultar en Hoy

### 1. Migración de la base de datos

Corre `supabase/schema_v15.sql` en Supabase, SQL Editor. Necesita `schema_v12.sql` (proyectos) y se puede correr dos veces. Crea la tabla `project_file_versions`, agrega a `project_files` la versión actual, la descripción y quién lo cambió por última vez, y deja los archivos que ya existían como versión 1.

Mientras no la corras, la pestaña Archivos de cada proyecto avisa que falta este paso y no deja subir.

### 2. Volver a desplegar funciones

```bash
npx supabase functions deploy ai
npx supabase functions deploy ical --no-verify-jwt
```

- `ai`: ahora también sugiere pasos (botón "Mejorar con IA" dentro de "Sugerir pasos"). Sin redesplegar, las sugerencias sin IA siguen funcionando.
- `ical`: responde a la prueba desde Ajustes, acepta el token también como `/ical/<token>.ics`, usa el horario por defecto si nunca lo cambiaste y avisa la zona horaria al calendario.

`supabase/config.toml` deja `ical` y `notify` sin verificación de JWT, así que aunque alguien despliegue sin la bandera no se vuelve a romper.

### 3. Calendario: "No se puede conectar mediante SSL"

El iPhone muestra ese mensaje ante cualquier fallo al suscribirse (y Google solo dice que no pudo agregarlo). El certificado de Supabase es válido; casi siempre la causa es que la función `ical` exige inicio de sesión (respuesta 401) o no está desplegada (404).

1. Despliega `ical` como en el paso 2.
2. En Kaderno, Ajustes, Calendario, toca **Probar enlace**: dice si funciona o qué falta.
3. Si quieres que el enlace salga por tu dominio (recomendado; termina en `.ics` y funciona aunque la verificación JWT quede activa):
   - Copia el bloque de `deploy/nginx-calendario.conf` dentro del `server { ... }` HTTPS de Kaderno, antes de otros `location ~`. Cambia `TU-PROYECTO` y `TU-ANON-KEY` (la llave pública; la service role nunca va ahí).
   - `sudo nginx -t && sudo systemctl reload nginx`
   - En `/var/www/kaderno-app/shared/kaderno-config.js` agrega `CALENDAR_URL: 'https://tu-dominio/calendario',`
   - Recarga Kaderno y toca **Obtener mi enlace**: ahora sale con tu dominio (el token es el mismo). Si ya habías pegado el enlace de Supabase en un calendario, quítalo y suscríbete con el nuevo.

Ajustes también trae botones para abrir el enlace directo en Google Calendar o en el iPhone/Mac (webcal), y **Descargar .ics** como plan B (una copia de hoy que no se actualiza sola).

### 4. Qué cambió en la app

- **Sugerir pasos** (en la ventana de una tarea personal y de una tarea de proyecto): lee la descripción y propone microtareas. Entiende listas, frases ("luego..."), "incluir A, B y C" y rangos ("ejercicios 1 a 15" se parte en tandas de cinco); si no hay descripción usa pasos típicos según el tipo (examen, informe, exposición, ensayo, lectura, taller, proyecto, video). Se agregan con un toque o todos a la vez. "Mejorar con IA" pide otras a la función `ai`.
- **Archivos del proyecto** (pestaña nueva junto a Tablero, Lista y Equipo):
  - Subir un archivo (hasta 25 MB). En el computador también se puede soltar sobre la lista.
  - Subir una versión nueva desde la fila, desde el historial o soltando el archivo sobre la fila. Si el nombre se parece a uno que ya está ("Informe_v2.docx", "Informe final corregido.docx"), Kaderno propone guardarlo como versión de ese.
  - Cada versión guarda una nota de qué cambió, quién la subió y cuándo.
  - Historial: ver, descargar o **restaurar** cualquier versión. Restaurar crea una versión nueva igual a la vieja; nunca se pierde nada.
  - Editar nombre y descripción, y eliminar el archivo con todo su historial (solo quien puede editar el proyecto).
  - Todo queda en la bitácora del proyecto. Quien solo mira puede ver y descargar.
- **Ocultar de Hoy**: en Hoy, el botón `···` de una tarea de proyecto (o mantenerla presionada) ofrece "Ocultar esta tarea de Hoy" u "Ocultar todo el proyecto de Hoy", con Deshacer. En la pantalla del proyecto está el botón "Ocultar de Hoy" / "Mostrar en Hoy". Solo cambia tu vista: la tarea sigue en el tablero para el equipo. Ajustes muestra cuántas hay ocultas y permite mostrarlas todas.

### 5. Pruebas

- `npm test`: además de lo anterior, pasos sugeridos, nombres y rutas de archivos, detección de versiones, enlaces y diagnóstico del calendario, zona horaria y horario por defecto en el .ics.
- `bash tests/run_sql.sh`: ahora también corre `schema_v15.sql` dos veces sobre un archivo viejo y prueba numeración automática, restaurar, historial que no se puede editar ni borrar, permisos de editor, viewer y extraños, y borrado en cascada.

## Versión 14: Hoy por materias o proyectos, tablero fluido, velocidad y animaciones

No hay migración de base de datos ni funciones nuevas que desplegar. Se publica como siempre (fusionar en `main`).

### 1. Nginx (recomendado, una sola vez)

Copia el contenido de `deploy/nginx-rendimiento.conf` dentro del `server { ... }` HTTPS de Kaderno y recarga:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Hace dos cosas: comprime el JavaScript (en Ubuntu, Nginx solo comprime HTML si no se le dice otra cosa; el JS pasa de unos 1,8 MB a unos 500 KB) y guarda un año los archivos del build, que llevan una huella en el nombre. Después de cada despliegue, `deploy/comprobar-sitio.sh` avisa si alguna de las dos cosas falta.

### 2. Qué cambió

- **Hoy: Todo, Materias o Proyectos.** Arriba de la lista hay un selector con el número de pendientes de cada lado. "Materias" esconde las tareas de proyectos; "Proyectos" muestra solo esas y cambia los filtros por proyecto. El resumen, la semana, la agenda y el calendario siguen la misma vista. Se recuerda entre dispositivos y es el mismo ajuste de "Tareas de proyectos en Hoy" en Ajustes.
- **Tablero.** El arrastre se rehízo:
  - Con ratón, la tarjeta se arrastra apenas se mueve; un clic sin mover la abre como siempre. Ya no hay que "seleccionarla" primero (mantener presionado activaba el modo seleccionar; ahora eso está solo en el botón Seleccionar).
  - En el celular, se mantiene el dedo un instante (0,2 s) y se arrastra; si el dedo se mueve enseguida, es scroll normal. El botón de mover sigue ahí como alternativa.
  - La tarjeta flota bajo el puntero, la columna de destino se ilumina y aparece un hueco del alto de la tarjeta donde va a caer. El tablero y la columna se desplazan solos cerca de los bordes. Esc cancela.
- **Velocidad.**
  - El primer arranque descarga un 35 % menos (de 769 KB a 500 KB comprimidos): cada pantalla se descarga cuando se abre y los íconos ya no traen las otras 15 familias que no se usan.
  - Al abrir Hoy se hacen 17 peticiones en vez de 27 (y un proyecto, 14 en vez de 30). Antes cada consulta preguntaba primero al servidor quién era el usuario (6 idas y vueltas en fila) y la app se remontaba entera al arrancar, así que todo se pedía dos veces.
  - Hoy y los proyectos se pintan al instante con lo de la visita anterior y se actualizan cuando llega lo nuevo. Esa copia vive en el navegador y se borra al cerrar sesión.
  - El service worker descarga en segundo plano el resto de pantallas y la fuente de íconos, y cada versión nueva limpia la caché de la anterior. Si se publica una versión con una pestaña abierta, la pestaña se recarga sola si le falta algún archivo.
  - Se abre la conexión con Supabase mientras carga la app.
- **Animaciones.** Entrada suave de cada pantalla y de las listas (escalonada), ventanas y menús que suben, avisos que suben desde abajo, botones y tarjetas que se hunden al presionar y se elevan al pasar el ratón, el círculo de tarea que rebota al marcarla hecha, barras de progreso e interruptores que se deslizan, y brillo en los esqueletos de carga. Todo dura entre 0,12 y 0,26 s y se apaga si el sistema tiene "reducir movimiento".

## Versión 15: importar sin duplicar, ordenar el tablero, sonidos y más velocidad

No hay migración ni funciones nuevas. Se publica al fusionar en `main`.

### 1. Importar ya no duplica

Antes, una fila sin `id` siempre se creaba como tarea nueva. Si una IA devolvía el plan completo sin ids (como el JSON de Zenit: 9 tareas con id y 59 sin id), cada importación volvía a crear las 59.

Ahora cada fila sin id se compara con lo que ya está en el tablero:
1. por el código al inicio del título (`H-009 · ...`, `HU12: ...`, `[RF-2] ...`), si ese código es único;
2. si no, por el título completo (sin tildes, mayúsculas ni signos).

Las que coinciden se **actualizan** (estado, descripción, responsable, fechas y checklist que vengan en el archivo). En la revisión se elige: actualizarlas (recomendado), dejarlas como están o crearlas otra vez. Probado con el JSON real: reimportarlo sobre un tablero que ya lo tiene crea 0 tareas.

Opción nueva al importar: **Reemplazar el tablero con este archivo**. Lo que está en el tablero y no viene en el archivo se borra. Se puede deshacer.

El prompt para la IA ahora pide conservar el `id` o el código del título al devolver tareas existentes.

### 2. Ordenar el tablero

Botón **Ordenar** en el proyecto (en el celular, en el menú `···`):
- **Quitar repetidas**: agrupa las tarjetas con el mismo código o título y deja una por grupo, la más trabajada (terminada, con responsable, con checklist avanzado; si empatan, la que estaba primero). Muestra la lista antes de borrar. Con el tablero de Zenit duplicado tres veces, deja de nuevo las 68.
- **Vaciar el tablero**: borra todas las tarjetas (columnas, archivos e integrantes se quedan).

Las dos se hacen en un solo lote con **Deshacer**.

Para limpiar el tablero actual: Ordenar, Quitar repetidas. Desde ahí, importar el JSON actualiza en vez de duplicar.

### 3. Movimiento y sonido

- Completar una tarea en Hoy: el círculo rebota con un anillo, la fila se tacha y se desliza fuera, y suena un "hecho" de dos notas. Si era lo último de hoy (incluidas las vencidas), confeti y arpegio.
- Pasos (checklist): tic al marcar, rebote del cuadro; en proyectos se marcan al instante (antes esperaban al servidor).
- Tablero: sonido al soltar una tarjeta; si cae en la columna final, suena como completada.
- Agregar con el botón +: burbuja que sube. Borrar: barrido grave. Errores: aviso corto.
- Pomodoro terminado: confeti.
- Los anillos de Enfoque y Estudiar avanzan suavemente en vez de saltar cada segundo.
- Los sonidos se sintetizan en el navegador (no se descargan archivos) y se apagan en **Ajustes, Sonidos**. En el celular también vibra un instante.

### 4. Velocidad

- Descarga inicial: 500 KB a 415 KB comprimidos (769 KB antes de la versión 14).
  - Markdown (notas y Oráculo), selector de imágenes y archivos se cargan solo cuando se usan.
  - Los anillos de progreso usan el SVG del navegador en vez de react-native-svg.
  - Se quitó el cliente de tiempo real de Supabase, que la app no usa (`metro.config.js`, `lib/stubs/realtime.js`).
- Tablero: una tarjeta solo se vuelve a pintar si cambió; arrastrar en tableros grandes ya no repinta todo.

## Versión 16: detalles de uso y otra pasada de velocidad

No hay migración ni funciones nuevas. Se publica al fusionar en `main`.

### Qué cambió

- **Buscar (Ctrl K):** al recorrer con las flechas, la lista se desplaza sola para que el elegido siempre se vea. Tiene botón para cerrar.
- **Agregar:** botón para cerrar arriba a la derecha.
- **Nueva tarea:** la fecha y la hora ya usan la misma letra que el resto (antes salían en Times).
- **Materia:** la imagen o el ícono de la materia aparece junto al nombre.
- **Calificaciones:** se pueden editar (tocar la evaluación o el lápiz): nombre, peso, nota y escala.
- **Proyectos:** un solo botón **Opciones** con un menú agrupado (Tareas: importar y exportar; Tablero: ordenar y columnas; Para mí). El antiguo "Ocultar de Hoy" se quitó de la cabecera: ahora está en Opciones, dice exactamente qué hace ("No mostrar mis tareas en Hoy") y solo aparece si tienes tareas asignadas en ese proyecto. En el celular, el mismo menú sale desde abajo.

### Velocidad

- Materias, Proyectos y cada materia también se pintan al instante con lo de la visita anterior (como Hoy y el tablero).
- Menos esperas en cadena: un proyecto pide todo a la vez (antes primero el proyecto y luego lo demás), la lista de proyectos ahorra una ida y vuelta, y Hoy trae las tareas de proyectos en la misma tanda que las tuyas.
- La lista de materias ya no descarga el texto de todas las notas (solo las cuenta).
- Las fotos de materias se guardan a 160 x 160 (unos 8 KB en vez de cientos). Las que ya estaban grandes se achican solas una vez al abrir la app.
- Google Fonts solo se pide si elegiste una fuente distinta de "Sistema".
- El service worker pide `kaderno-config.js` a la red sin caché y, si tarda más de 1,2 s o no hay conexión, usa la copia guardada (desde la versión 18; antes respondía siempre con la guardada y un cambio en el servidor solo se veía en la segunda apertura). Si la red tarda más de 1,5 s en entregar la página, se muestra la guardada.

## Versión 17: mascotas de estudio

### 1. Base de datos (una sola vez)

Correr `supabase/schema_v16.sql` en Supabase → SQL Editor → New query → Run. Es seguro correrlo dos veces. Requiere las migraciones v2, v9 y v14 (ya corridas).

Crea las tablas `pets`, `pet_ledger`, `pet_items`, `pet_daily` y `pet_reviews`, las funciones `pet_adopt`, `pet_buy`, `pet_wear`, `pet_activate` y `pet_rename`, y tres disparadores que pagan monedas:

- al marcar una tarea como hecha por primera vez (5 a tiempo, 2 tarde, 10 extra al terminar lo de hoy),
- al guardar una sesión de enfoque (1 por minuto, máximo 180 por sesión),
- al repasar tarjetas (3 por cada 10 tarjetas distintas del día).

El primer logro de cada día paga además la racha (5 por día seguido, hasta 35). Hay un tope de 300 por día. También crea `pet_achievements()`: calcula 14 logros con lo que ya hay en la base, paga cada uno una sola vez (aparte del tope diario) y devuelve el avance. Los logros cuentan desde que adoptas la primera mascota. El navegador no puede escribir en esas tablas: solo leer lo propio. Si los disparadores fallan, la tarea, el enfoque o el repaso se guardan igual (el error queda como aviso en el registro de Postgres).

Sin la migración la app funciona igual: la pantalla Mascota dice que falta activarla y no aparece ninguna mascota.

### 2. Oráculo con el tono de la mascota (opcional)

Para que el Oráculo responda con el tono de la mascota, volver a desplegar su función desde la carpeta del proyecto en tu PC:

```
npx supabase functions deploy oracle
```

Sin ese paso, el Oráculo ya muestra la cara y el nombre de la mascota, pero responde con su tono de siempre.

### 3. Qué cambió

- **Mascota:** pixel art de pingüino, gato, perro o loro. Se elige en la bienvenida (paso nuevo, opcional), desde la tarjeta en Hoy o en **Estudiar → Mascota**. La primera es gratis.
- **En pantalla (web):** camina por el borde de abajo (sobre la barra en el celular, al pie en el computador), se puede arrastrar y soltar encima de una tarea, celebra lo que terminas, muestra "+5" cuando gana y avisa de vencidas, parciales cercanos, racha en riesgo o paseos sin hacer nada. Durante un enfoque se va a su esquina y no habla. Se duerme tras 10 minutos sin uso.
- **Se mueve sola:** además de caminar, de vez en cuando se sube de un salto a una tarea que esté a la vista, pasea por encima y luego se baja.
- **Pantalla Mascota:** nivel, monedas, tienda de 10 prendas, adoptar y cambiar de mascota, logros, cómo se gana y ajustes.
- **Logros:** 14 (primera tarea, 25 y 100 tareas, una hora de enfoque en un día, 10 horas, rachas de 7 y 30 días, una semana sin vencidas, 100 tarjetas, 5 días completos, 3 prendas, las cuatro mascotas, niveles 5 y 10). Cuando consigues uno, la mascota lo celebra y ofrece verlo.
- **Oráculo:** la mascota aparece como quien responde (su cara junto a cada respuesta y "Pingu está pensando…") y, con la función al día, habla con su tono.
- **Importar cronograma:** así se llama ahora lo que antes era "Importar del sílabo" (Agregar, Ajustes, buscador y la pantalla).
- **Ajustes:** mostrar u ocultar, "Pasea" o "Quieta en su esquina", cuánto habla y silenciar por hoy.
- **Enfoque:** saltar un pomodoro a mitad ahora guarda solo los minutos hechos (antes guardaba el pomodoro completo).

### 4. Pruebas

`npm test` (arte, economía, frases, logros, cerebro y motor de movimiento) y `bash tests/run_sql.sh` (incluye `tests/sql/16_pruebas.sql`: pagos, tope diario, una sola vez por tarea, compras, adopciones, logros y aislamiento entre usuarios).

## Versión 18: la casa de la mascota y arreglos

### 1. Base de datos (una sola vez)

Correr `supabase/schema_v17.sql` en Supabase → SQL Editor. Requiere schema_v16. Es seguro correrlo dos veces.

Agrega `pets.home` (la casa de cada mascota), suma 16 cosas para la casa al catálogo de la tienda (`pet_buy` ahora vende ropa y casa) y crea `pet_home` para poner o quitar lo comprado. Sin la migración la app funciona igual; la pestaña Casa avisa que falta al intentar decorar.

### 2. Qué cambió

- **Casa de la mascota:** un cuarto en pixel art (pared, piso, ventana que cambia con la hora, escritorio y muebles). Sale arriba en el Oráculo y en **Mascota → Casa**, donde se compra y se decora: 4 papeles de pared, 3 pisos, 3 vistas y 6 muebles. Cada mascota tiene su casa y se paga con su moneda; al cambiar de mascota cambia la casa.
- **Filtros de materias:** en el computador bajan a otra línea en vez de cortarse; en el celular se deslizan y se desvanecen en el borde.
- **Recuadro al hacer clic:** el anillo de foco solo aparece al navegar con el teclado.
- **Mascota:** ya no tiembla sobre las tarjetas (dos tarjetas podían quedar con la misma clave al volver de Mascota u Oráculo). Ahora se sube también a las tarjetas de materias, notas, proyectos, Ajustes y al panel derecho de Hoy. El globo aparece directamente junto a ella.
- **Cambio de pantalla:** el velo oscuro sobre el fondo de pantalla y la barra lateral ya no desaparecen mientras carga la pantalla siguiente (hay una sola barra y un solo velo para toda la app). Además, las pantallas se descargan por detrás después de abrir la app.
- **Ajustes → Conexión → Probar conexión:** mide cuánto tarda el servidor en responder desde donde estás.

### 3. Si la conexión sale lenta: mudar Supabase de región

Supabase no permite cambiar la región de un proyecto existente. El camino es crear uno nuevo en la región más cercana (desde Colombia suele ser East US, Virginia) y pasar todo, siguiendo la guía oficial "Migrating within Supabase":

1. Crear el proyecto nuevo en la región elegida.
2. Pasar la base con `pg_dump` y `psql` (esquema, datos y usuarios de Auth), como dice la guía.
3. Copiar los archivos de Storage (buckets `wallpapers`, `project-files` y los demás).
4. Volver a poner los secretos de las funciones (`ANTHROPIC_API_KEY`, `VAPID_PRIVATE_KEY`, etc.) y desplegar las funciones en el proyecto nuevo.
5. En el droplet, cambiar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `/var/www/kaderno-app/shared/kaderno-config.js` (no hace falta recompilar).
6. Probar con "Probar conexión" y, cuando todo esté bien, pausar el proyecto viejo.

Conviene hacerlo con calma un fin de semana: mientras dura la copia, lo que se guarde en el proyecto viejo no pasa al nuevo.

## Versión 19: materias y notas

### 1. Base de datos (una sola vez)

Correr `supabase/schema_v18.sql` en Supabase → SQL Editor. Requiere schema.sql y schema_v14. Es seguro correrlo dos veces.

Agrega a `subjects` las columnas `teacher`, `room` y `link` (profesor, salón y enlace del aula virtual; el enlace solo acepta `http://` o `https://`) y a `notes` las columnas `pinned` (notas fijadas) y `updated_at` (última edición del título o el texto, la mantiene un disparador). Sin la migración la app funciona igual; al guardar profesor, salón o enlace, o al fijar una nota, avisa que falta.

### 2. Qué cambió

- **Página de la materia:** arriba, la ficha con profesor, salón, días de clase (del horario), créditos y aula virtual, y cuatro indicadores que no cambian al pasar de pestaña: promedio y lo que falta para pasar, próxima evaluación (con días y peso), pendientes y estudio de la semana (enfoque y tarjetas para hoy). Botones para enfocar en la materia, preguntar al Oráculo y crear tarea.
- **Columna derecha (computador):** próxima clase, calendario del mes, notas recientes con "Nota rápida" y archivos.
- **Tareas:** campo para escribir una tarea en una línea ("informe el jueves 6pm") y lista agrupada en vencidas, esta semana, más adelante y sin fecha.
- **Calificaciones:** barra con lo calificado, lo pendiente y lo que falta registrar, y cuánto aporta cada nota.
- **Notas (computador):** lista de la materia a la izquierda (buscador, fijadas y recientes) y la nota abierta al lado, con índice y "Estudiar esta nota" a la derecha en pantallas anchas. En el celular, la lista y luego la nota a pantalla completa.
- **Editor nuevo (web):** se lee y se edita en el mismo lugar, sin asteriscos a la vista. Barra de formato delgada, barra al seleccionar texto (incluye "Flashcards" y "Explicar" con el Oráculo), menú con "/", fórmulas con LaTeX (`$x^2$` en línea y `$$...$$` centradas, con vista previa), tablas, listas de tareas que se marcan aun leyendo, imágenes pegadas o arrastradas dentro del texto. Esc vuelve a la vista de lectura. Las notas se siguen guardando en Markdown: las viejas abren igual y el resumen, las flashcards, el Oráculo y el PDF siguen funcionando. Un "$20 y $30" no se toma como fórmula.
- **Letra de las notas:** en Personalizar se elige aparte (por defecto una serif de lectura).
- **Lista de Materias:** resumen del semestre arriba (promedio ponderado, pendientes, próxima entrega y próxima clase) y en cada tarjeta el profesor, los días y la clase de hoy o mañana.
- **PDF de la materia:** sale con títulos, negrillas, tablas, fórmulas e imágenes (antes salía el Markdown en bruto).

### 3. Notas técnicas

- El editor (TipTap + KaTeX) se descarga aparte solo al abrir una nota (unos 290 KB comprimido).
- Las fuentes y la hoja de estilos de KaTeX están en `public/katex/`. Si se actualiza `katex`, correr `node scripts/katex-assets.mjs`.
- Las imágenes dentro del texto quedan como `![](kd-img:<ruta>)` en el bucket `notes`, y se muestran con URL firmada.

### 4. Pruebas

`npm test` (incluye `tests/v19.test.ts`: días y próxima clase, próxima evaluación, grupos de tareas, orden y búsqueda de notas, índice, enlaces y PDF) y `bash tests/run_sql.sh` (incluye `tests/sql/18_pruebas.sql`).

## Versión 20 (parte 1): Enfoque con sonido de fondo y pausas guiadas

Primera entrega del plan v20 (secciones B y C de `PLAN_v20.md`). No necesita migración: las preferencias se guardan en el dispositivo y en `user_prefs.settings.ambient`.

### 1. Qué cambió

- **Sonido de fondo:** en la tarjeta del reloj, chips Silencio, Lluvia, Mar, Bosque, Río, Fuego, Ruido rosa y Ruido café. Un toque deja ese sonido solo; otro toque lo apaga. Con el reloj quieto, cada cambio suena 6 segundos para probarlo; con el reloj andando suena todo el pomodoro, entra en 3 s y sale en 2 s. Al pausar el reloj se apaga.
- **Mezclar:** hoja con un deslizador por sonido (incluye Viento), volumen general (35% por defecto), qué suena en el descanso (Silencio, Pájaros o Lo mismo) y hasta 3 mezclas guardadas con nombre.
- **Barra lateral:** junto al reloj, una nota musical que silencia el fondo hasta el siguiente pomodoro.
- **Mascota:** mientras suena el fondo, una nota musical flota sobre ella. Al empezar el descanso sugiere qué hacer (respeta "Silenciar por hoy").
- **Pausa guiada:** en el descanso, una sugerencia (estirar, tomar agua, mirar lejos, respirar, caminar...) que no se repite en el día, con "Hecho" y "Otra idea". No da monedas.
- **Anotar para después:** durante el enfoque, botón o tecla D. Enter guarda y vuelves a lo tuyo. En la pausa aparece "Anotaste N cosas para después", cada una con "Hacer tarea" (abre Agregar con el texto) o borrar.
- **Resumen del pomodoro:** en el descanso, minutos enfocados, distracciones anotadas y total del día.

### 2. Notas técnicas

- Los sonidos se generan en el navegador con Web Audio (`lib/ambient.ts`, recetas de ruido filtrado y modulado; pájaros sintetizados). No hay archivos de audio, así que no hay licencias que cuidar y funcionan sin conexión. Si más adelante se quieren grabaciones reales, se pueden sumar como otra receta.
- El volumen de cada sonido se igualó midiéndolo (entre -26 y -29 dBFS al 60% con volumen 35%) y hay un limitador al final para que no sature.
- Los navegadores solo dejan sonar después de un toque. Si se recarga la página con el reloj andando, aparece "Toca para activar el sonido" (cualquier toque sirve).
- En iPhone se pide `audioSession.type = 'playback'` para que suene con el interruptor de silencio activo. Si se bloquea la pantalla con la app instalada, el sonido puede pararse.

### 3. Pruebas

`npm test` (incluye `tests/v20.test.ts`: ruidos sin saturar, bucle sin salto, mezcla y chips, qué suena según el reloj, mezclas guardadas, pausas sin repetir, anotar para después y la mascota en la pausa).

## Versión 20 (parte 2): Enfocar juntos

Sección L de `PLAN_v20.md`: salas de estudio con compañeros.

### 1. Base de datos (una sola vez)

Correr `supabase/schema_v19.sql` en Supabase → SQL Editor. Requiere schema.sql, schema_v2, schema_v12 y schema_v14. Es seguro correrlo dos veces. Sin la migración la app funciona igual; la tarjeta "Enfocar juntos" avisa que falta.

Crea `study_rooms`, `study_room_members`, `study_room_join_tries` y la columna `focus_sessions.room_id`, las funciones `study_room_create`, `study_room_join`, `study_room_for_project`, `study_room_leave`, `study_room_update`, `study_room_new_code` y `study_room_people`, y las políticas de los canales de Realtime `sala:<id>` sobre `realtime.messages` (solo miembros escuchan y envían). Realtime no necesita otro ajuste: la app usa canales privados.

### 2. Qué cambió

- **Salas:** desde Enfoque, "Crear sala" (te da un código de 6 letras, sin I, O, 0 ni 1) o "Unirme con código". Desde un proyecto, Opciones → "Sala de estudio": entra cualquiera del equipo, sin código.
- **Invitar:** "Copiar enlace" (o "Invitar" en el celular). Quien abre el enlace entra directo; si no había iniciado sesión, entra después de iniciarla.
- **Quién está:** cada persona aparece como Enfocado (con los minutos que le quedan), Descanso, En la sala o Fuera. La sala activa sigue conectada mientras la app esté abierta, aunque cambies de pantalla.
- **Empezar juntos:** propones un pomodoro con tu duración; a los demás les llega un aviso con "Me uno". Los relojes arrancan 10 s después y todos terminan a la misma hora (quien se une tarde tiene menos minutos).
- **Meta del grupo:** "Juntos hoy: 6 de 8 pomodoros". Cuentan los pomodoros de 10 min o más terminados con la sala activa (máximo 24 por persona al día). Quien creó la sala cambia la meta.
- **Privacidad:** nadie ve en qué tarea estás, salvo que actives "Mostrar en qué tarea estoy".
- **Salir:** "Desconectarme" deja de mostrarte ahora; "Salir de la sala" te quita de la lista. Si sale quien la creó, la sala pasa a quien llegó primero; si sale la última persona, se borra.

### 3. Seguridad

- Nada se escribe directo en las tablas de salas: todo pasa por funciones `security definer` que revisan quién eres.
- Un pomodoro con `room_id` de una sala ajena se guarda sin sala (disparador).
- Unirse con código: 20 códigos equivocados por hora como máximo, 30 personas por sala, 10 salas propias.
- Lo que llega por el canal (propuestas, estados) se valida antes de usarse.

### 4. Notas técnicas

- `metro.config.js` sigue cambiando `@supabase/realtime-js` por un sustituto vacío para que la app abra liviana. Las salas cargan el cliente real por la ruta del archivo (`lib/realtimeLazy.ts`), en un pedazo aparte de unos 65 KB que solo se descarga al entrar a una sala.

### 5. Pruebas

`npm test` (incluye las pruebas de `lib/roomsLogic.ts` en `tests/v20.test.ts`) y `bash tests/run_sql.sh` (incluye `tests/sql/19_pruebas.sql`: crear, unirse, acceso desde afuera, pomodoros solo en tus salas, meta, dueño, sala del proyecto, tope de códigos, canales privados y salir).

## Versión 20 (parte 3): el patio de mascotas en la sala

No necesita migración: la especie y la ropa de la mascota viajan en la presencia del canal de la sala.

- **Patio:** arriba de la lista de la sala, un cuarto de estudio en pixel art con la mascota de cada quien (con su ropa) y su nombre. En la tarjeta "Enfocar juntos" de Enfoque sale en pequeño cuando hay dos o más mascotas.
- **Según el estado del dueño:** enfocado, la mascota va a su puesto y se queda quieta y concentrada, con los minutos que le quedan encima; en descanso juega: persigue a las otras que también descansan, salta y se pasan una pelota (solo si hay dos o más en descanso); en la sala sin reloj pasea; fuera, duerme donde estaba (se recuerda la última mascota que se le vio).
- **Saludar:** tocar la mascota de alguien la saluda: las dos saltan con un globo "¡Hola!". Si esa persona no está mirando la sala le llega un aviso, y si está enfocada se le muestra al terminar el enfoque. Máximo un saludo cada 10 s por persona.
- **Celebrar:** cada pomodoro que suma a la meta hace saltar a todas; al cumplir la meta celebran más rato con "¡Meta!".
- Tocar tu propia mascota la hace saltar y decir algo.
- Con "reducir movimiento" activado (o fuera de la web), las mascotas se muestran quietas en fila.
- Técnico: `lib/pets/patio.ts` (simulación pura, con pruebas) y `components/rooms/PetPatio.tsx` (anima con requestAnimationFrame escribiendo directo en el estilo, sin repintar React en cada cuadro; se pausa con la pestaña oculta).

## Versión 20 (parte 4): las mascotas de la sala sueltas por la pantalla

Reemplaza el patio de la pantalla de la sala. No necesita migración.

- **En la pantalla de la sala:** las mascotas de los compañeros (hasta 6) andan por toda la pantalla con el mismo motor de tu mascota: caminan por el piso, se suben a las tarjetas y saltan. Encima llevan el nombre (y los minutos si su dueño está enfocado). Tocarlas las saluda.
- **Según el estado del dueño:** enfocado, se va a la esquina de abajo, al lado de la tuya, y se queda quieta; descanso, juega: persigue a las otras que descansan, salta cerca y se pasan una pelota por encima de la pantalla (también con tu mascota si tú estás en descanso); en la sala pasea; fuera duerme.
- **En el resto de la app:** solo tu mascota, salvo que se active **Ajustes → Mascota → "Ver las mascotas de mi sala en toda la app"** (apagado por defecto). Con eso se ven hasta 3, sin nombre, sin hablar y sin capturar clics (los toques pasan a lo que hay debajo). Si tú estás enfocado, se quedan quietas en su esquina.
- Si apagas "Mostrar la mascota", tampoco aparecen las de la sala.
- La versión pequeña del patio sigue en la tarjeta "Enfocar juntos" de Enfoque cuando el ajuste está apagado.
- Técnico: `lib/pets/friends.ts` (controlador de varias mascotas en una capa propia, debajo de la tuya) reutiliza `PetMotion` y las funciones de mundo compartidas de `lib/pets/dom.ts` (piso, menú lateral, tarjetas y obstáculos). `components/pets/FriendPets.tsx` lo monta en el layout.

## Versión 20 (parte 5): Repaso nuevo

### 1. Migración

Vuelve a correr `supabase/schema_v19.sql` completo en el SQL Editor (es idempotente). La sección "FASE 1" agrega:

- Columnas nuevas en `flashcards`: `kind` (basic o cloze), `fsrs_state`, `stability`, `difficulty`, `due_at`, `suspended`, `source_heading`, `created_from`, `learning_steps`, `scheduled_days`.
- Migración de las tarjetas que ya existen: las que nunca se repasaron quedan como nuevas; las demás pasan a "repaso" con estabilidad y dificultad sacadas del SM-2 y vencen el mismo día que antes. Nadie pierde su avance ni recibe una avalancha.
- Tabla `flashcard_reviews` (un registro por respuesta, con RLS).
- Trigger que da monedas a la mascota por cada repaso (solo si ya existen las tablas de la mascota).
- Tabla `ai_usage` y función `ai_take`: tope diario de usos de IA por persona (30 generaciones de tarjetas al día).

La app vieja sigue funcionando: si alguien aún no tiene las columnas, Repaso usa el SM-2 de antes y muestra un aviso.

### 2. Función `ai`

Redespliega la función: `supabase functions deploy ai`. Ahora pide tarjetas básicas y de completar, evita repetir las que ya hay en la nota, valida lo que responde el modelo y aplica el tope diario (responde 429 con un mensaje claro al pasarlo). Usa `AI_MODEL` si existe; si no, `OCR_MODEL`.

### 3. Lo que cambia para el usuario

- **Repaso con FSRS:** cuatro botones (Otra vez, Difícil, Bien, Fácil) con el intervalo que da cada uno. Pasos cortos dentro de la sesión, nuevas por día (15 por defecto) y retención objetivo (85, 90 o 95 %) en **Ajustes → Estudio** o en el ícono de ajustes de Repaso.
- **Sesión:** deshacer (Z), editar (E), no mostrar más, saltar, escribir la respuesta antes de voltear (opcional), "Solo 5 minutos" y "Ver en la nota" (abre la nota en el título de donde salió la tarjeta).
- **Tarjetas de completar:** `{{respuesta}}` dentro del texto; también dentro de fórmulas.
- **Crear con IA:** antes de guardar se revisan en "Revisa tus tarjetas": se marcan las parecidas a otras que ya tienes, se puede rehacer una, quitarla o agregar a mano. Las nuevas entran poco a poco.
- **Mazos:** búsqueda, filtros (nuevas, difíciles, suspendidas), agrupadas por materia y nota, selección para mover, suspender o borrar.
- **Estadísticas:** retención de 30 días, repasos por día (12 semanas) y lo que viene en 30 días.
- **Parcial cerca:** con un parcial en 7 días o menos sale "Repaso intensivo" de esa materia.
- Hoy muestra cuánto tiempo toma el repaso del día.

### 4. Pruebas

`npm test` (FSRS, completar, duplicados, cola, lectura de la respuesta de la IA) y `bash tests/run_sql.sh` (incluye `tests/sql/19b_pruebas.sql`: migración de tarjetas viejas, sincronía de fechas, registro de repasos y RLS, monedas y tope de IA).

## Versión 20 (parte 6): rachas amables, "¿Cuándo lo haces?" y tu tiempo real

### 1. Migración y funciones

1. Vuelve a correr `supabase/schema_v19.sql` completo (es idempotente). La sección "FASE 2" agrega:
   - `study_days`: un día de estudio por persona, llenado por disparadores al guardar un enfoque, completar una tarea o repasar una tarjeta, y rellenado hacia atrás con lo que ya había.
   - `study_shields`, `study_streaks()` y `study_buy_shield()`: escudos (se ganan, se usan y se compran solo desde la base).
   - El premio de racha de la mascota pasa a contar días de estudio.
   - `assignments.plan_at` y `assignments.plan_place`, y `enqueue_plans()` dentro de `enqueue_all()` (aviso a la hora del plan).
2. Redespliega la función de avisos: `supabase functions deploy notify` (el aviso del plan trae el botón "Empezar enfoque").

Sin la migración la app sigue como antes: la racha vieja de Enfoque, sin "¿Cuándo lo haces?".

### 2. Lo que cambia para el usuario

- **Un solo día de estudio:** cuenta con 10 min de enfoque, 1 tarea hecha o 10 tarjetas. Funciona sin mascota.
- **Meta semanal (racha principal):** "estudiar N días por semana", 4 por defecto, en **Ajustes → Estudio → Meta semanal**. Se ve en grande cuántas semanas seguidas la cumples, con los siete puntos L M M J V S D en Hoy, Estudiar y Enfoque. La racha diaria queda más pequeña.
- **Escudos:** uno gratis cada 7 días seguidos (máximo 2) o por 80 monedas de la mascota. Se usan solos: si ayer faltaste y hoy estudias, ese día queda protegido.
- **Reparar:** si la racha se rompió hace 1 o 2 días sin escudo, Hoy muestra "Te saltaste un día: no pasa nada…" y "Reparar racha: haz hoy el doble (50 min de enfoque o 30 tarjetas)". Al cumplirlo, el día perdido queda protegido.
- **¿Cuándo lo haces?:** al crear o editar una tarea que vence mañana o después salen 3 horarios libres (fuera de clases y de otros planes, prefiriendo tus horas de enfoque), "Otro" y el lugar (Casa, Biblioteca, Universidad o uno tuyo). Se muestra como frase: "Si son las 4:00 pm del jueves, empiezo "Informe" en la biblioteca."
- El plan aparece en la agenda de Hoy y en la fila de la tarea. A esa hora llega un aviso que abre Enfoque con la tarea elegida. Si pasan 30 min sin enfoque, Hoy pregunta "No arrancó… ¿Lo movemos?" con 3 horarios.
- Al agregar rápido una tarea que vence mañana o después, el aviso ofrece "¿Cuándo lo haces?".
- **Tu tiempo real:** con 5 o más tareas hechas con estimado y enfoque, al poner un estimado sale "Sueles tardar 1,6 veces lo que calculas. ¿Pongo 50 min?". Al completar en Hoy: "Te tomó 50 min (calculaste 30 min)".

### 3. Pruebas

`npm test` (rachas, escudos, reparar, meta semanal, huecos libres, frase del plan y tiempo real) y `bash tests/run_sql.sh` (incluye `tests/sql/19c_pruebas.sql` y `19c_despues.sql`: cada fuente del día de estudio, ganar, usar, comprar y tope de escudos, reparar, hueco de 3 días, RLS, aviso del plan y relleno idempotente).

## Versión 20 (parte 7): plan del parcial, simulacro y "Ponme a prueba"

### 1. Migración y funciones

1. Vuelve a correr `supabase/schema_v19.sql` completo (es idempotente). La sección "FASE 3" agrega:
   - `assignments.parent_id` y `assignments.session_kind`: sesiones de repaso ligadas a su examen (solo de tareas propias). Una sesión que no es simulacro se marca hecha sola cuando el enfoque en ella llega a lo planeado.
   - `quizzes`: historial de simulacros (RLS: cada quien lo suyo).
   - `notes.last_recall_at` y `notes.last_recall_score`.
   - Un simulacro o una prueba de la nota hacen que el día de estudio cuente.
2. Redespliega la función `ai`: `supabase functions deploy ai`. Tareas nuevas `quiz`, `grade` y `recall`, con topes diarios: 5 simulacros, 10 pruebas de notas (incluye "3 preguntas rápidas") y 25 correcciones.

### 2. Lo que cambia para el usuario

- **Plan de repaso del parcial:** al crear un examen o quiz a 3 días o más (o desde Hoy, para los que ya estaban o se importaron) sale "¿Armo tu plan de repaso para…?". Propone sesiones a 14, 7, 4, 2 y 1 días (las que quepan): preparar, tarjetas y ejercicios, simulacro y repaso ligero de 20 min, cada una en un hueco libre de ese día. Se crean con un toque como tareas de tipo **Repaso** y salen en Hoy, el calendario y la materia.
- En el examen (al editarlo): "Plan de repaso: 2 de 4 sesiones hechas" con Rehacer y Quitar. Si cambia la fecha del examen pregunta "¿Muevo las sesiones que faltan?".
- **Simulacro** (desde Repaso, la materia o la sesión de simulacro): eliges notas, 5, 10 o 20 preguntas y si va con tiempo (1,5 min por pregunta). Mezcla opción múltiple, respuesta corta y problemas, con fórmulas. La opción múltiple y los números cercanos se corrigen al instante; lo escrito lo corrige la IA y puedes cambiar el veredicto. Resultado en la escala de la materia, desglose por nota, errores con explicación y "Ver en la nota", y "Convertir errores en tarjetas".
- La materia muestra "Preparación: último simulacro 3,8 (antes 3,1)" y el avance del plan del próximo examen.
- **Ponme a prueba** es el primer botón de "Estudiar esta nota": escribes lo que recuerdas (sugerencia de 3 min) y la IA te muestra lo que recordaste, lo que faltó (con enlace al título) y lo que quedó mal, con "Hacer tarjetas de lo que faltó". La lista de notas muestra "Probada hace 3 días · 70%". También están las "3 preguntas rápidas". "Resumir" pasa al final.

### 3. Pruebas

`npm test` (plan del parcial, mover sesiones, huecos de un día, lectura de las respuestas de la IA, corrección, nota y desglose) y `bash tests/run_sql.sh` (incluye `tests/sql/19d_pruebas.sql`: sesiones solo de exámenes propios, hechas solas al cumplir el enfoque, borrado en cascada, simulacros y pruebas que cuentan para el día, RLS).

## Versión 20 (parte 8): ritual del lunes, ritual del semestre y metas WOOP

### 1. Migración

Vuelve a correr `supabase/schema_v19.sql` completo (es idempotente). La sección "FASE 4" agrega:

- `week_plans`: el plan de cada semana (hasta 3 prioridades, la meta de días, cuándo se terminó y hasta cuándo se pospuso). Solo semanas que empiezan en lunes.
- `goals`: metas WOOP por materia o del semestre, con la nota que quieres. Una activa por materia (y una del semestre).
- `enqueue_week_plans()` dentro de `enqueue_all()`: aviso opcional "Planea tu semana" el lunes a las 8 am, solo si aún no la planeaste.

No hay que redesplegar funciones.

### 2. Lo que cambia para el usuario

- **Ritual del lunes:** el lunes (o el domingo desde las 6 pm, para la semana siguiente) Hoy muestra "Planea tu semana". Se puede posponer a mañana. Son cuatro pasos: tu semana (entregas y exámenes de esta semana y la siguiente, clases, cómo te fue la semana pasada y lo estimado contra lo real, y tus metas), lo importante (hasta 3, de tus tareas o escritas), ¿cuándo? (un horario libre para cada una) y la meta de días.
- Las prioridades quedan arriba en Hoy toda la semana ("Lo importante esta semana"), con su hora y para marcarlas.
- **Ajustes → Estudio:** "Ritual del lunes" (encendido) y "Empezar semestre". **Ajustes → Avisos:** "Aviso del lunes" (apagado).
- **Ritual del semestre:** se ofrece en Hoy al crear 3 o más materias en 7 días (o desde Ajustes): la nota que quieres en cada materia, la meta semanal y una meta WOOP del semestre.
- **Metas WOOP:** en la materia, "Ponerte una meta": deseo (y la nota que quieres), mejor resultado, obstáculo (con ejemplos) y plan "Si…, entonces…". La meta y el plan se ven en la materia y en el ritual del lunes. La nota que quieres reemplaza el valor de "Quiero sacar" y sale en el resultado del simulacro. La mascota recuerda el plan cuando hay un examen cerca de esa materia o una vez al mes.

### 3. Pruebas

`npm test` (cuándo se ofrece el ritual y qué semana, entregas de la semana, prioridades, la semana pasada, ritual del semestre y WOOP) y `bash tests/run_sql.sh` (incluye `tests/sql/19e_pruebas.sql`: límites del plan de la semana, una meta activa, RLS y el aviso del lunes).

## Versión 21 (parte 1): organizar el día

Requiere la versión 20 completa (`schema_v19.sql` con sus cuatro fases).

### 1. Migración y funciones

1. Corre `supabase/schema_v20.sql` en el SQL Editor (es idempotente). La fase 1 agrega:
   - `assignments.repeat_rule` y `repeat_parent_id`: tareas que se repiten. Al marcar una como hecha, la base crea la siguiente con la misma materia, tipo, pasos (sin marcar), estimado y hora planeada; nunca nace vencida y no se duplica aunque se marque dos veces. `skip_repeat()` salta una vez.
   - `assignments.inbox`: la bandeja. `assignments.plan_day` y `plan_band`: mañana, tarde o noche de un día.
   - `day_reviews`: el cierre del día.
   - `enqueue_day_close()` dentro de `enqueue_all()`: aviso opcional a la hora del cierre.
2. No hay funciones nuevas que desplegar. El `manifest.webmanifest` y el `sw.js` cambian (accesos directos y compartir hacia Kaderno): salen con el despliegue normal de la web.

### 2. Lo que cambia para el usuario

- **Tareas que se repiten:** en Agregar se escribe "lab de física cada martes", "quiz de inglés cada viernes 8am", "leer 20 páginas cada día", "cada día hábil", "cada 2 semanas", "cada mes el 15", "cada lunes y miércoles hasta el 5 dic" o "cada! 3 días" (contar desde que la terminas). En el formulario de la tarea: "Repetir" (cada día, días hábiles, cada semana con sus días, cada 2 semanas, cada mes), "hasta" y "Contar desde que la termino". La fila muestra "cada martes" y el menú tiene "Saltar esta vez".
- **Bandeja:** lo que agregas sin fecha ni materia cae ahí y no ensucia Hoy. Hoy muestra "Bandeja: 4 por ordenar" (también en la barra lateral) y se ordena una por una: hoy, mañana, otro día, materia, convertir en nota, algún día o borrar (atajos H, M, N, A, Supr).
- **Dictar:** botón de micrófono en Agregar donde el navegador lo permite.
- **Accesos directos** del ícono instalado: Agregar tarea, Enfoque, Repaso y Capturar apunte. **Compartir hacia Kaderno** (Android, app instalada): un texto o enlace cae en la bandeja; una foto se abre en Capturar para digitalizarla. En iPhone no aparece (Safari no lo permite).
- **Mi día** (en Hoy, junto a "Lista"): línea de tiempo de 6 am a 11 pm con clases, planes con hora y enfoque hecho, la línea de "ahora" y franjas Mañana, Tarde y Noche. Lo pendiente sin hora sale al lado: se pone con "Poner hora" y tocando la hora (o arrastrándolo en el computador). Los bloques se mueven arrastrando y se estiran para cambiar la duración; tocarlos da Empezar enfoque, Marcar hecha, Mover a mañana y Quitar la hora. En el computador también la semana.
- **Aviso de sobrecarga:** "Planeaste 7 h y te quedan 4 h libres hoy" (con "tu tiempo real") y la sugerencia de pasar a mañana lo que vence más lejos.
- **Cerrar el día:** desde las 6 pm (o la hora elegida en Ajustes → Avisos), en 3 pasos: lo que hiciste, lo que quedó (mañana, otro día o a la bandeja) y "¿Qué aprendiste hoy?", que sale en el ritual del lunes. Lo planeado ayer que no se hizo ni se movió aparece arriba como "Quedó de ayer". Cerrar el día no cuenta para la racha.
- **Cuenta regresiva** de exámenes en Hoy y en Estudiar ("Parcial 3 de Física · 13 días"); tocarla abre el examen con su plan de repaso.

### 3. Pruebas

`npm test` (incluye `tests/v21.test.ts`: lector de repeticiones, siguiente fecha con fin de mes, hasta, atrasadas y "desde que la termino", agregar rápido, carriles de la línea de tiempo, horas libres, sobrecarga, cierre, cuenta regresiva y bandeja) y `bash tests/run_sql.sh` (incluye `tests/sql/20_pruebas.sql`: misma siguiente fecha que la app, una sola repetición aunque se marque dos veces, saltar, cierre privado y aviso del cierre).

## Versión 21 (parte 2): notas conectadas

### 1. Migración

Vuelve a correr `supabase/schema_v20.sql` completo (es idempotente). La fase 2 agrega:

- `note_links`: enlaces entre notas, recalculados por la base al guardar (solo a notas propias) y rellenados con lo que ya hubiera.
- `related_notes()`: notas parecidas con los vectores del Oráculo (`note_embeddings`). Solo se crea si existe esa tabla (schema_v3).
- `note_templates` y `subjects.default_template`: plantillas propias y la de cada materia.
- `flashcards.note_line` y el origen `note`: tarjetas escritas en la nota.

No hay funciones que desplegar.

### 2. Lo que cambia para el usuario

- **Enlaces entre notas:** en el editor, `[[` abre un buscador de notas; al elegir una queda un enlace con su título (se guarda como `[Título](kd-note:<id>)` y al abrir la nota se pone el título actual). Leyendo, un toque abre la nota; editando, Ctrl o Cmd + clic.
- **Mencionada en** y **Notas relacionadas** en la columna de la nota (las relacionadas salen de los vectores del Oráculo, aunque no estén enlazadas).
- **Plantillas:** "Nueva nota" en la materia ofrece En blanco, Apuntes de clase (Cornell), Laboratorio, Capítulo de libro, Ejercicio resuelto y las tuyas, con "Usar siempre en esta materia". Menú de la nota → "Guardar como plantilla".
- **Nota de la clase:** durante una clase (según el horario), Hoy y la materia muestran "Apuntes de hoy": abre o crea la nota "Clase del 23 oct" con la plantilla de la materia.
- **Tarjetas desde la nota:** una línea `pregunta :: respuesta` o con `{{completar}}` se marca como tarjeta (y leyendo se ve con una flecha). Al terminar de editar, si hay tarjetas nuevas se abre "Revisa tus tarjetas"; si cambias una línea ya guardada, la tarjeta se actualiza sola.

### 3. Pruebas

`npm test` (enlaces, títulos al día, líneas con `::` y `{{ }}`, nuevas y cambiadas, plantillas) y `bash tests/run_sql.sh` (incluye `tests/sql/20b_pruebas.sql`: enlaces solo a notas propias, se recalculan y se borran con la nota, plantillas privadas y origen `note`).

## Versión 21 (parte 3): tu calendario en Hoy y compartir una nota

### 1. Migración y funciones

1. Vuelve a correr `supabase/schema_v20.sql` completo (es idempotente). La fase 3 agrega:
   - `external_calendars` (hasta 5 por persona, solo direcciones https o webcal) y `external_events` (la app solo los lee; los escribe la función).
   - `notes.share_token` y `get_shared_note(token)`, que devuelve solo el título, el contenido y la fecha de esa nota.
2. Despliega las dos funciones (ninguna pide secretos nuevos; `ical-import` usa el mismo `NOTIFY_CRON_SECRET` de `notify`):

   ```bash
   npx supabase functions deploy ical-import --no-verify-jwt
   npx supabase functions deploy shared-note --no-verify-jwt
   ```

   `ical-import` revisa la sesión del usuario por su cuenta (solo lee calendarios propios) y `shared-note` es pública a propósito (solo responde con un enlace activo).
3. Programa la lectura de calendarios cada 15 minutos (cambia `TU-PROYECTO` y el secreto):

   ```sql
   select cron.schedule('kaderno-calendars', '*/15 * * * *', $$
     select net.http_post(
       url := 'https://TU-PROYECTO.supabase.co/functions/v1/ical-import',
       headers := jsonb_build_object('x-cron-secret', 'EL-MISMO-NOTIFY_CRON_SECRET')
     );
   $$);
   ```

No hay cambios en el droplet: la página `/compartida/<token>` es parte de la app.

### 2. Lo que cambia para el usuario

- **Tus otros calendarios** (Ajustes, Calendario): pegar la dirección iCal secreta de Google Calendar u Outlook, con nombre y color. Se lee al conectarlo, con "Actualizar" y cada 15 minutos. Si falla, el calendario se marca en rojo con el motivo. Los eventos salen en la agenda de Hoy (los de todo el día en "Durante el día") y en "Mi día", y cuentan para el aviso de sobrecarga.
- **Compartir con un enlace** (menú de la nota): crea un enlace de solo lectura, sin cuenta, con fórmulas, tablas e imágenes. Se puede copiar, cambiar por uno nuevo o desactivar.
- **Copiar a un proyecto** (menú de la nota): guarda la nota como `.md` en Archivos del proyecto elegido.

### 3. Pruebas

`npm test` (lector de .ics con zonas, todo el día, repeticiones y ediciones; direcciones permitidas; agenda con eventos; copia sin imágenes privadas; enlaces seguros) y `bash tests/run_sql.sh` (incluye `tests/sql/20c_pruebas.sql`: solo https y máximo 5, la app no escribe eventos, calendarios aislados por persona, la nota compartida solo con su enlace y sin datos del dueño, y al desactivarlo deja de funcionar).

## Versión 22 (parte 1): grabar la clase

### 1. Migración y funciones

1. Corre `supabase/schema_v21.sql` completo (es idempotente). La fase 1 agrega `note_transcripts`: el texto de la clase con su minuto y las líneas de la nota con el minuto en que se escribieron (máximo 4 horas y 10 grabaciones por nota). El audio no se guarda.
2. Vuelve a desplegar la función `ai` (trae el resumen de clase, con tope de 10 por día):

   ```bash
   npx supabase functions deploy ai
   ```

No hay secretos nuevos ni cambios en el droplet.

### 2. Lo que cambia para el usuario

- En una nota, **Grabar clase** (con el idioma: español o inglés). La primera vez recuerda pedir permiso al profesor y que el audio no se guarda. Mientras graba hay una barra con el tiempo, la última frase, Pausar y Terminar; la pantalla no se apaga.
- Funciona con el reconocimiento del navegador: Chrome, Edge y Safari (en Firefox avisa que no se puede). Necesita internet.
- Al terminar, debajo de la nota queda **Transcripción de la clase**: buscador, tus apuntes intercalados por minuto, **Resumir con IA** (ideas, fórmulas, lo que dejó el profesor con "Crear tarea" y preguntas para repasar), **Insertar en la nota**, **Crear tarjetas** y borrar.
- Al seleccionar texto escrito durante la grabación: **¿Qué se decía?** lleva a ese minuto de la transcripción.

### 3. Pruebas

`npm test` (incluye `tests/v22.test.ts`: frases sin duplicar, minuto de cada línea, búsqueda, resumen en la nota, validación de lo que devuelve la IA) y `bash tests/run_sql.sh` (incluye `tests/sql/21_pruebas.sql`: solo en notas propias, topes, nadie más la ve y se borra con la nota).

## Versión 22 (parte 2): anotar PDFs

### 1. Migración

Vuelve a correr `supabase/schema_v21.sql` completo (es idempotente). La fase 2 agrega `file_highlights`: resaltados y comentarios de cada persona en los PDF de Archivos de la materia y de los proyectos (se borran con el archivo). No hay funciones que desplegar.

pdf.js viene en `public/pdfjs` (versión 4.10.38, la de `pdfjs-dist` en `devDependencies`). Para actualizarlo: cambiar la versión y correr `node scripts/copy-pdfjs.mjs`.

### 2. Lo que cambia para el usuario

- Los PDF de Archivos (materia y proyectos) abren en un visor nuevo a pantalla completa: páginas que cargan al bajar, ir a una página, zoom y texto seleccionable.
- Al seleccionar texto: resaltar en 4 colores, **Comentar**, **A una nota** (la de la clase de hoy, otra o una nueva, como cita con un enlace que abre el PDF en esa página) y **Tarjeta** (tarjetas con IA desde lo seleccionado).
- Tocar un resaltado: cambiar el color, comentar, enviarlo a una nota, hacer tarjeta o borrarlo. **Resaltados** muestra la lista del archivo (al lado en computador, abajo en el celular).

### 3. Pruebas

`npm test` (rectángulos en proporciones, líneas juntas, texto limpio, enlace a la página, cita, orden) y `bash tests/run_sql.sh` (incluye `tests/sql/21b_pruebas.sql`: solo archivos propios o de proyectos donde es miembro, resaltados de cada persona y se borran con el archivo).

## Versión 22 (parte 3): ¿cómo te fue?

### 1. Migración

Vuelve a correr `supabase/schema_v21.sql` completo (es idempotente). La fase 3 agrega `exam_results`: la nota de cada parcial o quiz (o "no lo presenté"), cómo te sentiste, tus razones, qué harás distinto y una foto de las horas de enfoque. No hay funciones que desplegar ni usa IA.

### 2. Lo que cambia para el usuario

- Desde el día siguiente a un parcial o quiz (hasta 3 semanas), Hoy pregunta **¿Cómo te fue?** También desde el detalle del parcial.
- Pides la nota (y cuánto vale, si no estaba en Calificaciones) y cómo te sentiste. Kaderno muestra si el esfuerzo alcanzó frente a la nota que querías (o aprobar): horas de enfoque, días distintos, cuándo empezaste, cuánto fue en las últimas 48 horas, sesiones del plan, tarjetas y simulacros; una gráfica de horas contra nota de tus parciales; y las razones que se ven en los datos.
- Eliges lo que los datos no ven (nervios, no entendía temas, el examen fue distinto...) y escribes qué harás distinto, con sugerencias. Esa frase aparece al armar el plan del siguiente parcial de la materia.
- La nota queda en Calificaciones, y la pestaña muestra **Tus parciales: esfuerzo y nota**.

### 3. Pruebas

`npm test` (cuándo preguntar, esfuerzo, veredicto y razones, sugerencias, nota escrita, puntos de la gráfica) y `bash tests/run_sql.sh` (incluye `tests/sql/21c_pruebas.sql`: uno por parcial propio, nota dentro de la escala, "no lo presenté", privado y se borra con el parcial).

## Versión 22 (parte 4): Capturar nueva y lectura de fotos segura

### 1. Funciones

No hay migración. Vuelve a desplegar las dos funciones de IA:

```bash
npx supabase functions deploy ocr
npx supabase functions deploy ai
```

- `ocr` ahora exige sesión y tiene tope de 80 páginas por día y persona (usa `ai_take` de schema_v19). Lee en modo `notes` (Markdown con títulos, tablas, fórmulas y la caja de los dibujos), `board` (pizarra) o `plain` (texto tal cual). Sin modo responde como antes.
- `ai` exige sesión para todo y suma topes al resumen (40) y a las microtareas (40).

### 2. Lo que cambia para el usuario

- **Modos**: Apuntes, Pizarra, PDF y Cronograma o tarea.
- **Lectura más fiel**: sale en Markdown con títulos, listas, tablas y fórmulas; lo dudoso queda con [?] y se avisa; los dibujos se recortan y quedan como imagen en su lugar (se pueden quitar). Revisión con la foto al lado en computador (pestañas Foto y Texto en el celular), "Ver cómo queda" y "Leer de nuevo" por página.
- **Foto más limpia**: girar, recortar arrastrando las esquinas y modo escáner (se puede dejar siempre activo).
- **Menos pasos**: materia según la clase de ahora (o la última usada), título con el primer título de la foto o "Clase del 20 oct", y guardar en una nota nueva, en la clase de hoy o al final de otra nota. Lo que llevas queda guardado en el dispositivo ("Tienes una captura sin guardar").
- **Más cosas**: PDF de hasta 20 páginas (sin IA si ya trae texto), pizarra como imagen con el texto debajo, y del cronograma a Importar cronograma o de un enunciado a Nueva tarea con la descripción llena.

### 3. Pruebas

`npm test` (lectura en Markdown y dibujos válidos, materia y título sugeridos, páginas con dibujos, pizarra, recorte, modo escáner, texto de un PDF). No hay pruebas SQL nuevas.

## Versión 23 (parte 1): pantalla de proyecto ordenada

Sin cambios para desplegar: la pantalla de proyecto quedó partida en `components/projects/` y se ve y funciona igual.

## Versión 23 (parte 2): comentarios y menciones en tareas de proyecto

### 1. Migración

Corre `supabase/schema_v22.sql` completo (es idempotente; requiere schema_v12 y schema_v14). Agrega `task_comments` con sus permisos (solo integrantes) y los avisos de mención y de comentario. También cambia el aviso de "te asignaron una tarea" para que abra la tarea. No hay funciones que desplegar: `notify` ya envía cualquier aviso de la bandeja.

### 2. Lo que cambia para el usuario

- En la ventana de una tarea de proyecto, **Comentarios**: escribir con @ muestra a los integrantes para mencionarlos (flechas y Enter, o tocar). Ctrl + Enter envía. Cada quien edita o borra lo suyo; el dueño puede borrar cualquiera.
- Las tarjetas del tablero y la lista muestran cuántos comentarios tienen.
- Avisos en la campana y como notificación: "te mencionó" y "comentó en tu tarea". Tocar el aviso abre el proyecto con la tarea.

### 3. Pruebas

`npm test` (incluye `tests/v23.test.ts`: qué se busca tras la @, sugerencias sin tildes, insertar la mención, quién quedó mencionado, correos que no son menciones) y `bash tests/run_sql.sh` (incluye `tests/sql/22_pruebas.sql`: lectores comentan, nada en proyectos ajenos ni a nombre de otro, menciones solo de integrantes, avisos sin duplicar, editar solo avisa a los nuevos y deja marca, el dueño borra, todo se borra con la tarea).

## Versión 23 (parte 3): calendario del proyecto

Sin migración: usa `start_at` y `due_at` de `project_tasks` (schema_v13).

### Lo que cambia para el usuario

- Nueva vista **Calendario** en cada proyecto, entre Lista y Archivos.
- **Mes**: las entregas de cada día con el color de su columna. En computador, tocar un día vacío crea una tarea con esa fecha; en celular, tocar un día muestra sus tareas y "+ Tarea este día". Los lectores solo miran.
- **Línea de tiempo**: una barra por tarea del inicio a la entrega, la raya de hoy y la de la entrega final. Las tareas sin fecha quedan abajo.
- Arriba, **Entrega final**: cuántos días faltan, cuántas van hechas, las vencidas, las de esta semana y si el ritmo alcanza. Se puede escoger qué tarea es la entrega final.
- **Cruces**: avisa cuando alguien tiene tres o más tareas pendientes al mismo tiempo.
- Filtros "Solo lo mío" y "Ocultar hechas".
- La ventana de la tarea tiene un campo nuevo, **Empieza (opcional)**.

### Pruebas

`npm test` (incluye en `tests/v23.test.ts` la cuadrícula del mes, barras recortadas al rango, cruces que juntan días seguidos y el camino a la entrega final).

## Versión 23 (parte 4): ropa de temporada y citas de PDF

### 1. Migración

Corre otra vez `supabase/schema_v22.sql` completo (es idempotente; ahora también requiere schema_v17). La fase 4 agrega siete prendas al catálogo y hace que `pet_buy` solo venda las de temporada en sus fechas, con la fecha local de cada quien. Sin correrla, la tienda muestra las prendas pero la compra responde "Eso no está en la tienda".

### 2. Lo que cambia para el usuario

- En Mascota > Ropa, debajo de la tienda de siempre, **Temporada**: si hay una activa, sus prendas y hasta cuándo se venden; si no, la próxima con la fecha en que llega ("Llega el 1 dic, en 16 días"). Lo de otras temporadas que ya compraste aparece en "Tuyas de otras temporadas".
- Temporadas: Carnaval, vacaciones de mitad de año, Amor y Amistad, Halloween y Navidad.
- Tocar la fuente de una cita de PDF en una nota abre el visor en la misma pestaña, en la página citada; atrás vuelve a la nota.
- Las notas abiertas ya no se repintan sin parar (gastaban batería y procesador aunque no se tocaran).

### 3. Pruebas

`npm test` (temporadas que cruzan el año, la próxima temporada, estados de la tienda y que las fechas y precios coincidan con el SQL) y `bash tests/run_sql.sh` (incluye `tests/sql/22d_pruebas.sql`: fechas, fuera de temporada no se vende, la ropa de siempre sí, lo comprado se pone todo el año).

## Versión 24 (parte 1): planes y topes

### 1. Migración

Corre `supabase/schema_v23.sql` completo (requiere schema_v14, schema_v19 y schema_v20; es idempotente). Crea `subscriptions` y `team_seats`, las funciones `plan_of`, `my_plan` y `start_trial`, y cambia el tope de calendarios externos (2 con Gratis, 10 con Pro). Después despliega otra vez las funciones `ai` y `ocr`:

```
npx supabase functions deploy ai
npx supabase functions deploy ocr
```

Sin la migración, la IA usa los topes de Pro y la pantalla "Tu plan" avisa que falta correrla.

### 2. Lo que cambia para el usuario

- Ajustes > **Tu plan**: el plan de hoy, la prueba gratis de Pro (7 días, sin tarjeta, una vez), los precios (mensual y anual), qué incluye cada plan y cuánto llevas usado de la IA hoy.
- Cuando se acaba el cupo del día con Gratis, el aviso trae el botón "Ver planes".
- Topes diarios: ver PLAN_v24.md, sección B.

### 3. Pruebas

`npm test` (precios, ahorro anual, topes y lo que dice "Tu plan" en cada estado) y `bash tests/run_sql.sh` (incluye `tests/sql/23_pruebas.sql`: cuenta nueva, prueba una sola vez, nadie se regala Pro, calendarios por plan, puestos de Equipo y vencimiento).

## Versión 24 (parte 2): cobro con Wompi

Todo funciona en el modo de pruebas de Wompi (sandbox) sin RUT. Para cobrar de verdad, ver PLAN_v24.md, sección D.

### 1. Migración

Corre otra vez `supabase/schema_v23.sql` completo. La fase 2 agrega `billing_payments`, `billing_events`, los precios (`billing_price`), las funciones del servidor para crear, aplicar y renovar pagos, `billing_cancel`, `billing_resume` y los puestos de Equipo (`team_seat_add`, `team_seat_remove`).

### 2. Llaves de Wompi

1. Crea la cuenta en comercios.wompi.co. Mientras aprueban el comercio, en Desarrolladores ya salen las llaves de **pruebas** (empiezan por `pub_test_`, `prv_test_`, `test_integrity_` y `test_events_`).
2. Guárdalas como secretos de Supabase (nunca en el repositorio ni en el droplet):

   ```bash
   npx supabase secrets set WOMPI_PUBLIC_KEY=pub_test_... WOMPI_PRIVATE_KEY=prv_test_... \
     WOMPI_INTEGRITY_SECRET=test_integrity_... WOMPI_EVENTS_SECRET=test_events_... \
     WOMPI_ENV=sandbox APP_URL=https://TU-DOMINIO
   ```

   `APP_URL` es la dirección de Kaderno (a donde vuelve la persona después de pagar). Si usas varias, sepáralas con comas.
3. Despliega las tres funciones:

   ```bash
   npx supabase functions deploy billing
   npx supabase functions deploy billing-webhook --no-verify-jwt
   npx supabase functions deploy billing-charge --no-verify-jwt
   ```

4. En Wompi > Desarrolladores > **URL de eventos** (la de pruebas): `https://TU-PROYECTO.supabase.co/functions/v1/billing-webhook`.
5. Programa el cobro de renovaciones y los avisos cada hora (en el SQL Editor):

   ```sql
   select cron.schedule('kaderno-billing', '7 * * * *', $$
     select net.http_post(
       url := 'https://TU-PROYECTO.supabase.co/functions/v1/billing-charge',
       headers := jsonb_build_object('x-cron-secret', 'EL-MISMO-NOTIFY_CRON_SECRET')
     );
   $$);
   ```

No hay cambios en el droplet.

### 3. Probar en sandbox

- Ajustes > Tu plan > Pagar Pro > **Pagar una vez**: abre la página de Wompi; con PSE escoge "Banco que aprueba"; con tarjeta usa 4242 4242 4242 4242. Al volver, "Tu plan" muestra "Pago aprobado" y el plan sube a Pro.
- **Renovar solo con tarjeta**: 4242 4242 4242 4242 aprueba, 4111 1111 1111 1111 rechaza. **Con Nequi**: 3991111111 aprueba, 3992222222 rechaza.
- Para probar una renovación sin esperar un mes: en el SQL Editor, `update subscriptions set next_charge_at = now() where user_id = '...';` y llama `billing-charge` (o espera la hora).
- Cada evento que manda Wompi queda en `billing_events` (con `ok = false` si la firma no coincide).

### 4. Pasar a producción

Cuando Wompi apruebe el comercio: cambia los cuatro secretos por los de producción (`pub_prod_`, `prv_prod_`, `prod_integrity_`, `prod_events_`), `WOMPI_ENV=production`, y pon la URL de eventos de producción en Wompi. No hay que desplegar nada otra vez. Haz un pago real pequeño (Pro mensual) y reembólsalo desde el panel de Wompi para confirmar.

### 5. Lo que cambia para el usuario

- En Tu plan: **Pagar una vez** (cualquier medio de Wompi, sin renovación) o **Renovar solo** con tarjeta o Nequi (se cobra un día antes de que termine el periodo).
- Si una renovación falla, se reintenta 1, 2 y 4 días después y la persona conserva su plan mientras tanto; al tercer fallo se apaga la renovación. Cada paso llega como aviso.
- Cambiar el medio de pago, apagar y prender la renovación, historial de pagos con su referencia.
- Equipo: agregar y quitar personas por correo, y comprar puestos extra a mitad de periodo (se cobra la parte que falta).
- Avisos: la prueba termina mañana; un plan sin renovación termina en 3 días.

### 6. Pruebas

`npm test` (firma de integridad, verificación de eventos, checkout, tarjeta y Nequi, precios iguales en el SQL) y `bash tests/run_sql.sh` (incluye `tests/sql/23b_pruebas.sql`: monto exacto, idempotencia, renovación y reintentos, Equipo y puestos, que nadie apruebe pagos desde la app, cancelar y avisos).

## Versión 24 (parte 3): modo Trabajo

### 1. Migración

Ninguna: el modo se guarda en las preferencias de cada persona (`user_prefs.settings.mode`).

### 2. Lo que cambia para el usuario

- La bienvenida empieza preguntando para qué usas Kaderno: **Estudio**, **Trabajo** o **Los dos**. También se cambia en Ajustes > "Para qué usas Kaderno".
- En Trabajo: Materias pasa a ser **Áreas** (áreas o clientes, con ícono de maletín), Horario pasa a ser **Agenda**, la sección Estudiar pasa a ser **Herramientas** (en el celular, la pestaña dice Enfoque), y "Grabar clase" pasa a ser **Grabar reunión** (con su aviso para los asistentes y la nota "Reunión del 23 nov" con la plantilla de acta).
- En Los dos: se conservan los nombres del estudio ("Materias y áreas") y se suman las plantillas y funciones del trabajo.
- Plantillas de notas nuevas: acta de reunión, uno a uno, retrospectiva, propuesta e informe semanal. Plantillas de proyecto nuevas: proyecto con cliente, sprint de dos semanas y lanzamiento. En Trabajo salen primero; en Estudio no salen.
- Nada se borra ni se mueve al cambiar de modo: solo cambian los nombres y el orden.

### 3. Pruebas

`npm test` (nombres por modo y orden de las plantillas).

## Versión 24 (parte 4): grabar la reunión

### 1. Migración y despliegue

Sin migración (el acta se guarda en `note_transcripts.summary`, como el resumen de clase). Despliega otra vez la función `ai` (nueva tarea `meeting`):

```
npx supabase functions deploy ai
```

### 2. Lo que cambia para el usuario

- En una nota, "Grabar reunión" (modo Trabajo) o "Grabar" (los dos) graba igual que la clase: el texto se escribe solo y el audio no se guarda.
- Al terminar, **Hacer acta con IA**: título, asistentes, resumen, decisiones, tareas con responsable y fecha, y pendientes para la próxima. En "Los dos" se puede escoger entre resumen de clase y acta.
- **Publicar en un proyecto**: escoges el proyecto, Kaderno adivina el responsable de cada tarea entre los integrantes (si hay dos con el mismo nombre, pregunta), puedes cambiarlo, quitar fechas o tareas, y al publicar se crean las tareas asignadas (cada responsable recibe el aviso de siempre) y el acta queda en Archivos como `Acta 15 nov - Título.md`.
- "Para mí" crea una tarea personal; "Insertar en la nota" pega el acta al final de la nota.
- Tope diario: 2 actas con Gratis y 8 con Pro.

### 3. Pruebas

`npm test` (el acta se valida, responsables sin adivinar de más, Markdown y nombre del archivo).

## Versión 24 (parte 5): registro de horas e informes

### 1. Migración

Corre otra vez `supabase/schema_v23.sql` completo (la fase 5 requiere también schema_v12 y schema_v14). `focus_sessions` gana `project_id`, `note` y `source`; se agrega `project_hours`. Sin correrla, el registro de horas muestra el tiempo por área, pero sin proyectos ni horas a mano.

### 2. Lo que cambia para el usuario

- **Horas** (en la barra de Herramientas en modo Trabajo, y desde Enfoque en el celular): el tiempo de la semana o del mes, por proyecto, por área o cliente, o por día.
- En Enfoque, con modo Trabajo o los dos, "Contar para un proyecto": cada pomodoro suma a ese proyecto.
- **Anotar horas** a mano (reuniones, llamadas, trabajo fuera de Kaderno): fecha, duración (1:30, 1,5 o 90), área, proyecto y nota. Máximo 12 horas por registro y nunca en el futuro.
- **Tarifa por hora** por proyecto o por área: el informe muestra el valor (la del proyecto gana a la del área). Solo la ve la persona.
- **CSV** para Excel o Google Sheets (gratis) e **informe en PDF** (Pro): sobrio, en Times New Roman y en negro, con resumen y detalle.
- **Horas del equipo** en un proyecto (plan Equipo): cuánto anotó cada integrante en el periodo.
- En cada proyecto, menú > **Informe semanal**: lo hecho en la semana, lo que viene en 7 días, lo atrasado y la carga de cada quien. Se copia, se descarga o se guarda en Archivos.

### 3. Pruebas

`npm test` (periodos, duración, sumas con tarifa, CSV, informe y el informe semanal) y `bash tests/run_sql.sh` (incluye `tests/sql/23c_pruebas.sql`: enfoque con su hora real, horas a mano con tope, solo en proyectos propios, y las horas del equipo solo con plan Equipo).

## Versión 25 (parte 1): cobrar

### 1. Migración

Corre `supabase/schema_v24.sql` completo (requiere schema_v12, schema_v14 y schema_v23; es idempotente). Crea `billing_profile`, `clients` e `invoices`, las funciones `invoice_create`, `invoice_set_status`, `project_set_budget` y `project_budget`, la columna `projects.budget_minutes` y el aviso de presupuesto al anotar horas. No hay que desplegar funciones.

### 2. Lo que cambia para el usuario

- **Cobrar** (en Herramientas con modo Trabajo, y desde Horas > Cobrar):
  - **Tus datos**: nombre, documento, ciudad, dónde te pagan (ahorros, corriente, Nequi o Daviplata), prefijo y siguiente número, y una nota fija (por ejemplo, "no soy responsable de IVA").
  - **Clientes**: nombre, NIT o cédula, tarifa por hora y los proyectos y áreas que le cobras.
  - **Nueva cuenta de cobro**: escoges cliente y periodo; Kaderno arma una línea por proyecto con sus horas y la tarifa (la del proyecto, la del área o la del cliente). Puedes cambiar o agregar líneas. Se abre lista para imprimir o guardar en PDF, con el valor en letras.
  - Marcar pagada, volver a por cobrar, anular (el número no se reusa) y mandar por WhatsApp. Arriba: cuánto está por cobrar y cuánto se cobró este mes.
  - Con Gratis, 2 cuentas de cobro al mes (las anuladas no cuentan).
- En cada proyecto, Opciones > **Presupuesto de horas**: cuánto va el equipo y aviso al 80 % y al 100 % (al dueño y a quien anota). Con Gratis, en 1 proyecto.

### 3. Pruebas

`npm test` (número, valor en letras, líneas desde las horas, total igual al del servidor, documento) y `bash tests/run_sql.sh` (incluye `tests/sql/24_pruebas.sql`: pide tus datos, total del servidor, consecutivo, tope de Gratis, nadie ve datos ajenos, presupuesto y sus avisos).

## Versión 25 (parte 2): cronómetro y hoja semanal

### 1. Migración

Corre otra vez `supabase/schema_v24.sql` completo. La fase 2 permite `source = 'timer'` y `project_task_id` en `focus_sessions`, crea `timesheet_weeks` con `timesheet_submit` y `timesheet_decide`, y bloquea los cambios en una semana aprobada. Sin la migración, el cronómetro guarda su tiempo como horas a mano.

### 2. Lo que cambia para el usuario

- **Cronómetro libre**: "Iniciar cronómetro" en una tarea (Hoy, la tarea abierta o la tarea del proyecto) o en Horas > Cronómetro. Uno a la vez: si inicias otro, el anterior se anota solo.
- Mientras corre se ve con el botón de parar: en computador, en la barra lateral encima de Ajustes; en el celular, encima de las pestañas (salvo en el Oráculo, Repaso, el simulacro, el editor de notas, las salas y Enfoque, donde taparía lo de abajo). Al parar, el tiempo queda en el registro de horas con su proyecto y su tarea.
- **Cronómetro olvidado**: si pasa de 3 horas, pregunta "¿Se te olvidó pararlo?" y deja anotar la duración real, seguir o descartar.
- **Hoja semanal** (Horas > Semana > Hoja semanal): filas por proyecto o área y una columna por día; se escribe la duración en la casilla (1:30, 1,5 o 90). Si baja, se recortan primero las horas a mano; las del enfoque y el cronómetro se borran en "Cada registro".
- **Aprobar horas** (plan Equipo): cada integrante manda su semana de un proyecto ("Mandar para aprobar") y el dueño la aprueba o la devuelve en "Horas del equipo". Aprobada, esa semana ya no se puede cambiar en ese proyecto. Quien edita no aprueba sus propias horas; el dueño sí.

### 3. Pruebas

`npm test` (reloj, cronómetro olvidado, hoja semanal y cómo se edita una casilla) y `bash tests/run_sql.sh` (incluye `tests/sql/24b_pruebas.sql`: cronómetro, tarea del proyecto, mandar, aprobar, candado de la semana aprobada, devolver y plan Equipo).

## Versión 25 (parte 3): proyectos de trabajo

### 1. Migración y despliegue

Corre otra vez `supabase/schema_v24.sql` completo (la fase 3 requiere también schema_v20). Agrega a `project_tasks` prioridad, etiquetas, "bloqueada por" y repetición; crea `project_rules` y `project_updates`, y `project_rules_tick`. Despliega otra vez `ai` (tarea `project_update`) y `billing-charge` (revisa cada hora las reglas "cuando se venza"):

```
npx supabase functions deploy ai
npx supabase functions deploy billing-charge --no-verify-jwt
```

### 2. Lo que cambia para el usuario

- En la tarea del proyecto, "+ Prioridad, etiquetas, bloqueos y repetir": prioridad (urgente, alta, normal, baja), etiquetas (#cliente), "bloqueada por" otras tareas del proyecto y repetición (como en las tareas personales; necesita fecha).
- En el tablero y la lista se ven la prioridad, "Espera: …" si está bloqueada, la repetición y las etiquetas. Filtros arriba: lo mío, cada prioridad, bloqueadas y cada etiqueta.
- Al terminar una tarea que se repite nace la siguiente en la primera columna. Al terminar la última que bloqueaba otra, le avisa a quien la tiene.
- Opciones > **Reglas automáticas**: "cuando pase a una columna", "cuando se cree una tarea" o "cuando se venza", entonces "asignar a", "avisar a" o "avisar a quien la tiene". Con Gratis, 2 por proyecto; con Pro, 20.
- Opciones > **Estado del proyecto**: en curso, en riesgo o atrasado, con una nota; "Redactar con IA" la escribe con el informe semanal. Le llega a todo el equipo y se ve en la barra del proyecto.

### 3. Pruebas

`npm test` (etiquetas, bloqueos, filtros, prioridad, reglas, estado sugerido y el de la IA) y `bash tests/run_sql.sh` (incluye `tests/sql/24c_pruebas.sql`).

## Versión 25 (parte 4): entradas y clientes

### 1. Migración

Corre otra vez `supabase/schema_v24.sql` completo. La fase 4 crea `project_links` y `project_requests`, y las funciones `project_link_set`, `public_form_info`, `public_form_submit` y `public_project_view` (estas tres se pueden llamar sin sesión, con la llave anónima). No hay que desplegar funciones ni tocar el droplet: las páginas `/solicitar/<enlace>` y `/avance/<enlace>` son de la app web.

### 2. Lo que cambia para el usuario

- En cada proyecto, Opciones > **Enlaces para el cliente**:
  - **Formulario de solicitudes**: quien tenga el enlace escribe su nombre, correo, qué necesita y para cuándo, sin cuenta. Llega como tarea (#solicitud) a la columna nueva "Solicitudes" y avisa a quien edita. Tiene campo trampa para robots y tope (30 por hora por proyecto, 5 al día por correo).
  - **Avance para el cliente**: porcentaje terminado, columnas, lo que viene en 3 semanas, lo entregado en 30 días y el último estado del proyecto. No muestra nombres, correos, comentarios, horas ni las tareas con la etiqueta #interno ni las solicitudes.
  - Para cada uno: prender o apagar, copiar, mandar por WhatsApp, un mensaje propio arriba y "Cambiar enlace" (el viejo deja de servir).
  - Con Gratis, en 1 proyecto.
- El informe semanal del proyecto también se manda por WhatsApp.

### 3. Pruebas

`npm test` y `bash tests/run_sql.sh` (incluye `tests/sql/24d_pruebas.sql`: enlaces, quién los maneja, formulario sin sesión con validación, robots y tope, la tarea y su aviso, la vista sin datos internos, cambiar y apagar, y el tope de Gratis).

## Versión 25 (parte 5): reuniones encadenadas

### 1. Migración y despliegue

No hay SQL nuevo. Hay que desplegar dos funciones:

```
npx supabase functions deploy ai
npx supabase functions deploy oracle
```

Sin el despliegue, todo sigue funcionando como antes: el acta sale con el formato de siempre y el Oráculo no tiene el modo de reuniones.

### 2. Lo que cambia para el usuario

- En modo Trabajo, la nota nueva de una reunión ("Reunión del ...") empieza con **Viene de la reunión del ...**: las tareas (con responsable y fecha) y los pendientes del acta anterior de la misma área, y las casillas sin marcar de esa nota. Sin repetidos y máximo 15.
- Al hacer el acta, la IA recibe esos pendientes y dice cuáles se resolvieron y cuáles siguen abiertos.
- **Formato del acta**: breve, completa o detallada, y una indicación propia de hasta 300 caracteres. Se guarda en la cuenta (`user_prefs.settings.minutes`).
- El acta se manda por **WhatsApp** (con títulos en negrita), por **correo** (se abre el correo con asunto y texto) o se copia.
- En el Oráculo, el filtro **Mis reuniones** responde con las últimas 15 actas: qué se decidió, quién quedó con qué y lo que sigue abierto. En los demás filtros, si una nota tiene acta, el Oráculo la lee junto a la nota.

### 3. Pruebas

`npm test` (lo abierto que pasa a la siguiente, el formato y los pendientes en el pedido a la IA, el texto para WhatsApp y el correo).

## Versión 25 (parte 6): planear el día

### 1. Migración y despliegue

Nada. Es solo de la app.

### 2. Lo que cambia para el usuario

- En Hoy > Mi día, debajo de lo que no tiene hora: **Sugerir horario**. Acomoda esas tareas en los huecos libres del día (fuera del horario, los eventos y lo que ya tiene hora), primero lo vencido y lo que vence antes, luego lo urgente. Empieza en el siguiente cuarto de hora y deja 5 minutos entre una y otra. Hasta las 7 p. m. en modo Trabajo y las 10 p. m. en los demás. Muestra la propuesta y lo que no cabe; nada se guarda hasta que se acepta.
- En modo Trabajo, **Cerrar el día** muestra las horas registradas hoy (enfoque, cronómetro y a mano) y, si son pocas, recuerda anotarlas con un botón que abre "Anotar horas".

### 3. Pruebas

`npm test` (huecos libres, orden y acomodo sin cruces, lo que no cabe, el recordatorio de horas).

## Versión 26 (parte 1): marca base (Margen)

### 1. Migración y despliegue

Nada en Supabase. Es solo la app: al fusionar se publica sola en el droplet. Los archivos nuevos viajan en `public/` (la letra en `public/fonts/`, los íconos y `og.png`).

### 2. Lo que cambia para el usuario

- **Logo nuevo** en la barra lateral, el inicio de sesión, la bienvenida y las páginas públicas del cliente: la raya del margen junto a la K. El nombre va en minúscula, "kaderno".
- **Íconos nuevos:** pestaña del navegador, app instalada (Android e iOS), insignia de los avisos e imagen al compartir un enlace.
- **Letra de la marca** (Plus Jakarta Sans), servida desde el mismo servidor.
- **Temas Kaderno oscuro y Kaderno claro** con **color de acento** a elección: coral (el de la marca), lápiz azul, hoja verde, uva, mostaza o rosa. Los temas de antes siguen en Personalizar > Más colores.
- El panel del inicio de sesión es una hoja de cuaderno en tinta con la raya del margen.
- Quien tenía los valores de fábrica de antes (tema Medianoche y letra del sistema) pasa una sola vez a Kaderno oscuro con la letra de la marca. Quien había escogido otro tema u otra letra los conserva. Si después vuelve a escoger Medianoche, se respeta.
- La app instalada puede tardar en mostrar el ícono nuevo: el sistema lo actualiza solo, o al reinstalarla.

### 3. Para regenerar los íconos

Solo si cambia el logo: `npx tsx scripts/brand-icons.ts` (usa el Chromium de Playwright). La guía de la marca está en `docs/marca.md`.

### 4. Pruebas

`npm test` (incluye `tests/v26.test.ts`: contraste de cada acento en los dos temas, el dibujo del logo en todas sus versiones, el paso a la marca una sola vez y la letra servida desde la app).

## Versión 26 (parte 2): espacios Estudio y Trabajo

### 1. Migración

Corre `supabase/schema_v25.sql` en Supabase (es idempotente). Agrega `subjects.space` ('estudio' o 'trabajo'). Vacío cuenta como el modo de la persona, así que quien usa un solo modo no nota nada. Sin la migración la app funciona, pero con "Los dos" todo se ve junto.

### 2. Lo que cambia para el usuario

- **Dos espacios** para quien tiene "Los dos": Estudio y Trabajo.
  - Se cambia arriba de la barra lateral, en Hoy (celular) o con Alt+1 y Alt+2.
  - Cada espacio muestra solo sus materias o áreas, sus tareas, su navegación y su tema.
  - Las tareas sin materia ni área se ven en los dos.
  - El cambio de espacio se funde en unos 400 ms.
- **Hoy** avisa en una línea lo del otro espacio que vence hoy o está vencido ("En Trabajo: 2 cosas para hoy"); al tocarla, cambia de espacio.
- **Primera vez:** a quien ya tenía "Los dos" se le pregunta una sola vez qué es de Estudio y qué de Trabajo, con una sugerencia (créditos es Estudio; tarifa, cliente o plantilla de acta es Trabajo). Después se cambia en cada una con Editar > Espacio.
- Al pasar de un modo a "Los dos", lo que ya había queda en el espacio de ese modo, sin preguntar.
- **Lo que sale de Trabajo:**
  - la pestaña Calificaciones y el promedio de la ficha del área;
  - los créditos y la meta de nota;
  - "Ponte a prueba antes del parcial";
  - el promedio en Áreas;
  - Repaso y Mascota en la barra;
  - la invitación a la mascota, el ritual del semestre, "¿Cómo te fue?" y el plan de repaso en Hoy.
- **Palabras de Trabajo:** "Responsable", "Lugar" y "Enlace" en la ficha; "Reunión de X ahora", "Próxima reunión" y "Agenda".
- **Tema de Trabajo:**
  - Neutros fríos (grafito y hueso) con acento a elección: terracota, acero, pino o ciruela.
  - Texto en Inter y títulos en Newsreader (serif), las dos servidas desde la app.
  - En el logo, la raya del margen pasa a cobre o terracota.
  - Los temas de "Más colores" y los fondos de pantalla son de Estudio; en Trabajo se usa el Kaderno claro u oscuro según el tema elegido.
- **Personalizar** dice qué espacio se está ajustando. Claro u oscuro y la letra valen para los dos; el acento es de cada uno.
- **Horas y Proyectos** con "Los dos": en Trabajo no se cuentan las horas de las materias de Estudio, y los proyectos de una materia de Estudio no salen en Trabajo (y al revés).

### 3. Pruebas

`npm test` (contraste del tema de Trabajo con cada acento, qué se ve en cada espacio, lo que sale de Trabajo) y `bash tests/run_sql.sh` (incluye `tests/sql/25_pruebas.sql`).

## Versión 26 (parte 3): semestres e historial académico

### 1. Migración

Corre otra vez `supabase/schema_v25.sql` completo. La fase 3 crea:
- `terms` (los semestres, uno abierto a la vez, máximo 40 por persona).
- `subjects.term_id`.
- Las funciones `term_close` y `term_add_past`. Calculan el promedio y los créditos en el servidor y validan la escala.

Sin la migración, Historial avisa que falta este paso y lo demás sigue igual.

### 2. Lo que cambia para el usuario

- **Historial académico** (barra lateral en Estudio, botón en Materias y en Ajustes):
  - Promedio acumulado, créditos aprobados y escala de notas.
  - Los semestres, con el detalle de cada uno y una gráfica del promedio por semestre.
  - Descarga en PDF, sobrio: Times New Roman, todo en negro.
- **Semestre abierto:**
  - Se crea solo con el nombre que toca por la fecha (2026-2), y las materias de Estudio sin semestre quedan en él.
  - Muestra la nota en curso de cada materia.
  - "Nombre y fechas" para ponerle inicio y fin.
- **Cerrar el semestre**, en 3 pasos:
  1. Nota final de cada materia (sale de las calificaciones y se corrige) y su estado: aprobada, reprobada, homologada o retirada.
  2. Resumen: promedio, créditos, horas de estudio, tarjetas repasadas, racha más larga y la mejor materia.
  3. Una línea de lo que te llevas y el nombre del siguiente semestre.

  Al cerrar, el resumen queda guardado tal cual, las materias se archivan con sus apuntes y se abre el siguiente semestre.
- **Agregar un semestre que ya terminó**, a mano, para que el acumulado esté completo.
- **Escala de notas propia:** nota máxima, nota para aprobar y decimales. Hay atajos para 0 a 5, 0 a 10, 0 a 100 y 0 a 20. Se usa en los promedios de Materias, en la ficha de cada materia y en el historial. Los semestres con otra escala se convierten para el acumulado.
- **Recordatorio en Hoy:** "Cierra el semestre" cuando pasa su fecha de fin (o en junio y diciembre si no tiene fecha).

### 3. Pruebas

`npm test` (escala, nombres de semestre, promedio igual al del servidor, acumulado con escalas distintas, racha y el PDF) y `bash tests/run_sql.sh` (incluye `tests/sql/25b_pruebas.sql`).

## Versión 26 (parte 4): movimiento e interfaz

### 1. Migración

Ninguna. Es solo de la app.

### 2. Lo que cambia para el usuario

- **Paso entre pantallas:** en los navegadores que lo permiten (Chrome, Edge y Safari reciente), cambiar de pantalla hace un fundido corto y la barra lateral y la barra de abajo se quedan quietas. Al abrir una materia desde Materias, su ícono viaja hasta el encabezado de la ficha. Donde el navegador no lo permite, la pantalla cambia como antes.
- **Listas que se acomodan:** en Hoy, al completar, borrar o mover una tarea, las demás se deslizan a su nuevo lugar en vez de saltar.
- **Deslizar una tarea en el teléfono:** a la derecha la completa ("Hecha") y a la izquierda la pasa a mañana. El aviso de abajo permite deshacer. El desplazamiento vertical de la lista sigue igual, y el toque al soltar no abre la tarea.
- **Hojas que se cierran deslizando:** en el teléfono las hojas de abajo tienen una agarradera; se cierran arrastrando el encabezado hacia abajo.
- **Barra de abajo:** la marca de la pestaña activa se desliza de una a otra.
- **Números que suben:** el promedio y los créditos de Historial y el total de Horas cuentan hasta su valor al aparecer.
- **Pantallas vacías:** una hoja de cuaderno con la raya del margen, el dibujo de la marca.
- **Esquinas por espacio:** Estudio es más redondo y Trabajo más recto (botones, campos, tarjetas, filas y hojas).
- Con "reducir movimiento" activado en el sistema no hay fundidos, ni deslizamientos, ni conteos.

### 3. Pruebas

`npm test` (radios por espacio) y una vuelta a mano en el teléfono: deslizar una tarea en Hoy a cada lado y cerrar una hoja arrastrando.

## Versión 26 (parte 5): mascotas

### 1. Migración

Corre otra vez `supabase/schema_v25.sql` completo. La fase 5:
- Agrega la ropa nueva al catálogo de la base (`_pet_item`) con dos lugares nuevos: espalda y mano. `pet_buy` y `pet_wear` los aceptan.
- Cambia los premios: las tareas de Trabajo no pagan (quedan marcadas en 0, así no pagan después) y el enfoque solo paga con el temporizador de Enfoque y en Estudio. Las horas anotadas a mano o con el cronómetro de Trabajo ya no pagan.
- Qué cuenta como Trabajo: la materia con espacio Trabajo; sin materia, una cuenta que está solo en modo Trabajo.

Sin la migración, la ropa nueva se ve en la tienda pero la base no la vende ("Eso no está en la tienda").

### 2. Lo que cambia para el usuario

- **Dibujo:** contorno en la tinta de la marca en vez de negro y sombra cálida. Los sombreros ya no se cortan arriba en el perro, el loro y el pingüino.
- **Movimiento:** camina en 6 cuadros, la cola y la cresta se mecen, se agacha antes de saltar y se aplasta al aterrizar, respira y parpadea a destiempo, y mira hacia el puntero cuando está cerca.
- **Caras nuevas:** cansada después de 2 horas de enfoque casi seguidas y sorprendida con un logro (además de concentrada y contenta).
- **Ropa nueva, en tres grupos en la tienda:**
  - Para estudiar: lápiz (mano), lápiz en la oreja, lentes de lectura, mochila (espalda), más las gafas y el birrete.
  - Para trabajar: taza (mano), carné, corbata, maletín (mano), audífonos con micrófono, más el corbatín.
  - Para lucirse: la capa (espalda) y lo de siempre.
  - La bufanda, la corbata, el carné y la capa se quedan un poco atrás al caminar y al saltar.
- **En Trabajo:** la mascota se queda quieta en su esquina, no saluda ni avisa, no salta, y solo habla al cerrar el día o si la tocas (sin tienda en el globo). No gana monedas allí.
- **Al cerrar el día** (en Hoy) la mascota se despide, en los dos espacios.

### 3. Pruebas

`npm test` (la ropa cabe en las 4 especies en los 16 cuadros, la bufanda se queda atrás, el catálogo es igual al de la base, modo discreto, parpadeo y aterrizaje) y `bash tests/run_sql.sh` (incluye `tests/sql/25c_pruebas.sql`: espalda y mano, Trabajo no paga, horas a mano no pagan, cuenta solo de Trabajo).

## Versión 26 (parte 6): pulido

### 1. Migración

Ninguna. Es solo de la app.

### 2. Lo que cambia para el usuario

- **Nota compartida** (la página pública): encabezado con el logo y pie "Escrita en Kaderno". Si el enlace ya no funciona, la hoja de cuaderno del estado vacío.
- **Bienvenida en el teléfono:** solo el paso actual lleva nombre (antes se partían las palabras, "Compañer o").
- **Documentos:**
  - Los apuntes en PDF quedan como los demás documentos: Times New Roman, todo en negro, sin cajas de color.
  - Los apuntes y el historial académico llevan al final el logo en una tinta y "Hecho con Kaderno".
  - Las cuentas de cobro y los informes de horas no llevan la marca: son documentos de quien los manda.
- **Contraste:** el acento y los textos de estado (verde, amarillo, rojo) se leen a 4,5:1 sobre la tarjeta y sobre el fondo en todos los temas. En los temas claros de "Más colores" el acento quedó un poco más oscuro; los temas Kaderno no cambian.

### 3. Rendimiento

Medido con el mismo juego de datos, la CPU 4 veces más lenta y la mediana de 5 cargas de Hoy, contra `main` (v24):

| | v24 | v26 |
|---|---|---|
| Primer contenido pintado | 988 ms | 1.008 ms |
| Contenido principal pintado | 2.028 ms | 2.016 ms |
| Tareas largas al cargar | 909 ms | 921 ms |
| Tareas largas en 10 s quieta (con la mascota) | 0 ms | 0 ms |
| JS de arranque (gzip) | 631 KB | 690 KB |

Los 59 KB de más son las funciones de v25 y v26. La tira de la mascota (16 cuadros) se arma en unos 2 ms y se guarda.

### 4. Pendiente

- `og:image` en `public/index.html` es relativo (`/og.png`). Cuando el dominio sea definitivo hay que ponerlo completo (`https://<dominio>/og.png`), porque algunas redes no leen rutas relativas.

### 5. Pruebas

`npm test` (contraste de todos los temas sobre tarjeta y fondo, documentos sobrios con su pie).

## Arreglo: la página se congelaba al cambiar de pantalla

Desde v26 (parte 4), cada cambio de pantalla dejaba la página quieta unos 4 segundos. La transición del navegador esperaba a que se pintara la pantalla nueva, pero el navegador no pinta mientras arranca una transición: se quedaba esperando hasta su límite de 4 segundos. Ahora se navega directo y la pantalla nueva entra con su animación de CSS, que no bloquea.

Medido con la CPU 4 veces más lenta, ida y vuelta entre Materias, Oráculo, Horario y Hoy: antes 4.124 ms por cambio (mediana), ahora 227 ms.

No hay migración. Se pierde que el ícono de la materia viaje hasta su ficha.

## Versión 27 (parte 1): importante y la matriz de Eisenhower

### 1. Migración

Corre `supabase/schema_v26.sql` (es idempotente). Agrega `assignments.important`. Sin la migración, la vista Matriz se ve igual, pero la estrella avisa que falta este paso.

### 2. Lo que cambia para el usuario

- **Estrella de "importante"** en las tareas:
  - En la tarea abierta.
  - En el menú de cada fila ("Marcar importante").
  - En la vista Matriz, con un toque.
  - En las demás listas se ve una estrella pequeña junto a la tarea.
- **Vista Matriz en Hoy**, junto a Lista y Mi día, con cuatro cuadrantes:
  - Hacer ya.
  - Planear.
  - Hacer rápido (en Trabajo: Delegar).
  - Soltar.
  - Urgente sale de la fecha: lo vencido y lo que vence en los próximos 2 días (se cambia en Ajustes > Urgente en la Matriz).
  - En el computador las tareas se arrastran entre cuadrantes. Al cambiar de columna cambia la estrella; al cambiar de fila se ofrece mover la fecha.
  - Las tareas de proyecto entran por su prioridad.
- **Ritual del lunes:** lo importante sale primero en las sugerencias, y una línea dice cuánto de lo terminado la semana pasada era importante.

### 3. Pruebas

`npm test` (urgente, importante, cuadrantes, arrastrar, balance de la semana) y `bash tests/run_sql.sh` (incluye `tests/sql/26_pruebas.sql`).

## Versión 27 (parte 2): la rana y la lista para mañana

### 1. Migración

Corre otra vez `supabase/schema_v26.sql`. La fase 2 agrega `assignments.frog` y `assignments.plan_order`, y las funciones `day_set_frog` (una rana por día) y `day_plan_list` (hasta 6 en orden). Sin la migración, la tarjeta de la rana y la lista avisan qué falta.

### 2. Lo que cambia para el usuario

- **La rana en Mi día:** una tarjeta arriba propone lo más pesado e importante del día (importante, largo y lo que más lleva esperando).
  - Se acepta con "Esa", o se elige otra.
  - Hoy tiene "Empezar", que abre el enfoque con esa tarea.
  - Va primero en "Sin hora" y en la lista de Hoy se marca como "Primero".
  - En Trabajo la tarjeta se llama "Lo primero de hoy".
- **Cerrar el día, nuevo paso "Mañana"** (método Ivy Lee): se escogen hasta 6 tareas en orden.
  - Quedan planeadas para mañana en ese orden, y la primera es la rana.
  - Es opcional ("Seguir sin lista").
- **La mascota** recuerda la rana en la mañana (antes de la 1 p. m.).
- **Regla 1-3-5** (Ajustes, apagada por defecto): Mi día avisa si el día tiene más de 1 tarea grande, 3 medianas o 5 pequeñas, según el tiempo estimado.
- **Arreglo:** una tarea pasada a otro día sin hora (por ejemplo con "Pasarla a mañana") ya no desaparece de Mi día.

### 3. Pruebas

`npm test` (sugerencia de la rana, orden de Mi día, 1-3-5, candidatas de la lista, recordatorio de la mascota) y `bash tests/run_sql.sh` (incluye `tests/sql/26b_pruebas.sql`: una rana por día, la lista en orden, máximo 6, tareas ajenas).

## Versión 27 (parte 3): más formas de enfocarse

### 1. Migración

Ninguna.

### 2. Lo que cambia para el usuario

- **Enfoque, tres formas** (arriba del reloj):
  - Pomodoro: como antes, con tus tiempos.
  - 52/17: 52 minutos de trabajo y 17 de pausa.
  - Flujo: el reloj cuenta hacia arriba hasta que pares (máximo 90 min). Al terminar, la pausa es un quinto de lo trabajado, entre 5 y 20 min.
  - Se cambia con el reloj quieto. Las monedas de la mascota cuentan igual en las tres.
- **Bloque que se pasa:** si empiezas el enfoque desde una tarea con hora, al pasar la hora de fin de su bloque (hora más estimado) sale un aviso: "Se acabó el bloque. ¿La cierras aquí?", con "Terminar". Si sigues, vuelve a avisar en 15 min.

### 3. Pruebas

`npm test` (pausa de Flujo, pausa según la forma, tiempos de cada forma y el aviso del bloque). En el navegador, con el reloj adelantado, 40 min en Flujo dan una sesión de 40 min y una pausa de 8.

## Versión 27 (parte 4): Algún día y tandas

### 1. Migración

Corre otra vez `supabase/schema_v26.sql`. La fase 4 agrega `assignments.someday`. Sin la migración, "Mandar a Algún día" avisa qué falta.

### 2. Lo que cambia para el usuario

- **Algún día:** ideas sin compromiso, aparte de la bandeja.
  - No salen en Hoy ni cuentan como "por ordenar".
  - Se mandan desde el menú de una tarea, desde la bandeja ("Algún día (A)") o al soltarlas en el cuadrante "Soltar" de la Matriz.
  - En Hoy, "Algún día: N" abre la lista con "Rescatar" (vuelve a la bandeja) y "Borrar".
  - El ritual del lunes muestra 3 al azar para rescatar o soltar.
- **Tandas en Mi día:** si hay 2 o más tareas cortas (30 min o menos) del mismo tipo o de la misma materia, aparece "Tanda de ...: N cortas" con "Juntar".
  - Las pone seguidas en el primer hueco donde caben.
  - No se guarda nada hasta aceptar.

### 3. Pruebas

`npm test` (tandas, dónde caben, Algún día aparte de la bandeja, los 3 al azar del día) y `bash tests/run_sql.sh` (incluye `tests/sql/26c_pruebas.sql`).

## Versión 28: logo del lápiz y nuevo inicio de sesión

### 1. Migración

No hay. Solo cambian la app y los íconos de `public/`, que se suben con el despliegue normal.

### 2. Lo que cambia para el usuario

- **Logo:** la raya del margen ahora es un lápiz coral sin borrador, con madera y punta de grafito. Cambian el ícono de la app, el favicon, la insignia de los avisos y la imagen para compartir (`og.png`).
  - Los navegadores guardan el favicon un buen rato: si se ve el viejo, basta recargar sin caché.
  - En el teléfono, quien instaló la app puede seguir viendo el ícono viejo hasta que el sistema la actualice.
- **El logo que se escribe:** en el login, el registro y Bienvenida, el lápiz escribe la K y vuelve a su lugar. Se repite al tocarlo y con "reducir movimiento" se ve quieto.
- **Login y registro a pantalla completa:**
  - En el computador, la pantalla se parte en dos: a la izquierda un cuaderno de tinta con el logo, el titular, la vista de "Hoy" y lo que trae Kaderno; a la derecha el formulario, sin cuadro.
  - En el teléfono, el cuaderno va arriba como franja y el formulario debajo, a todo el ancho.
  - Entradas suaves por partes, el selector de Entrar o Crear cuenta se desliza y los campos marcan el foco.

### 3. Pruebas

`npm test` (piezas del lápiz sin borrador, silueta de una tinta, orden de los trazos de la animación y login sin cuadro). En el navegador, revisar `/login` en 1440, 1024 y 390 px, y el favicon.

## Versión 29 (parte 1): base táctil para el celular

### 1. Migración

No hay. Cambian la app, `public/index.html`, el manifiesto y las capturas de `public/screenshots/`.

### 2. Lo que cambia para el usuario

- **Más fácil de tocar:** en pantallas táctiles, cada botón tiene al menos 44 px de área, aunque se vea más pequeño. En el computador nada cambia.
- **Sin zoom al escribir en el iPhone:** Safari ya no acerca la pantalla al tocar un campo. El zoom con dos dedos sigue funcionando. En Android no se toca nada.
- **Toque inmediato:** sin la espera del doble toque y sin el recuadro gris de Android; lo que se toca se ve presionado.
- **Teclado:** mientras escribes en el celular se esconde la barra de pestañas; en Android el contenido se acomoda encima del teclado (por ejemplo la caja del Oráculo).
- **Hojas y diálogos:** al llegar al final del desplazamiento ya no se mueve lo de atrás.
- **Instalar la app:** el manifiesto trae capturas y categorías. Android muestra la ventana de instalación con imágenes.
- Campos base y del login con letra de 16 px.

### 3. Pruebas

`npm test` (incluye `tests/v29.test.ts`). En un iPhone: tocar el correo del login no debe acercar la pantalla. En Android: abrir el Oráculo y escribir; la barra de pestañas se esconde y la caja queda encima del teclado.

## Versión 29 (parte 2): pantallas en el celular

### 1. Migración

No hay.

### 2. Lo que cambia para el usuario

- **Horario:** la cuadrícula ocupa todo el ancho. Antes las celdas medían 24 px y quedaba media pantalla vacía.
- **Encabezados:** si los botones de la derecha no caben, bajan debajo del título ("Tipos de tarea", "Horas" en un celular angosto). "Hoy" conserva sus íconos al lado.
- **Resúmenes de Materias y de cada materia:** cuadrícula de 2 (4 en tableta) en vez de una fila cortada.
- **Hoy:** en la tarjeta de la mascota los botones bajan en un celular angosto; el título ya no se parte a mitad de palabra.
- **Cifras:** "0 semanas", "45 min" con el número grande y la unidad más pequeña; ya no se cortan ("0 sem...").
- **Enfoque:** el reloj se achica en celulares bajos (iPhone SE) para que "Empezar" se vea sin desplazar.
- **Estudiar:** el botón de enviar del Oráculo ya no se sale de su caja a 320 px.
- **Horas:** la semana va en su propia línea en un celular angosto; flechas, tarifas y borrar con más área.
- **Cobrar:** el estado va junto a la fecha y las acciones tienen más área.
- **Tablero del proyecto:**
  - la columna casi llena la pantalla y se asoma la siguiente;
  - al deslizar se acomoda sola;
  - mover y agregar tarjeta tienen botones más grandes.
  - Las pestañas y los filtros se desvanecen en el borde cuando hay más.
- **Proyecto:** el encabezado respeta la zona de la hora en la app instalada.
- **Tipos de tarea:** subir, bajar y restablecer con botones de 40 px. En un celular angosto se toca la fila para editar.
- **Login en celulares bajos:** franja más pequeña, el formulario se ve sin desplazar y respeta la zona de la hora.
- **Letras diminutas:** iniciales y datos de las tarjetas del tablero, y letras de la racha, a 9,5 a 11,5 px como mínimo.

### 3. Pruebas

`npm test` (reglas de `lib/mobileLayout.ts` en `tests/v29.test.ts`). En el navegador, revisar a 320 x 568 y 390 x 844: Horario, Tipos de tarea, Horas, Enfoque, Materias, una materia, un proyecto y el login.

## Versión 29 (parte 3): sensación de app

### 1. Migración

No hay.

### 2. Lo que cambia para el usuario

- **Hojas que se cierran arrastrando hacia abajo**, desde la rayita o el título:
  - editar tarea;
  - Agregar;
  - el menú de una tarea (desde cualquier parte);
  - la hoja de tarjetas. Esta última ya lo prometía desde v26, pero en la web no respondía.
- Arrastrar dentro del contenido sigue desplazando; no cierra la hoja.
- **Vibración corta** en Android al completar una tarea (tocando el círculo o deslizando) y al abrir el menú con un toque largo. El iPhone no permite vibrar desde la web. Con "reducir movimiento" no vibra.
- Editar tarea respeta la zona del indicador de inicio del iPhone abajo.

### 3. Pruebas

`npm test`. En un celular: abrir una tarea y arrastrar la rayita hacia abajo (se cierra); arrastrar en medio del formulario (se desplaza, no se cierra); deslizar una tarea a la derecha en Android (vibra y queda hecha).

## Versión 29 (arreglo): franja negra abajo en el computador

No hay migración. Con "Tamaño de interfaz" en Pequeño aparecía una franja negra abajo, y con Grande o Muy grande se cortaba el final de la pantalla. Lo causaba el alto `100dvh` de la parte 1, que no respeta ese zoom. La raíz vuelve a medir el 100 % del alto. Para revisarlo, cambia el tamaño en Personalizar: la app debe llenar la ventana exacta en los cuatro tamaños.
