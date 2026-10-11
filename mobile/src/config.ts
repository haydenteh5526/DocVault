import { Platform } from 'react-native';

// In development, Android emulator uses 10.0.2.2 to reach host localhost.
// iOS simulator can use localhost directly.
// For real devices on the same network, replace with your machine's IP.
const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const CONFIGURED_API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

export const API_URL = CONFIGURED_API_URL || (__DEV__
  ? `http://${DEV_HOST}:8000`
  : 'https://api.docvault.invalid');
