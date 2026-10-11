import * as SecureStore from 'expo-secure-store';

import { API_URL } from './config';

const ACCESS_TOKEN_KEY = 'docvault.access_token';
const REFRESH_TOKEN_KEY = 'docvault.refresh_token';

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  requires_2fa?: boolean;
};

export type LoginResult =
  | { requires2FA: true }
  | { requires2FA: false; accessToken: string };

export type RegistrationResult = {
  message: string;
  requiresVerification: boolean;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function responseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: any, fallback: string): string {
  if (typeof body === 'string' && body.trim()) return body;
  if (typeof body?.detail === 'string') return body.detail;
  if (typeof body?.message === 'string') return body.message;
  return fallback;
}

async function requireResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = await responseBody(response);
  if (!response.ok) throw new ApiError(errorMessage(body, fallback), response.status);
  return body as T;
}

async function persistSession(data: TokenResponse): Promise<string> {
  if (!data.access_token) throw new ApiError('The server did not return an access token.', 500);
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.access_token);
  if (data.refresh_token) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refresh_token);
  }
  return data.access_token;
}

export async function restoreSession(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember_me: true }),
  });
  const data = await requireResponse<TokenResponse>(response, 'Unable to sign in.');
  if (data.requires_2fa) return { requires2FA: true };
  return { requires2FA: false, accessToken: await persistSession(data) };
}

export async function verify2FA(email: string, password: string, code: string): Promise<string> {
  const response = await fetch(`${API_URL}/api/v1/auth/login/2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, code, remember_me: true }),
  });
  const data = await requireResponse<TokenResponse>(response, 'Unable to verify that code.');
  return persistSession(data);
}

export async function register(email: string, password: string): Promise<RegistrationResult> {
  const response = await fetch(`${API_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await requireResponse<{ message: string; requires_verification?: boolean }>(
    response,
    'Unable to create the account.',
  );
  return {
    message: data.message,
    requiresVerification: data.requires_verification !== false,
  };
}

let refreshPromise: Promise<string> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

async function refreshSession(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) throw new ApiError('Your session has expired. Please sign in again.', 401);
    const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data = await requireResponse<TokenResponse>(response, 'Your session has expired. Please sign in again.');
    return persistSession(data);
  })();

  try {
    return await refreshPromise;
  } catch (error) {
    await clearSession();
    sessionExpiredHandler?.();
    throw error;
  } finally {
    refreshPromise = null;
  }
}

async function apiFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401 && retry) {
    const refreshedToken = await refreshSession();
    headers.set('Authorization', `Bearer ${refreshedToken}`);
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  }
  return response;
}

export async function uploadDocument(uri: string, filename: string): Promise<any> {
  const form = new FormData();
  form.append('file', { uri, name: filename, type: 'image/jpeg' } as any);
  const response = await apiFetch('/api/v1/documents', { method: 'POST', body: form });
  return requireResponse(response, 'Document upload failed.');
}

export async function getDocuments(): Promise<any> {
  const response = await apiFetch('/api/v1/documents');
  return requireResponse(response, 'Unable to load documents.');
}

export async function getDocument(id: string): Promise<any> {
  const response = await apiFetch(`/api/v1/documents/${id}`);
  return requireResponse(response, 'Unable to load this document.');
}

export async function searchDocuments(query: string): Promise<any> {
  const response = await apiFetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
  return requireResponse(response, 'Search failed.');
}

export async function askQuestion(question: string, documentId?: string): Promise<any> {
  const response = await apiFetch('/api/v1/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, document_id: documentId || null }),
  });
  return requireResponse(response, 'Unable to answer that question.');
}

export async function listConversations(): Promise<any[]> {
  const response = await apiFetch('/api/v1/conversations');
  return requireResponse(response, 'Unable to load conversations.');
}

export async function createConversation(title?: string): Promise<any> {
  const response = await apiFetch('/api/v1/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return requireResponse(response, 'Unable to start a conversation.');
}

export async function getConversation(id: string): Promise<any> {
  const response = await apiFetch(`/api/v1/conversations/${id}`);
  return requireResponse(response, 'Unable to load this conversation.');
}

export async function sendMessage(conversationId: string, question: string, documentId?: string): Promise<any> {
  const response = await apiFetch(`/api/v1/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, document_id: documentId || null }),
  });
  return requireResponse(response, 'Unable to send the message.');
}

export async function registerPushToken(token: string, platform: string): Promise<void> {
  const response = await apiFetch('/api/v1/notifications/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform }),
  });
  await requireResponse(response, 'Unable to register this device for notifications.');
}
