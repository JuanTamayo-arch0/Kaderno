import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { C } from '../../lib/theme';
import { Note, Subject, SubjectFile, Task, getSubjectFiles, signedUrl } from '../../lib/db';
import { notePreview, sortNotes, type NextClass } from '../../lib/subjectInfo';
import { MiniCalendar } from '../MiniCalendar';
import { focusRingStyle } from '../ds';
import { classWhen, shortDate } from './SubjectParts';

// ============================================================
//  Columna derecha de la materia (computador): próxima clase, calendario,
//  notas recientes y archivos. Se queda igual al cambiar de pestaña.
// ============================================================

function Box({ title, right, children }: { title?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View dataSet={{ petPerch: '1' }} style={{ padding: 16, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, gap: 10 }}>
      {(title || right) && (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {!!title && <Text style={{ color: C.text, fontSize: 14, fontWeight: '800', flex: 1 }}>{title}</Text>}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}
function LinkText({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ focused }: any) => [{ paddingVertical: 2 }, focused ? focusRingStyle() : null]}>
      <Text style={{ color: C.brand, fontSize: 12.5, fontWeight: '700' }}>{text}</Text>
    </Pressable>
  );
}
function Row({ title, sub, onPress, left }: { title: string; sub?: string; onPress: () => void; left?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} dataSet={{ press: '1' }}
      style={({ pressed, focused }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, marginHorizontal: -6, borderRadius: 10, backgroundColor: pressed ? C.surface2 : 'transparent' }, focused ? focusRingStyle() : null]}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>{sub}</Text>}
      </View>
    </Pressable>
  );
}
function fileBadge(f: SubjectFile): { text: string; color: string } {
  const n = f.name.toLowerCase();
  if (f.mime?.includes('pdf') || n.endsWith('.pdf')) return { text: 'PDF', color: C.bad };
  if (f.mime?.includes('image')) return { text: 'IMG', color: C.good };
  if (/\.(docx?|odt)$/.test(n)) return { text: 'DOC', color: C.brand };
  if (/\.(xlsx?|csv)$/.test(n)) return { text: 'XLS', color: C.good };
  if (/\.(pptx?)$/.test(n)) return { text: 'PPT', color: C.warn };
  return { text: (n.split('.').pop() ?? 'ARCH').slice(0, 4).toUpperCase(), color: C.muted };
}

export function SubjectRail({ subject, nextCls, scheduleLoaded = true, tasks, notes, onOpenNote, onAllNotes, onQuickNote, onAllFiles, onTask, onSchedule }: {
  subject: Subject; nextCls: NextClass | null; scheduleLoaded?: boolean; tasks: Task[]; notes: Note[];
  onOpenNote: (n: Note) => void; onAllNotes: () => void; onQuickNote: () => void; onAllFiles: () => void;
  onTask: (t: Task) => void; onSchedule: () => void;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<SubjectFile[] | null>(null);
  useEffect(() => { getSubjectFiles(subject.id).then(setFiles).catch(() => setFiles([])); }, [subject.id]);
  const recent = sortNotes(notes).slice(0, 3);

  async function openFile(f: SubjectFile) {
    const url = await signedUrl(f.path).catch(() => null);
    if (url) router.push({ pathname: '/visor', params: { url, name: f.name, mime: f.mime ?? '' } } as any);
  }

  return (
    <View style={{ gap: 12 }}>
      <Box title="Próxima clase">
        {!scheduleLoaded ? <Text style={{ color: C.muted, fontSize: 13, marginTop: -4 }}>Cargando…</Text> : nextCls ? (
          <View style={{ gap: 3, marginTop: -4 }}>
            <Text style={{ color: nextCls.now ? C.goodText : C.text, fontSize: 17, fontWeight: '800' }}>{classWhen(nextCls)}</Text>
            <Text style={{ color: C.muted, fontSize: 13 }}>{[subject.room, nextCls.now ? null : shortDate(nextCls.start)].filter(Boolean).join(' · ') || 'Según tu horario'}</Text>
          </View>
        ) : (
          <View style={{ gap: 6, marginTop: -4 }}>
            <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18 }}>Esta materia no está en tu horario.</Text>
            <LinkText text="Agregarla al horario" onPress={onSchedule} />
          </View>
        )}
      </Box>

      <MiniCalendar tasks={tasks} subjects={[subject]} embedded onTaskPress={onTask} />

      <Box title="Notas recientes" right={notes.length > 0 ? <LinkText text="Ver todas" onPress={onAllNotes} /> : undefined}>
        {recent.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>Todavía no hay notas.</Text>}
        {recent.map((n) => (
          <Row key={n.id} title={n.title || 'Nota sin título'} onPress={() => onOpenNote(n)}
            sub={[notePreview(n.content, 40), shortDate(new Date(n.updated_at || n.created_at))].filter(Boolean).join(' · ')} />
        ))}
        <Pressable onPress={onQuickNote} accessibilityRole="button" dataSet={{ press: '1' }}
          style={({ pressed, focused }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 9, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, opacity: pressed ? 0.75 : 1 }, focused ? focusRingStyle() : null]}>
          <Ionicons name="add" size={16} color={C.muted} />
          <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600' }}>Nota rápida</Text>
        </Pressable>
      </Box>

      <Box title="Archivos" right={files && files.length > 3 ? <LinkText text={`Ver los ${files.length}`} onPress={onAllFiles} /> : undefined}>
        {files === null ? <Text style={{ color: C.muted, fontSize: 13 }}>Cargando…</Text>
          : files.length === 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: C.muted, fontSize: 13 }}>Sube el programa, guías o lecturas.</Text>
              <LinkText text="Subir archivo" onPress={onAllFiles} />
            </View>
          ) : files.slice(0, 3).map((f) => {
            const b = fileBadge(f);
            return (
              <Row key={f.id} title={f.name} sub={shortDate(new Date(f.created_at))} onPress={() => openFile(f)}
                left={<View style={{ width: 34, height: 40, borderRadius: 7, backgroundColor: b.color + '22', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: b.color, fontSize: 10, fontWeight: '800' }}>{b.text}</Text></View>} />
            );
          })}
      </Box>
    </View>
  );
}
