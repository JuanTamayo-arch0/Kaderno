# Kaderno — Plan de la tanda v10

Todo lo que pediste, con archivos, funciones y SQL concretos. Léelo, dime qué cambias y lo implemento tal cual quede aprobado.

---

## 0. Antes de nada: dos migraciones tuyas están pendientes

`supabase/schema_v8.sql` (columna `assignments.type` y `subjects.credits`) y `supabase/schema_v9.sql` (tabla `user_prefs` para que la personalización viaje entre dispositivos) siguen sin confirmarme que los corriste. Este plan agrega tres migraciones más encima (`v10`, `v11`, `v12`), y **si v8 y v9 no están aplicadas, las nuevas fallan o quedan a medias**. Al entregarte el zip te voy a dar el orden exacto: v8 → v9 → v10 → v11 → v12, todas idempotentes, todas se pueden correr dos veces sin romper nada.

---

## 1. Mi opinión sobre Proyectos (esto primero, porque cambia el resto del plan)

Te la doy sin adornos: **Proyectos es la mejor idea que has tenido para Kaderno, y también la que más fácil se puede arruinar.**

Se arruina si construyes un Trello. Si el resultado es un tablero kanban genérico con tarjetas, tu competencia pasa a ser Trello, Notion y ClickUp — herramientas gratis, con apps nativas, con años de pulido. Ahí pierdes, y además pierdes lo que te hace distinto.

Lo que te hace distinto es que **Kaderno ya sabe el contexto académico**: sabe que existen materias con color, sabe cuándo entregas, sabe cuánto estudiaste, y tiene una pantalla "Hoy" que el estudiante ya abre todos los días. Trello no sabe nada de eso. Entonces la jugada no es "hacer un tablero", es:

> **Las tareas de proyecto que me asignaron aparecen en mi "Hoy", mezcladas con mis tareas personales, con la etiqueta del proyecto.**

Esa sola frase es la diferencia entre un módulo más y la razón por la que un grupo entero de estudiantes se instala tu app. Porque el dolor real del trabajo en grupo no es "no tenemos tablero" — es *"nadie sabe qué le toca y nadie se acuerda"*. Un tablero que hay que ir a visitar no resuelve eso. Un tablero que te empuja el pendiente a la pantalla que ya miras, sí.

### Cómo le saco más valor (ordenado por impacto real)

**a) Bandeja unificada.** Lo de arriba. Tarea de proyecto asignada a mí → aparece en Hoy con su chip del proyecto y su color. Es la pieza número uno y va en la v1.

**b) Carga por integrante, visible para todos.** Un panel en el proyecto que muestre cuántas tareas tiene cada persona y cuántas cerró. Suena inocente y es lo más potente del módulo: el problema #1 del trabajo en grupo universitario es el que no hace nada, y hoy eso se discute a punta de percepción y resentimiento. Un contador lo vuelve un hecho. Esto se comparte por WhatsApp solo, es marketing gratis, y no lo tiene ninguna app académica que conozca.

**c) Entrar con código, no con correo.** Nada de "invita por email". El dueño genera un código de 6 caracteres tipo `K7F2QX` (o un link), lo tira al grupo de WhatsApp, y el resto entra pegándolo. Cero fricción. Y de paso: **cada invitado es un registro nuevo en Kaderno**. Proyectos es tu único canal de crecimiento viral — un estudiante solo no invita a nadie, un estudiante con trabajo en grupo invita a cuatro. Vale la pena diseñarlo pensando en eso.

**d) Proyecto ligado a una materia.** Si el proyecto es de "Cálculo II", hereda el color, y sus entregas cuentan en la carga de esa materia y en el calendario. Es una línea de código (`projects.subject_id`) y amarra todo el módulo al resto de la app.

**e) Plantillas de proyecto.** "Informe de laboratorio", "Exposición", "Proyecto final". Al crear, el proyecto ya nace con sus columnas y su checklist estándar. Convierte "crear proyecto" de 15 minutos de trabajo en 10 segundos, que es la diferencia entre que lo usen y que no.

**f) Registro de actividad.** "Ana movió *Marco teórico* a Hecho · ayer 8:14pm". Trazabilidad. Sirve para coordinarse y sirve, cuando toca, para mostrarle al profesor quién hizo qué. Los estudiantes valoran esto muchísimo más de lo que uno esperaría.

**g) Y aquí el ángulo de negocio,** por si algún día cobras: personal gratis para siempre, y el límite lo pones en proyectos (por ejemplo 1 proyecto activo gratis, ilimitados en Pro). Es el punto natural para cobrar porque es donde hay más valor y donde el pago se puede repartir entre varios.

