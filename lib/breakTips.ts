// ============================================================
//  Pausas guiadas: qué hacer en el descanso. Puro y probado.
//  Rotan sin repetirse en el día; cuando se agotan, vuelven a empezar.
//  Ninguna da monedas: son para descansar, no para hacer clic.
// ============================================================

export type BreakTip = { id: string; long: boolean; icon: string; title: string; body: string; pet: string };

export const BREAK_TIPS: BreakTip[] = [
  { id: 'estirar', long: false, icon: 'body-outline', title: 'Párate y estira un minuto', body: 'Brazos arriba, cuello y espalda. Moverse un poco despeja más que quedarse sentado.', pet: 'Párate y estira un minuto.' },
  { id: 'agua', long: false, icon: 'water-outline', title: 'Toma agua', body: 'Llena el vaso y tómalo con calma. Tu cabeza también lo agradece.', pet: '¿Y si tomas agua?' },
  { id: 'lejos', long: false, icon: 'eye-outline', title: 'Mira algo lejano 20 segundos', body: 'Una ventana, el fondo del cuarto. Tus ojos llevan rato enfocados de cerca.', pet: 'Mira algo lejos unos segundos.' },
  { id: 'respirar', long: false, icon: 'leaf-outline', title: 'Respira despacio un minuto', body: 'Toma aire en 4 tiempos y suéltalo en 6. Repite unas cuantas veces.', pet: 'Respira despacio conmigo.' },
  { id: 'celular', long: false, icon: 'phone-portrait-outline', title: 'Deja el celular boca abajo', body: 'La pausa rinde más sin pantalla. Las redes pueden esperar al descanso largo.', pet: 'El celular boca abajo, ¿va?' },
  { id: 'escritorio', long: false, icon: 'file-tray-outline', title: 'Ordena el escritorio', body: 'Guarda lo que no usas para el siguiente pomodoro. Menos cosas, menos distracciones.', pet: 'Ordenemos un poco el escritorio.' },
  { id: 'caminar', long: true, icon: 'walk-outline', title: 'Sal a caminar 10 minutos', body: 'Aunque sea por la casa o el pasillo. Caminar ayuda a fijar lo que acabas de estudiar.', pet: '¡Vamos a caminar un rato!' },
  { id: 'comer', long: true, icon: 'nutrition-outline', title: 'Come algo', body: 'Una fruta, unas nueces o lo que tengas a mano. Sin pantalla, si puedes.', pet: 'Hora de un snack.' },
  { id: 'aire', long: true, icon: 'sunny-outline', title: 'Toma aire afuera', body: 'Asómate a la ventana o sal un momento. La luz natural despierta.', pet: 'Un poco de aire fresco.' },
];

export function tipById(id: string | null | undefined): BreakTip | null {
  return BREAK_TIPS.find((t) => t.id === id) ?? null;
}

/** Día local en "AAAA-MM-DD". */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Elige la siguiente sugerencia del tipo pedido (corta o larga) que no se haya
 * usado hoy. Devuelve el id y la lista de usadas actualizada.
 */
export function pickTip(long: boolean, used: string[], seed = Math.random(), avoid?: string | null): { id: string; used: string[] } {
  const pool = BREAK_TIPS.filter((t) => t.long === long);
  let fresh = pool.filter((t) => !used.includes(t.id) && t.id !== avoid);
  let base = used;
  if (!fresh.length) {
    // Ya salieron todas: se empieza de nuevo (sin repetir la que se está mostrando).
    base = used.filter((id) => !pool.some((t) => t.id === id));
    fresh = pool.filter((t) => t.id !== avoid);
    if (!fresh.length) fresh = pool;
  }
  const t = fresh[Math.min(fresh.length - 1, Math.floor(seed * fresh.length))];
  return { id: t.id, used: [...base, t.id] };
}

// ---------- Anotar para después ----------
export type Parked = { id: string; text: string; at: number };
export const MAX_PARKED = 30;

export function addParked(list: Parked[], text: string, now = Date.now()): Parked[] {
  const t = text.trim().replace(/\s+/g, ' ').slice(0, 200);
  if (!t) return list;
  return [...list, { id: `${now.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, text: t, at: now }].slice(-MAX_PARKED);
}
export function removeParked(list: Parked[], id: string): Parked[] {
  return list.filter((p) => p.id !== id);
}
export function parkedTitle(n: number): string {
  return n === 1 ? 'Anotaste 1 cosa para después' : `Anotaste ${n} cosas para después`;
}
