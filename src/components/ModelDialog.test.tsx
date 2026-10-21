import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModelDialog from "./ModelDialog";
import type { ModelDialogInfo } from "../api/aiModelService";

const dialogInfo = vi.fn();
const download = vi.fn();
const remove = vi.fn();
vi.mock("../api/aiModelService", () => ({
  aiModelService: {
    dialogInfo: (...a: unknown[]) => dialogInfo(...a),
    download: (...a: unknown[]) => download(...a),
    remove: (...a: unknown[]) => remove(...a),
  },
}));

const base: ModelDialogInfo = {
  id: "llama-3.2-3b",
  label: "Llama 3.2 3B",
  size: "2.0 GB",
  downloaded: true,
  needSize: "2.0 GB",
  freeSize: "10.0 GB",
  shortSize: null,
  enoughSpace: true,
  memoryWarning: null,
  impact: { inUse: false },
};

const flush = () => act(async () => {});
const noop = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  dialogInfo.mockResolvedValue(base);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("download", () => {
  it("shows the size and downloads confirmed", async () => {
    download.mockResolvedValue({ success: true });
    const onClose = vi.fn();
    const onResult = vi.fn();
    render(
      <ModelDialog
        modelId="m"
        mode="download"
        onClose={onClose}
        onResult={onResult}
      />,
    );
    await flush();
    expect(screen.getByText(/downloads 2\.0 GB/)).toBeTruthy();
    fireEvent.click(screen.getByText("Download"));
    await flush();
    expect(download).toHaveBeenCalledWith("m", true);
    expect(onClose).toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith({ success: true });
  });

  it("blocks on low disk and enables when space is freed while open", async () => {
    dialogInfo.mockResolvedValue({
      ...base,
      enoughSpace: false,
      shortSize: "0.5 GB",
    });
    render(
      <ModelDialog
        modelId="m"
        mode="download"
        onClose={noop}
        onResult={noop}
      />,
    );
    await flush();
    expect(screen.getByText(/Free 0\.5 GB more/)).toBeTruthy();
    const button = screen.getByText("Download") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    dialogInfo.mockResolvedValue(base);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(button.disabled).toBe(false);
  });
});

describe("delete", () => {
  it("warns when the model is in use", async () => {
    dialogInfo.mockResolvedValue({
      ...base,
      impact: { inUse: true, alternative: null, warning: "Chat turns off." },
    });
    render(
      <ModelDialog modelId="m" mode="delete" onClose={noop} onResult={noop} />,
    );
    await flush();
    expect(screen.getByText("Chat turns off.")).toBeTruthy();
  });

  it("offers retry later when the file is locked", async () => {
    remove
      .mockResolvedValueOnce({
        error: "The file is in use by another program.",
        retryLater: true,
      })
      .mockResolvedValueOnce({ success: true, chatModel: null });
    const onResult = vi.fn();
    render(
      <ModelDialog
        modelId="m"
        mode="delete"
        onClose={noop}
        onResult={onResult}
      />,
    );
    await flush();
    fireEvent.click(screen.getByText("Delete"));
    await flush();
    expect(screen.getByText(/Try again later/)).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    await flush();
    expect(onResult).toHaveBeenCalledWith({ success: true, chatModel: null });
  });
});
