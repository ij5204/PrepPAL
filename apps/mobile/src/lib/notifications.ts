import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('preppal', {
    name: 'PrepPAL',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function ensurePushPermissions(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === 'granted';
}

export async function registerPushTokenToProfile(userId: string): Promise<void> {
  try {
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    const projectIdRaw = extra?.eas?.projectId;
    const projectId =
      typeof projectIdRaw === 'string' && projectIdRaw.length > 0 && projectIdRaw !== 'your-eas-project-id'
        ? projectIdRaw
        : undefined;

    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenRes.data;
    if (!token) return;

    await supabase.from('users').update({ push_token: token }).eq('id', userId);
  } catch {
    /* Dev build without EAS project id: skip silently */
  }
}

/** Local acceptance ping + daily engagement shells (device-local, user timezone). */
export async function scheduleTestLocalNotification(seconds = 4): Promise<void> {
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'PrepPAL',
      body: 'Test notification — reminders are configured.',
    },
    trigger:
      Platform.OS === 'android'
        ? { seconds: Math.max(1, seconds), channelId: 'preppal' }
        : { seconds: Math.max(1, seconds) },
  });
}

export async function scheduleDailyEngagementReminders(): Promise<void> {
  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const daily9 =
    Platform.OS === 'android'
      ? ({ hour: 9, minute: 0, repeats: true, channelId: 'preppal' } as const)
      : ({ hour: 9, minute: 0, repeats: true } as const);
  const daily19 =
    Platform.OS === 'android'
      ? ({ hour: 19, minute: 0, repeats: true, channelId: 'preppal' } as const)
      : ({ hour: 19, minute: 0, repeats: true } as const);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'PrepPAL',
      body: 'Log a meal to stay on track with your goals.',
    },
    trigger: daily9,
  });

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'PrepPAL',
      body: 'You may be under your calorie goal today. Plan a balanced dinner.',
    },
    trigger: daily19,
  });
}
