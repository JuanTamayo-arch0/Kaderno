// ============================================================
//  La mascota que acompaña en todas las pantallas (web).
//
//  Este componente no dibuja nada con React: crea un PetController
//  (lib/pets/dom.ts) que vive en una capa fija y le pasa lo que pasa en la
//  app. El cerebro (lib/pets/brain.ts) decide qué cara pone y si habla.
// ============================================================
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router, usePathname } from 'expo-router';
import { C } from '../../lib/theme';
import { coinSvg, SPECIES } from '../../lib/pets/art';
import { PetController, type BubbleAction } from '../../lib/pets/dom';
import {
  commit, initialBrain, isWandering, react, suggestion,
  type ActionId, type BrainState, type PetEvent, type Reaction, type TaskHint,
} from '../../lib/pets/brain';
import { lineFor } from '../../lib/pets/lines';
import {
  activePet, checkAchievements, isMutedToday, loadPetPrefs, loadPets, onPetEvent, usePets, type PetSignal,
} from '../../lib/pets/store';
import { getAmbientStatus, subscribeAmbient } from '../../lib/ambient';
import { subscribeFocus, startFocus } from '../../lib/focusTimer';
import { getTasks, getSubjects, getFocusDetail, moveTaskDate, type Task } from '../../lib/db';
import { bucketOf, dayDiff, dueDay, dueMoment, isoDate, startOfDay } from '../../lib/time';
import { onDataChanged, dataChanged } from '../../lib/uiBus';
import { toast, friendlyError } from '../../lib/feedback';
import { useAuth } from '../../lib/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getGoals } from '../../lib/ritualsDb';

const LABELS: Record<ActionId, string> = {
  enfocar: 'Enfocarme ya', mover_hoy: 'Mover a hoy', que_hago: '¿Qué hago ahora?', dos_min: 'Regla de 2 min',
  luego: 'Luego', tienda: 'Tienda', terminar_enfoque: 'Ir al enfoque', seguir: 'Seguir', logros: 'Ver logros',
};
/** Pantallas donde no aparece (o ya está en grande, como en Mascota y en el Oráculo). */
const HIDDEN = ['/login', '/bienvenida', '/visor', '/mascota', '/oraculo'];
const BRAIN_KEY = 'pet_brain';

function readBrain(): BrainState {
  try {
    const raw = localStorage.getItem(BRAIN_KEY);
    if (raw) return { ...initialBrain(), ...JSON.parse(raw), focusing: false };
  } catch { /* noop */ }
  return initialBrain();
}
function saveBrain(b: BrainState) {
  try { localStorage.setItem(BRAIN_KEY, JSON.stringify({ lastSpontaneous: b.lastSpontaneous, lastSaid: b.lastSaid })); } catch { /* noop */ }
}

/** Tareas de la base a pistas para el cerebro. */
export function hintsOf(tasks: Task[], now = new Date()): { overdue: TaskHint[]; today: TaskHint[]; tasks: Map<string, Task> } {
  const overdue: TaskHint[] = [], today: TaskHint[] = [], map = new Map<string, Task>();
  for (const t of tasks) {
    if (t.status === 'done' || t.deleted_at) continue;
    const b = bucketOf(t, now);
    if (b !== 'overdue' && b !== 'today') continue;
    map.set(t.id, t);
    const h: TaskHint = { id: t.id, title: t.title, overdue: b === 'overdue', today: b === 'today', dueTs: dueMoment(t)?.getTime() ?? null, estimate: t.estimate_min ?? null };
    (b === 'overdue' ? overdue : today).push(h);
  }
  return { overdue, today, tasks: map };
}

