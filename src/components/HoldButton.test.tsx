import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HoldButton from "./HoldButton";

describe("HoldButton", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const setup = (props = {}) => {
    const onComplete = vi.fn();
    render(<HoldButton label="Hold" onComplete={onComplete} {...props} />);
    return { onComplete, button: screen.getByRole("button") };
  };

  it("acts only after the full duration", () => {
    const { onComplete, button } = setup();
    fireEvent.pointerDown(button);
    act(() => void vi.advanceTimersByTime(1499));
    expect(onComplete).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does nothing when released early", () => {
    const { onComplete, button } = setup();
    fireEvent.pointerDown(button);
    act(() => void vi.advanceTimersByTime(1000));
    fireEvent.pointerUp(button);
    act(() => void vi.advanceTimersByTime(5000));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does nothing when the pointer leaves", () => {
    const { onComplete, button } = setup();
    fireEvent.pointerDown(button);
    fireEvent.pointerLeave(button);
    act(() => void vi.advanceTimersByTime(5000));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("ignores a plain click", () => {
    const { onComplete, button } = setup();
    fireEvent.click(button);
    act(() => void vi.advanceTimersByTime(5000));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("works from the keyboard and cancels on key up", () => {
    const { onComplete, button } = setup();
    fireEvent.keyDown(button, { key: " " });
    act(() => void vi.advanceTimersByTime(1500));
    expect(onComplete).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyUp(button, { key: "Enter" });
    act(() => void vi.advanceTimersByTime(5000));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does not start when disabled, and a repeat keydown does not restart", () => {
    const off = setup({ disabled: true });
    fireEvent.pointerDown(off.button);
    act(() => void vi.advanceTimersByTime(5000));
    expect(off.onComplete).not.toHaveBeenCalled();
  });

  it("cancels if disabled while held", () => {
    const onComplete = vi.fn();
    const { rerender } = render(
      <HoldButton label="Hold" onComplete={onComplete} />,
    );
    fireEvent.pointerDown(screen.getByRole("button"));
    rerender(<HoldButton label="Hold" onComplete={onComplete} disabled />);
    act(() => void vi.advanceTimersByTime(5000));
    expect(onComplete).not.toHaveBeenCalled();
  });
});
