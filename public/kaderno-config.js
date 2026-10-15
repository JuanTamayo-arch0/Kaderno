/*
 * Configuración de Kaderno para la web (se lee en tiempo de EJECUCIÓN).
 *
 * Este archivo se copia tal cual a dist/kaderno-config.js al hacer el export.
 * Puedes editarlo DIRECTAMENTE EN EL SERVIDOR sin recompilar la app:
 *   nano /var/www/kaderno/kaderno-config.js
 *
 * Los valores están en Supabase → Project Settings → API.
 * Si lo dejas vacío, la app usa las variables del .env con las que se compiló.
 */
window.KADERNO_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  // Llave pública para las notificaciones push (ver RUNBOOK.md, sección v12).
  VAPID_PUBLIC_KEY: '',
};
