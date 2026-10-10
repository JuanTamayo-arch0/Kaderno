import { Image, Text } from 'react-native';

// ¿El "icono" de la materia es en realidad una foto/imagen (no un emoji)?
export function isPhotoIcon(icon?: string | null): boolean {
  return !!icon && (icon.startsWith('data:') || icon.startsWith('http') || icon.startsWith('file:') || icon.startsWith('blob:'));
}

// Emoji para incrustar dentro de textos/etiquetas. Si el icono es una foto,
// usa un emoji de respaldo (no se puede meter una imagen dentro de un string).
export function iconChar(icon?: string | null, fallback = '📘'): string {
  return isPhotoIcon(icon) ? fallback : (icon || fallback);
}

// Ícono de materia: muestra la foto si el icono es una imagen, o el emoji si no.
export function SubjectIcon({ icon, box, emoji }: { icon?: string | null; box: number; emoji: number }) {
  if (isPhotoIcon(icon)) {
    return <Image source={{ uri: icon as string }} style={{ width: box, height: box, borderRadius: Math.round(box * 0.28) }} resizeMode="cover" />;
  }
  return <Text style={{ fontSize: emoji }}>{icon || '📚'}</Text>;
}
