# Kaderno — MVP

App académica: digitaliza apuntes con OCR, organiza por materia, gestiona tareas con fechas y recordatorios, horario editable y Pomodoro. Hecha con **Expo (React Native) + Supabase**.

## 👉 Empieza aquí

Abre **[RUNBOOK.md](./RUNBOOK.md)** y sigue el paso a paso para dejarla corriendo en tu celular.

Para publicar la versión web en el droplet con `git push`, mira **[DESPLIEGUE.md](./DESPLIEGUE.md)**.

## Estructura

```
app/        Interfaz y navegación (Expo Router)
lib/        Supabase, base de datos, notificaciones, tema
supabase/   schema.sql (tablas + seguridad) y función OCR
```

## Stack
Expo · TypeScript · Expo Router · Supabase (Postgres + Auth + Storage + RLS) · Edge Function con modelo de visión para OCR.
