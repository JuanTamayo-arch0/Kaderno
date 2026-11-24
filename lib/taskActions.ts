// Borrar una tarea personal de forma segura.
// Con schema_v14 va a la papelera al instante y el aviso ofrece "Deshacer"
// (restaurar). Sin la migración el borrado es definitivo, así que se pregunta.
import { Task, deleteTask, restoreTask, hasV14 } from './db';
import { confirm, notify, toast, friendlyError } from './feedback';
import { dataChanged } from './uiBus';
import { refreshNavCounts } from './navCounts';
import { play } from './sound';
import { trn } from './i18n';

export async function removeTask(t: Pick<Task, 'id' | 'title'>, after?: () => void): Promise<boolean> {
  try {
    if (!hasV14()) {
      const ok = await confirm(trn('¿Borrar "{title}"?', { title: t.title }), trn('No se puede deshacer.'), trn('Borrar'));
      if (!ok) return false;
    }
    await deleteTask(t.id);
    play('delete');
    after?.(); dataChanged(); refreshNavCounts(true);
    if (hasV14()) {
      toast(trn('Tarea enviada a la papelera'), {
        actionLabel: trn('Deshacer'),
        onAction: () => { restoreTask(t.id).then(() => { dataChanged(); refreshNavCounts(true); toast(trn('Tarea restaurada')); }).catch((e) => notify(trn('No se pudo restaurar'), friendlyError(e))); },
      });
    } else toast(trn('Tarea borrada'));
    return true;
  } catch (e) { notify(trn('No se pudo borrar'), friendlyError(e)); return false; }
}
