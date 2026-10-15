import React from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R, S } from '../lib/theme';
import { useResponsive, SIDEBAR_W } from '../lib/responsive';
import { SideNav, type NavKey } from './SideNav';

// ============================================================
//  Sistema de diseño de Kaderno.
//  Todas las pantallas usan estas piezas en lugar de definir sus propios
//  botones, campos y encabezados. Los colores salen siempre de C (incluidos
//  los derivados onBrand, goodText, etc.), así que cumplen el contraste en
//  todos los temas.
// ============================================================

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------- Tipografía ----------
// Son "getters" para leer la paleta en el momento del render: C cambia al
// elegir otro tema y estos estilos deben seguirlo.
export const T = {
  get display(): TextStyle { return { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: 0.2 }; },
  get title(): TextStyle { return { fontSize: 22, fontWeight: '800', color: C.text }; },
  get h2(): TextStyle { return { fontSize: 17, fontWeight: '700', color: C.text }; },
  get body(): TextStyle { return { fontSize: 15, color: C.text, lineHeight: 21 }; },
  get small(): TextStyle { return { fontSize: 13, color: C.muted, lineHeight: 18 }; },
  get tiny(): TextStyle { return { fontSize: 12, color: C.muted }; },
  get label(): TextStyle { return { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 }; },
};

const webOnly = (s: any) => (Platform.OS === 'web' ? s : {});
/** Anillo de foco solo para teclado (web). */
export function focusRingStyle() { return webOnly({ outlineColor: C.focus, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' }); }

// ---------- Botón ----------
type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  label, onPress, kind = 'primary', icon, busy, disabled, size = 'md', full, style, accessibilityLabel,
}: {
  label: string; onPress?: () => void; kind?: BtnKind; icon?: IconName; busy?: boolean; disabled?: boolean;
  size?: 'sm' | 'md' | 'lg'; full?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  const bg = kind === 'primary' ? C.brand : kind === 'danger' ? C.bad : kind === 'secondary' ? C.surface2 : 'transparent';
  const fg = kind === 'primary' ? C.onBrand : kind === 'danger' ? C.onBad : kind === 'secondary' ? C.text : C.brand;
  const pad = size === 'sm' ? { paddingVertical: 8, paddingHorizontal: 12 } : size === 'lg' ? { paddingVertical: 14, paddingHorizontal: 20 } : { paddingVertical: 11, paddingHorizontal: 16 };
  const off = disabled || busy;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed, focused }: any) => [{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        minHeight: size === 'sm' ? 36 : 44, borderRadius: 10, backgroundColor: bg,
        borderWidth: kind === 'secondary' ? 1 : 0, borderColor: C.line,
        opacity: off ? 0.55 : pressed ? 0.8 : 1, alignSelf: full ? 'stretch' : 'auto',
      }, pad, focused ? focusRingStyle() : null, style]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: size === 'sm' ? 13 : 14.5 }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// ---------- Botón de ícono (área táctil de 44 px) ----------
export function IconButton({
  icon, onPress, label, color, size = 20, active, style, badge,
}: {
  icon: IconName; onPress?: () => void; label: string; color?: string; size?: number; active?: boolean;
  style?: StyleProp<ViewStyle>; badge?: number;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed, focused }: any) => [{
        width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? C.brand + '22' : pressed ? C.surface2 : 'transparent',
      }, focused ? focusRingStyle() : null, style]}>
      <Ionicons name={icon} size={size} color={color ?? (active ? C.brand : C.muted)} />
      {!!badge && badge > 0 && (
        <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.bad, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
          <Text style={{ color: C.onBad, fontSize: 10, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ---------- Campo de texto con etiqueta, ayuda y error ----------
export function Field({
  label, hint, error, style, inputStyle, right, ...rest
}: TextInputProps & { label?: string; hint?: string; error?: string | null; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle>; right?: React.ReactNode }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      {!!label && <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>{label}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, borderWidth: 1, borderRadius: 10, borderColor: error ? C.bad : focus ? C.brand : C.line }}>
        <TextInput
          placeholderTextColor={C.muted}
          {...rest}
          onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
          style={[{ flex: 1, color: C.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, minHeight: 44 }, webOnly({ outlineStyle: 'none' }), inputStyle]}
        />
        {right}
      </View>
      {!!error && <Text style={{ color: C.badText, fontSize: 12.5, marginTop: 5 }}>{error}</Text>}
      {!error && !!hint && <Text style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>{hint}</Text>}
    </View>
  );
}

// ---------- Tarjeta ----------
export function Card({ children, style, onPress, accessibilityLabel, padded = true }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string; padded?: boolean;
}) {
  const base: ViewStyle = { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: padded ? 16 : 0 };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      style={({ pressed, focused }: any) => [base, { opacity: pressed ? 0.85 : 1 }, focused ? focusRingStyle() : null, style]}>
      {children}
    </Pressable>
  );
}

