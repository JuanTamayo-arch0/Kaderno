# Kaderno: Plan de la tanda v11

Importación de tareas y edición en masa para Proyectos. Léelo, dime qué cambias y lo implemento tal cual quede aprobado.

---

## 0. Lo que asume este plan

Este plan se apoya en el modelo de datos de la Entrega B tal como quedó descrito en el plan v10 (`projects`, `project_members`, `project_tasks`, `project_task_steps` y la función `is_project_member`). No pude revisar el código de la carpeta `kaderno-entrega-B` porque tu computador se desconectó. Antes de escribir una línea voy a confirmar tres cosas en el código real y ajustar este plan si hace falta:

1. El nombre y el tipo de la columna de fecha en `project_tasks` (si hoy es `due_date date`, hay que pasar a `timestamptz` para guardar la hora).
2. Los valores exactos de `status` que usa el tablero.
3. Que `schema_v8` a `schema_v12` estén aplicados en tu Supabase. La nueva migración (`schema_v13.sql`) va encima de esas.

---

## 1. Alcance acordado

Entra en esta tanda:

- Importar tareas a un proyecto desde CSV o JSON, con fecha y hora de inicio y de entrega, responsable, estado, descripción y checklist.
- Botón "Copiar prompt para IA" en el importador, con los datos del proyecto ya llenos.
- Exportar el proyecto a CSV o JSON con el mismo formato.
- Edición en masa por selección dentro de la app (estado, responsable, fechas, correr fechas, borrar).
- Edición en masa por archivo: exportar, editar, volver a subir y ver los cambios antes de aplicarlos.
- Deshacer para importaciones y cambios masivos.

No entra:

- Tareas personales (solo Proyectos).
- Checklist a nivel de proyecto (solo el checklist de cada tarea).
- Archivos `.xlsx`.
- Tiempo real.

---

## 2. Formato de archivo (el contrato)

Un solo formato para importar, exportar y actualizar. Los encabezados se reconocen en español o inglés, sin importar mayúsculas ni tildes.

| Campo | Alias aceptados | Obligatorio | Notas |
|---|---|---|---|
| `id` | `id` | No | Solo al actualizar. Lo trae la exportación. |
| `titulo` | `title`, `tarea` | Sí | Hasta 200 caracteres. |
| `descripcion` | `description`, `detalle` | No | Hasta 5.000 caracteres. |
| `estado` | `status`, `columna` | No | Por hacer, En curso, En revisión, Hecho. También `todo`, `doing`, `review`, `done`. Por defecto: Por hacer. |
| `responsable` | `assignee`, `asignado` | No | Correo o nombre de un integrante. |
| `inicio` | `start` | No | Fecha y hora. |
| `entrega` | `due`, `fecha` | No | Fecha y hora. |
| `checklist` | `steps`, `subtareas` | No | Ver abajo. |
| `eliminar` | `delete` | No | Solo al actualizar. `sí` borra la tarea. |

**Fechas.** Se aceptan `2026-10-15`, `2026-10-15 14:30`, `2026-10-15T14:30`, ISO con zona (`2026-10-15T14:30-05:00`), `15/10/2026`, `15/10/2026 14:30` y `15/10/2026 2:30 pm`. Las fechas con barras se leen como día/mes/año. Sin zona explícita, se interpretan en hora de Bogotá. Si solo viene la fecha, la entrega queda a las 11:59 p. m. y el inicio a las 12:00 a. m. Si el inicio queda después de la entrega, la fila se marca con error.

**Checklist en CSV.** Ítems separados por `|`. Un ítem que empieza con `[x]` entra como hecho; `[ ]` o nada, como pendiente. Ejemplo: `[x] Buscar fuentes | Resumir | Citar en APA`.

**Checklist en JSON.** Lista de textos (`["Introducción", "Resultados"]`) o de objetos (`[{"texto": "Introducción", "hecho": false}]`). La raíz puede ser `{"tareas": [...]}` o directamente la lista.

**CSV.** Detecta el separador (`,`, `;` o tabulación), quita el BOM, lee UTF-8 y si encuentra caracteres dañados reintenta en Latin-1 (lo que exporta Excel en Windows en español). Soporta campos entre comillas con saltos de línea.

**Exportación.** CSV con `;` y BOM UTF-8, que es lo que Excel en español abre bien con doble clic. Las celdas que empiezan con `=`, `+`, `-` o `@` se exportan con un apóstrofo delante para evitar inyección de fórmulas en Excel.

---

## 3. Base de datos: `supabase/schema_v13.sql`

Idempotente, como las anteriores.

### 3.1 Columnas nuevas

```sql
alter table public.project_tasks
  add column if not exists start_at timestamptz,
  add column if not exists due_at timestamptz,
  add column if not exists external_id text,
  add column if not exists batch_id uuid,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists updated_by uuid references auth.users;

-- Si la columna actual es due_date (date), se copia a due_at a las 23:59 de Bogotá.
update public.project_tasks
   set due_at = (due_date::timestamp + time '23:59') at time zone 'America/Bogota'
 where due_at is null and due_date is not null;

create unique index if not exists project_tasks_external_idx
  on public.project_tasks(project_id, external_id) where external_id is not null;

alter table public.project_task_steps
  add column if not exists batch_id uuid;
```

