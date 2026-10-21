import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

/** Lets a field drive the hold, so holding Enter there is holding the button. */
export interface HoldButtonHandle {
  start: () => void;
  cancel: () => void;
}

interface HoldButtonProps {
  label: string;
  holdingLabel?: string;
  onComplete: () => void;
  /** How long it has to be held, in milliseconds. */
  duration?: number;
  disabled?: boolean;
  className?: string;
  ref?: Ref<HoldButtonHandle>;
}

/**
 * A button that only acts if it is held down, for things that cannot be undone:
 * a click, a tap or a stray Enter does nothing. Works with the mouse, touch and
 * the keyboard (hold Space or Enter), and letting go early cancels it.
 */
export default function HoldButton({
  label,
  holdingLabel = "Keep holding…",
  onComplete,
  duration = 1500,
  disabled = false,
  className = "",
  ref,
}: HoldButtonProps) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onComplete();
    }, duration);
  }, [disabled, duration, onComplete]);

  useImperativeHandle(ref, () => ({ start, cancel }), [start, cancel]);
  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);

  return (
    <button
      type="button"
      disabled={disabled}
      data-holding={holding ? "true" : "false"}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") cancel();
      }}
      onBlur={cancel}
      // A plain click (what a screen reader's "activate" sends) must not delete.
      onClick={(e) => e.preventDefault()}
      className={`relative overflow-hidden select-none rounded-lg px-5 py-2.5 font-medium text-white bg-danger disabled:opacity-50 ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-black/25"
        style={{
          width: holding ? "100%" : "0%",
          transition: holding
            ? `width ${duration}ms linear`
            : "width 150ms ease-out",
        }}
      />
      <span className="relative">{holding ? holdingLabel : label}</span>
    </button>
  );
}
