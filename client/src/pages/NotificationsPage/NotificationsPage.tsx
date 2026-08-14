import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Inbox, Send, FileText, Star, Bell as SystemIcon } from 'lucide-react';
import { useAuth } from '../../shared/auth/providers/AuthProvider/useAuth';
import type { ThemeRole } from '../../shared/providers/ThemeProvider/themeContext';
import {
  deleteNotification,
  listNotifications,
  markNotificationRead,
  starNotification,
} from '../../features/notifications/api/notifications.api';
import type { Notification } from '../../features/notifications/notifications.types';
import {
  deleteDraft,
  deleteThread,
  getThreadDetail,
  listDrafts,
  listThreads,
  markThreadRead,
  replyToThread,
  sendDraft,
  starThread,
} from '../../features/messaging/api/messaging.api';
import type {
  MessageDraft,
  MessageThreadType,
  PendingAttachment,
  ThreadDetail as ThreadDetailType,
  ThreadSummary,
} from '../../features/messaging/messaging.types';
import { ThreadDetail } from '../../features/messaging/components/ThreadDetail/ThreadDetail';
import styles from './NotificationsPage.module.css';

interface NotificationsPageProps {
  role: ThemeRole;
}

type FolderKey = 'inbox' | 'starred' | 'sent' | 'drafts' | 'system';
type FilterKey = 'all' | 'unread' | 'mail' | 'announcement';
type SortKey = 'newest' | 'oldest' | 'unread';

interface InboxItem {
  id: string;
  kind: 'system' | MessageThreadType;
  subject: string;
  preview: string;
  senderLabel: string;
  timestamp: string;
  isRead: boolean;
  isStarred: boolean;
  isOwn: boolean;
}

const FOLDERS: { key: FolderKey; label: string; icon: typeof Inbox }[] = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'starred', label: 'Starred', icon: Star },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'drafts', label: 'Drafts', icon: FileText },
  { key: 'system', label: 'System', icon: SystemIcon },
];

function notificationToItem(notification: Notification): InboxItem {
  return {
    id: notification.id,
    kind: 'system',
    subject: notification.title,
    preview: notification.message,
    senderLabel: 'System',
    timestamp: notification.created_at,
    isRead: notification.is_read,
    isStarred: notification.is_starred,
    isOwn: false,
  };
}

