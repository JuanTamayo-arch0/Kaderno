import React, { useEffect, useRef, useState } from 'react';
import { RequireAuth } from '../components/RequireAuth';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Button } from '../components/ds';
import {
  C, R, THEMES, derive, inkOn, fontFamilyOf, DARK_THEMES, LIGHT_THEMES, BACKGROUNDS, FONTS, SIZES,
  PSettings, PERSONALIZE, DEFAULTS, savePersonalize,
} from '../lib/theme';
import { fetchPrefs, savePrefs, uploadWallpaperFromUri, cleanOldWallpapers } from '../lib/db';
import { notify } from '../lib/confirm';

function Personalizar() {
  const router = useRouter();
  const [s, setS] = useState<PSettings>({ ...PERSONALIZE });
  const [saving, setSaving] = useState(false);
  // Mientras el fondo viaja al bucket se muestra la vista previa local con un
  // spinner encima; si falla, se queda la copia local y se avisa.
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<PSettings>) => setS((prev) => ({ ...prev, ...patch }));
  // Esta preferencia NO es de tema, así que no vive en PSettings (que se guarda
  // también en el teléfono para pintar la app antes de tener red): vive solo en
  // la nube, dentro del mismo jsonb, y por eso se lee aparte.
  const [hoyProy, setHoyProy] = useState(true);
  useEffect(() => {
    fetchPrefs().then((p) => { if (p && p.hoyProyectos === false) setHoyProy(false); }).catch(() => { });
  }, []);
  // Cada selección de foto lleva un número: si el usuario elige otra imagen
  // mientras la anterior sube, la subida vieja ya no puede pisar la nueva.
  const pickSeq = useRef(0);

  // Sube `uri` al bucket y deja la URL pública en bgCustom. Devuelve la URL o null.
  async function pushWallpaper(uri: string, seq: number, mime?: string): Promise<string | null> {
    setUploading(true);
    try {
      const url = await uploadWallpaperFromUri(uri, mime);
      if (pickSeq.current !== seq) return null; // llegó tarde: hay otra foto elegida
      set({ bgCustom: url, bgId: 'custom' });
      cleanOldWallpapers(url).catch(() => { });
      return url;
    } catch (e: any) {
      if (pickSeq.current === seq) {
        notify('El fondo no se pudo subir', 'Se usará solo en este dispositivo. Revisa tu conexión y vuelve a intentarlo.');
      }
      return null;
    } finally {
      if (pickSeq.current === seq) setUploading(false);
    }
  }

  async function pickBg() {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const uri = a.uri?.startsWith('data:') ? a.uri : (a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri);
      if (!uri) return;
      // Vista previa inmediata con el archivo local, y en paralelo la subida.
      const seq = ++pickSeq.current;
      set({ bgCustom: uri, bgId: 'custom' });
      await pushWallpaper(uri, seq, a.mimeType ?? undefined);
    } catch (e: any) { notify('No se pudo cargar la imagen', e?.message ?? ''); }
  }

  // Fondos guardados antes de que existiera el bucket: el base64 completo vivía
  // dentro de user_prefs. Se migran a Storage la primera vez que se abre esta
  // pantalla, para que dejen de viajar en cada lectura de preferencias.
  useEffect(() => {
    const legacy = PERSONALIZE.bgCustom;
    if (!legacy || !legacy.startsWith('data:')) return;
    let cancel = false;
    const seq = ++pickSeq.current;
    (async () => {
      const url = await pushWallpaper(legacy, seq);
      if (!url || cancel) return;
      const next: PSettings = { ...PERSONALIZE, bgCustom: url };
      await savePersonalize(next);
      savePrefs(next).catch(() => { });
    })();
    return () => { cancel = true; };
  }, []);

  // Volver siempre funciona: si no hay historial (p. ej. tras recargar la página),
  // vamos a la pantalla principal en vez de quedarnos atascados.
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  async function apply() {
    setSaving(true);
    await savePersonalize(s);
    // A la nube no se manda nunca un fondo local (data:/blob:/file:): sería un
    // base64 gigante dentro del jsonb y no serviría en otro dispositivo.
    const isLocalBg = !!s.bgCustom && !/^https?:/i.test(s.bgCustom);
    const remote: PSettings = isLocalBg ? { ...s, bgCustom: null, bgId: s.bgId === 'custom' ? 'none' : s.bgId } : s;
    try { await savePrefs({ ...remote, hoyProyectos: hoyProy }); } catch { /* sin conexión: queda guardado local */ }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Navegación dura a la raíz: aplica el tema y deja un historial válido
      // (antes hacíamos reload() y la flecha "atrás" quedaba sin nada que sacar).
      window.location.assign('/');
    } else {
      setSaving(false);
      goBack();
    }
  }

  const footer = (
    <View style={{ backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line, alignItems: 'center' }}>
      <View style={{ padding: 14, maxWidth: 932, width: '100%' }}>
        <Button label={uploading ? 'Subiendo fondo…' : 'Guardar y aplicar'} onPress={apply} busy={saving} disabled={uploading} size="lg" full />
        {Platform.OS === 'web' && <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 6 }}>La app se recarga con la nueva apariencia.</Text>}
      </View>
    </View>
  );

  return (
    <Screen title="Apariencia" subtitle="Tema, fondo, letra y tamaño" back="/ajustes" nav="personalizar" maxWidth={900} footer={footer}
      right={<Button label="Restablecer" kind="ghost" size="sm" onPress={() => { pickSeq.current++; setUploading(false); setS({ ...DEFAULTS, bgCustom: null }); }} />}>
        <ThemePreview s={s} />
        {/* ---------------- TEMA ---------------- */}
        <Section title="Tema" subtitle="Colores de la app" />
        <Text style={groupLbl}>Oscuros</Text>
        <View style={grid}>
          {DARK_THEMES.map((t) => <ThemeCard key={t.id} id={t.id} active={s.themeId === t.id} onPress={() => set({ themeId: t.id })} />)}
        </View>
        <Text style={groupLbl}>Claros</Text>
        <View style={grid}>
          {LIGHT_THEMES.map((t) => <ThemeCard key={t.id} id={t.id} active={s.themeId === t.id} onPress={() => set({ themeId: t.id })} />)}
        </View>

        {/* ---------------- FONDO ---------------- */}
        <Section title="Fondo de pantalla" subtitle="Detrás de las tarjetas" />
        <View style={grid}>
          <BgSwatch label="Ninguno" active={s.bgId === 'none'} onPress={() => set({ bgId: 'none' })} plain />
          {s.bgCustom && (
            <BgSwatch label="Mi foto" active={s.bgId === 'custom'} onPress={() => set({ bgId: 'custom' })} imageUri={s.bgCustom} busy={uploading} />
          )}
          {BACKGROUNDS.map((b) => (
            <BgSwatch key={b.id} label={b.name} css={b.css} solid={b.solid} active={s.bgId === b.id} onPress={() => set({ bgId: b.id })} />
          ))}
          <Pressable onPress={pickBg} disabled={uploading} style={[swatchBox, { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', opacity: uploading ? 0.5 : 1 }]}>
            <Ionicons name="cloud-upload-outline" size={20} color={C.muted} />
            <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 4 }}>Subir foto</Text>
          </Pressable>
        </View>
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
          {uploading ? 'Subiendo tu foto… se guardará en tu cuenta.' : 'Tu foto se guarda en tu cuenta, así la ves en cualquier dispositivo.'}
        </Text>

        {/* ---------------- FUENTE ---------------- */}
        <Section title="Tipo de letra" subtitle="La fuente de todos los textos" />
        <View style={{ gap: 8 }}>
          {FONTS.map((f) => {
            const active = s.fontId === f.id;
            return (
              <Pressable key={f.id} onPress={() => set({ fontId: f.id })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: active ? C.brand + '18' : C.surface, borderWidth: 1, borderColor: active ? C.brand : C.line }}>
                <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', flex: 1, ...(f.family ? ({ fontFamily: f.family } as any) : {}) }}>
                  {f.name} · Aa Bb 123
                </Text>
                {active && <Ionicons name="checkmark-circle" size={20} color={C.brand} />}
              </Pressable>
            );
          })}
        </View>
        {Platform.OS !== 'web' && <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Las fuentes se ven al 100% en la versión web; en móvil algunas usan la del sistema.</Text>}

        {/* ---------------- TAMAÑO ---------------- */}
        <Section title="Tamaño de la interfaz" subtitle="Escala general de texto y espacios" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SIZES.map((sz) => {
            const active = s.sizeId === sz.id;
            return (
              <Pressable key={sz.id} onPress={() => set({ sizeId: sz.id })}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: active ? C.brand : C.surface, borderWidth: 1, borderColor: active ? C.brand : C.line }}>
                <Text style={{ color: active ? C.onBrand : C.text, fontSize: 13, fontWeight: '700' }}>{sz.name}</Text>
              </Pressable>
            );
          })}
        </View>

    </Screen>
  );
}