### Lo que NO haría todavía

Archivos, comentarios por tarjeta, roles finos y tiempo real (websockets). Tú mismo dijiste que archivos es opcional, y coincido: **archivos es lo que más cuesta y lo que menos se usa** en la primera versión (los estudiantes ya se pasan los archivos por WhatsApp y Drive). Dejo la tabla y el bucket preparados en el SQL, pero la interfaz de archivos la construyo después, cuando ya haya gente usando el tablero.

### Lo importante del alcance

Proyectos, bien hecho, es tan grande como todo lo que pediste en los otros seis puntos juntos. Por eso el plan va **en dos entregas**, no en una. Si intento meter todo de un golpe te llega un zip enorme, difícil de probar, y si algo se rompe no sabemos qué fue.

---

## 2. Entrega A — mejoras a lo que ya existe

Esta es la tanda rápida y de bajo riesgo. Todo es sobre pantallas que ya usas a diario.

### A1. Colores de materia en "Hoy"

Encontré exactamente el problema. En `app/(tabs)/index.tsx` la tarjeta **móvil** (`renderTaskCard`) ya tiene el color: `borderLeftWidth: 4, borderLeftColor: s?.color`. La tarjeta de **escritorio** (línea ~244) no lo tiene: es `backgroundColor: C.surface, borderColor: C.line` y el chip de materia usa gris neutro (`C.surface2`). Por eso en el computador se ve todo igual.

Qué hago: le pongo a la tarjeta de escritorio la misma barra lateral de 4px con el color de la materia (gris cuando está hecha), el chip de materia con el color de la materia en vez de gris (`su.color + '22'` de fondo, `su.color` de texto), y un punto del color al lado del título. Queda idéntico en criterio al móvil, y de paso reviso `WeekStrip` y la lista de "Completadas" para que no queden inconsistentes.

### A2. Calendario: puntos por materia, tamaño según cantidad

En `components/MiniCalendar.tsx` reemplazo `dotColors()` — que hoy da un punto por color distinto, tope 4 — por un agrupador por materia:

```
día → { subject_id → { color, cantidad, tieneExamen } }
```

Cada materia = **un** punto, y el diámetro crece con la cantidad: 1 tarea → 6px, 2 → 8px, 3 → 10px, 4 o más → 12px. Si esa materia tiene un examen ese día, el punto lleva un anillo rojo delgado en vez de pintarse todo rojo — así no se pierde de qué materia es (hoy el examen se come el color de la materia, que es un bug conceptual). Máximo 4 puntos por celda y si hay más materias, un `+N` chiquito. Las celdas suben de 36 a 40px de alto para que los puntos grandes respiren.

### A3. Se elimina la pantalla de calendario y el widget se va a "Hoy"

Borro `app/calendario.tsx`. Está referenciado en **cuatro** lugares y los actualizo todos:

| Archivo | Línea | Qué era | Qué queda |
|---|---|---|---|
| `app/(tabs)/_layout.tsx` | 29 | Barra lateral → Calendario | **Proyectos** |
| `app/(tabs)/index.tsx` | 135 | Grid rápido → Calendario | **Proyectos** |
| `app/(tabs)/index.tsx` | 206 | Botón cabecera escritorio | se quita (el calendario ya está en la página) |
| `app/(tabs)/index.tsx` | 326 | Botón cabecera móvil | hace scroll al widget |

Ese hueco que deja Calendario en la barra lateral y en el grid rápido es justo el que necesita Proyectos: la barra de pestañas móvil ya tiene 6 pestañas y una séptima queda apretada, así que Proyectos entra como ruta suelta accesible desde ahí. Encaja perfecto.

Ubicación del widget: en escritorio, arriba de la columna derecha de 340px (encima de "Tu enfoque hoy") con `embedded`, así se ve siempre sin pelear con la lista de tareas. En móvil, entre `WeekStrip` y la lista, colapsable como está hoy pero abierto por defecto. `MiniCalendar` ya acepta `embedded`, así que esto es de poca fricción.

### A4. Descripción y microtareas con barra de progreso

`description` **ya existe** en la tabla `assignments` y en el tipo `Task` — lo que falta es interfaz, y hay un bug silencioso: `updateTask()` en `lib/db.ts` no acepta `description` en su patch, así que hoy es imposible editarla. Se arregla.