function threadToItem(thread: ThreadSummary): InboxItem {
  return {
    id: thread.id,
    kind: thread.thread_type,
    subject: thread.subject,
    preview: thread.lastMessagePreview,
    senderLabel: thread.lastSenderLabel,
    timestamp: thread.lastMessageAt,
    isRead: !thread.unread,
    isStarred: thread.isStarred,
    isOwn: thread.isOwn,
  };
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * The routed notifications page both /staff/notifications and
 * /portal/notifications render, reached via the navbar bell's "View all"
 * link. Gmail-style folder rail (Inbox/Starred/Sent/Drafts/System) replaces
 * the old Inbox-tab/Messages-tab split - a presentation-layer merge, not a
 * data-model one: system notifications (8 event types) and message threads
 * (Mail/Announcement) stay two separate tables/APIs under the hood,
 * normalized into one InboxItem shape here for a single unified list.
 * 'message_received' notification rows are deliberately excluded from every
 * normalized view - the thread itself is the canonical, richer
 * representation of that same event, so surfacing both would double-list
 * one conceptual item.
 */
export function NotificationsPage({ role: _role }: NotificationsPageProps) {
  const { user, accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [drafts, setDrafts] = useState<MessageDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('newest');

  const [threadDetail, setThreadDetail] = useState<ThreadDetailType | null>(
    null
  );
  const [threadDetailLoading, setThreadDetailLoading] = useState(false);
  const [threadDetailError, setThreadDetailError] = useState<string | null>(
    null
  );
  const [isSendingReply, setIsSendingReply] = useState(false);

  const folder: FolderKey =
    (searchParams.get('folder') as FolderKey | null) ?? 'inbox';
  const selectedThreadId = searchParams.get('thread');

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;
    setIsLoading(true);

    void Promise.all([
      listNotifications(accessToken),
      listThreads(accessToken),
      listDrafts(accessToken),
    ]).then(([notificationsResult, threadsResult, draftsResult]) => {
      if (!isMounted) return;

      setIsLoading(false);

      const firstError =
        notificationsResult.error ?? threadsResult.error ?? draftsResult.error;
      if (firstError) {
        setLoadError(firstError);
      }

      setNotifications(notificationsResult.data ?? []);
      setThreads(threadsResult.data ?? []);
      setDrafts(draftsResult.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedThreadId) {
      setThreadDetail(null);
      return;
    }

    let isMounted = true;
    setThreadDetailLoading(true);
    setThreadDetailError(null);

    void getThreadDetail(selectedThreadId, accessToken).then((result) => {
      if (!isMounted) return;
      setThreadDetailLoading(false);

      if (result.error || !result.data) {
        setThreadDetailError(result.error ?? 'Failed to load thread.');
        return;
      }

      setThreadDetail(result.data);
      void markThreadRead(selectedThreadId, accessToken);
      setThreads((current) =>
        current.map((thread) =>
          thread.id === selectedThreadId ? { ...thread, unread: false } : thread
        )
      );
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, selectedThreadId]);

  const systemItems = useMemo(
    () =>
      notifications
        .filter(
          (notification) => notification.event_type !== 'message_received'
        )
        .map(notificationToItem),
    [notifications]
  );
  const threadItems = useMemo(() => threads.map(threadToItem), [threads]);
  const allItems = useMemo(
    () => [...systemItems, ...threadItems],
    [systemItems, threadItems]
  );

  const folderItems = useMemo(() => {
    switch (folder) {
      case 'inbox':
        return allItems.filter((item) => !item.isOwn);
      case 'sent':
        return threadItems.filter((item) => item.isOwn);
      case 'starred':
        return allItems.filter((item) => item.isStarred);
      case 'system':
        return systemItems;
      case 'drafts':
        return [];
    }
  }, [folder, allItems, threadItems, systemItems]);

  const visibleItems = useMemo(() => {
    let items = folderItems;

    if (searchQuery.trim()) {
      const needle = searchQuery.trim().toLowerCase();
      items = items.filter(
        (item) =>
          item.subject.toLowerCase().includes(needle) ||
          item.preview.toLowerCase().includes(needle) ||
          item.senderLabel.toLowerCase().includes(needle)
      );
    }

    if (filterKey === 'unread') {
      items = items.filter((item) => !item.isRead);
    } else if (filterKey === 'mail' || filterKey === 'announcement') {
      items = items.filter((item) => item.kind === filterKey);
    }

    const sorted = [...items];
    if (sortKey === 'newest') {
      sorted.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    } else if (sortKey === 'oldest') {
      sorted.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
    } else {
      sorted.sort((a, b) => {
        if (a.isRead === b.isRead) return a.timestamp < b.timestamp ? 1 : -1;
        return a.isRead ? 1 : -1;
      });
    }

    return sorted;
  }, [folderItems, searchQuery, filterKey, sortKey]);

  const inboxUnreadCount = allItems.filter(
    (item) => !item.isOwn && !item.isRead
  ).length;
  const systemUnreadCount = systemItems.filter((item) => !item.isRead).length;
  const folderCounts: Record<FolderKey, number> = {
    inbox: inboxUnreadCount,
    starred: allItems.filter((item) => item.isStarred).length,
    sent: threadItems.filter((item) => item.isOwn).length,
    drafts: drafts.length,
    system: systemUnreadCount,
  };

  function setFolder(next: FolderKey) {
    const params = new URLSearchParams(searchParams);
    if (next === 'inbox') {
      params.delete('folder');
    } else {
      params.set('folder', next);
    }
    params.delete('thread');
    setSearchParams(params);
    setSearchQuery('');
    setFilterKey('all');
    setSortKey('newest');
  }

  function openThread(threadId: string) {
    const params = new URLSearchParams(searchParams);
    params.set('thread', threadId);
    setSearchParams(params);
  }

  async function handleSelectItem(item: InboxItem) {
    if (!accessToken) return;

    if (item.kind === 'system') {
      if (!item.isRead) {
        setNotifications((current) =>
          current.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
        );
        await markNotificationRead(item.id, accessToken, true);
      }
      return;
    }

    openThread(item.id);
  }

  async function handleToggleRead(item: InboxItem, event: MouseEvent) {
    event.stopPropagation();
    if (!accessToken) return;

    const nextRead = !item.isRead;

    if (item.kind === 'system') {
      setNotifications((current) =>
        current.map((n) => (n.id === item.id ? { ...n, is_read: nextRead } : n))
      );
      await markNotificationRead(item.id, accessToken, nextRead);
    } else {
      setThreads((current) =>
        current.map((t) => (t.id === item.id ? { ...t, unread: !nextRead } : t))
      );
      await markThreadRead(item.id, accessToken, nextRead);
    }
  }

  async function handleToggleStar(item: InboxItem, event: MouseEvent) {
    event.stopPropagation();
    if (!accessToken) return;

    const nextStarred = !item.isStarred;

    if (item.kind === 'system') {
      setNotifications((current) =>
        current.map((n) =>
          n.id === item.id ? { ...n, is_starred: nextStarred } : n
        )
      );
      await starNotification(item.id, nextStarred, accessToken);
    } else {
      setThreads((current) =>
        current.map((t) =>
          t.id === item.id ? { ...t, isStarred: nextStarred } : t
        )
      );
      await starThread(item.id, nextStarred, accessToken);
    }
  }

  async function handleDeleteItem(item: InboxItem, event: MouseEvent) {
    event.stopPropagation();
    if (!accessToken) return;

    if (item.kind === 'system') {
      setNotifications((current) => current.filter((n) => n.id !== item.id));
      await deleteNotification(item.id, accessToken);
    } else {
      setThreads((current) => current.filter((t) => t.id !== item.id));
      await deleteThread(item.id, accessToken);
    }
  }

  async function handleMarkAllRead() {
    if (!accessToken) return;

    const unreadInFolder = folderItems.filter((item) => !item.isRead);

    setNotifications((current) =>
      current.map((n) =>
        unreadInFolder.some(
          (item) => item.kind === 'system' && item.id === n.id
        )
          ? { ...n, is_read: true }
          : n
      )
    );
    setThreads((current) =>
      current.map((t) =>
        unreadInFolder.some(
          (item) => item.kind !== 'system' && item.id === t.id
        )
          ? { ...t, unread: false }
          : t
      )
    );

    await Promise.all(
      unreadInFolder.map((item) =>
        item.kind === 'system'
          ? markNotificationRead(item.id, accessToken, true)
          : markThreadRead(item.id, accessToken, true)
      )
    );
  }

  async function handleReply(body: string, attachments?: PendingAttachment[]) {
    if (!accessToken || !selectedThreadId) return;

    setIsSendingReply(true);
    const result = await replyToThread(
      selectedThreadId,
      body,
      accessToken,
      attachments
    );
    setIsSendingReply(false);

    const newMessage = result.data;
    if (newMessage) {
      setThreadDetail((current) =>
        current
          ? { ...current, messages: [...current.messages, newMessage] }
          : current
      );
      setThreads((current) =>
        current.map((thread) =>
          thread.id === selectedThreadId
            ? {
                ...thread,
                lastMessageAt: newMessage.created_at,
                lastMessagePreview: newMessage.body,
              }
            : thread
        )
      );
    }
  }

  async function handleSendDraft(draftId: string) {
    if (!accessToken) return;

    const result = await sendDraft(draftId, accessToken);
    if (result.data) {
      setDrafts((current) => current.filter((draft) => draft.id !== draftId));
      const listResult = await listThreads(accessToken);
      if (listResult.data) setThreads(listResult.data);
    }
  }

  async function handleDeleteDraft(draftId: string) {
    if (!accessToken) return;

    setDrafts((current) => current.filter((draft) => draft.id !== draftId));
    await deleteDraft(draftId, accessToken);
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load notifications.
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Notifications</h1>

      {loadError ? (
        <p className={styles.errorBanner} role="alert">
          {loadError}
        </p>
      ) : null}

      <div className={styles.layout}>
        <nav className={styles.folderRail} aria-label="Mailbox folders">
          {FOLDERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={
                folder === key ? styles.folderButtonActive : styles.folderButton
              }
              onClick={() => setFolder(key)}
            >
              <Icon size={16} aria-hidden="true" />
              <span className={styles.folderLabel}>{label}</span>
              {folderCounts[key] > 0 ? (
                <span className={styles.folderCount}>{folderCounts[key]}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className={styles.content}>
          {folder !== 'drafts' ? (
            <div className={styles.controls}>
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <select
                className={styles.select}
                value={filterKey}
                onChange={(event) =>
                  setFilterKey(event.target.value as FilterKey)
                }
              >
                <option value="all">All</option>
                <option value="unread">Unread</option>
                <option value="mail">Mail</option>
                <option value="announcement">Announcements</option>
              </select>
              <select
                className={styles.select}
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="unread">Unread first</option>
              </select>
              <button
                type="button"
                className={styles.markAllButton}
                onClick={() => void handleMarkAllRead()}
                disabled={folderItems.every((item) => item.isRead)}
              >
                Mark all as read
              </button>
            </div>
          ) : null}

          <div className={styles.body}>
            <div className={styles.listPane}>
              {isLoading ? (
                <p className={styles.copy}>Loading...</p>
              ) : folder === 'drafts' ? (
                drafts.length === 0 ? (
                  <p className={styles.copy}>No drafts.</p>
                ) : (
                  <ul className={styles.list}>
                    {drafts.map((draft) => (
                      <li key={draft.id} className={styles.draftRow}>
                        <div className={styles.draftInfo}>
                          <span className={styles.subject}>
                            {draft.subject || '(no subject)'}
                          </span>
                          <p className={styles.preview}>{draft.body || ''}</p>
                          <span className={styles.timestamp}>
                            {formatTimestamp(draft.updated_at)} ·{' '}
                            {draft.message_type === 'mail'
                              ? 'Mail'
                              : 'Announcement'}
                          </span>
                        </div>
                        <div className={styles.draftActions}>
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => void handleSendDraft(draft.id)}
                          >
                            Send
                          </button>
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => void handleDeleteDraft(draft.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              ) : visibleItems.length === 0 ? (
                <p className={styles.copy}>Nothing here.</p>
              ) : (
                <ul className={styles.list}>
                  {visibleItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={
                          item.id === selectedThreadId
                            ? styles.itemActive
                            : item.isRead
                              ? styles.item
                              : styles.itemUnread
                        }
                        onClick={() => void handleSelectItem(item)}
                      >
                        <div className={styles.itemMain}>
                          <span className={styles.sender}>
                            {item.senderLabel}
                          </span>
                          <span className={styles.subject}>{item.subject}</span>
                          <p className={styles.preview}>{item.preview}</p>
                        </div>
                        <div className={styles.itemMeta}>
                          <span className={styles.timestamp}>
                            {formatTimestamp(item.timestamp)}
                          </span>
                          <div className={styles.itemActions}>
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={(event) =>
                                void handleToggleStar(item, event)
                              }
                            >
                              {item.isStarred ? 'Unstar' : 'Star'}
                            </button>
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={(event) =>
                                void handleToggleRead(item, event)
                              }
                            >
                              {item.isRead ? 'Mark unread' : 'Mark read'}
                            </button>
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={(event) =>
                                void handleDeleteItem(item, event)
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {folder !== 'drafts' && folder !== 'system' ? (
              <div className={styles.detailPane}>
                <ThreadDetail
                  thread={threadDetail}
                  isLoading={threadDetailLoading}
                  error={threadDetailError}
                  viewerId={user.id}
                  accessToken={accessToken}
                  isSending={isSendingReply}
                  onReply={handleReply}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
