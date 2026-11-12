const BASE = '/api/v1'

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {}
  const token = localStorage.getItem('token')
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

function clearSessionAndRedirect() {
  localStorage.removeItem('token')
  localStorage.removeItem('refresh_token')
  window.location.href = '/login'
}

// De-duplicate concurrent refreshes: if many requests 401 at once, they all
// await the same single refresh call instead of hammering /auth/refresh.
let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return false

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!res.ok) return false
        const data = await res.json()
        if (data.access_token) localStorage.setItem('token', data.access_token)
        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token)
        return !!data.access_token
      } catch {
        return false
      }
    })()
    refreshPromise.finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

/**
 * Authenticated fetch with transparent token refresh. On a 401 it attempts a
 * single silent refresh using the stored refresh token, then retries the
 * original request once. If refresh fails, the session is cleared and the user
 * is redirected to /login.
 */
async function authorizedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const run = () => fetch(input, { ...init, headers: { ...getHeaders(), ...(init.headers || {}) } })

  let res = await run()
  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      res = await run()
    }
    if (res.status === 401) {
      clearSessionAndRedirect()
    }
  }
  return res
}

export interface Tag {
  id: string
  name: string
  color: string | null
}

export interface Document {
  id: string
  title: string
  brand: string | null
  model: string | null
  document_type: string | null
  category_id: string | null
  raw_text: string | null
  bill_review?: BillReview | null
  confirmed_bill?: BillRevision | null
  bill_split?: BillSplit | null
  summary: string | null
  file_size: number | null
  image_url: string | null
  processing_status?: string
  is_favourite?: boolean
  tags?: Tag[]
  created_at: string
}

export interface BillField {
  value: string | null
  sources: { line: number; text: string }[]
}

export interface BillReview {
  amount_due: BillField
  due_date: BillField
  billing_period: BillField
}

export interface BillRevision {
  id: string
  document_id: string
  revision_number: number
  amount_due: string
  due_date: string
  billing_period_start: string
  billing_period_end: string
  evidence: BillReview
  created_at: string
}

export interface BillConfirmation {
  amount_due: string
  due_date: string
  billing_period_start: string
  billing_period_end: string
  reviewed: BillReview
  base_revision: number
}

export interface BillShare {
  housemate_id: string
  label: string
  amount: string
}

export interface BillSplitRequest {
  bill_revision: number
  rule: 'equal'
  housemate_ids: string[]
}

export interface BillSplitSave extends BillSplitRequest {
  base_split: number
  reviewed: BillShare[]
}

export interface BillSplitPreview {
  bill_revision: number
  rule: string
  total: string
  remainder_cents: number
  shares: BillShare[]
}

export interface BillSplit extends BillSplitPreview {
  id: string
  document_id: string
  split_number: number
  stale: boolean
  created_at: string
}

/** An API failure carrying the HTTP status and, when the server gives one, a reason code. */
export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export interface SearchResult {
  chunk_text: string
  document_id: string
  document_title: string
  similarity: number
}

export interface AskResponse {
  answer: string
  sources: { document_id: string; document_title: string; chunk_text: string; similarity: number }[]
}

export async function registerUser(email: string, password: string, displayName?: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text ? detailMessage(safeJson(text)?.detail, 'Registration failed') : 'Server unavailable')
  }
  return res.json()
}

function safeJson(text: string): { detail?: unknown } | undefined {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Turn a FastAPI `detail` into text for the user. String details pass through;
 * a 422 validation list shows its first item's `msg`, else a plain fallback.
 */
export function detailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail)) {
    const msg = (detail[0] as { msg?: unknown } | undefined)?.msg
    return typeof msg === 'string' && msg ? msg : 'Check your email address and password.'
  }
  return fallback
}

// The verification token is single use, so each token is redeemed once per page
// load. React StrictMode runs effects twice in development; both runs share
// this promise instead of sending a second request that the server would reject.
const verifications = new Map<string, Promise<{ ok: boolean; message: string }>>()

