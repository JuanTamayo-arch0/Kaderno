import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';
import { SIDEBAR_W } from '../lib/responsive';

// ============================================================
//  Barra lateral de escritorio, compartida.
//
//  Antes vivía dentro de app/(tabs)/_layout.tsx y sólo se veía en las pestañas.
//  El problema: Proyectos, Buscar, Tipos y Personalizar NO son pestañas (viven
//  fuera del grupo (tabs)), así que al entrar a una de ellas la barra
//  desaparecía y en escritorio uno quedaba sin manera de volver.
//
//  Ahora el dibujo está aquí y lo usan los dos:
//   · el layout de pestañas le pasa `onNavigate` para no perder el estado del
//     navegador (navigation.navigate en vez de router.push);
//   · las pantallas sueltas la montan tal cual, diciendo cuál va resaltada.
// ============================================================

export type NavKey =
  | 'index' | 'materias' | 'capturar' | 'oraculo' | 'horario' | 'enfoque'
  | 'proyectos' | 'buscar' | 'tipos' | 'personalizar';

type Item = { key: NavKey; label: string; icon: any; href: string };

// Arriba: lo que no es pestaña. Abajo: las pestañas, en su orden.
export const TOP_ITEMS: Item[] = [
  { key: 'proyectos', label: 'Proyectos', icon: 'people-outline', href: '/proyectos' },
  { key: 'tipos', label: 'Tipos de tarea', icon: 'pricetags-outline', href: '/tipos' },
  { key: 'personalizar', label: 'Personalizar', icon: 'color-palette-outline', href: '/personalizar' },
];

export const TAB_ITEMS: Item[] = [
  { key: 'index', label: 'Hoy', icon: 'calendar', href: '/' },
  { key: 'materias', label: 'Materias', icon: 'book', href: '/materias' },
  { key: 'capturar', label: 'Capturar', icon: 'camera', href: '/capturar' },
  { key: 'oraculo', label: 'Oráculo', icon: 'sparkles', href: '/oraculo' },
  { key: 'horario', label: 'Horario', icon: 'grid', href: '/horario' },
  { key: 'enfoque', label: 'Enfoque', icon: 'timer', href: '/enfoque' },
];

export function SideNav({ active, onNavigate }: { active: NavKey | null; onNavigate?: (key: NavKey) => void }) {
  const router = useRouter();
  // Si el layout de pestañas no nos dio su navegador, navegamos por ruta.
  const go = (it: Item) => {
    if (onNavigate && TAB_ITEMS.some((t) => t.key === it.key)) onNavigate(it.key);
    else router.push(it.href as any);
  };

  const row = (it: Item, big: boolean) => {
    const on = active === it.key;
    return (
      <Pressable key={it.key} onPress={() => go(it)}
        accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={it.label}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingVertical: big ? 12 : 11, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4,
          backgroundColor: on ? C.brand + '22' : (pressed ? C.surface2 : 'transparent'),
        })}>
        <Ionicons name={it.icon} size={big ? 20 : 18} color={on ? C.brand : C.muted} />
        <Text style={{ color: on ? C.brand : C.muted, fontWeight: on ? '700' : '600', fontSize: big ? 14.5 : 14 }}>{it.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDEBAR_W, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.line, paddingTop: 44, paddingHorizontal: 12 }}>
      <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', paddingHorizontal: 12, marginBottom: 20 }}>Kaderno</Text>

      <Pressable onPress={() => router.push('/buscar')} accessibilityRole="button" accessibilityLabel="Buscar"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6, backgroundColor: pressed ? C.surface2 : C.surface, borderWidth: 1, borderColor: C.line })}>
        <Ionicons name="search" size={18} color={C.muted} />
        <Text style={{ color: C.muted, fontWeight: '600', fontSize: 14 }}>Buscar…</Text>
      </Pressable>

      {TOP_ITEMS.map((it) => row(it, false))}
      <View style={{ height: 6 }} />
      {TAB_ITEMS.map((it) => row(it, true))}
    </View>
  );
}
