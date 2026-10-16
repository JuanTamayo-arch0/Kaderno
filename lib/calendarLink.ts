// ============================================================
//  Enlace del calendario (.ics) y diagnóstico cuando falla.
//
//  Por qué existe: el iPhone muestra "No se puede conectar mediante SSL"
//  ante CUALQUIER fallo al suscribirse (401, 404, 500, respuesta que no es
//  un calendario), y Google Calendar solo dice "No se pudo agregar". El
//  certificado casi nunca es el problema; casi siempre es que la función
//  "ical" pide inicio de sesión (se desplegó sin --no-verify-jwt) o que no
//  está desplegada. Este módulo arma los enlaces y traduce la respuesta de
//  una prueba a un mensaje que diga qué hacer.
//
//  Si en kaderno-config.js está CALENDAR_URL (por ejemplo
//  https://tu-dominio/calendario), el enlace sale por el dominio de Kaderno
//  y Nginx lo pasa a Supabase con la llave pública. Así funciona aunque la
//  función tenga la verificación de JWT activada, y termina en .ics, que
//  algunos calendarios prefieren.
// ============================================================

export type CalendarLinks = { https: string; webcal: string; google: string; viaKaderno: boolean };

export function calendarLinks(token: string, supabaseUrl: string, calendarBase?: string | null): CalendarLinks {
  const base = (calendarBase ?? '').trim().replace(/\/+$/, '');
  const viaKaderno = /^https:\/\//i.test(base);
  const https = viaKaderno
    ? `${base}/${token}.ics`
    : `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/ical?token=${token}`;
  const webcal = https.replace(/^https?:\/\//i, 'webcal://');
  // Google acepta "cid" con la dirección webcal y abre el diálogo de suscripción.
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  return { https, webcal, google, viaKaderno };
}

export type Diagnosis = { ok: boolean; title: string; detail: string };

/**
 * Traduce el resultado de pedir el enlace. `status` = 0 cuando el navegador no
 * pudo ni conectar (red, CORS de una función vieja, certificado).
 */
export function diagnoseCalendar(status: number, body: string, viaKaderno: boolean): Diagnosis {
  const b = (body ?? '').slice(0, 400);
  if (status === 200 && b.trimStart().startsWith('BEGIN:VCALENDAR')) {
    const n = (body.match(/BEGIN:VEVENT/g) ?? []).length;
    return { ok: true, title: 'El enlace funciona', detail: `Devuelve un calendario con ${n} ${n === 1 ? 'evento' : 'eventos'}. Si tu calendario aún no lo muestra, espera unos minutos: Google tarda en actualizar.` };
  }
  if (status === 200) {
    return { ok: false, title: 'La respuesta no es un calendario', detail: viaKaderno
      ? 'El servidor devolvió la página de la app en vez del calendario. Falta el bloque "location /calendario/" en Nginx (ver RUNBOOK.md, versión 13).'
      : 'Algo entre tu navegador y Supabase cambió la respuesta. Prueba de nuevo o usa "Descargar .ics".' };
  }
  if (status === 401 || status === 403) {
    return { ok: false, title: 'La función pide inicio de sesión', detail: 'Por eso el iPhone dice "No se puede conectar mediante SSL". Hay que desplegar la función sin verificación: npx supabase functions deploy ical --no-verify-jwt (o desactivar "Enforce JWT verification" en Supabase, Edge Functions, ical).' };
  }
  if (status === 404 && /enlace no v[aá]lido|reemplazado/i.test(b)) {
    return { ok: false, title: 'Ese enlace ya no existe', detail: 'Se creó un enlace nuevo después. Copia el que aparece aquí y vuelve a suscribirte.' };
  }
  if (status === 404) {
    return { ok: false, title: 'La función del calendario no está desplegada', detail: 'Despliégala con: npx supabase functions deploy ical --no-verify-jwt' };
  }
  if (status === 400) {
    return { ok: false, title: 'El enlace está incompleto', detail: 'Copia el enlace completo, sin espacios al final.' };
  }
  if (status >= 500) {
    return { ok: false, title: 'La función del calendario falló', detail: `Respondió ${status}. Revisa los registros en Supabase, Edge Functions, ical, Logs. Mientras tanto puedes usar "Descargar .ics".` };
  }
  if (status === 0) {
    return { ok: false, title: 'No se pudo conectar', detail: viaKaderno
      ? 'Revisa el certificado del dominio (sudo certbot renew) y el bloque de Nginx para /calendario/.'
      : 'Puede ser la versión anterior de la función (no permitía esta prueba desde el navegador). Vuelve a desplegarla: npx supabase functions deploy ical --no-verify-jwt' };
  }
  return { ok: false, title: `Respuesta inesperada (${status})`, detail: 'Prueba de nuevo en un momento o usa "Descargar .ics".' };
}
