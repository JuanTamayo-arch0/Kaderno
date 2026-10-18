import React, { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { useAuth } from '../../lib/auth';
import { joinRoom } from '../../lib/roomsDb';
import { enterRoom } from '../../lib/rooms';
import { normalizeCode } from '../../lib/roomsLogic';
import { Screen, EmptyState, Skeleton } from '../../components/ds';

// Enlace de invitación: /sala/unirse?codigo=KD7X4P → entra y abre la sala.
// Sin sesión: se guarda el código, se pide entrar y luego se termina de unir
// (lo hace app/_layout.tsx al iniciar sesión).
export default function UnirseConSesion() {
  const { session, loading } = useAuth();
  const { codigo } = useLocalSearchParams<{ codigo?: string }>();
  if (loading) return null;
  if (!session) {
    if (Platform.OS === 'web' && codigo) { try { window.localStorage.setItem('kd:sala:pendiente', String(codigo)); } catch { /* noop */ } }
    return <Redirect href="/login" />;
  }
  return <Unirse />;
}

function Unirse() {
  const { codigo } = useLocalSearchParams<{ codigo?: string }>();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const code = normalizeCode(String(codigo ?? ''));
    if (!code) { setErr('El enlace no tiene un código válido.'); return; }
    joinRoom(code)
      .then(async (r) => {
        if (!r) { setErr('No encontramos una sala con ese código. Puede que lo hayan cambiado.'); return; }
        void enterRoom({ id: r.id, name: r.name });
        router.replace(`/sala/${r.id}` as any);
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, [codigo, router]);
  return (
    <Screen title="Unirse a la sala" back="/enfoque">
      {err ? (
        <EmptyState icon="people-outline" title="No pudimos entrar" text={err}
          action={{ label: 'Ir a Enfoque', onPress: () => router.replace('/enfoque' as any) }} />
      ) : <Skeleton height={120} />}
    </Screen>
  );
}
