// ============================================================
//  Capturar (v22, fase 4): lo que llevas no se pierde. Las páginas y el
//  texto se guardan en el dispositivo (IndexedDB) hasta guardar o descartar.
// ============================================================

const DB = 'kaderno-captura', STORE = 'draft', KEY = 'actual';

export type PageEdit = { rotate: number; crop: { x: number; y: number; w: number; h: number } | null; scan: boolean };
/** Una página: la imagen (JPEG en base64, ya editada), la original para volver a editar y lo leído. */
export type DraftPage = {
  id: string; base64: string; original: string | null; edit: PageEdit; markdown: string; figures: any[]; title: string | null;
  status: 'ok' | 'fail' | 'ocr'; source: 'photo' | 'pdf-text' | 'pdf-image'; error?: string | null;
};
export type CaptureDraft = { mode: string; pages: DraftPage[]; title: string; subjectId: string | null; savedAt: number };

function open(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined') return res(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
}

export async function saveDraft(d: Omit<CaptureDraft, 'savedAt'>): Promise<void> {
  const db = await open(); if (!db) return;
  // Mientras se lee una página no se guarda como "leyendo": al volver se lee otra vez.
  const clean = { ...d, pages: d.pages.map((p) => (p.status === 'ocr' ? { ...p, status: 'fail' as const } : p)), savedAt: Date.now() };
  await new Promise<void>((res) => {
    try { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(clean, KEY); tx.oncomplete = () => res(); tx.onerror = () => res(); }
    catch { res(); }
  });
}

export async function loadDraft(): Promise<CaptureDraft | null> {
  const db = await open(); if (!db) return null;
  return new Promise((res) => {
    try { const r = db.transaction(STORE).objectStore(STORE).get(KEY); r.onsuccess = () => res((r.result as CaptureDraft) ?? null); r.onerror = () => res(null); }
    catch { res(null); }
  });
}

export async function clearDraft(): Promise<void> {
  const db = await open(); if (!db) return;
  await new Promise<void>((res) => {
    try { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY); tx.oncomplete = () => res(); tx.onerror = () => res(); }
    catch { res(); }
  });
}
