import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VoiceModelPrompt from "./VoiceModelPrompt";

vi.mock("./ModelDialog", () => ({
  default: ({
    modelId,
    onStart,
    onClose,
    onResult,
  }: {
    modelId: string;
    onStart: () => void;
    onClose: () => void;
    onResult: (r: { success?: boolean; error?: string }) => void;
  }) => (
    <div>
      dialog {modelId}
      <button
        onClick={() => {
          onStart();
          onClose();
        }}
      >
        start
      </button>
      <button
        onClick={() => {
          onStart();
          onClose();
          onResult({ success: true });
        }}
      >
        finish
      </button>
      <button
        onClick={() => {
          onStart();
          onClose();
          onResult({ error: "Checksum mismatch" });
        }}
      >
        fail
      </button>
    </div>
  ),
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

  it("shows the outcome after the dialog closes itself on Download (KAN-485)", () => {
    render(<VoiceModelPrompt onClose={() => {}} />);
    fireEvent.click(screen.getByText(/English \(148 MB\)/));
    fireEvent.click(screen.getByText("start"));
    expect(screen.queryByText(/Download the voice model\?/)).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/Downloading/);
  });

  it("says the voice model is ready, or why it failed", () => {
    const { unmount } = render(<VoiceModelPrompt onClose={() => {}} />);
    fireEvent.click(screen.getByText(/English \(148 MB\)/));
    fireEvent.click(screen.getByText("finish"));
    expect(screen.getByRole("status").textContent).toMatch(/ready/);
    unmount();

    render(<VoiceModelPrompt onClose={() => {}} />);
    fireEvent.click(screen.getByText(/English \(148 MB\)/));
    fireEvent.click(screen.getByText("fail"));
    expect(screen.getByRole("alert").textContent).toMatch(/safety check/);
    fireEvent.click(screen.getByText("Try again"));
    expect(screen.getByText("dialog whisper-base-en")).toBeTruthy();
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
