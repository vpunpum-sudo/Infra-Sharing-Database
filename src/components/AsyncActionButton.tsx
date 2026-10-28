import React, { useCallback, useEffect, useId, useReducer, useRef } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { IDLE_ACTION, SKIPPED, createSingleFlight, reduceAsyncAction } from '../utils/asyncAction';

export interface AsyncActionButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'> {
  onAction: () => Promise<unknown> | void;
  children: React.ReactNode;
  pendingLabel: string;
  successLabel?: string;
  disabledReason?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  pending?: boolean;
}

const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'bg-rose-600 text-slate-100 hover:bg-rose-700 shadow-lg shadow-rose-900/20'
} as const;

const SUCCESS_VISIBLE_MS = 1200;
const ERROR_RING_MS = 1500;

export function AsyncActionButton({
  onAction, children, pendingLabel, successLabel, disabledReason, variant = 'primary', pending: pendingProp,
  className = '', disabled, type = 'button', ...rest
}: AsyncActionButtonProps): React.ReactElement {
  const [state, dispatch] = useReducer(reduceAsyncAction, IDLE_ACTION);
  const flight = useRef(createSingleFlight()).current;
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reasonId = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const settleLater = useCallback((ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (mounted.current) dispatch({ type: 'reset' });
    }, ms);
  }, []);

  const handleClick = useCallback(() => {
    if (flight.isRunning()) return;
    clearTimeout(timer.current);
    dispatch({ type: 'start' });
    void flight
      .run(async () => {
        try {
          await onAction();
        } catch (error) {
          if (mounted.current) {
            dispatch({ type: 'fail', message: 'error' });
            settleLater(ERROR_RING_MS);
          }
          return SKIPPED;
        }
        if (mounted.current) {
          dispatch({ type: 'succeed' });
          settleLater(successLabel ? SUCCESS_VISIBLE_MS : 0);
        }
        return undefined;
      })
      .catch(() => undefined);
  }, [flight, onAction, settleLater, successLabel]);

  const isPending = pendingProp === true || state.status === 'pending';
  const showSuccess = !isPending && state.status === 'success' && !!successLabel;
  const isDisabled = !!disabled || isPending;
  const showReason = !!disabled && !isPending && !!disabledReason;

  const button = (
      <button
        {...rest}
        type={type}
        disabled={isDisabled}
        aria-busy={isPending || undefined}
        aria-describedby={showReason ? reasonId : rest['aria-describedby']}
        title={showReason ? disabledReason : rest.title}
        onClick={handleClick}
        className={`ux-pressable inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${VARIANTS[variant]} ${state.status === 'error' ? 'ux-error-ring' : ''} ${className}`}
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>{pendingLabel}</span>
          </>
        ) : showSuccess ? (
          <>
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>{successLabel}</span>
          </>
        ) : (
          children
        )}
      </button>
  );

  return showReason ? (
    <span className="inline-flex min-w-0 flex-col gap-1 align-middle">
      {button}
      <span id={reasonId} className="max-w-xs text-xs text-slate-400 whitespace-normal">{disabledReason}</span>
    </span>
  ) : button;
}
