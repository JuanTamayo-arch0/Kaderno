import React, { Suspense } from 'react';
import { Text } from 'react-native';

// react-native-markdown-display (con markdown-it) pesa unos 250 KB y solo se
// usa al leer una nota o una respuesta del Oráculo. Se descarga la primera vez
// que hace falta; mientras tanto se muestra el texto plano.
const Markdown = React.lazy(() => import('react-native-markdown-display'));

export function LazyMarkdown({ style, children }: { style?: any; children: string }) {
  return (
    <Suspense fallback={<Text style={{ color: style?.body?.color, fontSize: style?.body?.fontSize, lineHeight: style?.body?.lineHeight }}>{children}</Text>}>
      <Markdown style={style}>{children}</Markdown>
    </Suspense>
  );
}
