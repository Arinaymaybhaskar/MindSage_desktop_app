import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AIStatusCard, { SETTLE_MS } from "./AIStatusCard";
import {
  AI_STATE_PRIORITY,
  deriveAIState,
  type AIStatusFacts,
} from "../utils/aiStatus";

const none: AIStatusFacts = {
  restart: "ready",
  downloadFailed: false,
  downloadPaused: false,
  downloading: false,
  stopped: false,
  needsSetup: false,
  working: false,
};

describe("deriveAIState priority", () => {
  it("is ready with nothing going on", () => {
    expect(deriveAIState(none)).toBe("ready");
  });

  it("picks the earlier state in the fixed order when two apply", () => {
    expect(deriveAIState({ ...none, downloading: true, working: true })).toBe(
      "downloading",
    );
    expect(
      deriveAIState({ ...none, downloading: true, needsSetup: true }),
    ).toBe("setup");
    expect(deriveAIState({ ...none, needsSetup: true, stopped: true })).toBe(
      "setup",
    );
    expect(
      deriveAIState({ ...none, stopped: true, downloadPaused: true }),
    ).toBe("stopped");
    expect(
      deriveAIState({ ...none, downloadFailed: true, downloading: true }),
    ).toBe("error");
    expect(
      deriveAIState({ ...none, restart: "starting", downloadPaused: true }),
    ).toBe("paused");
    expect(deriveAIState({ ...none, restart: "starting", working: true })).toBe(
      "starting",
    );
  });

  it("covers all eight states", () => {
    expect(AI_STATE_PRIORITY).toHaveLength(8);
  });
});

type Handler = (payload: unknown) => void;
let handlers: Record<string, Handler>;
let status: unknown;
const invoke = vi.fn();
const emit = (channel: string, payload: unknown) =>
  act(() => handlers[channel](payload));

const models = [
  { id: "chat", label: "Qwen 3B", role: "chat", downloaded: true },
];
const baseStatus = (over: object = {}) => ({
  provider: "builtin",
  chatModel: "chat",
  models,
  downloading: null,
  restart: { state: "ready", provider: "builtin", managed: true },
  ...over,
});

