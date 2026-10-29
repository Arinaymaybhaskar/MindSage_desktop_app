import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VoiceModelPrompt from "./VoiceModelPrompt";

vi.mock("./ModelDialog", () => ({
  default: ({ modelId }: { modelId: string }) => <div>dialog {modelId}</div>,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VoiceModelPrompt", () => {
  it("offers both models with their sizes and opens the shared dialog", () => {
    render(<VoiceModelPrompt onClose={() => {}} />);
    expect(screen.getByText(/English \(148 MB\)/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Hindi and other languages \(488 MB\)/));
    expect(screen.getByText("dialog whisper-small")).toBeTruthy();
  });

  it("explains being offline and offers later instead of downloads", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const onClose = vi.fn();
    render(<VoiceModelPrompt onClose={onClose} />);
    expect(screen.getByRole("alert").textContent).toMatch(/offline/);
    expect(screen.queryByText(/148 MB/)).toBeNull();
    fireEvent.click(screen.getByText("Later"));
    expect(onClose).toHaveBeenCalled();
  });
});
