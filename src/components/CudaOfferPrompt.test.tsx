import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CudaOfferPrompt from "./CudaOfferPrompt";

const invoke = vi.fn();
const OFFER = {
  offer: true,
  id: "cuda-engine",
  label: "GPU engine",
  bytes: 132 * 2 ** 20,
};

beforeEach(() => {
  invoke.mockReset();
  Object.assign(window, {
    electron: { ipcRenderer: { invoke, on: () => () => undefined } },
  });
});
afterEach(cleanup);

describe("CudaOfferPrompt (KAN-434)", () => {
  it("shows nothing when there is no offer", async () => {
    invoke.mockResolvedValue({ offer: false });
    render(<CudaOfferPrompt />);
    await Promise.resolve();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("records a decline and goes away", async () => {
    invoke.mockImplementation(async (channel: string) =>
      channel === "ai:cuda-offer-get" ? OFFER : { success: true },
    );
    render(<CudaOfferPrompt />);
    fireEvent.click(await screen.findByText("No thanks"));
    expect(invoke).toHaveBeenCalledWith("ai:cuda-offer-answer", false);
    await vi.waitFor(() => expect(screen.queryByText(/132 MB/)).toBeNull());
    expect(invoke).not.toHaveBeenCalledWith(
      "ai:download-model",
      expect.anything(),
      expect.anything(),
    );
  });

  it("downloads through the shared downloader and says when it takes effect", async () => {
    invoke.mockImplementation(async (channel: string) =>
      channel === "ai:cuda-offer-get"
        ? OFFER
        : channel === "ai:download-model"
          ? { success: true, restartRequired: true }
          : { success: true },
    );
    render(<CudaOfferPrompt />);
    fireEvent.click(await screen.findByText("Download"));
    expect(await screen.findByText(/next time it starts/)).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith("ai:cuda-offer-answer", true);
    expect(invoke).toHaveBeenCalledWith(
      "ai:download-model",
      "cuda-engine",
      true,
    );
  });

  it("offers a retry when the download fails", async () => {
    invoke.mockImplementation(async (channel: string) =>
      channel === "ai:cuda-offer-get"
        ? OFFER
        : channel === "ai:download-model"
          ? { error: "Download failed: checksum mismatch" }
          : { success: true },
    );
    render(<CudaOfferPrompt />);
    fireEvent.click(await screen.findByText("Download"));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /keeps running as before/,
    );
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});