`due_date` se mantiene un tiempo por compatibilidad y se elimina en una tanda posterior, cuando todo lea `due_at`.

### 3.2 Historial de cambios masivos

```sql
create table if not exists public.project_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('import','bulk_edit','file_update')),
  summary jsonb not null default '{}',   -- {"creadas":12,"actualizadas":3,"borradas":0}
  snapshot jsonb not null default '[]',  -- valores anteriores, para deshacer
  created_at timestamptz default now(),
  undone_at timestamptz
);
alter table public.project_batches enable row level security;
create policy "project_batches read members" on public.project_batches
  for select using (public.is_project_member(project_id));
-- Sin políticas de escritura: solo se escribe desde las funciones de abajo.
```

### 3.3 Funciones

Todas son `security definer`, validan que quien llama sea integrante con rol `owner` o `editor`, trabajan en una sola transacción (o todo o nada) y devuelven el `id` del lote.

- `import_project_tasks(p_project uuid, p_tasks jsonb, p_duplicates text)`: crea tareas y su checklist. `p_duplicates` es `omitir`, `actualizar` o `crear`. Máximo 500 tareas.
- `bulk_update_project_tasks(p_project uuid, p_ids uuid[], p_patch jsonb)`: aplica un cambio a varias tareas. `p_patch` admite `status`, `assignee_id`, `start_at`, `due_at`, `shift_minutes` con `shift_target` (`ambas` o `entrega`) y `delete`.
- `apply_project_file(p_project uuid, p_rows jsonb)`: filas con `id` actualizan, filas sin `id` crean, filas con `eliminar` borran. Una tarea que no aparece en el archivo no se toca.
- `undo_project_batch(p_batch uuid)`: restaura el `snapshot`. Borra lo creado, devuelve los valores anteriores y recrea lo borrado con su checklist.

Comprobaciones del lado del servidor, aunque el cliente ya las haga:

- Cada `id` debe pertenecer al proyecto; los ajenos se ignoran y se reportan.
- Cada responsable debe ser integrante del proyecto; si no, queda sin asignar.
- Longitudes máximas de título, descripción e ítems de checklist.

Esqueleto de la primera, para que veas el patrón:

```sql
create or replace function public.import_project_tasks(
  p_project uuid, p_tasks jsonb, p_duplicates text default 'omitir')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid := gen_random_uuid();
  v_role text;
begin
  select role into v_role from project_members
   where project_id = p_project and user_id = auth.uid();
  if v_role is null or v_role = 'viewer' then
    raise exception 'sin permiso para importar en este proyecto';
  end if;
  if jsonb_array_length(p_tasks) > 500 then
    raise exception 'máximo 500 tareas por archivo';
  end if;

  -- 1. insertar tareas (con batch_id = v_batch)
  -- 2. insertar su checklist en project_task_steps
  -- 3. registrar el lote en project_batches con el resumen

  return v_batch;
end $$;
```

**Deshacer:** solo el último lote del proyecto y durante 7 días. Si dejara deshacer un lote viejo cuando ya hubo cambios encima, podría pisar trabajo de otro integrante. Con esta regla eso no pasa.

---

## 4. Código cliente

### 4.1 Lógica (`lib/import/`)

| Archivo | Qué hace |
|---|---|
| `parse.ts` | Lee el archivo (CSV con `papaparse`, JSON con `JSON.parse`), detecta formato, separador y codificación. |
| `normalize.ts` | Mapea encabezados, convierte fechas, estados y checklist, y resuelve responsables contra los integrantes (correo primero, luego nombre, sin tildes ni mayúsculas). |
| `validate.ts` | Errores y avisos por fila: fecha inválida, inicio después de entrega, responsable no encontrado, estado desconocido, título vacío, duplicado. |
| `prompt.ts` | `buildAiPrompt(proyecto, integrantes, hoy)`: arma el prompt con los integrantes, la materia, la fecha de hoy y la entrega final. |
| `export.ts` | Exporta a CSV o JSON. En web descarga con `Blob`; en el celular guarda con `expo-file-system` y comparte con `expo-sharing`. |
| `lib/projectsBulk.ts` | Envoltorios de las cuatro funciones RPC. |

El parser de fechas lo escribo a mano, sin `dayjs` ni similares. Son pocos formatos y así no se suma peso a la app.

### 4.2 Interfaz (`components/projects/`)

| Componente | Qué es |
|---|---|
| `ImportSheet.tsx` | El importador del diseño: modal en escritorio, hoja inferior en el celular. Archivo, plantillas y "Planéalo con IA". |
| `ImportPreview.tsx` | Tabla con una fila por tarea y su estado (lista, con aviso, con error). Se corrige fecha, estado o responsable en la misma fila, o se omite. Selector de qué hacer con duplicados. |
| `BulkBar.tsx` | Barra de acciones que aparece al seleccionar tareas. |
| `ShiftDatesDialog.tsx` | Diálogo para correr fechas. |
| `FileDiffPreview.tsx` | Resumen de cambios al actualizar por archivo, con el antes y el después de cada campo. |
| `UndoToast.tsx` | Aviso con resumen y botón Deshacer. |

