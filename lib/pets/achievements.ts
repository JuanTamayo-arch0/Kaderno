// ============================================================
//  Logros de la mascota. La base (pet_achievements en schema_v16.sql) los
//  calcula, paga y devuelve con su avance; aquí solo están los textos.
//  Cuentan desde que adoptaste tu primera mascota.
// ============================================================

export type AchievementId =
  | 'primera_tarea' | 'tareas_25' | 'tareas_100' | 'enfoque_hora' | 'enfoque_10h'
  | 'racha_7' | 'racha_30' | 'sin_vencidas' | 'repaso_100' | 'dia_5'
  | 'ropa_3' | 'familia' | 'nivel_5' | 'nivel_10';

export type AchievementRow = { id: AchievementId; progress: number; goal: number; reward: number; unlocked_at: string | null; is_new: boolean };

export const ACHIEVEMENTS: Record<AchievementId, { title: string; desc: string; icon: string; unit?: string }> = {
  primera_tarea: { title: 'Primera tarea', desc: 'Termina una tarea con tu mascota.', icon: 'checkmark-circle' },
  tareas_25: { title: 'Constancia', desc: 'Termina 25 tareas.', icon: 'checkmark-done' },
  tareas_100: { title: 'Imparable', desc: 'Termina 100 tareas.', icon: 'rocket' },
  enfoque_hora: { title: 'Una hora de enfoque', desc: 'Suma 60 minutos de enfoque en un día.', icon: 'timer', unit: 'min' },
  enfoque_10h: { title: 'Diez horas', desc: 'Suma 10 horas de enfoque.', icon: 'hourglass', unit: 'min' },
  racha_7: { title: 'Semana completa', desc: 'Gana algo 7 días seguidos.', icon: 'flame' },
  racha_30: { title: 'Mes de racha', desc: 'Gana algo 30 días seguidos.', icon: 'bonfire' },
  sin_vencidas: { title: 'Una semana sin vencidas', desc: '7 días seguidos sin dejar vencer nada.', icon: 'shield-checkmark' },
  repaso_100: { title: 'Memoria de elefante', desc: 'Repasa 100 tarjetas.', icon: 'albums' },
  dia_5: { title: 'Días redondos', desc: 'Termina todo lo del día 5 veces.', icon: 'sunny' },
  ropa_3: { title: 'Con estilo', desc: 'Compra 3 cosas en la tienda (ropa o casa).', icon: 'shirt' },
  familia: { title: 'Familia completa', desc: 'Adopta las cuatro mascotas.', icon: 'paw' },
  nivel_5: { title: 'Nivel 5', desc: 'Lleva una mascota al nivel 5.', icon: 'star-half' },
  nivel_10: { title: 'Nivel 10', desc: 'Lleva una mascota al nivel 10.', icon: 'star' },
};

export const ACHIEVEMENT_ORDER = Object.keys(ACHIEVEMENTS) as AchievementId[];

/** Ordena: primero los conseguidos (los más recientes arriba), luego por avance. */
export function sortAchievements(rows: AchievementRow[]): AchievementRow[] {
  return [...rows].sort((a, b) => {
    if (!!a.unlocked_at !== !!b.unlocked_at) return a.unlocked_at ? -1 : 1;
    if (a.unlocked_at && b.unlocked_at) return b.unlocked_at.localeCompare(a.unlocked_at);
    return b.progress / b.goal - a.progress / a.goal || ACHIEVEMENT_ORDER.indexOf(a.id) - ACHIEVEMENT_ORDER.indexOf(b.id);
  });
}
