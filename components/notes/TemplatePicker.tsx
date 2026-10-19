import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../lib/theme';
import { Sheet } from '../cards/CardForms';
import { TEMPLATES } from '../../lib/noteLinks';
import { getTemplates, deleteTemplate, setSubjectTemplate, subjectTemplate, type MyTemplate } from '../../lib/notesDb';
import { toast, friendlyError } from '../../lib/feedback';

// ============================================================
//  Nueva nota con plantilla (v21, sección 7): en blanco, las de fábrica
//  (Cornell, laboratorio, capítulo, ejercicio) y las tuyas. Cada materia
//  puede tener una por defecto.
// ============================================================

export function TemplatePicker({ visible, subjectId, onClose, onPick }: {
  visible: boolean; subjectId: string | null; onClose: () => void; onPick: (content: string) => void;
}) {
  const [mine, setMine] = useState<MyTemplate[]>([]);
  const [def, setDef] = useState<string | null>(null);
  const [always, setAlways] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setAlways(false);
    getTemplates().then(setMine).catch(() => {});
    if (subjectId) subjectTemplate(subjectId).then(setDef).catch(() => {});
  }, [visible, subjectId]);

  const pick = (key: string | null, content: string) => {
    if (always && subjectId) setSubjectTemplate(subjectId, key).then(() => toast('Plantilla por defecto de la materia guardada')).catch((e) => toast(friendlyError(e), { tone: 'bad' }));
    onPick(content); onClose();
  };
  const row = (key: string | null, name: string, hint: string, content: string, onDelete?: () => void) => (
    <Pressable key={key ?? 'blank'} onPress={() => pick(key, content)} accessibilityRole="button" accessibilityLabel={`Nota: ${name}`}
      style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: def === key ? C.brand : C.line, backgroundColor: hovered ? C.surface2 : 'transparent' })}>
      <Ionicons name={key ? 'document-text-outline' : 'document-outline'} size={20} color={C.brand} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700' }}>{name}{def === key ? ' · por defecto' : ''}</Text>
        <Text style={{ color: C.muted, fontSize: 12.5 }} numberOfLines={1}>{hint}</Text>
      </View>
      {onDelete && <Pressable onPress={onDelete} accessibilityLabel={`Borrar plantilla ${name}`} hitSlop={8}><Ionicons name="trash-outline" size={17} color={C.muted} /></Pressable>}
    </Pressable>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title="Nueva nota" subtitle="Empieza en blanco o con una plantilla">
      {row(null, 'En blanco', 'Sin secciones', '')}
      {TEMPLATES.map((t) => row(t.key, t.name, t.hint, t.content))}
      {mine.map((t) => row(t.id, t.name, 'Tu plantilla', t.content, async () => {
        try { await deleteTemplate(t.id); setMine((m) => m.filter((x) => x.id !== t.id)); } catch (e) { toast(friendlyError(e), { tone: 'bad' }); }
      }))}
      {!!subjectId && (
        <Pressable onPress={() => setAlways(!always)} accessibilityRole="checkbox" accessibilityState={{ checked: always }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
          <Ionicons name={always ? 'checkbox' : 'square-outline'} size={19} color={always ? C.brand : C.muted} />
          <Text style={{ color: C.text, fontSize: 13.5 }}>Usar la que elija siempre en esta materia</Text>
        </Pressable>
      )}
      <Text style={{ color: C.muted, fontSize: 12 }}>Para guardar una nota tuya como plantilla: menú de la nota → "Guardar como plantilla".</Text>
    </Sheet>
  );
}
