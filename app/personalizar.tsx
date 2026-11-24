import React, { useEffect, useRef, useState } from 'react';
import { RequireAuth } from '../components/RequireAuth';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, Button } from '../components/ds';
import {
  C, R, THEMES, derive, inkOn, fontFamilyOf, BRAND_THEMES, MORE_THEMES, BACKGROUNDS, FONTS, SIZES,
  PSettings, PERSONALIZE, DEFAULTS, savePersonalize, loadWebFont, NOTE_FONTS,
} from '../lib/theme';
import { STUDY_ACCENTS, WORK_ACCENTS, isKadernoTheme, accentOf, workAccentOf, spacePalette } from '../lib/brand';
import { useMode, getSpace } from '../lib/mode';
import { fetchPrefs, savePrefs, uploadWallpaperFromUri, cleanOldWallpapers } from '../lib/db';
import { notify } from '../lib/confirm';
import { t, trn } from '../lib/i18n';

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
  // v26: los temas de antes quedan en "Más colores", abiertos si hay uno elegido.
  const [more, setMore] = useState(!isKadernoTheme(PERSONALIZE.themeId));
  // v26: el acento, los temas de antes y el fondo dependen del espacio abierto.
  const { space, both } = useMode();
  const work = space === 'trabajo';
  // Vista previa de todas las fuentes: se cargan solo al entrar aquí.
  useEffect(() => { loadWebFont('all'); }, []);
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
        notify(t('El fondo no se pudo subir'), t('Se usará solo en este dispositivo. Revisa tu conexión y vuelve a intentarlo.'));
      }
      return null;
    } finally {
      if (pickSeq.current === seq) setUploading(false);
    }
  }

  async function pickBg() {
    try {
      const ImagePicker = await import('expo-image-picker');
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const uri = a.uri?.startsWith('data:') ? a.uri : (a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri);
      if (!uri) return;
      // Vista previa inmediata con el archivo local, y en paralelo la subida.
      const seq = ++pickSeq.current;
      set({ bgCustom: uri, bgId: 'custom' });
      await pushWallpaper(uri, seq, a.mimeType ?? undefined);
    } catch (e: any) { notify(t('No se pudo cargar la imagen'), e?.message ?? ''); }
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
        <Button label={uploading ? t('Subiendo fondo…') : t('Guardar y aplicar')} onPress={apply} busy={saving} disabled={uploading} size="lg" full />
        {Platform.OS === 'web' && <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 6 }}>{t('La app se recarga con la nueva apariencia.')}</Text>}
      </View>
    </View>
  );

  return (
    <Screen title={t('Apariencia')} subtitle={t('Tema, color, fondo, letra y tamaño')} back="/ajustes" nav="personalizar" maxWidth={900} footer={footer}
      right={<Button label={t('Restablecer')} kind="ghost" size="sm" onPress={() => { pickSeq.current++; setUploading(false); setS({ ...DEFAULTS, bgCustom: null }); }} />}>
        <ThemePreview s={s} />
        {/* ---------------- TEMA ---------------- */}
        <Section title={t('Tema')} subtitle={both ? t('Estás ajustando {v}. Claro u oscuro y la letra valen para los dos espacios; el acento es de cada uno. El logo no cambia de color.', { v: work ? 'Trabajo' : 'Estudio' }) : t('Los de Kaderno, con el color de acento que quieras. El logo no cambia de color.')} />
        <View style={grid}>
          {BRAND_THEMES.map((t) => <ThemeCard key={t.id} id={t.id} accentId={s.accentId} workAccentId={s.workAccentId} work={work} wide active={s.themeId === t.id || (work && !isKadernoTheme(s.themeId) && THEMES[s.themeId]?.scheme === t.scheme)} onPress={() => set({ themeId: t.id })} />)}
        </View>
        {(isKadernoTheme(s.themeId) || work) && (
          <>
            <Text style={groupLbl}>{t('Color de acento{v}', { v: both ? (work ? ' en Trabajo' : ' en Estudio') : '' })}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }} accessibilityRole="radiogroup">
              {(work ? WORK_ACCENTS : STUDY_ACCENTS).map((a) => {
                const on = (work ? workAccentOf(s.workAccentId) : accentOf(s.accentId)).id === a.id;
                const col = (THEMES[s.themeId]?.scheme === 'light' ? a.light : a.dark).brand;
                return (
                  <Pressable key={a.id} onPress={() => set(work ? { workAccentId: a.id } : { accentId: a.id })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={a.name}
                    style={{ alignItems: 'center', gap: 6, width: 72 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: col, borderWidth: 3, borderColor: on ? C.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Ionicons name="checkmark" size={18} color={inkOn(col)} />}
                    </View>
                    <Text style={{ color: on ? C.text : C.muted, fontSize: 12, fontWeight: on ? '700' : '500', textAlign: 'center' }} numberOfLines={1}>{a.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        {work && <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 12 }}>{t('Los temas de colores y los fondos de pantalla son del espacio Estudio.')}</Text>}
        {!work && (<>
        <Pressable onPress={() => setMore(!more)} accessibilityRole="button" accessibilityState={{ expanded: more }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingVertical: 6, alignSelf: 'flex-start' }}>
          <Ionicons name={more ? 'chevron-down' : 'chevron-forward'} size={16} color={C.muted} />
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{t('Más colores')}</Text>
          <Text style={{ color: C.muted, fontSize: 12.5 }}>{t('· los temas de antes')}</Text>
        </Pressable>
        {more && (
          <>
            <Text style={groupLbl}>{t('Oscuros')}</Text>
            <View style={grid}>
              {MORE_THEMES.filter((t) => t.scheme === 'dark').map((t) => <ThemeCard key={t.id} id={t.id} active={s.themeId === t.id} onPress={() => set({ themeId: t.id })} />)}
            </View>
            <Text style={groupLbl}>{t('Claros')}</Text>
            <View style={grid}>
              {MORE_THEMES.filter((t) => t.scheme === 'light').map((t) => <ThemeCard key={t.id} id={t.id} active={s.themeId === t.id} onPress={() => set({ themeId: t.id })} />)}
            </View>
          </>
        )}

        {/* ---------------- FONDO ---------------- */}
        <Section title={t('Fondo de pantalla')} subtitle={t('Detrás de las tarjetas')} />
        <View style={grid}>
          <BgSwatch label={t('Ninguno')} active={s.bgId === 'none'} onPress={() => set({ bgId: 'none' })} plain />
          {s.bgCustom && (
            <BgSwatch label={t('Mi foto')} active={s.bgId === 'custom'} onPress={() => set({ bgId: 'custom' })} imageUri={s.bgCustom} busy={uploading} />
          )}
          {BACKGROUNDS.map((b) => (
            <BgSwatch key={b.id} label={b.name} css={b.css} solid={b.solid} active={s.bgId === b.id} onPress={() => set({ bgId: b.id })} />
          ))}
          <Pressable onPress={pickBg} disabled={uploading} style={[swatchBox, { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', opacity: uploading ? 0.5 : 1 }]}>
            <Ionicons name="cloud-upload-outline" size={20} color={C.muted} />
            <Text style={{ color: C.muted, fontSize: 11.5, marginTop: 4 }}>{t('Subir foto')}</Text>
          </Pressable>
        </View>
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
          {uploading ? t('Subiendo tu foto… se guardará en tu cuenta.') : t('Tu foto se guarda en tu cuenta, así la ves en cualquier dispositivo.')}
        </Text>

        </>)}

        {/* ---------------- FUENTE ---------------- */}
        <Section title={t('Tipo de letra')} subtitle={t('La fuente de todos los textos')} />
        <View style={{ gap: 8 }}>
          {FONTS.map((f) => {
            const active = s.fontId === f.id;
            return (
              <Pressable key={f.id} onPress={() => set({ fontId: f.id })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: active ? C.brand + '18' : C.surface, borderWidth: 1, borderColor: active ? C.brand : C.line }}>
                <Text style={{ color: C.text, fontSize: 17, fontWeight: '700', flex: 1, ...(f.family ? ({ fontFamily: f.family } as any) : {}) }}>{t('{name} · Aa Bb 123', { name: f.name })}</Text>
                {active && <Ionicons name="checkmark-circle" size={20} color={C.brand} />}
              </Pressable>
            );
          })}
        </View>
        {Platform.OS !== 'web' && <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>{t('Las fuentes se ven al 100% en la versión web; en móvil algunas usan la del sistema.')}</Text>}

        {/* ---------------- LETRA DE LAS NOTAS ---------------- */}
        <Section title={t('Letra de las notas')} subtitle={t('Para leer y escribir tus apuntes')} />
        <View style={{ gap: 8 }}>
          {NOTE_FONTS.map((f) => {
            const active = (s.noteFontId ?? 'serif') === f.id;
            return (
              <Pressable key={f.id} onPress={() => set({ noteFontId: f.id })} accessibilityRole="radio" accessibilityState={{ checked: active }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: active ? C.brand + '18' : C.surface, borderWidth: 1, borderColor: active ? C.brand : C.line }}>
                <Text style={{ color: C.text, fontSize: 16, flex: 1, ...(f.family ? ({ fontFamily: f.family } as any) : {}) }}>{t('{name} · El aire es un gas y se comprime', { name: f.name })}</Text>
                {active && <Ionicons name="checkmark-circle" size={20} color={C.brand} />}
              </Pressable>
            );
          })}
        </View>

        {/* ---------------- TAMAÑO ---------------- */}
        <Section title={t('Tamaño de la interfaz')} subtitle={t('Escala general de texto y espacios')} />
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

function ThemeCard({ id, active, onPress, accentId, workAccentId, work, wide }: { id: string; active: boolean; onPress: () => void; accentId?: string; workAccentId?: string; work?: boolean; wide?: boolean }) {
  const p = spacePalette({ themeId: id, scheme: THEMES[id].scheme, base: THEMES[id].palette, space: work ? 'trabajo' : 'estudio', accentId, workAccentId });
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={`Tema ${THEMES[id].name}`} style={[swatchBox, wide ? { width: 150 } : null, { borderColor: active ? p.brand : C.line, borderWidth: active ? 2 : 1, padding: 0, overflow: 'hidden' }]}>
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
  const theme = THEMES[s.themeId] ?? THEMES['kaderno-oscuro'];
  const p = derive(spacePalette({ themeId: theme.id, scheme: theme.scheme, base: theme.palette, space: getSpace(), accentId: s.accentId, workAccentId: s.workAccentId }));
  const ff = fontFamilyOf(s.fontId);
  const t = (extra: any) => ({ ...(ff ? { fontFamily: ff } : {}), ...extra });
  return (
    <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line, marginBottom: 6 }} accessibilityLabel={trn('Vista previa del tema {name}', { name: theme.name })}>
      <View style={{ backgroundColor: p.bg, padding: 16, gap: 10 }}>
        <Text style={t({ color: p.muted, fontSize: 12 })}>{trn('Vista previa · {name}', { name: theme.name })}</Text>
        <Text style={t({ color: p.text, fontSize: 22, fontWeight: '800' })}>{trn('Hoy')}</Text>
        {[{ title: trn('Informe de laboratorio'), meta: trn('Física · Hoy, 11:59 pm'), tone: p.warnText }, { title: trn('Parcial 2: series'), meta: trn('Cálculo II · vie 16, 8:00 am'), tone: p.muted }].map((x) => (
          <View key={x.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: p.surface, borderColor: p.line, borderWidth: 1, borderRadius: 12, padding: 12 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: p.muted }} />
            <View style={{ flex: 1 }}>
              <Text style={t({ color: p.text, fontSize: 14.5, fontWeight: '600' })}>{x.title}</Text>
              <Text style={t({ color: x.tone, fontSize: 12.5, marginTop: 2 })}>{x.meta}</Text>
            </View>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ backgroundColor: p.brand, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 }}><Text style={t({ color: p.onBrand, fontWeight: '700' })}>{trn('Nueva tarea')}</Text></View>
          <View style={{ backgroundColor: p.surface2, borderColor: p.line, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 }}><Text style={t({ color: p.text, fontWeight: '700' })}>{trn('Cancelar')}</Text></View>
        </View>
      </View>
    </View>
  );
}