### 4.3 Cambios en pantallas

`app/proyectos/[id].tsx`:

- Cabecera en escritorio: botones **Importar** y **Exportar** junto a "+ Tarea". En el celular van en el menú de tres puntos.
- Vista Lista: columna de selección, "seleccionar todo" (respeta el filtro activo) y la `BulkBar`.
- Vista Tablero: selección con clic largo en el celular y con Shift + clic en escritorio.
- Ajustes del proyecto: al cambiar la fecha final, ofrece correr también las tareas pendientes.

### 4.4 Dependencias nuevas

- `papaparse` y `@types/papaparse`.
- `expo-clipboard` para copiar el prompt en el celular (en web se usa `navigator.clipboard`).

`expo-document-picker`, `expo-file-system` y `expo-sharing` ya están en el proyecto.

---

## 5. Flujos

### 5.1 Importar

1. Importar, elegir archivo.
2. Se lee y se muestra la vista previa con los errores marcados.
3. Si hay columnas que no reconoció, se asignan con un selector.
4. Se elige qué hacer con duplicados (mismo título y misma entrega): omitir, actualizar o crear de todas formas.
5. Importar. Aviso: "23 tareas y 87 ítems de checklist creados", con Deshacer.

### 5.2 Edición por selección

Acciones de la barra: cambiar estado, cambiar responsable, poner fecha de entrega, correr fechas y borrar. Borrar pide confirmación con el número de tareas.

**Correr fechas:** se eligen los días (positivos o negativos) y qué fechas se mueven. Por defecto **inicio y entrega**, para que cada tarea conserve su duración, y la opción **solo entrega** en el mismo diálogo. La hora se conserva. Antes de aplicar muestra el resultado: "8 tareas. La última entrega pasa del 25 oct al 1 nov". Si alguna queda después de la entrega final del proyecto, lo avisa.

**Correr todo el proyecto:** al cambiar la fecha final del proyecto, ofrece mover las tareas pendientes la misma cantidad de días. Las que están en Hecho no se mueven.

### 5.3 Edición por archivo

1. Exportar (incluye la columna `id`).
2. Editar en Excel o pedirle cambios a una IA.
3. Subir con el mismo botón Importar. Si el archivo trae `id`, el importador entra en modo actualización.
4. Vista de cambios: "12 cambian, 3 nuevas, 1 se borra", con el detalle por campo.
5. Aplicar, con Deshacer.

**Checklist al actualizar:** si la columna `checklist` viene en el archivo, reemplaza la lista de la tarea, pero los ítems con el mismo texto conservan su estado de hecho. Si la columna no viene, el checklist no se toca.

---

## 6. Límites y seguridad

- Archivo de máximo 2 MB y 500 tareas.
- Un integrante con rol `viewer` no ve los botones de importar ni la selección masiva, y el servidor lo rechaza igual si lo intenta.
- Nada se borra porque falte en el archivo; borrar requiere `eliminar = sí` y aparece resaltado en la vista de cambios.
- Exportación protegida contra inyección de fórmulas.

---

## 7. Pruebas

- **Parser:** archivos de prueba exportados desde Excel en español (`;`, Latin-1), Google Sheets (`,`, UTF-8), con BOM, con saltos de línea dentro de celdas, con todos los formatos de fecha y con checklists en las dos formas.
- **Permisos, con dos usuarios de mentira contra tu Supabase:** un `viewer` no puede importar ni editar en masa, alguien que no es integrante tampoco, y los `id` de otro proyecto se ignoran.
- **Deshacer:** importar, deshacer y verificar que no queda nada; editar en masa, deshacer y verificar los valores anteriores; borrar, deshacer y verificar que vuelven las tareas con su checklist.
- **Interfaz:** capturas en 1920, 1440, 1280, 1024, 768 y 420 px, sin errores en consola.

---

## 8. Qué te llega

Un zip con:

- Código fuente y `dist/` compilado.
- `supabase/schema_v13.sql`.
- `plantillas/plantilla_tareas.csv` y `plantillas/plantilla_tareas.json`.

Como siempre, sin tu `.env` y con `kaderno-config.js` con cadenas vacías.

---

## 9. Decisiones que tomé por defecto

Cámbialas si no te cuadran:

1. Correr fechas mueve inicio y entrega, con la opción de solo entrega en el mismo diálogo.
2. Una entrega sin hora queda a las 11:59 p. m.
3. Deshacer funciona solo sobre el último cambio masivo del proyecto y durante 7 días.
4. Al actualizar por archivo, el checklist se reemplaza solo si la columna viene en el archivo.
5. La exportación CSV usa `;` para que Excel en español la abra directo.
