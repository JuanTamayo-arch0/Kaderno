// Contadores de la navegación: tareas para hoy, tarjetas por repasar y avisos sin leer.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { hasV14, isMissingColumn } from './db';
import { countToday } from './cardsDb';
import { bucketOf } from './time';
import { onDataChanged } from './uiBus';

export type NavCounts = { today: number; repaso: number; unread: number; inbox: number };
let counts: NavCounts = { today: 0, repaso: 0, unread: 0, inbox: 0 };
let last = 0;
let inflight: Promise<void> | null = null;
const ls = new Set<(c: NavCounts) => void>();

export function setNavCounts(patch: Partial<NavCounts>) { counts = { ...counts, ...patch }; ls.forEach((l) => l(counts)); }

export function refreshNavCounts(force = false): Promise<void> {
  if (!force && Date.now() - last < 30000) return inflight ?? Promise.resolve();
  last = Date.now();
  inflight = (async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return;
      const tq = async () => {
        const first = await supabase.from('assignments').select(hasV14() ? 'due_date, due_at, status, deleted_at' : 'due_date, status').neq('status', 'done');
        if (first.error && isMissingColumn(first.error)) return supabase.from('assignments').select('due_date, status').neq('status', 'done');
        return first;
      };
      const [t, r, u, ib] = await Promise.all([
        tq(),
        countToday().then((c) => c.total).catch(() => 0),
        supabase.from('notification_queue').select('id', { count: 'exact', head: true }).is('read_at', null),
        // Bandeja (schema_v20): si la columna no existe, cuenta 0.
        supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('inbox', true).neq('status', 'done').is('deleted_at', null),
      ]);
      const now = new Date();
      const rows = ((t.data as any[]) ?? []).filter((x) => !x.deleted_at && !x.inbox);
      const today = rows.filter((x) => { const b = bucketOf(x, now); return b === 'today' || b === 'overdue'; }).length;
      setNavCounts({ today, repaso: r, unread: u.error ? 0 : (u.count ?? 0), inbox: ib.error ? 0 : (ib.count ?? 0) });
    } catch { /* sin conexión: se deja lo anterior */ }
    finally { inflight = null; }
  })();
  return inflight;
}

export function useNavCounts(): NavCounts {
  const [c, setC] = useState(counts);
  useEffect(() => {
    ls.add(setC);
    refreshNavCounts();
    const off = onDataChanged(() => refreshNavCounts(true));
    return () => { ls.delete(setC); off(); };
  }, []);
  return c;
}
