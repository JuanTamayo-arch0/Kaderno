// Enlaces que el usuario pega (aula virtual): solo http(s), sin espacios.
/** Deja solo enlaces http(s); devuelve null si el texto no sirve. */
export function cleanLink(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const withProto = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(t) ? t : `https://${t}`;
  if (!/^https?:\/\/[^\s]+$/i.test(withProto)) return null;
  return withProto.slice(0, 500);
}
