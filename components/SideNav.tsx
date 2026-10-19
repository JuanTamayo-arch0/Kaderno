import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { SIDEBAR_W, useResponsive } from '../lib/responsive';
import { useAuth } from '../lib/auth';
import { useNavCounts } from '../lib/navCounts';
import { useFocusTimer } from '../lib/focusTimer';
import { updateAmbient } from '../lib/ambient';
import { useAmbient } from './focus/AmbientControls';
import { openAdd, openCommand, openInbox } from '../lib/uiBus';
import { navKeyOf } from '../lib/navKey';
export { navKeyOf };

// ============================================================
//  Navegación de computador (barra lateral) y de celular (barra inferior).
//
//  Computador: Hoy, Materias, Horario y Proyectos arriba; la sección
//  "Estudiar" (Enfoque, Repaso, Oráculo, Capturar); abajo la persona con
//  Ajustes. Hay una sola barra para toda la app (AppSideNav, en el layout
//  raíz): así no desaparece mientras carga la pantalla siguiente.
//
//  Celular: cinco botones (Hoy, Materias, +, Estudiar, Proyectos). Las
//  pantallas que viven "dentro" de otra (Horario dentro de Materias,
//  Enfoque / Repaso / Oráculo / Capturar dentro de Estudiar) encienden
//  el botón de su sección.
// ============================================================

export type { NavKey } from '../lib/navKey';
import type { NavKey } from '../lib/navKey';

type Item = { key: NavKey; label: string; icon: any; iconOn: any; href: string };

export const MAIN_ITEMS: Item[] = [
  { key: 'index', label: 'Hoy', icon: 'today-outline', iconOn: 'today', href: '/' },
  { key: 'materias', label: 'Materias', icon: 'book-outline', iconOn: 'book', href: '/materias' },
  { key: 'horario', label: 'Horario', icon: 'grid-outline', iconOn: 'grid', href: '/horario' },
  { key: 'proyectos', label: 'Proyectos', icon: 'people-outline', iconOn: 'people', href: '/proyectos' },
];
export const STUDY_ITEMS: Item[] = [
  { key: 'enfoque', label: 'Enfoque', icon: 'timer-outline', iconOn: 'timer', href: '/enfoque' },
  { key: 'repaso', label: 'Repaso', icon: 'albums-outline', iconOn: 'albums', href: '/repaso' },
  { key: 'oraculo', label: 'Oráculo', icon: 'sparkles-outline', iconOn: 'sparkles', href: '/oraculo' },
  { key: 'capturar', label: 'Capturar', icon: 'camera-outline', iconOn: 'camera', href: '/capturar' },
  { key: 'mascota', label: 'Mascota', icon: 'paw-outline', iconOn: 'paw', href: '/mascota' },
];
/** Rutas que son pestañas (se navega con el navegador de pestañas para no perder su estado). */
export const TAB_KEYS: NavKey[] = ['index', 'materias', 'horario', 'proyectos', 'estudiar', 'enfoque', 'oraculo', 'capturar'];

