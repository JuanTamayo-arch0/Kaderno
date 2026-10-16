// Borrar una tarea personal de forma segura.
// Con schema_v14 va a la papelera al instante y el aviso ofrece "Deshacer"
// (restaurar). Sin la migración el borrado es definitivo, así que se pregunta.
import { Task, deleteTask, restoreTask, hasV14 } from './db';
import { confirm, notify, toast, friendlyError } from './feedback';
import { dataChanged } from './uiBus';
import { refreshNavCounts } from './navCounts';
import { play } from './sound';

export async function removeTask(t: Pick<Task, 'id' | 'title'>, after?: () => void): Promise<boolean> {
  try {
    if (!hasV14()) {
      const ok = await confirm(`¿Borrar "${t.title}"?`, 'No se puede deshacer.', 'Borrar');
      if (!ok) return false;
    }
    await deleteTask(t.id);
    play('delete');
    after?.(); dataChanged(); refreshNavCounts(true);
    if (hasV14()) {
      toast('Tarea enviada a la papelera', {
        actionLabel: 'Deshacer',
        onAction: () => { restoreTask(t.id).then(() => { dataChanged(); refreshNavCounts(true); toast('Tarea restaurada'); }).catch((e) => notify('No se pudo restaurar', friendlyError(e))); },
      });
    } else toast('Tarea borrada');
    return true;
  } catch (e) { notify('No se pudo borrar', friendlyError(e)); return false; }
}
