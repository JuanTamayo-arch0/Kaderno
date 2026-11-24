import { Platform } from 'react-native';
import { I18N_READY, LANG_KEY, cleanLang, lang, type Lang } from './i18n';
import { savePrefs } from './db';

// ============================================================
//  v30: cambiar de idioma en la app (lo que toca react-native y la nube).
//  El idioma se guarda en este dispositivo y en user_prefs.settings.lang,
//  para que los avisos push y el calendario salgan en el idioma de cada quien.
// ============================================================

function readLocal(): Lang | null {
  try { return typeof localStorage !== 'undefined' ? cleanLang(localStorage.getItem(LANG_KEY)) : null; } catch { return null; }
}

/** Cambia el idioma: lo guarda y recarga la app para que todo salga en el nuevo. */
export async function setLang(l: Lang): Promise<void> {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_KEY, l); } catch { /* noop */ }
  try { await savePrefs({ lang: l }); } catch { /* sin sesión: queda en el dispositivo */ }
  if (Platform.OS === 'web' && typeof location !== 'undefined') location.reload();
}

/** Marca el documento con el idioma (lectores de pantalla y traductores del navegador). */
export function applyHtmlLang(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  try { document.documentElement.lang = lang(); } catch { /* noop */ }
}

/**
 * Al iniciar sesión: si este dispositivo no eligió idioma y la cuenta tiene
 * uno guardado distinto, se usa el de la cuenta (y se recarga). Si la cuenta
 * no tiene, se le guarda el de ahora, para los avisos.
 */
export function syncCloudLang(remote: Record<string, any> | null): void {
  const cloud = cleanLang(remote?.lang);
  if (!cloud) { savePrefs({ lang: lang() }).catch(() => {}); return; }
  if (cloud === lang() || readLocal()) return;
  if (!I18N_READY && cloud === 'en') return; // mientras el inglés está escondido
  try { localStorage.setItem(LANG_KEY, cloud); } catch { return; }
  if (Platform.OS === 'web' && typeof location !== 'undefined') location.reload();
}

/** ¿Se muestra el selector? Cuando el inglés está listo (o alguien ya lo escogió a mano). */
export function showLangPicker(): boolean {
  return I18N_READY || lang() === 'en' || readLocal() != null;
}
