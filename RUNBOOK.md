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
