export type AsyncActionStatus = 'idle' | 'pending' | 'success' | 'error';

export interface AsyncActionState {
  readonly status: AsyncActionStatus;
  readonly message?: string;
}

export const IDLE_ACTION: AsyncActionState = Object.freeze({ status: 'idle' });

export type AsyncActionEvent =
  | { type: 'start' }
  | { type: 'succeed'; message?: string }
  | { type: 'fail'; message: string }
  | { type: 'reset' };

export function reduceAsyncAction(state: AsyncActionState, event: AsyncActionEvent): AsyncActionState {
  switch (event.type) {
    case 'start':
      return state.status === 'pending' ? state : { status: 'pending' };
    case 'succeed':
      if (state.status !== 'pending') return state;
      return event.message === undefined ? { status: 'success' } : { status: 'success', message: event.message };
    case 'fail':
      return state.status === 'pending' ? { status: 'error', message: event.message } : state;
    case 'reset':
      return IDLE_ACTION;
    default:
      return state;
  }
}

export const SKIPPED: unique symbol = Symbol('SKIPPED');

export interface SingleFlight {
  run<T>(task: () => Promise<T>): Promise<T | typeof SKIPPED>;
  isRunning(): boolean;
}

export function createSingleFlight(): SingleFlight {
  let running = false;
  return {
    run<T>(task: () => Promise<T>): Promise<T | typeof SKIPPED> {
      if (running) return Promise.resolve(SKIPPED);
      running = true;
      let promise: Promise<T>;
      try {
        promise = Promise.resolve(task());
      } catch (error) {
        promise = Promise.reject(error);
      }
      return promise.finally(() => {
        running = false;
      });
    },
    isRunning: () => running
  };
}

export const ACTION_ERROR_MESSAGES = {
  permission: 'คุณไม่มีสิทธิ์ทำรายการนี้',
  quota: 'โควต้าการเขียนข้อมูลวันนี้เต็มแล้ว กรุณาลองใหม่หลังโควต้ารีเซ็ต',
  offline: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'
} as const;

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: unknown; message?: unknown };
    return [code, message].filter((part): part is string => typeof part === 'string').join(' ');
  }
  return '';
}

export function describeActionError(error: unknown, fallback: string): string {
  const text = errorText(error).toLowerCase();
  if (text.includes('permission-denied') || text.includes('insufficient permissions')) return ACTION_ERROR_MESSAGES.permission;
  if (text.includes('resource-exhausted') || text.includes('quota exceeded')) return ACTION_ERROR_MESSAGES.quota;
  if (['unavailable', 'network', 'offline', 'failed to fetch'].some(key => text.includes(key))) return ACTION_ERROR_MESSAGES.offline;
  return fallback;
}
