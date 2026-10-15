// ============================================================
//  Promedios: por materia (ponderado por el peso de cada evaluación) y
//  del semestre (ponderado por créditos). Puro, para poder probarlo.
// ============================================================
export type GradeLike = { subject_id: string; weight: number; score: number | null; max_score: number };
export type SubjectLike = { id: string; name: string; credits?: number | null };

/** Promedio actual de una materia en escala `scale` (5 por defecto), o null si no hay notas. */
export function subjectAverage(grades: GradeLike[], scale = 5): { avg: number | null; doneWeight: number } {
  const items = grades.filter((g) => g.score != null && g.weight > 0 && g.max_score > 0);
  const w = items.reduce((a, g) => a + g.weight, 0);
  if (!w) return { avg: null, doneWeight: 0 };
  const avg = items.reduce((a, g) => a + ((g.score as number) / g.max_score) * scale * g.weight, 0) / w;
  return { avg, doneWeight: Math.min(100, w) };
}

/** Promedio del semestre ponderado por créditos (las materias sin notas no cuentan). */
export function semesterAverage(subjects: SubjectLike[], grades: GradeLike[], scale = 5): { avg: number | null; credits: number; rows: { id: string; name: string; credits: number; avg: number | null; doneWeight: number }[] } {
  const rows = subjects.map((s) => {
    const { avg, doneWeight } = subjectAverage(grades.filter((g) => g.subject_id === s.id), scale);
    return { id: s.id, name: s.name, credits: s.credits && s.credits > 0 ? s.credits : 1, avg, doneWeight };
  });
  const graded = rows.filter((r) => r.avg != null);
  const credits = graded.reduce((a, r) => a + r.credits, 0);
  const avg = credits ? graded.reduce((a, r) => a + (r.avg as number) * r.credits, 0) / credits : null;
  return { avg, credits, rows };
}

/** Nota que hace falta en el peso restante para llegar a `target` (escala `scale`). */
export function neededFor(grades: GradeLike[], target: number, scale = 5): { needed: number | null; remainingWeight: number } {
  const items = grades.filter((g) => g.score != null && g.weight > 0 && g.max_score > 0);
  const doneW = items.reduce((a, g) => a + g.weight, 0);
  const earned = items.reduce((a, g) => a + ((g.score as number) / g.max_score) * scale * (g.weight / 100), 0);
  const remainingWeight = Math.max(0, 100 - doneW);
  if (remainingWeight <= 0) return { needed: null, remainingWeight: 0 };
  return { needed: (target - earned) / (remainingWeight / 100), remainingWeight };
}
