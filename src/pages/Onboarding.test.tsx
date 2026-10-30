import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";
import type { AiSetupState } from "../api/aiSetupService";

const provider = vi.hoisted(() => ({ value: "builtin" }));
const setup = vi.hoisted(() => ({ state: null as unknown }));
const answerMetered = vi.hoisted(() => vi.fn());

vi.mock("../api/aiProviderService", () => ({
  aiProviderService: { get: async () => ({ provider: provider.value }) },
}));
vi.mock("../api/aiSetupService", () => ({
  aiSetupService: {
    start: async () => setup.state,
    onState: () => () => {},
    answerMetered,
  },
}));
vi.mock("../api/setupService", () => ({
  setupService: {
    getStatus: async () => ({
      ollamaInstalled: true,
      ollamaRunning: true,
      embeddingReady: false,
      generationReady: false,
      models: [],
      recommended: null,
      platform: "win32",
    }),
    onProgress: () => () => {},
  },
  appPrefsService: { get: async () => null },
}));

const mount = (state: AiSetupState, p = "builtin") => {
  provider.value = p;
  setup.state = state;
  render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>,
  );
};

beforeEach(() => answerMetered.mockReset());
afterEach(cleanup);

describe("Local AI step (KAN-493)", () => {
  it("says offline and still lets setup finish", async () => {
    mount({ state: "offline", host: "h", retryInMs: 5, sizeBytes: 2.5e9 });
    expect(await screen.findByText(/You are offline/)).toBeTruthy();
    expect(screen.getByText(/finish setup now/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeTruthy();
  });

  it("shows the size and asks before downloading on a metered link", async () => {
    mount({ state: "metered", sizeBytes: 2.5e9 });
    expect(await screen.findByText(/about 2\.5 GB/)).toBeTruthy();
    screen.getByRole("button", { name: "Wait for Wi-Fi" }).click();
    expect(answerMetered).toHaveBeenCalledWith(true);
  });

  it("does not mention Ollama with the built-in engine", async () => {
    mount({ state: "ready" });
    await screen.findByText(/Ready/);
    expect(document.body.textContent).not.toMatch(/ollama/i);
  });

  it("keeps the Ollama steps when Ollama is the provider", async () => {
    mount({ state: "ready" }, "ollama");
    await waitFor(() =>
      expect(screen.getByText("Local AI engine (Ollama)")).toBeTruthy(),
    );
  });
});
