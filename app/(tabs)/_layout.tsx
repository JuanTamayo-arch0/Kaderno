import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';
import { SideNav, NavKey } from '../../components/SideNav';
import { useAuth } from '../../lib/auth';
import { C } from '../../lib/theme';
import { useResponsive } from '../../lib/responsive';

// La barra lateral de escritorio vive en components/SideNav.tsx porque también
// la usan las pantallas que no son pestañas (Proyectos, Personalizar…). Aquí
// sólo se traduce la pestaña activa y se navega con el navegador de las tabs,
// que conserva el estado de cada pantalla.
function Sidebar({ state, navigation }: any) {
  const current = state.routes[state.index]?.name as NavKey | undefined;
  return <SideNav active={current ?? 'index'} onNavigate={(key) => navigation.navigate(key)} />;
}

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const { isWide } = useResponsive();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;

  return (
    <Tabs
      tabBar={isWide ? (props) => <Sidebar {...props} /> : undefined}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.line, height: 62, paddingBottom: 8, paddingTop: 6 },
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontSize: 10.5 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }} />
      <Tabs.Screen name="materias" options={{ title: 'Materias', tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} /> }} />
      <Tabs.Screen name="capturar" options={{ title: 'Capturar', tabBarIcon: ({ color, size }) => <Ionicons name="camera" size={size} color={color} /> }} />
      <Tabs.Screen name="oraculo" options={{ title: 'Oráculo', tabBarIcon: ({ color, size }) => <Ionicons name="sparkles" size={size} color={color} /> }} />
      <Tabs.Screen name="horario" options={{ title: 'Horario', tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="enfoque" options={{ title: 'Enfoque', tabBarIcon: ({ color, size }) => <Ionicons name="timer" size={size} color={color} /> }} />
    </Tabs>
  );
}
