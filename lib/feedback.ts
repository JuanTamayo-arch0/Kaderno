// ============================================================
//  Avisos, confirmaciones y mensajes cortos ("toasts") propios.
//
//  Antes se usaba Alert.alert, que en el navegador no hace NADA
//  (react-native-web lo deja vacío): los errores pasaban en silencio y los
//  botones de "Eliminar" de algunas confirmaciones nunca aparecían.
//
//  Ahora todo pasa por aquí y lo dibuja <FeedbackHost/> (montado una sola vez
//  en app/_layout.tsx), igual en web y en el celular.
// ============================================================

export type DialogButton = { label: string; tone?: 'primary' | 'danger' | 'plain'; value: boolean };
export type DialogReq = {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  resolve: (v: boolean) => void;
};
export type ToastReq = {
  id: number;
  message: string;
  tone?: 'plain' | 'good' | 'bad';
  actionLabel?: string;
  onAction?: () => void;
  onTimeout?: () => void;
  duration: number;
};

type State = { dialogs: DialogReq[]; toasts: ToastReq[] };
let state: State = { dialogs: [], toasts: [] };
const listeners = new Set<(s: State) => void>();
let seq = 1;

function emit() { listeners.forEach((l) => l(state)); }
export function subscribeFeedback(fn: (s: State) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => { listeners.delete(fn); };
}
export function hasFeedbackHost(): boolean { return listeners.size > 0; }

function pushDialog(title: string, message: string | undefined, buttons: DialogButton[]): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (!hasFeedbackHost()) {
      // Sin anfitrión (por ejemplo en pruebas): no bloquear.
      resolve(buttons.some((b) => b.value) && buttons.length === 1);
      return;
    }
    const id = seq++;
    const req: DialogReq = {
      id, title, message, buttons,
      resolve: (v) => {
        state = { ...state, dialogs: state.dialogs.filter((d) => d.id !== id) };
        emit();
        resolve(v);
      },
    };
    state = { ...state, dialogs: [...state.dialogs, req] };
    emit();
  });
}

/** Aviso con un solo botón. */
export function notify(title: string, message?: string): Promise<void> {
  return pushDialog(title, message, [{ label: 'Entendido', tone: 'primary', value: true }]).then(() => undefined);
}

/** Pregunta sí/no. Devuelve true si se aceptó. */
export function confirm(
  title: string,
  message?: string,
  okLabel = 'Sí, continuar',
  cancelLabel = 'Cancelar',
  opts: { danger?: boolean } = {},
): Promise<boolean> {
  const danger = opts.danger ?? /eliminar|borrar|quitar|archivar|salir|cerrar sesi/i.test(okLabel);
  return pushDialog(title, message, [
    { label: cancelLabel, tone: 'plain', value: false },
    { label: okLabel, tone: danger ? 'danger' : 'primary', value: true },
  ]);
}

/** Mensaje corto abajo de la pantalla, con acción opcional. */
export function toast(message: string, opts: Partial<Omit<ToastReq, 'id' | 'message'>> = {}): number {
  const id = seq++;
  const t: ToastReq = { id, message, duration: opts.actionLabel ? 6000 : 3200, ...opts };
  state = { ...state, toasts: [...state.toasts.slice(-2), t] };
  emit();
  return id;
}
export function dismissToast(id: number, reason: 'action' | 'timeout' | 'close' = 'close'): void {
  const t = state.toasts.find((x) => x.id === id);
  if (!t) return;
  state = { ...state, toasts: state.toasts.filter((x) => x.id !== id) };
  emit();
  if (reason === 'action') t.onAction?.();
  else t.onTimeout?.();
}

/**
 * Borrar con "Deshacer": se quita de la vista enseguida (`hide`), se muestra el
 * aviso y solo se borra de verdad (`commit`) si no se tocó "Deshacer" a tiempo.
 * Si la página se cierra antes, se confirma el borrado.
 */
const pendingCommits = new Map<number, () => void>();
export function deleteWithUndo(opts: {
  message: string;
  hide: () => void;
  restore: () => void;
  commit: () => Promise<unknown>;
  onError?: (e: unknown) => void;
}): void {
  opts.hide();
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    pendingCommits.delete(id);
    opts.commit().catch((e) => { opts.restore(); (opts.onError ?? defaultError)(e); });
  };
  const id = toast(opts.message, {
    actionLabel: 'Deshacer',
    onAction: () => { done = true; pendingCommits.delete(id); opts.restore(); },
    onTimeout: run,
  });
  pendingCommits.set(id, run);
}
export function flushPendingDeletes(): void { [...pendingCommits.values()].forEach((f) => f()); }

function defaultError(e: unknown) { notify('No se pudo completar', friendlyError(e)); }

/** Convierte errores técnicos en algo que un estudiante entienda. */
export function friendlyError(e: unknown): string {
  const raw = (e as any)?.message ?? String(e ?? '');
  const msg = String(raw);
  if (/Failed to fetch|NetworkError|Network request failed|ERR_INTERNET|timeout/i.test(msg)) return 'Parece que no hay conexión. Revisa tu internet e inténtalo de nuevo.';
  if (/JWT|session|sesi[oó]n activa|not authenticated|401/i.test(msg)) return 'Tu sesión venció. Vuelve a iniciar sesión.';
  if (/row-level security|permission denied|42501|403/i.test(msg)) return 'No tienes permiso para hacer esto.';
  if (/function .*(oracle|ai|ocr)|FunctionsHttpError|FunctionsFetchError|Edge Function|non-2xx/i.test(msg)) return 'La función de inteligencia artificial no respondió. Inténtalo en un momento.';
  if (/does not exist|schema cache|PGRST20|42703|42883/i.test(msg)) return 'Falta actualizar la base de datos (ver RUNBOOK.md). Avísale a quien administra Kaderno.';
  if (/duplicate key|23505/i.test(msg)) return 'Ya existe un elemento igual.';
  return msg || 'Ocurrió un error inesperado.';
}