export function PetBuddy() {
  const { session } = useAuth();
  const s = usePets();
  const pet = activePet(s);
  const pathname = usePathname();
  const ctl = useRef<PetController | null>(null);
  const brain = useRef<BrainState>(initialBrain());
  const ctx = useRef<{ task: Task | null; navTimes: number[]; lastAction: number; opened: boolean }>({ task: null, navTimes: [], lastAction: Date.now(), opened: false });
  const userId = session?.user?.id;

  // Cargar mascotas y ajustes al iniciar sesión.
  useEffect(() => {
    if (!userId) return;
    loadPetPrefs();
    loadPets(true).catch(() => {});
  }, [userId]);

  const hiddenRoute = HIDDEN.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const show = Platform.OS === 'web' && typeof document !== 'undefined' && !!userId && s.available === true && s.prefs.enabled && !!pet && !hiddenRoute;
  // Logros que se cumplieron mientras la app estaba cerrada (después del saludo).
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { checkAchievements().catch(() => {}); }, 12000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // ---------- Reacciones ----------
  function apply(r: Reaction | null) {
    const c = ctl.current;
    if (!r || !c || !pet) return;
    if (r.mood) c.setMood(r.mood, r.moodMs);
    if (r.celebrate) c.celebrate();
    if (r.say) c.say(r.say, (r.actions ?? []).map((id): BubbleAction => ({ id, label: LABELS[id] })), r.ms);
    brain.current = commit(brain.current, r, Date.now());
    saveBrain(brain.current);
  }
  function handle(ev: PetEvent) {
    if (!pet) return;
    const b = { ...brain.current, talk: s.prefs.talk, mutedUntil: isMutedToday(s.prefs) ? Number.MAX_SAFE_INTEGER : 0 };
    apply(react(ev, b, pet.species, Date.now()));
  }

  async function freshHints() {
    const tasks = await getTasks();
    const h = hintsOf(tasks);
    return { ...h, all: tasks };
  }

  async function onAction(id: ActionId) {
    const c = ctl.current;
    if (!c || !pet) return;
    c.hideBubble();
    try {
      if (id === 'enfocar') {
        const t = ctx.current.task;
        startFocus(t ? { taskId: t.id, taskTitle: t.title, subjectId: t.subject_id } : {});
        router.push('/enfoque');
      } else if (id === 'mover_hoy') {
        const t = ctx.current.task;
        if (!t) return;
        await moveTaskDate(t, isoDate(startOfDay(new Date())));
        dataChanged();
        toast(`Movida a hoy: ${t.title}`);
      } else if (id === 'que_hago') {
        const h = await freshHints();
        const sug = suggestion(h.overdue, h.today, pet.species);
        ctx.current.task = sug.task ? h.tasks.get(sug.task.id) ?? null : null;
        c.say(sug.say, sug.task ? [{ id: 'enfocar', label: LABELS.enfocar }, { id: 'dos_min', label: LABELS.dos_min }] : [], 9000);
      } else if (id === 'dos_min') {
        const t = ctx.current.task;
        c.say(lineFor('dos_minutos', pet.species, { tarea: t?.title ?? 'lo primero' }), [{ id: 'enfocar', label: LABELS.enfocar }], 9000);
      } else if (id === 'tienda') {
        router.push('/mascota');
      } else if (id === 'logros') {
        router.push({ pathname: '/mascota', params: { tab: 'logros' } } as any);
      } else if (id === 'terminar_enfoque') {
        router.push('/enfoque');
      }
    } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
  }

  // Los callbacks de la capa y de las suscripciones leen siempre la versión
  // más reciente (con la mascota y los ajustes actuales).
  const fns = useRef({ handle, onAction });
  fns.current = { handle, onAction };

  // Crear y destruir la mascota en pantalla.
  useEffect(() => {
    if (!show || !pet) return;
    brain.current = readBrain();
    const c = new PetController({
      species: pet.species, outfit: pet.outfit ?? {}, name: pet.name, move: s.prefs.move,
      palette: { paper: '#f6f2ea', ink: '#1f2433', muted: '#5b6475', brand: '#2d3c5a', onBrand: '#ffffff', soft: '#e6e1d3', coin: C.warn },
      onTap: () => fns.current.handle({ type: 'toque' }),
      onAction: (id) => { fns.current.onAction(id); },
      onGrab: () => fns.current.handle({ type: 'agarrar' }),
      onWake: () => fns.current.handle({ type: 'despierta' }),
    });
    ctl.current = c;
    return () => { c.destroy(); ctl.current = null; };
    // Solo al aparecer o desaparecer; los cambios de aspecto van abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // Aspecto y ajustes.
  useEffect(() => { if (pet) ctl.current?.setLook({ species: pet.species, outfit: pet.outfit ?? {}, name: pet.name }); }, [pet?.species, pet?.name, JSON.stringify(pet?.outfit)]);
  useEffect(() => { ctl.current?.setMove(s.prefs.move); }, [s.prefs.move, show]);

  // Enfoque: se va a su esquina y se calla.
  useEffect(() => {
    if (!show) return;
    let was = false;
    return subscribeFocus((f) => {
      const on = f.running && f.mode === 'work';
      ctl.current?.setFocus(on);
      brain.current = { ...brain.current, focusing: on };
      if (on && !was) fns.current.handle({ type: 'enfoque_inicio' });
      was = on;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, pet?.id]);

  // Con sonido de fondo: una nota musical flota sobre la mascota.
  useEffect(() => {
    if (!show) return;
    const sync = () => { const st = getAmbientStatus(); ctl.current?.setMusic(st.playing && !st.preview); };
    sync();
    return subscribeAmbient(sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, pet?.id]);

  // Eventos de la app (tarea hecha, enfoque terminado, ganancias...).
  useEffect(() => {
    if (!show) return;
    return onPetEvent((e: PetSignal) => {
      if (e.type === 'ganancia') { const p = activePet(); if (p) ctl.current?.gain(e.amount, coinSvg(p.species, 16)); return; }
      if (e.type === 'accion') { ctx.current.lastAction = Date.now(); return; }
      if (e.type === 'tarea_hecha') ctx.current.lastAction = Date.now();
      fns.current.handle(e);
    });
  }, [show]);

  // Al abrir la app: una mirada a lo pendiente (una vez por sesión).
  useEffect(() => {
    if (!show || ctx.current.opened) return;
    ctx.current.opened = true;
    const id = setTimeout(async () => {
      try {
        const [h, subs, focus, goals] = await Promise.all([freshHints(), getSubjects().catch(() => []), getFocusDetail().catch(() => null), getGoals().catch(() => [])]);
        const now = new Date();
        const first = h.overdue[0] ? h.tasks.get(h.overdue[0].id) ?? null : null;
        ctx.current.task = first;
        // Examen (o quiz) en los próximos 3 días.
        const exam = h.all
          .filter((t) => t.status !== 'done' && !t.deleted_at && (t.type === 'examen' || t.type === 'parcial') && dueDay(t))
          .map((t) => ({ t, dias: dayDiff(dueDay(t)!, now) }))
          .filter((x) => x.dias >= 0 && x.dias <= 3)
          .sort((a, b) => a.dias - b.dias)[0];
        // Meta con plan: la de la materia del examen cercano, o una vez al mes cualquiera.
        const withPlan = goals.filter((g) => g.plan);
        let goal = exam ? withPlan.find((g) => g.subject_id === exam.t.subject_id) ?? null : null;
        if (!goal && withPlan.length) {
          const last = Number(await AsyncStorage.getItem('kd:goalNudge').catch(() => null)) || 0;
          if (Date.now() - last > 30 * 86_400_000) { goal = withPlan[0]; AsyncStorage.setItem('kd:goalNudge', String(Date.now())).catch(() => {}); }
        }
        const goalHint = goal ? { materia: subs.find((x) => x.id === goal!.subject_id)?.name ?? 'el semestre', plan: String(goal.plan).slice(0, 140) } : null;
        fns.current.handle({
          type: 'abrir', overdue: h.overdue, today: h.today, hour: now.getHours(), goal: goalHint,
          exam: exam ? { materia: subs.find((x) => x.id === exam.t.subject_id)?.name ?? exam.t.title, dias: exam.dias } : null,
          streakAtRisk: !!focus && focus.streak > 0 && focus.todayMin === 0,
        });
      } catch { /* sin datos, sin mensaje */ }
    }, 2500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // "Paseo sin hacer nada": 3 pantallas en 2 minutos sin ninguna acción.
  useEffect(() => {
    if (!show) return;
    const now = Date.now();
    const c = ctx.current;
    c.navTimes = [...c.navTimes.filter((t) => now - t < 120_000), now];
    if (isWandering(c.navTimes, c.lastAction, now)) {
      c.navTimes = [];
      freshHints().then((h) => {
        const next = h.overdue[0] ?? [...h.today].sort((a, b) => (a.estimate ?? 999) - (b.estimate ?? 999))[0] ?? null;
        ctx.current.task = next ? h.tasks.get(next.id) ?? null : null;
        fns.current.handle({ type: 'paseo', next });
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, show]);
  useEffect(() => onDataChanged(() => { ctx.current.lastAction = Date.now(); }), []);

  return null;
}

/** Nombre de la moneda de la especie activa, para textos. */
export function coinNameOf(species: keyof typeof SPECIES, n: number) {
  const c = SPECIES[species].coin;
  return n === 1 ? c.one : c.many;
}