// ---------- Fila de lista ----------
export function ListRow({
  title, subtitle, left, right, onPress, chevron = !!onPress, style, danger,
}: {
  title: string; subtitle?: string; left?: React.ReactNode; right?: React.ReactNode; onPress?: () => void;
  chevron?: boolean; style?: StyleProp<ViewStyle>; danger?: boolean;
}) {
  const inner = (
    <>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: danger ? C.badText : C.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {right}
      {chevron && <Ionicons name="chevron-forward" size={18} color={C.muted} />}
    </>
  );
  const base: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 52 };
  if (!onPress) return <View style={[base, style]}>{inner}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed, focused }: any) => [base, { backgroundColor: pressed ? C.surface2 : 'transparent' }, focused ? focusRingStyle() : null, style]}>
      {inner}
    </Pressable>
  );
}

// ---------- Etiqueta ----------
export function Badge({ text, color, icon, solid }: { text: string; color?: string; icon?: IconName; solid?: boolean }) {
  const c = color ?? C.muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 8, borderRadius: R.pill, backgroundColor: solid ? c : c + '22' }}>
      {icon && <Ionicons name={icon} size={12} color={solid ? C.onBrand : textTone(c)} />}
      <Text style={{ color: solid ? C.onBrand : textTone(c), fontSize: 11.5, fontWeight: '700' }} numberOfLines={1}>{text}</Text>
    </View>
  );
}
/** Si el color es uno de los semánticos, usa su versión legible como texto. */
export function textTone(c: string): string {
  if (c === C.good) return C.goodText;
  if (c === C.warn) return C.warnText;
  if (c === C.bad) return C.badText;
  return c;
}

/** Punto de color + nombre (materia). */
export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

// ---------- Pestañas segmentadas ----------
export function Segmented<K extends string>({ items, value, onChange, style }: {
  items: { key: K; label: string; icon?: IconName; count?: number }[]; value: K; onChange: (k: K) => void; style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ borderBottomWidth: 1, borderBottomColor: C.line, flexGrow: 0 }, style]} contentContainerStyle={{ gap: 4 }} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={({ focused }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: on ? C.brand : 'transparent', marginBottom: -1 }, focused ? focusRingStyle() : null]}>
            {it.icon && <Ionicons name={it.icon} size={16} color={on ? C.brand : C.muted} />}
            <Text style={{ color: on ? C.text : C.muted, fontWeight: '700', fontSize: 14 }}>{it.label}</Text>
            {it.count != null && it.count > 0 && <Text style={{ color: C.muted, fontSize: 12 }}>{it.count}</Text>}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------- Chip de filtro ----------
export function FilterChip({ label, active, onPress, color, icon }: { label: string; active: boolean; onPress: () => void; color?: string; icon?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={({ pressed, focused }: any) => [{
        flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36,
        paddingVertical: 7, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, marginRight: S.sm,
        backgroundColor: active ? C.brand : C.surface, borderColor: active ? C.brand : C.line, opacity: pressed ? 0.8 : 1,
      }, focused ? focusRingStyle() : null]}>
      {icon ?? (color ? <Dot color={color} /> : null)}
      <Text style={{ color: active ? C.onBrand : C.text, fontSize: 13, fontWeight: active ? '700' : '600' }}>{label}</Text>
    </Pressable>
  );
}

// ---------- Estado vacío ----------
export function EmptyState({ icon, title, text, action, compact }: {
  icon: IconName; title: string; text?: string; action?: { label: string; onPress: () => void; icon?: IconName }; compact?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? 20 : 44, paddingHorizontal: 20 }}>
      <View style={{ width: compact ? 48 : 64, height: compact ? 48 : 64, borderRadius: 32, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Ionicons name={icon} size={compact ? 22 : 28} color={C.muted} />
      </View>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {!!text && <Text style={{ color: C.muted, fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 19, maxWidth: 380 }}>{text}</Text>}
      {action && <Button label={action.label} icon={action.icon} onPress={action.onPress} style={{ marginTop: 16 }} />}
    </View>
  );
}

// ---------- Esqueleto de carga ----------
export function Skeleton({ height = 64, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, marginBottom: 8, opacity: 0.7 }, style]} />;
}

