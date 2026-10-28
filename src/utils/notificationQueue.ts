export type NotificationKind = 'success' | 'error' | 'info' | 'warning';

export interface QueuedNotification {
  readonly id: string;
  readonly message: string;
  readonly kind: NotificationKind;
  readonly durationMs: number;
}

export interface NotificationQueueState {
  readonly items: readonly QueuedNotification[];
}

export const EMPTY_QUEUE: NotificationQueueState = Object.freeze({ items: Object.freeze([]) as readonly QueuedNotification[] });
export const MAX_VISIBLE_NOTIFICATIONS = 3 as const;
export const MAX_STORED_NOTIFICATIONS = 10 as const;
export const NOTIFICATION_DURATION_MS: Record<NotificationKind, number> = {
  success: 3000,
  info: 4000,
  warning: 5000,
  error: 6000
};

export function enqueueNotification(
  state: NotificationQueueState,
  input: { message: string; kind?: NotificationKind; durationMs?: number },
  id: string
): NotificationQueueState {
  if (!input.message || !input.message.trim()) return state;
  const kind = input.kind ?? 'success';
  if (state.items.some(item => item.message === input.message && item.kind === kind)) return state;
  const durationMs =
    typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs > 0
      ? input.durationMs
      : NOTIFICATION_DURATION_MS[kind];
  const items = [...state.items, { id, message: input.message, kind, durationMs }];
  if (items.length > MAX_STORED_NOTIFICATIONS) items.splice(MAX_VISIBLE_NOTIFICATIONS, 1);
  return { items };
}

export function dismissNotification(state: NotificationQueueState, id: string): NotificationQueueState {
  if (!state.items.some(item => item.id === id)) return state;
  return { items: state.items.filter(item => item.id !== id) };
}

export function visibleNotifications(state: NotificationQueueState): readonly QueuedNotification[] {
  return state.items.slice(0, MAX_VISIBLE_NOTIFICATIONS);
}