/** Redeem an email verification token. Public call: no session is needed. */
export function verifyEmail(token: string): Promise<{ ok: boolean; message: string }> {
  let pending = verifications.get(token)
  if (!pending) {
    pending = (async () => {
      const res = await fetch(`${BASE}/auth/verify?token=${encodeURIComponent(token)}`)
      let data: { message?: unknown; detail?: unknown } = {}
      try {
        data = await res.json()
      } catch {
        // fall through to the generic messages below
      }
      if (res.ok) {
        return { ok: true, message: typeof data.message === 'string' ? data.message : 'Email verified' }
      }
      return { ok: false, message: detailMessage(data.detail, 'Verification failed') }
    })()
    verifications.set(token, pending)
    // A network failure is not a verdict on the token, so let a retry run.
    pending.catch(() => verifications.delete(token))
  }
  return pending
}

export async function loginUser(email: string, password: string, rememberMe = false): Promise<{ access_token?: string; refresh_token?: string; requires_2fa?: boolean }> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember_me: rememberMe }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text ? (JSON.parse(text).detail || 'Login failed') : 'Server unavailable')
  }
  return res.json()
}

export async function verify2FA(email: string, password: string, code: string, rememberMe = false): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(`${BASE}/auth/login/2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, code, remember_me: rememberMe }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text ? (JSON.parse(text).detail || 'Invalid code') : 'Server unavailable')
  }
  return res.json()
}

export interface UserProfile {
  email: string
  display_name: string | null
  created_at: string
}

export async function getProfile(): Promise<UserProfile> {
  const res = await authorizedFetch(`${BASE}/auth/me`)
  if (!res.ok) throw new Error('Failed to load profile')
  return res.json()
}

export async function updateProfile(displayName: string): Promise<{ email: string; display_name: string | null }> {
  const res = await authorizedFetch(`${BASE}/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: displayName }),
  })
  if (!res.ok) throw new Error('Failed to update profile')
  return res.json()
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text ? (JSON.parse(text).detail || 'Request failed') : 'Server unavailable')
  }
  return res.json()
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text ? (JSON.parse(text).detail || 'Reset failed') : 'Server unavailable')
  }
  return res.json()
}

