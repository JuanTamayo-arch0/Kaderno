import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { C } from '../lib/theme';

// ============================================================
//  Candado de sesión para las pantallas que NO son pestañas.
//
//  Las pestañas ya lo tienen en app/(tabs)/_layout.tsx, pero Proyectos,
//  Personalizar, Tipos y Buscar viven fuera de ese grupo: si a alguien se le
//  vencía la sesión estando ahí (o abría el enlace directo sin haber entrado),
//  la pantalla se pintaba vacía y los botones fallaban en silencio, sin decir
//  que el problema era la sesión.
//
//  Se envuelve por fuera —y no con un `if` dentro de la pantalla— para no
//  romper el orden de los hooks: el contenido sólo se monta cuando ya hay
//  sesión, así que dentro nunca hay un return anticipado.
// ============================================================
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;
  return <>{children}</>;
}
