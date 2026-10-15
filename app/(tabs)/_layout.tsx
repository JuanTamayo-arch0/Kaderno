import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SideNav, BottomBar, NavKey } from '../../components/SideNav';
import { useAuth } from '../../lib/auth';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';

// ============================================================
//  Pestañas.
//  Celular: barra inferior de cinco botones (Hoy, Materias, +, Estudiar,
//  Proyectos). Computador: barra lateral. Horario, Enfoque, Oráculo y
//  Capturar también son pestañas (conservan su estado al cambiar de
//  pantalla) pero no tienen botón propio abajo: encienden el de su sección.
// ============================================================

function Bar({ state, navigation }: any) {
  const { isWide } = useResponsive();
  const insets = useSafeAreaInsets();
  const current = (state.routes[state.index]?.name ?? 'index') as NavKey;
  const go = (key: NavKey) => navigation.navigate(key);
  if (isWide) return <SideNav active={current} onNavigate={go} />;
  return <BottomBar active={current} onNavigate={go} bottomInset={insets.bottom} />;
}

export default function TabsLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;

  return (
    <Tabs tabBar={(props) => <Bar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Hoy' }} />
      <Tabs.Screen name="materias" options={{ title: 'Materias' }} />
      <Tabs.Screen name="estudiar" options={{ title: 'Estudiar' }} />
      <Tabs.Screen name="proyectos" options={{ title: 'Proyectos' }} />
      <Tabs.Screen name="horario" options={{ title: 'Horario' }} />
      <Tabs.Screen name="enfoque" options={{ title: 'Enfoque' }} />
      <Tabs.Screen name="oraculo" options={{ title: 'Oráculo' }} />
      <Tabs.Screen name="capturar" options={{ title: 'Capturar' }} />
    </Tabs>
  );
}
