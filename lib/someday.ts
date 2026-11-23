// "Algún día" (v27, fase 4). Puro, con pruebas.

/** Hasta `n` al azar (el ritual del lunes muestra 3), estable durante el día. */
export function sampleSomeday<X extends { id: string }>(items: X[], n = 3, seed = new Date().toDateString()): X[] {
  const h = (s: string) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) | 0; return x; };
  // Mezcla la semilla con cada id (si solo se suman, el orden sale igual todos los días).
  const mix = (id: string) => {
    let x = h(seed) ^ h(id);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    return (x ^ (x >>> 16)) >>> 0;
  };
  return [...items].sort((a, b) => mix(a.id) - mix(b.id)).slice(0, n);
}

/** Lo de la bandeja que sí está por ordenar (sin lo de "Algún día"). */
export function toSort<X extends { inbox?: boolean | null; someday?: boolean | null; status?: string | null }>(tasks: X[]): X[] {
  return tasks.filter((t) => t.inbox && !t.someday && t.status !== 'done');
}
export function somedayOf<X extends { someday?: boolean | null; status?: string | null }>(tasks: X[]): X[] {
  return tasks.filter((t) => t.someday && t.status !== 'done');
}
