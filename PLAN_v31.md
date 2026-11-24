# PLAN v31: elegir el proveedor de IA (Claude o Gemini)

## A. Por qué
La cuenta de Claude no tiene saldo y la de Gemini sí. Kaderno usa IA en el servidor:
- `ai`: resúmenes, tarjetas, simulacros, actas, pasos y estado del proyecto;
- `oracle`: el Oráculo;
- `ocr`: digitalizar fotos.

El proveedor tiene que poder cambiarse sin tocar la app.

## B. Decisiones
1. **Un solo archivo compartido:** `supabase/functions/_shared/llm.ts` habla con Claude o con Gemini. Las tres funciones lo usan.
2. **Se elige con un secreto:** `AI_PROVIDER=gemini` o `claude` (por defecto). No hay selector en la app: es una decisión de quien paga la API, no de cada persona.
3. **Modelos de Gemini:**
   - `gemini-3.8-flash` para lo principal y para leer fotos;
   - `gemini-3.5-flash-lite` para tareas cortas (los pasos de una tarea);
   - se cambian con `GEMINI_MODEL` y `GEMINI_MODEL_LIGHT`.
   Los 3.x piensan antes de responder: se pide poco pensamiento (`low`, o `minimal` en Flash-Lite) y el doble de margen de salida.
4. **Respaldo opcional:** con `AI_FALLBACK=1`, si el proveedor elegido falla (por ejemplo, sin saldo) y está la llave del otro, responde el otro.
5. **Vectores del Oráculo:** OpenAI (como antes) o Gemini (`gemini-embedding-2` a 1536 dimensiones, el mismo tamaño de la tabla).
   - Cada vector guarda su modelo (`schema_v28.sql`), así los de un proveedor no se comparan con los del otro.
   - Al cambiar, cada persona los vuelve a armar con "Preparar mis notas". Mientras tanto, el Oráculo responde con sus notas recientes.
6. **Lo que no cambia:** prompts, cupos diarios, idioma de las respuestas (v30) y formato de lo que devuelve cada tarea.

## C. Fases
Una sola PR:
- `llm.ts`, las tres funciones y `schema_v28.sql`;
- pruebas con respuestas simuladas;
- revisión de tipos de las funciones con Deno (`npm run check:fn`);
- RUNBOOK.