function Section({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ marginTop: 22, marginBottom: 12 }}>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>{title}</Text>
      <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

function ThemeCard({ id, active, onPress }: { id: string; active: boolean; onPress: () => void }) {
  const p = THEMES[id].palette;
  return (
    <Pressable onPress={onPress} style={[swatchBox, { borderColor: active ? p.brand : C.line, borderWidth: active ? 2 : 1, padding: 0, overflow: 'hidden' }]}>
      <View style={{ flex: 1, backgroundColor: p.bg, padding: 8, justifyContent: 'space-between' }}>
        <View style={{ backgroundColor: p.surface, borderRadius: 6, padding: 6, borderWidth: 1, borderColor: p.line }}>
          <View style={{ height: 5, width: '70%', borderRadius: 3, backgroundColor: p.text, opacity: 0.85 }} />
          <View style={{ height: 5, width: '45%', borderRadius: 3, backgroundColor: p.muted, marginTop: 4 }} />
        </View>
        {/* El nombre va en su propia línea: junto a los puntos se cortaba
            («Medianoche» no cabía en 104 px). */}
        <View>
          <Text numberOfLines={1} style={{ color: p.text, fontSize: 11.5, fontWeight: '700', marginBottom: 5 }}>{THEMES[id].name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.brand }} />
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.brand2 }} />
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.good }} />
          </View>
        </View>
      </View>
      {active && <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: p.brand, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="checkmark" size={13} color={inkOn(p.brand)} /></View>}
    </Pressable>
  );
}