// ---------- Error con reintentar ----------
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState icon="cloud-offline-outline" title="No se pudo cargar" text={message}
      action={onRetry ? { label: 'Reintentar', onPress: onRetry, icon: 'refresh' } : undefined} compact />
  );
}

// ---------- Título de sección ----------
export function SectionLabel({ text, count, tone, right, style }: { text: string; count?: number; tone?: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8 }, style]}>
      <Text style={[T.label, tone ? { color: textTone(tone) } : null]}>{text}</Text>
      {count != null && (
        <View style={{ backgroundColor: C.surface2, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 1 }}>
          <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700' }}>{count}</Text>
        </View>
      )}
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

// ---------- Volver sin quedar atrapado ----------
export function useGoBack(fallback: string = '/') {
  const router = useRouter();
  return React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback as any);
  }, [router, fallback]);
}

// ---------- Pantalla ----------
/**
 * Marco común de todas las pantallas.
 *  - En computador deja el espacio de la barra lateral y, si la pantalla no es
 *    una pestaña (`nav` definido), la dibuja ella misma.
 *  - Encabezado único: título, subtítulo, flecha de volver y acciones.
 *  - Ancho máximo opcional para que el texto no se estire.
 */
export function Screen({
  title, subtitle, back, nav, right, children, scroll = true, maxWidth, padded = true,
  contentStyle, header, footer, eyebrow,
}: {
  title?: string; subtitle?: string; eyebrow?: string;
  back?: boolean | string; nav?: NavKey | null; right?: React.ReactNode; children: React.ReactNode;
  scroll?: boolean; maxWidth?: number; padded?: boolean; contentStyle?: StyleProp<ViewStyle>;
  header?: React.ReactNode; footer?: React.ReactNode;
}) {
  const { isWide } = useResponsive();
  const insets = useSafeAreaInsets();
  const goBack = useGoBack(typeof back === 'string' ? back : '/');
  const padX = isWide ? 40 : 16;
  const top = isWide ? 30 : Math.max(insets.top, 12) + 8;

  const head = title || back ? (
    <View style={{ paddingTop: top, paddingHorizontal: padX, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: maxWidth && isWide ? maxWidth : undefined, width: '100%', alignSelf: maxWidth && isWide ? 'center' : 'auto' }}>
        {back ? (
          <IconButton icon="chevron-back" label="Volver" onPress={goBack} color={C.text} size={24} style={{ marginLeft: -12, marginBottom: title ? -4 : 0 }} />
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {!!eyebrow && <Text style={{ color: C.muted, fontSize: 13, marginBottom: 2 }}>{eyebrow}</Text>}
          {!!title && <Text style={back && !isWide ? T.title : T.display} numberOfLines={1} accessibilityRole="header">{title}</Text>}
          {!!subtitle && <Text style={{ color: C.muted, fontSize: 13.5, marginTop: 3 }} numberOfLines={2}>{subtitle}</Text>}
        </View>
        {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{right}</View> : null}
      </View>
    </View>
  ) : <View style={{ height: top }} />;

  const inner = (
    <View style={[{ paddingHorizontal: padded ? padX : 0, paddingBottom: scroll ? 40 : 0, flex: scroll ? undefined : 1, width: '100%', maxWidth: maxWidth && isWide ? maxWidth + padX * 2 : undefined, alignSelf: maxWidth && isWide ? 'center' : 'auto' }, contentStyle]}>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingLeft: isWide ? SIDEBAR_W : 0 }}>
      {isWide && nav !== undefined && <SideNav active={nav} />}
      {head}
      {header ? (
        <View style={{ paddingHorizontal: padX }}>
          <View style={{ width: '100%', maxWidth: maxWidth && isWide ? maxWidth : undefined, alignSelf: maxWidth && isWide ? 'center' : 'auto' }}>{header}</View>
        </View>
      ) : null}
      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">{inner}</ScrollView>
      ) : (
        <View style={{ flex: 1, minHeight: 0 }}>{inner}</View>
      )}
      {footer}
    </View>
  );
}

// ---------- Interruptor ----------
export function Toggle({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}
      style={({ focused }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 52 }, focused ? focusRingStyle() : null]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        {!!hint && <Text style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{hint}</Text>}
      </View>
      <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: value ? C.brand : C.line, alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: value ? C.onBrand : C.surface }} />
      </View>
    </Pressable>
  );
}

// Re-exporta lo que las pantallas suelen necesitar junto con el sistema.
export type { PressableProps };