function displayName(session: any): { name: string; initials: string; email: string } {
  const email = session?.user?.email ?? '';
  const name = (session?.user?.user_metadata?.full_name as string | undefined)?.trim() || email.split('@')[0] || 'Tú';
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  const initials = (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
  return { name, initials, email };
}

export function Avatar({ initials, size = 30 }: { initials: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.onBrand, fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

export function SideNav({ active, onNavigate }: { active: NavKey | null; onNavigate?: (key: NavKey) => void }) {
  const router = useRouter();
  const { session } = useAuth();
  const counts = useNavCounts();
  const focus = useFocusTimer();
  const amb = useAmbient();
  const me = displayName(session);

  const go = (it: { key: NavKey; href: string }) => {
    if (onNavigate && TAB_KEYS.includes(it.key)) onNavigate(it.key);
    else router.push(it.href as any);
  };

  const row = (it: Item, extra?: React.ReactNode) => {
    const on = active === it.key || (it.key === 'materias' && active === 'materias');
    return (
      <Pressable key={it.key} onPress={() => go(it)}
        accessibilityRole="link" accessibilityState={{ selected: on }} accessibilityLabel={it.label}
        style={({ pressed, hovered, focused }: any) => [{
          flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40,
          paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, marginBottom: 2,
          backgroundColor: on ? C.brand + '22' : (pressed || hovered ? C.surface2 : 'transparent'),
        }, focused ? { outlineColor: C.focus, outlineWidth: 2, outlineStyle: 'solid' } as any : null]}>
        <Ionicons name={on ? it.iconOn : it.icon} size={19} color={on ? C.brand : C.muted} />
        <Text style={{ color: on ? C.brand : C.text, fontWeight: on ? '700' : '600', fontSize: 14, flex: 1 }}>{it.label}</Text>
        {extra}
      </Pressable>
    );
  };
  const badge = (n: number, tone?: string) => n > 0 ? (
    <View style={{ minWidth: 22, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: tone ?? C.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: tone ? C.onBrand : C.text, fontSize: 11.5, fontWeight: '800' }}>{n > 99 ? '99+' : n}</Text>
    </View>
  ) : null;
  const showMute = focus.state.running && (amb.status.playing && !amb.status.preview || amb.prefs.muted);
  const timer = focus.state.running || focus.remaining < focus.total
    ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: focus.state.mode === 'work' ? C.brand : C.goodText, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{focus.label}</Text>
        {showMute && (
          <Pressable onPress={() => updateAmbient({ muted: !amb.prefs.muted })} hitSlop={6} accessibilityRole="button"
            accessibilityLabel={amb.prefs.muted ? 'Activar el sonido de fondo' : `Silenciar el sonido de fondo (${amb.status.label})`}
            style={({ hovered }: any) => ({ width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? C.surface2 : 'transparent' })}>
            <Ionicons name={amb.prefs.muted ? 'volume-mute-outline' : 'musical-notes-outline'} size={14} color={C.muted} />
          </Pressable>
        )}
      </View>
    )
    : null;

  return (
    <View dataSet={{ petSidebar: '1' }} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDEBAR_W, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.line, zIndex: 10 }}>
      <ScrollView contentContainerStyle={{ paddingTop: 22, paddingHorizontal: 12, paddingBottom: 12, flexGrow: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 16 }}>
          <KadernoMark size={28} />
          <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', flex: 1 }}>Kaderno</Text>
          <Pressable onPress={openInbox} accessibilityRole="button" accessibilityLabel={counts.unread ? `Avisos, ${counts.unread} sin leer` : 'Avisos'}
            style={({ hovered }: any) => ({ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? C.surface2 : 'transparent' })}>
            <Ionicons name={counts.unread ? 'notifications' : 'notifications-outline'} size={19} color={counts.unread ? C.brand : C.muted} />
            {counts.unread > 0 && <View style={{ position: 'absolute', top: 7, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: C.bad }} />}
          </Pressable>
        </View>

        <Pressable onPress={openCommand} accessibilityRole="search" accessibilityLabel="Buscar o ir a… (Ctrl K)"
          style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: hovered ? C.surface2 : C.bg, marginBottom: 8 })}>
          <Ionicons name="search" size={17} color={C.muted} />
          <Text style={{ color: C.muted, fontSize: 13.5, flex: 1 }}>Buscar…</Text>
          {Platform.OS === 'web' && <Kbd text="Ctrl K" />}
        </Pressable>
        <Pressable onPress={openAdd} accessibilityRole="button" accessibilityLabel="Agregar"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 40, borderRadius: 10, backgroundColor: C.brand, opacity: pressed ? 0.85 : 1, marginBottom: 14 })}>
          <Ionicons name="add" size={19} color={C.onBrand} />
          <Text style={{ color: C.onBrand, fontWeight: '800', fontSize: 14 }}>Agregar</Text>
        </Pressable>

        {row(MAIN_ITEMS[0], badge(counts.today))}
        {counts.inbox > 0 && (
          <Pressable onPress={() => router.push({ pathname: '/', params: { bandeja: '1' } } as any)} accessibilityRole="link" accessibilityLabel={`Bandeja, ${counts.inbox} por ordenar`}
            style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingLeft: 40, paddingRight: 10, borderRadius: 10, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
            <Ionicons name="file-tray-outline" size={15} color={C.muted} />
            <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600', flex: 1 }}>Bandeja</Text>
            {badge(counts.inbox)}
          </Pressable>
        )}
        {row(MAIN_ITEMS[1])}
        {row(MAIN_ITEMS[2])}
        {row(MAIN_ITEMS[3])}

        <Pressable onPress={() => go({ key: 'estudiar', href: '/estudiar' })} accessibilityRole="link" accessibilityLabel="Estudiar">
          <Text style={{ color: active === 'estudiar' ? C.brand : C.muted, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase', paddingHorizontal: 10, paddingTop: 16, paddingBottom: 6 }}>Estudiar</Text>
        </Pressable>
        {row(STUDY_ITEMS[0], timer)}
        {row(STUDY_ITEMS[1], badge(counts.repaso))}
        {row(STUDY_ITEMS[2])}
        {row(STUDY_ITEMS[3])}
        {row(STUDY_ITEMS[4])}

        <View style={{ flex: 1, minHeight: 16 }} />
        <Pressable onPress={() => router.push('/ajustes')} accessibilityRole="link" accessibilityLabel="Ajustes y cuenta"
          style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: active === 'ajustes' ? C.brand + '22' : hovered ? C.surface2 : 'transparent' })}>
          <Avatar initials={me.initials} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }} numberOfLines={1}>{me.name}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>Ajustes y cuenta</Text>
          </View>
          <Ionicons name="settings-outline" size={18} color={C.muted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const NO_SIDEBAR = ['/login', '/bienvenida', '/visor'];

/**
 * La barra lateral de computador, montada una sola vez en el layout raíz.
 * Las pestañas se abren con navigate (vuelve a la pestaña y conserva su estado).
 */
export function AppSideNav() {
  const { isWide } = useResponsive();
  const { session } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  if (!isWide || !session || NO_SIDEBAR.some((x) => pathname.startsWith(x))) return null;
  const go = (key: NavKey) => router.navigate((key === 'index' ? '/' : `/${key}`) as any);
  return <SideNav active={navKeyOf(pathname)} onNavigate={go} />;
}

export function Kbd({ text }: { text: string }) {
  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
      <Text style={{ color: C.muted, fontSize: 10.5, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

/** Marca de Kaderno: un cuaderno con una línea. */
export function KadernoMark({ size = 28 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="book" size={size * 0.56} color={C.onBrand} />
    </View>
  );
}

// ---------- Barra inferior (celular) ----------
const SECTION_OF: Partial<Record<NavKey, NavKey>> = {
  horario: 'materias', enfoque: 'estudiar', repaso: 'estudiar', oraculo: 'estudiar', capturar: 'estudiar',
};

export function BottomBar({ active, onNavigate, bottomInset }: { active: NavKey; onNavigate: (k: NavKey) => void; bottomInset: number }) {
  const counts = useNavCounts();
  const focus = useFocusTimer();
  const section = SECTION_OF[active] ?? active;
  const tab = (key: NavKey, label: string, icon: any, iconOn: any, badgeN = 0, extra?: string) => {
    const on = section === key;
    return (
      <Pressable key={key} onPress={() => onNavigate(key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 8, paddingBottom: 6, minHeight: 52 }}>
        <View>
          <Ionicons name={on ? iconOn : icon} size={23} color={on ? C.brand : C.muted} />
          {badgeN > 0 && (
            <View style={{ position: 'absolute', top: -4, right: -10, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: C.bad, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={{ color: C.onBad, fontSize: 10, fontWeight: '800' }}>{badgeN > 99 ? '99+' : badgeN}</Text>
            </View>
          )}
        </View>
        <Text style={{ color: on ? C.brand : C.muted, fontSize: 11, fontWeight: on ? '700' : '500', marginTop: 3, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{extra ?? label}</Text>
      </Pressable>
    );
  };
  const timerLabel = focus.state.running ? focus.label : undefined;
  return (
    <View dataSet={{ petFloor: '1' }} style={{ flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line, paddingBottom: Math.max(bottomInset, 6) }}>
      {tab('index', 'Hoy', 'today-outline', 'today', counts.today)}
      {tab('materias', 'Materias', 'book-outline', 'book')}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable onPress={openAdd} accessibilityRole="button" accessibilityLabel="Agregar" dataSet={{ petObstacle: '1' }}
          style={({ pressed }) => ({ width: 50, height: 44, borderRadius: 15, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
          <Ionicons name="add" size={28} color={C.onBrand} />
        </Pressable>
      </View>
      {tab('estudiar', 'Estudiar', 'school-outline', 'school', counts.repaso, timerLabel)}
      {tab('proyectos', 'Proyectos', 'people-outline', 'people')}
    </View>
  );
}
