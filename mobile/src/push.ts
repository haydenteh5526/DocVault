import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { registerPushToken } from './api';

/**
 * Request notification permission, obtain the Expo push token, and register it
 * with the backend. No-ops gracefully on simulators or when permission denied.
 *
 * NOTE: A real Expo push token requires a development or EAS build on a physical
 * device — it will not resolve in Expo Go on a simulator. The backend + delivery
 * pipeline are fully wired; only on-device token retrieval needs a build.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    await registerPushToken(tokenData.data, Platform.OS);
  } catch (e) {
    // Non-fatal — the app works without push
    console.warn('Push registration skipped:', e);
  }
}