Microtareas: tabla nueva, no un jsonb. Un jsonb es más rápido de escribir pero después no se puede consultar, ordenar ni asignar a un integrante, y en Proyectos voy a necesitar exactamente eso.

`supabase/schema_v10.sql`:

```sql
create table if not exists public.assignment_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  assignment_id uuid not null references public.assignments on delete cascade,
  title text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz default now()
);
alter table public.assignment_steps enable row level security;
create policy "assignment_steps own" on public.assignment_steps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists assignment_steps_assignment_idx
  on public.assignment_steps(assignment_id, position);
notify pgrst, 'reload schema';
```

En `lib/db.ts`: tipo `Step`, más `getSteps(assignmentId)`, `getStepsFor(assignmentIds[])` (una sola consulta para toda la lista de Hoy, no una por tarea), `addStep`, `toggleStep`, `deleteStep`, `renameStep`, `reorderSteps`. Y `description` agregado al patch de `updateTask`.

En interfaz: `TaskModal` gana un campo de descripción multilínea y un editor de microtareas (agregar con Enter, marcar, borrar, arrastrar para reordenar en escritorio). En la tarjeta de Hoy, si la tarea tiene microtareas aparece una barra de progreso delgada con `2/5 · 40%`; se puede desplegar la tarjeta y marcar microtareas sin abrir el modal — esto último es lo que hace que de verdad se usen. Y cuando marcas la última microtarea, te pregunta si cierras la tarea completa.

### A5. Tipos de tarea propios

`lib/taskTypes.ts` hoy es 100% fijo, y `taskTypeMeta()` se llama de forma **sincrónica** en medio del render en cinco archivos. Eso manda el diseño: no puedo volverla `async`. Lo que hago es un registro en memoria — `loadTaskTypes()` trae los tipos del usuario al arrancar y los fusiona con los cuatro por defecto; `taskTypeMeta()` sigue siendo sincrónica y lee el registro, con los cuatro de siempre como respaldo. Cero cambios en los sitios que la llaman.

`supabase/schema_v11.sql`:

```sql
create table if not exists public.task_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  key text not null,              -- slug estable, ej. 'laboratorio'
  label text not null,            -- 'Laboratorio'
  icon text not null default '📌',
  color text not null default '#6aa9ff',
  position int not null default 0,
  created_at timestamptz default now(),
  unique (user_id, key)
);
alter table public.task_types enable row level security;
create policy "task_types own" on public.task_types
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
notify pgrst, 'reload schema';
```

`assignments.type` sigue siendo `text`, sin llave foránea — así una tarea nunca se rompe si borras el tipo (cae al respaldo "Tarea"). Interfaz: pantalla nueva `app/tipos.tsx` para crear/editar/borrar tipos (nombre, emoji desde una paleta, color desde la misma paleta que ya usan las materias), más un botón "+ Nuevo tipo" dentro del selector de tipo del `TaskModal` para no tener que salir. Los cuatro por defecto no se pueden borrar, pero **sí** se les puede cambiar nombre, emoji y color (se guardan como fila propia con la misma `key`, sobrescribiendo el default).

---

## 3. Entrega B — Proyectos v1

### Modelo de datos (`supabase/schema_v12.sql`)

Cinco tablas: `projects` (con `subject_id` opcional para heredar color y materia, `join_code` de 6 caracteres único), `project_members` (`project_id` + `user_id`, rol `owner`/`editor`/`viewer`), `project_tasks` (título, descripción, `status` de columna kanban, `assignee_id`, `due_date`, `position` numérica para ordenar sin renumerar todo), `project_task_steps` (microtareas, igual que en personal) y `project_files` (tabla y bucket creados pero **sin interfaz todavía**, como acordamos).

**El punto delicado y por qué lo menciono:** todo el resto de la app usa RLS de dueño único (`auth.uid() = user_id`). Eso no sirve para datos compartidos. Y la forma obvia de arreglarlo — que la política de `projects` consulte `project_members` y la de `project_members` consulte `projects` — produce **recursión infinita en las políticas**, que en Supabase se manifiesta como un error feo y difícil de diagnosticar. La solución correcta es una función auxiliar:

```sql
create or replace function public.is_project_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members m
                 where m.project_id = p and m.user_id = auth.uid());
$$;
```

Al ser `security definer` no pasa por RLS, entonces no recursa. Todas las políticas de proyecto se apoyan en ella: leer si eres miembro, escribir si eres miembro con rol distinto de `viewer`, borrar el proyecto sólo el `owner`. Entrar por código va por una función `join_project(code text)` también `security definer`, que valida el código e inserta la membresía — así nadie puede insertarse a un proyecto ajeno escribiendo directo en la tabla.

