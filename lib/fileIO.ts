import { Platform, Share } from 'react-native';
// Los módulos nativos se cargan solo en el celular (import dinámico): en web
// no hacen falta y así no se descargan al abrir la app.
const nativeFs = () => import('expo-file-system');
const nativePicker = () => import('expo-document-picker');

// ============================================================
//  Leer y guardar archivos de texto en web y en el celular.
//  Lo usan el importador (elegir un .csv/.json) y la exportación.
// ============================================================

const isWeb = Platform.OS === 'web';

export type PickedFile = { name: string; bytes: Uint8Array };

/** Abre el selector de archivos y devuelve el contenido en bytes, o null si se canceló. */
export async function pickTextFile(): Promise<PickedFile | null> {
  if (isWeb) {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,.tsv,.json,.txt,text/csv,application/json,text/plain';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        try { resolve(await readWebFile(f)); } catch (e) { reject(e); }
      };
      input.click();
    });
  }
  const DocumentPicker = await nativePicker();
  const { File } = await nativeFs();
  const res = await DocumentPicker.getDocumentAsync({
    type: ['text/*', 'application/json', 'text/csv', 'text/comma-separated-values', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const bytes = await new File(a.uri).bytes();
  return { name: a.name ?? 'archivo', bytes };
}

export type PickedAny = PickedFile & { mime: string | null; size: number };

/** Cualquier tipo de archivo (para los archivos de un proyecto). null si se canceló. */
export async function pickAnyFile(): Promise<PickedAny | null> {
  if (isWeb) {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        try { resolve(await readWebAny(f)); } catch (e) { reject(e); }
      };
      input.click();
    });
  }
  const DocumentPicker = await nativePicker();
  const { File } = await nativeFs();
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const bytes = await new File(a.uri).bytes();
  return { name: a.name ?? 'archivo', bytes, mime: a.mimeType ?? null, size: a.size ?? bytes.byteLength };
}

/** Archivo de cualquier tipo soltado o elegido en el navegador. */
export async function readWebAny(f: { name: string; type?: string; size?: number; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<PickedAny> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  return { name: f.name, bytes, mime: f.type || null, size: f.size ?? bytes.byteLength };
}

/** Un archivo soltado o elegido en el navegador. */
export async function readWebFile(f: { name: string; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<PickedFile> {
  return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
}

/** Descarga (web) o comparte (celular) un archivo generado por la app. */
export async function saveFile(name: string, content: string | Uint8Array, mime: string): Promise<void> {
  if (isWeb) {
    const part: BlobPart = typeof content === 'string' ? content : (content.slice().buffer as ArrayBuffer);
    const url = URL.createObjectURL(new Blob([part], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  const { File, Paths } = await nativeFs();
  const Sharing = await import('expo-sharing');
  const file = new File(Paths.cache, name);
  try { file.delete(); } catch { /* no existía */ }
  file.create();
  file.write(content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
  }
}

/**
 * Copia un texto. En el navegador va directo al portapapeles; en el celular se
 * abre el menú de compartir, que tiene "Copiar". Devuelve true si quedó copiado.
 */
export async function copyText(text: string): Promise<boolean> {
  if (isWeb) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Navegadores sin permiso de portapapeles: textarea temporal.
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch { return false; }
    }
  }
  await Share.share({ message: text });
  return false;
}
