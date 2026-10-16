import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../lib/theme';
import { Screen, IconButton } from '../components/ds';
import { RequireAuth } from '../components/RequireAuth';

// react-native-webview NO funciona en web; solo lo cargamos en móvil.
let WebView: any = null;
if (Platform.OS !== 'web') {
  try { WebView = require('react-native-webview').WebView; } catch { /* noop */ }
}

function Visor() {
  const { url, name } = useLocalSearchParams<{ url: string; name?: string; mime?: string }>();
  const router = useRouter();
  const clean = String(url ?? '');
  const isWeb = Platform.OS === 'web';
  // Android WebView no renderiza PDF embebido → usar el visor de Google.
  const src = Platform.OS === 'android' ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(clean)}` : clean;

  return (
    <Screen title={name || 'Documento'} back="/materias" nav="materias" scroll={false} padded={false}
      right={<IconButton icon="open-outline" label="Abrir en una pestaña nueva" onPress={() => Linking.openURL(clean)} />}>
      <View style={{ flex: 1 }}>
        {!clean ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.muted }}>No se pudo cargar el documento.</Text></View>
        ) : isWeb ? (
          // En web renderizamos un iframe nativo del navegador (muestra el PDF).
          React.createElement('iframe', { src: clean, style: { border: 'none', width: '100%', height: '100%', backgroundColor: '#fff' }, title: name || 'Documento' })
        ) : WebView ? (
          <WebView source={{ uri: src }} style={{ flex: 1, backgroundColor: C.bg }} startInLoadingState
            renderLoading={() => (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
                <ActivityIndicator color={C.brand} />
              </View>
            )} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: C.muted, textAlign: 'center', marginBottom: 16 }}>No se pudo mostrar el visor aquí.</Text>
            <Pressable onPress={() => Linking.openURL(clean)} style={{ backgroundColor: C.brand, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18 }}>
              <Text style={{ color: C.onBrand, fontWeight: '700' }}>Abrir / descargar</Text>
            </Pressable>
          </View>
        )}
      </View>

      {!isWeb && !!clean && (
        <Pressable onPress={() => Linking.openURL(clean)} style={{ position: 'absolute', bottom: 24, right: 20, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Ionicons name="download-outline" size={16} color={C.text} />
          <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>Abrir / descargar</Text>
        </Pressable>
      )}
    </Screen>
  );
}

export default function VisorProtegido() {
  return <RequireAuth><Visor /></RequireAuth>;
}