export async function uploadDocument(file: File, title?: string): Promise<Document> {
  const form = new FormData()
  form.append('file', file)
  if (title) form.append('title', title)
  const res = await authorizedFetch(`${BASE}/documents`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getDocuments(categoryId?: string): Promise<{ documents: Document[]; total: number }> {
  // Request a high limit so the full collection loads — the Dashboard does its
  // own client-side folders / sort / filter / analytics over the whole set.
  // (The backend still supports skip/limit for future server-side pagination.)
  const params = new URLSearchParams({ limit: '1000' })
  if (categoryId) params.set('category_id', categoryId)
  const res = await authorizedFetch(`${BASE}/documents?${params.toString()}`)
  return res.json()
}

export async function exportDocuments(format: 'json' | 'csv'): Promise<void> {
  const res = await authorizedFetch(`${BASE}/documents/export?format=${format}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `docvault-export.${format}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function getDocument(id: string): Promise<Document> {
  const res = await authorizedFetch(`${BASE}/documents/${id}`)
  return res.json()
}

/** Build an ApiError from a failed response, reading the reason code from a `{code, message}` detail. */
async function apiErrorFrom(res: Response, fallback: string): Promise<ApiError> {
  let detail: unknown
  try {
    detail = (await res.json())?.detail
  } catch {
    detail = undefined
  }
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const { message, code } = detail as { message?: unknown; code?: unknown }
    return new ApiError(
      res.status,
      typeof message === 'string' ? message : fallback,
      typeof code === 'string' ? code : undefined,
    )
  }
  return new ApiError(res.status, typeof detail === 'string' ? detail : fallback)
}

export async function confirmBill(documentId: string, body: BillConfirmation): Promise<BillRevision> {
  const res = await authorizedFetch(`${BASE}/documents/${documentId}/bill-revisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await apiErrorFrom(res, 'Could not save the bill')
  return res.json()
}

export interface Housemate {
  id: string
  label: string
  position: number
  created_at: string
}

export async function getHousemates(): Promise<Housemate[]> {
  const res = await authorizedFetch(`${BASE}/housemates`)
  if (!res.ok) throw await apiErrorFrom(res, 'Could not load your housemates')
  return res.json()
}

export async function addHousemate(label: string): Promise<Housemate> {
  const res = await authorizedFetch(`${BASE}/housemates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  })
  if (!res.ok) throw await apiErrorFrom(res, 'Could not add that name')
  return res.json()
}

export async function removeHousemate(id: string): Promise<void> {
  const res = await authorizedFetch(`${BASE}/housemates/${id}`, { method: 'DELETE' })
  if (!res.ok) throw await apiErrorFrom(res, 'Could not remove that name')
}

export async function previewBillSplit(documentId: string, body: BillSplitRequest): Promise<BillSplitPreview> {
  const res = await authorizedFetch(`${BASE}/documents/${documentId}/bill-splits/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await apiErrorFrom(res, 'Could not calculate the shares')
  return res.json()
}

export async function saveBillSplit(documentId: string, body: BillSplitSave): Promise<BillSplit> {
  const res = await authorizedFetch(`${BASE}/documents/${documentId}/bill-splits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await apiErrorFrom(res, 'Could not save the split')
  return res.json()
}

export async function deleteDocument(id: string): Promise<void> {
  await authorizedFetch(`${BASE}/documents/${id}`, { method: 'DELETE' })
}

export async function bulkDeleteDocuments(documentIds: string[]): Promise<void> {
  await authorizedFetch(`${BASE}/documents/bulk/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document_ids: documentIds }) })
}

export async function toggleFavourite(id: string): Promise<{ is_favourite: boolean }> {
  const res = await authorizedFetch(`${BASE}/documents/${id}/favourite`, { method: 'POST' })
  return res.json()
}

export async function shareDocument(id: string, expiresHours = 24): Promise<{ share_url: string; expires_in_hours: number }> {
  const res = await authorizedFetch(`${BASE}/documents/${id}/share?expires_hours=${expiresHours}`)
  return res.json()
}

export interface SimilarDocument {
  id: string
  title: string
  brand: string | null
  document_type: string | null
  similarity: number
}

export async function findSimilarDocuments(id: string): Promise<{ similar: SimilarDocument[] }> {
  const res = await authorizedFetch(`${BASE}/documents/${id}/similar`)
  return res.json()
}

export async function searchDocuments(q: string): Promise<{ results: SearchResult[] }> {
  const res = await authorizedFetch(`${BASE}/search?q=${encodeURIComponent(q)}`)
  return res.json()
}

export async function askQuestion(question: string, documentId?: string, history?: { role: string; content: string }[]): Promise<AskResponse> {
  const res = await authorizedFetch(`${BASE}/ai/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, document_id: documentId, history: history || [] }) })
  return res.json()
}

export async function getCategories(): Promise<{ id: string; name: string }[]> {
  const res = await authorizedFetch(`${BASE}/categories`)
  return res.json()
}

