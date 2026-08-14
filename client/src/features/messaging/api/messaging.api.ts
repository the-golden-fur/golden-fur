import type {
  CreateAnnouncementParams,
  CreateMailThreadParams,
  DirectoryEntry,
  Message,
  MessageDraft,
  MessageThread,
  PendingAttachment,
  SaveDraftParams,
  ThreadDetail,
  ThreadSummary,
} from '../messaging.types';

interface MessagingApiResult<T> {
  data: T | null;
  error: string | null;
}

// messaging.routes.ts (server) is mounted at the server root, same as
// notifications.routes.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Request failed. Please try again.';
}

async function parseBody<T>(
  response: Response
): Promise<MessagingApiResult<T>> {
  const body = (await response.json().catch(() => null)) as T | null;

  if (body === null) {
    return { data: null, error: 'Request failed. Please try again.' };
  }

  return { data: body, error: null };
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function jsonAuthHeaders(accessToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function listThreads(
  accessToken: string
): Promise<MessagingApiResult<ThreadSummary[]>> {
  const response = await fetch(`${API_BASE_URL}/messages/threads`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ threads: ThreadSummary[] }>(response);
  return { data: result.data?.threads ?? null, error: result.error };
}

export async function getThreadDetail(
  threadId: string,
  accessToken: string
): Promise<MessagingApiResult<ThreadDetail>> {
  const response = await fetch(`${API_BASE_URL}/messages/threads/${threadId}`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ thread: ThreadDetail }>(response);
  return { data: result.data?.thread ?? null, error: result.error };
}

export async function replyToThread(
  threadId: string,
  body: string,
  accessToken: string,
  attachments?: PendingAttachment[]
): Promise<MessagingApiResult<Message>> {
  const response = await fetch(
    `${API_BASE_URL}/messages/threads/${threadId}/messages`,
    {
      method: 'POST',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({ body, attachments }),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ message: Message }>(response);
  return { data: result.data?.message ?? null, error: result.error };
}

export async function uploadAttachment(
  file: File,
  accessToken: string
): Promise<MessagingApiResult<PendingAttachment>> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/messages/attachments`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: formData,
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ attachment: PendingAttachment }>(response);
  return { data: result.data?.attachment ?? null, error: result.error };
}

export async function markThreadRead(
  threadId: string,
  accessToken: string,
  read = true
): Promise<MessagingApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/messages/threads/${threadId}/read`,
    {
      method: 'PATCH',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({ read }),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function starThread(
  threadId: string,
  starred: boolean,
  accessToken: string
): Promise<MessagingApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/messages/threads/${threadId}/star`,
    {
      method: 'PATCH',
      headers: jsonAuthHeaders(accessToken),
      body: JSON.stringify({ starred }),
    }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function deleteThread(
  threadId: string,
  accessToken: string
): Promise<MessagingApiResult<null>> {
  const response = await fetch(
    `${API_BASE_URL}/messages/threads/${threadId}/delete`,
    { method: 'POST', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function createAnnouncement(
  params: CreateAnnouncementParams,
  accessToken: string
): Promise<MessagingApiResult<MessageThread>> {
  const response = await fetch(`${API_BASE_URL}/messages/announcements`, {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ thread: MessageThread }>(response);
  return { data: result.data?.thread ?? null, error: result.error };
}

export async function createMailThread(
  params: CreateMailThreadParams,
  accessToken: string
): Promise<MessagingApiResult<MessageThread>> {
  const response = await fetch(`${API_BASE_URL}/messages/mail`, {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ thread: MessageThread }>(response);
  return { data: result.data?.thread ?? null, error: result.error };
}

export async function searchDirectory(
  query: string,
  accessToken: string
): Promise<MessagingApiResult<DirectoryEntry[]>> {
  const response = await fetch(
    `${API_BASE_URL}/messages/directory?q=${encodeURIComponent(query)}`,
    { headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ entries: DirectoryEntry[] }>(response);
  return { data: result.data?.entries ?? null, error: result.error };
}

export async function listDrafts(
  accessToken: string
): Promise<MessagingApiResult<MessageDraft[]>> {
  const response = await fetch(`${API_BASE_URL}/messages/drafts`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ drafts: MessageDraft[] }>(response);
  return { data: result.data?.drafts ?? null, error: result.error };
}

export async function createDraft(
  params: SaveDraftParams,
  accessToken: string
): Promise<MessagingApiResult<MessageDraft>> {
  const response = await fetch(`${API_BASE_URL}/messages/drafts`, {
    method: 'POST',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ draft: MessageDraft }>(response);
  return { data: result.data?.draft ?? null, error: result.error };
}

export async function updateDraft(
  draftId: string,
  params: Partial<Omit<SaveDraftParams, 'messageType'>>,
  accessToken: string
): Promise<MessagingApiResult<MessageDraft>> {
  const response = await fetch(`${API_BASE_URL}/messages/drafts/${draftId}`, {
    method: 'PATCH',
    headers: jsonAuthHeaders(accessToken),
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ draft: MessageDraft }>(response);
  return { data: result.data?.draft ?? null, error: result.error };
}

export async function deleteDraft(
  draftId: string,
  accessToken: string
): Promise<MessagingApiResult<null>> {
  const response = await fetch(`${API_BASE_URL}/messages/drafts/${draftId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  return { data: null, error: null };
}

export async function sendDraft(
  draftId: string,
  accessToken: string
): Promise<MessagingApiResult<MessageThread>> {
  const response = await fetch(
    `${API_BASE_URL}/messages/drafts/${draftId}/send`,
    { method: 'POST', headers: authHeaders(accessToken) }
  );

  if (!response.ok) {
    return { data: null, error: await parseError(response) };
  }

  const result = await parseBody<{ thread: MessageThread }>(response);
  return { data: result.data?.thread ?? null, error: result.error };
}