async function mount(compact = false) {
  render(
    <MemoryRouter>
      <AIStatusCard compact={compact} />
      <Routes>
        <Route path="/settings/models" element={<p>Settings models</p>} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}
const settle = () => act(() => vi.advanceTimersByTimeAsync(SETTLE_MS + 10));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  handlers = {};
  status = baseStatus();
  invoke.mockReset();
  invoke.mockImplementation(async (channel: string) =>
    channel === "ai:get-status" ? status : { success: true },
  );
  window.electron = {
    ipcRenderer: {
      invoke,
      on: (channel: string, fn: Handler) => {
        handlers[channel] = fn;
        return () => delete handlers[channel];
      },
    },
  } as unknown as typeof window.electron;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AIStatusCard", () => {
  it("shows ready and announces it politely", async () => {
    await mount();
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("Local AI ready");
    expect(screen.getByText("Everything runs on this PC")).toBeVisible();
  });

  it("shows the table's title and second line for starting and paused", async () => {
    await mount();
    emit("ai:restart-status", { state: "starting" });
    await settle();
    expect(screen.getByText("Starting Local AI…")).toBeVisible();
    expect(screen.getByText("Search and Ask ready in a moment")).toBeVisible();
    emit("ai:restart-status", { state: "ready" });
    emit("ai:download-progress", { id: "chat", paused: true });
    await settle();
    expect(screen.getByText("Local AI paused")).toBeVisible();
    expect(
      screen.getByText("Writing works. AI catches up when you resume."),
    ).toBeVisible();
  });

  it("working counts distinct entries and does not re-announce the count", async () => {
    await mount();
    const live = screen.getByRole("status");
    for (const id of [1, 2, 3])
      emit("ai-status-event", {
        event: "journal:aiStarted",
        data: { entryId: id },
      });
    await settle();
    expect(screen.getByText("Working on 3 entries")).toBeVisible();
    const announced = live.textContent;
    for (const id of [1, 2])
      emit("ai-status-event", {
        event: "journal:aiCompleted",
        data: { entryId: id },
      });
    expect(screen.getByText("Working on 1 entry")).toBeVisible();
    expect(live.textContent).toBe(announced);
  });

  it("never says it works on 0 entries while the last job settles (KAN-486)", async () => {
    await mount();
    emit("ai-status-event", {
      event: "journal:aiStarted",
      data: { entryId: 1 },
    });
    await settle();
    emit("ai-status-event", {
      event: "journal:aiCompleted",
      data: { entryId: 1 },
    });
    expect(screen.queryByText(/Working on 0/)).toBeNull();
    expect(screen.getByText("Working on 1 entry")).toBeVisible();
  });

  it("moves to not set up when a model delete is announced (KAN-486)", async () => {
    await mount();
    status = {
      ...baseStatus(),
      models: [{ ...models[0], downloaded: false }],
    };
    emit("ai:download-progress", { id: "chat", finished: true });
    await act(async () => {});
    await settle();
    expect(screen.getByText("Local AI not set up")).toBeVisible();
  });

  it("clicking the title opens Settings > Local AI", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Local AI ready" }));
    expect(screen.getByText("Settings models")).toBeVisible();
  });

  it("shows real GB done of total with a progress bar", async () => {
    await mount();
    const GB = 1024 ** 3;
    emit("ai:download-progress", {
      id: "chat",
      done: 1.2 * GB,
      total: 2.4 * GB,
    });
    await settle();
    expect(
      screen.getByText("1.2 of 2.4 GB · only downloads use the internet"),
    ).toBeVisible();
    expect(screen.getByTestId("ai-status-card")).toHaveAttribute(
      "data-state",
      "downloading",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Downloading a model");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });

  it("does not flash starting for a quick restart", async () => {
    await mount();
    emit("ai:restart-status", { state: "starting" });
    await act(() => vi.advanceTimersByTimeAsync(100));
    emit("ai:restart-status", { state: "ready" });
    await settle();
    expect(screen.getByTestId("ai-status-card")).toHaveAttribute(
      "data-state",
      "ready",
    );
  });

  it("moves to error at once when the engine crashes mid-download, with Restart", async () => {
    await mount();
    emit("ai:download-progress", { id: "chat", done: 10, total: 100 });
    await settle();
    emit("ai:download-progress", { id: "chat", error: "engine stopped" });
    expect(screen.getByTestId("ai-status-card")).toHaveAttribute(
      "data-state",
      "error",
    );
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(invoke).toHaveBeenCalledWith("ai:restart");
  });

  it("Resume restarts the paused download, confirmed", async () => {
    await mount();
    emit("ai:download-progress", { id: "chat", paused: true, done: 1 });
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(invoke).toHaveBeenCalledWith("ai:download-model", "chat", true);
  });

  it("offers Set up when no writing model is installed", async () => {
    status = baseStatus({ models: [{ ...models[0], downloaded: false }] });
    await mount();
    await settle();
    expect(screen.getByRole("button", { name: "Set up" })).toBeVisible();
  });

  it("compact rail hides when fine and shows a badge when AI needs attention", async () => {
    await mount(true);
    expect(screen.queryByTestId("ai-status-card")).toBeNull();
    emit("ai:download-progress", { id: "chat", paused: true });
    await settle();
    const card = screen.getByTestId("ai-status-card");
    expect(card).toHaveAttribute("data-state", "paused");
    expect(card.querySelector("[data-badge=paused]")).not.toBeNull();
  });

  it("compact rail stays hidden while downloading", async () => {
    await mount(true);
    emit("ai:download-progress", { id: "chat", done: 1, total: 100 });
    await settle();
    expect(screen.queryByTestId("ai-status-card")).toBeNull();
  });
});