export async function createCategory(name: string): Promise<{ id: string; name: string }> {
  const res = await authorizedFetch(`${BASE}/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
  return res.json()
}

export async function renameCategory(id: string, name: string): Promise<{ id: string; name: string }> {
  const res = await authorizedFetch(`${BASE}/categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
  return res.json()
}

export async function deleteCategory(id: string): Promise<void> {
  await authorizedFetch(`${BASE}/categories/${id}`, { method: 'DELETE' })
}

export async function moveToCategory(documentId: string, categoryId: string | null): Promise<void> {
  await authorizedFetch(`${BASE}/documents/${documentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category_id: categoryId }) })
}

// === 2FA ===
export async function setup2FA(): Promise<{ secret: string; qr_code: string; uri: string }> {
  const res = await authorizedFetch(`${BASE}/auth/2fa/setup`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to set up 2FA')
  return res.json()
}

export async function disable2FA(): Promise<void> {
  await authorizedFetch(`${BASE}/auth/2fa/disable`, { method: 'POST' })
}

// === Warranties ===
export interface Warranty {
  id: string
  document_id: string
  document_title: string
  purchase_date: string | null
  expiry_date: string | null
  notes: string | null
}

export async function getWarranties(): Promise<Warranty[]> {
  const res = await authorizedFetch(`${BASE}/warranties`)
  return res.json()
}

export async function getExpiringWarranties(days = 30): Promise<{ warranty_id: string; document_title: string; expiry_date: string; days_remaining: number }[]> {
  const res = await authorizedFetch(`${BASE}/warranties/expiring?days=${days}`)
  return res.json()
}

// === Account ===
export async function deleteAccount(): Promise<void> {
  await authorizedFetch(`${BASE}/auth/account`, { method: 'DELETE' })
}

// === Tags ===
export async function getTags(): Promise<Tag[]> {
  const res = await authorizedFetch(`${BASE}/tags`)
  return res.json()
}

export async function createTag(name: string, color?: string): Promise<Tag> {
  const res = await authorizedFetch(`${BASE}/tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color }) })
  return res.json()
}

export async function deleteTag(tagId: string): Promise<void> {
  await authorizedFetch(`${BASE}/tags/${tagId}`, { method: 'DELETE' })
}

export async function addTagToDocument(documentId: string, tagId: string): Promise<void> {
  await authorizedFetch(`${BASE}/tags/documents/${documentId}/tags/${tagId}`, { method: 'PUT' })
}

export async function removeTagFromDocument(documentId: string, tagId: string): Promise<void> {
  await authorizedFetch(`${BASE}/tags/documents/${documentId}/tags/${tagId}`, { method: 'DELETE' })
}

// === Version history ===
export interface DocumentVersion {
  id: string
  version_number: number
  created_at: string | null
  preview: string
  char_count: number
}

export async function updateDocumentText(documentId: string, rawText: string): Promise<Document> {
  const res = await authorizedFetch(`${BASE}/documents/${documentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_text: rawText }) })
  return res.json()
}

export async function renameDocument(documentId: string, title: string): Promise<Document> {
  const res = await authorizedFetch(`${BASE}/documents/${documentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
  return res.json()
}

export async function getDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  const res = await authorizedFetch(`${BASE}/documents/${documentId}/versions`)
  return res.json()
}

export async function restoreDocumentVersion(documentId: string, versionId: string): Promise<Document> {
  const res = await authorizedFetch(`${BASE}/documents/${documentId}/versions/${versionId}/restore`, { method: 'POST' })
  return res.json()
}

// === Conversations ===
export interface Conversation {
  id: string
  title: string
  is_pinned: boolean
  created_at: string
  updated_at: string
  message_count?: number
}

export interface ConversationMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  sources: AskResponse['sources'] | null
  created_at: string
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[]
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await authorizedFetch(`${BASE}/conversations`)
  return res.json()
}

export async function createConversation(title?: string): Promise<Conversation> {
  const res = await authorizedFetch(`${BASE}/conversations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
  return res.json()
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const res = await authorizedFetch(`${BASE}/conversations/${id}`)
  return res.json()
}

export async function deleteConversation(id: string): Promise<void> {
  await authorizedFetch(`${BASE}/conversations/${id}`, { method: 'DELETE' })
}

export async function renameConversation(id: string, title: string): Promise<Conversation> {
  const res = await authorizedFetch(`${BASE}/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
  return res.json()
}

export async function togglePinConversation(id: string, is_pinned: boolean): Promise<Conversation> {
  const res = await authorizedFetch(`${BASE}/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_pinned }) })
  return res.json()
}

export async function sendMessage(conversationId: string, question: string, documentId?: string): Promise<{ user_message: ConversationMessage; assistant_message: ConversationMessage }> {
  const res = await authorizedFetch(`${BASE}/conversations/${conversationId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, document_id: documentId || null }) })
  return res.json()
}