### Interfaz

`app/proyectos/index.tsx` — lista de mis proyectos, botón crear, campo "entrar con código".

`app/proyectos/[id].tsx` — la pantalla del proyecto, con tres vistas:

- **Tablero** (kanban). Cuatro columnas por defecto: Por hacer · En curso · En revisión · Hecho. En escritorio, arrastrar y soltar de verdad, usando eventos HTML5 nativos vía `Platform.OS === 'web'` (arrastrar en React Native Web con librerías es frágil; con `draggable`/`onDrop` nativos es sólido). En móvil, columnas con desplazamiento horizontal y un menú "Mover a →" en cada tarjeta, que es lo que funciona bien con el dedo.
- **Lista** — la misma información en tabla, ordenable por fecha o por responsable. En un celular pequeño esta vista es la útil.
- **Equipo** — integrantes, roles, el código de invitación con botón de copiar, y el panel de **carga por integrante** (tareas asignadas / cerradas por persona) del que hablé arriba.

Cada tarjeta: título, responsable (avatar con iniciales), fecha, chip de materia si el proyecto tiene materia, y barra de progreso si tiene microtareas.

### Y la pieza clave

En `app/(tabs)/index.tsx`, "Hoy" pasa a cargar **también** las tareas de proyecto asignadas a mí con fecha próxima, y las mezcla en los mismos grupos de urgencia que ya existen, con un chip del proyecto que las distingue. Un interruptor en Personalizar para apagarlo si molesta. Sin esto, Proyectos es un módulo aparte que se visita; con esto, es parte del hábito diario.

Sincronización en v1: recarga al enfocar la pantalla (que es como ya funciona todo) más deslizar para actualizar. Tiempo real con websockets queda para v2 — es fácil de agregar después y ahora sólo agregaría formas de fallar.

---

## 4. Riesgos que veo, dichos de frente

**El más probable:** que las políticas RLS compartidas no queden bien de una. Es la primera vez que esta base de datos tiene datos de varios usuarios en la misma fila y es donde históricamente se rompen estas cosas. Mitigación: pruebo las políticas con dos usuarios de mentira contra tu Supabase antes de darte la interfaz, y te documento cada política en el SQL.

**El segundo:** "Hoy" ya tiene 655 líneas y le estoy sumando el widget de calendario, microtareas, barra de progreso y tareas de proyecto. Va a quedar inmantenible. Aprovecho para sacar los componentes a `components/` (`TaskCard`, `SubtaskList`, `ProgressBar`, `TaskModal`) — mismo comportamiento, archivos separados. No es capricho, es lo que permite que la siguiente tanda no sea un dolor.

**El tercero:** el fondo personalizado se guarda como base64 dentro del jsonb de `user_prefs`. Una foto del celular son varios megas viajando en cada carga de preferencias. Sigue pendiente de la vez pasada; lo correcto es Storage + URL. Dime si lo meto en esta tanda o lo dejo para después.

---

## 5. Orden de trabajo y qué te llega

**Zip 1 — Entrega A** (A1 a A5): código fuente + `dist/` compilado, más `schema_v10.sql` y `schema_v11.sql`. Verificado con capturas en 1920, 1440, 1280, 1024, 768 y 420px, sin errores en consola.

**Zip 2 — Entrega B** (Proyectos v1): igual, más `schema_v12.sql` y las políticas ya probadas con dos usuarios.

En los dos, como siempre: **sin tu `.env`**, y `kaderno-config.js` con cadenas vacías para no pisar las credenciales de tu servidor. Tú sacas el `dist` y lo subes.

**Después, si quieres:** archivos en proyectos, comentarios por tarjeta, registro de actividad, tiempo real, plantillas de proyecto, y el fondo a Storage.

---

## 6. Lo que decides tú

1. ¿Va el plan en dos entregas, o quieres todo en un zip aunque sea más difícil de probar?
2. Las cuatro columnas del kanban — ¿fijas (Por hacer / En curso / En revisión / Hecho) o configurables por proyecto? Fijas es v1 sólido; configurables agrega tiempo.
3. ¿Meto ya el panel de carga por integrante en la v1? Yo digo que sí, es lo que hace que el módulo se comparta.
4. El fondo personalizado a Storage: ¿ahora o después?
5. ¿Confirmas que ya corriste `schema_v8.sql` y `schema_v9.sql`?

Con eso arranco.