function BgSwatch({ label, css, solid, imageUri, active, onPress, plain, busy }: { label: string; css?: string; solid?: string; imageUri?: string; active: boolean; onPress: () => void; plain?: boolean; busy?: boolean }) {
  const inner = Platform.OS === 'web' && css
    ? React.createElement('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: css } })
    : null;
  return (
    <Pressable onPress={onPress} style={[swatchBox, { borderColor: active ? C.brand : C.line, borderWidth: active ? 2 : 1, padding: 0, overflow: 'hidden' }]}>
      {plain ? (
        <View style={{ flex: 1, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="ban-outline" size={18} color={C.muted} />
        </View>
      ) : imageUri ? (
        <Image source={{ uri: imageUri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
      ) : (
        <View style={{ flex: 1, backgroundColor: solid }}>{inner}</View>
      )}
      {busy && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      )}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 3 }}>
        <Text style={{ color: '#fff', fontSize: 10.5, textAlign: 'center' }}>{label}</Text>
      </View>
      {active && !busy && <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: C.brand, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="checkmark" size={13} color={C.onBrand} /></View>}
    </Pressable>
  );
}

const grid = { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } as const;
const groupLbl = { color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 8 } as const;
const swatchBox = { width: 104, height: 88, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface } as const;

// Esta pantalla no es una pestaña, así que el candado de sesión va aquí.
export default function PersonalizarProtegida() {
  return (
    <RequireAuth>
      <Personalizar />
    </RequireAuth>
  );
}

// Vista previa en vivo con los colores elegidos, antes de aplicar.
function ThemePreview({ s }: { s: PSettings }) {
  const theme = THEMES[s.themeId] ?? THEMES.medianoche;
  const p = derive(theme.palette);
  const ff = fontFamilyOf(s.fontId);
  const t = (extra: any) => ({ ...(ff ? { fontFamily: ff } : {}), ...extra });
  return (
    <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line, marginBottom: 6 }} accessibilityLabel={`Vista previa del tema ${theme.name}`}>
      <View style={{ backgroundColor: p.bg, padding: 16, gap: 10 }}>
        <Text style={t({ color: p.muted, fontSize: 12 })}>Vista previa · {theme.name}</Text>
        <Text style={t({ color: p.text, fontSize: 22, fontWeight: '800' })}>Hoy</Text>
        {[{ title: 'Informe de laboratorio', meta: 'Física · Hoy, 11:59 pm', tone: p.warnText }, { title: 'Parcial 2: series', meta: 'Cálculo II · vie 16, 8:00 am', tone: p.muted }].map((x) => (
          <View key={x.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: p.surface, borderColor: p.line, borderWidth: 1, borderRadius: 12, padding: 12 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: p.muted }} />
            <View style={{ flex: 1 }}>
              <Text style={t({ color: p.text, fontSize: 14.5, fontWeight: '600' })}>{x.title}</Text>
              <Text style={t({ color: x.tone, fontSize: 12.5, marginTop: 2 })}>{x.meta}</Text>
            </View>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ backgroundColor: p.brand, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 }}><Text style={t({ color: p.onBrand, fontWeight: '700' })}>Nueva tarea</Text></View>
          <View style={{ backgroundColor: p.surface2, borderColor: p.line, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 }}><Text style={t({ color: p.text, fontWeight: '700' })}>Cancelar</Text></View>
        </View>
      </View>
    </View>
  );
}
