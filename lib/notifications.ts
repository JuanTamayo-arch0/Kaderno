import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotifPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Recordatorios',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  return req.status === 'granted';
}

// Programa un recordatorio local N días antes de la fecha de entrega (a las 9:00 am).
export async function scheduleReminder(title: string, dueDate: string, daysBefore: number) {
  if (!dueDate || !daysBefore) return;
  const target = new Date(dueDate + 'T09:00:00');
  target.setDate(target.getDate() - daysBefore);
  if (target.getTime() <= Date.now()) return; // ya pasó, no programar
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Entrega próxima', body: title },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target },
  });
}

// Aviso local en el celular para el momento exacto del recordatorio. En la web
// los avisos llegan por notificación push desde el servidor (función notify).
export async function scheduleLocalReminder(title: string, at: Date): Promise<void> {
  if (Platform.OS === 'web') return;
  if (at.getTime() <= Date.now()) return;
  if (!(await ensureNotifPermission())) return;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Entrega próxima', body: title },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
}
