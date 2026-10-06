import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocalAIPanel from "./LocalAIPanel";

const showToast = vi.fn();
const navigate = vi.fn();
const retryAIMetadata = vi.fn().mockResolvedValue({ success: true });

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ accessToken: "tok" }),
}));
vi.mock("../hooks/useToast", () => ({ useToast: () => ({ showToast }) }));
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("../api/journalService", () => ({
  default: {
    retryAIMetadata: (...args: unknown[]) => retryAIMetadata(...args),
  },
}));
vi.mock("../api/qDrantService", () => ({
  qdrantService: { syncJournal: vi.fn().mockResolvedValue({ success: true }) },
}));

interface AIStatusPayload {
  event: string;
  data?: Record<string, unknown>;
}

/** The single `ai-status-event` handler the component registers. */
let emit: (payload: AIStatusPayload) => void;
/** The `status-update` handler, which carries the Ollama engine state. */
let emitEngine: (status: { type: string; [key: string]: unknown }) => void;

beforeEach(() => {
  vi.clearAllMocks();
  window.electron = {
    ipcRenderer: {
      on: (channel: string, handler: (payload: AIStatusPayload) => void) => {
        if (channel === "ai-status-event") emit = handler;
        return () => {};
      },
    },
    onStatusUpdate: (handler: (status: { type: string }) => void) => {
      emitEngine = handler as typeof emitEngine;
      return () => {};
    },
    send: vi.fn(),
  } as unknown as typeof window.electron;

  render(
    <MemoryRouter>
      <LocalAIPanel />
    </MemoryRouter>,
  );
});

// Auto-cleanup is not wired up in this project's vitest setup, so each test
// would otherwise query a DOM still holding every previous render.
afterEach(cleanup);

const send = (event: string, data: Record<string, unknown>) =>
  act(() => emit({ event, data }));

const pill = () => screen.queryByRole("button", { name: /^Local AI/i });
const openPanel = async () => {
  await act(async () => {
    fireEvent.click(pill()!);
  });
  return screen.getByText("Local AI").closest("div")!.parentElement!;
};

describe("LocalAIPanel", () => {
  it("stays in the title bar and shows the engine state at rest", () => {
    expect(pill()).toHaveTextContent("Checking AI");

    act(() => emitEngine({ type: "system-ready" }));
    expect(pill()).toHaveTextContent("AI ready");

    act(() => emitEngine({ type: "ollama-not-installed" }));
    expect(pill()).toHaveTextContent("Ollama missing");
  });

  it("puts the Ollama engine and its setup links in the panel", async () => {
    act(() => emitEngine({ type: "ollama-not-installed" }));
    const panel = await openPanel();

    expect(
      within(panel).getByText("Ollama is not installed"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("No entries are being processed right now."),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Install" }));
    });
    expect(navigate).toHaveBeenCalledWith("/ollama-tutorial");
  });

  it("falls back to the engine state once work is done", () => {
    act(() => emitEngine({ type: "system-ready" }));
    send("journal:aiStarted", { entryId: 1, preview: "Tuesday" });
    expect(pill()).toHaveTextContent("Tuesday");

    send("journal:aiCompleted", { entryId: 1 });
    expect(pill()).toHaveTextContent("AI ready");
  });

  it("names the entry being processed", () => {
    send("journal:aiStarted", { entryId: 1, title: "", preview: "Rainy walk" });
    expect(pill()).toHaveTextContent("Rainy walk");

    // The generated title replaces the snippet as soon as it lands.
    send("journal:aiCompleted", { entryId: 1, title: "A Rainy Walk Home" });
    send("ollama:summary-started", { entryId: 1, title: "A Rainy Walk Home" });
    expect(pill()).toHaveTextContent("A Rainy Walk Home");
  });

  it("counts multiple entries instead of naming one of them", () => {
    send("journal:aiStarted", { entryId: 1, preview: "One" });
    send("journal:aiStarted", { entryId: 2, preview: "Two" });
    expect(pill()).toHaveTextContent("2 entries");

    send("journal:aiCompleted", { entryId: 1 });
    expect(pill()).toHaveTextContent("Two");
  });

  // The regression this file exists for: `journal:aiFailed` reaches the title
  // bar, so a failed generation stops presenting itself as still running.
  it("reports a failure instead of spinning forever", async () => {
    send("journal:aiStarted", { entryId: 7, preview: "Hard day" });
    send("journal:aiFailed", {
      entryId: 7,
      error: "AI returned incomplete or invalid metadata",
    });
    expect(pill()).toHaveTextContent("1 needs attention");

    await openPanel();
    expect(
      screen.getByText(/AI returned incomplete or invalid metadata/),
    ).toBeInTheDocument();
  });

  it("keeps running while a second entry is still being enriched", () => {
    send("journal:aiStarted", { entryId: 1, preview: "One" });
    send("journal:aiStarted", { entryId: 2, preview: "Two" });
    send("journal:aiFailed", { entryId: 1, error: "nope" });
    expect(pill()).toHaveTextContent("Two");

    send("journal:aiCompleted", { entryId: 2 });
    expect(pill()).toHaveTextContent("1 needs attention");
  });

  it("shows every job for one entry in a single row", async () => {
    send("journal:aiStarted", { entryId: 3, preview: "A long day" });
    send("ollama:summary-skipped", { entryId: 3 });
    send("journal:indexStarted", { entryId: 3 });

    const panel = await openPanel();
    expect(within(panel).getByText(/Title & mood/)).toBeInTheDocument();
    expect(within(panel).getByText(/Summary skipped/)).toBeInTheDocument();
    expect(within(panel).getByText(/Search index/)).toBeInTheDocument();
  });

  it("collapses a bulk re-index into one row with progress", async () => {
    send("qdrant:bulkStarted", { kind: "journals", total: 40 });
    send("qdrant:bulkProgress", { kind: "journals", done: 12, total: 40 });
    expect(pill()).toHaveTextContent("Indexing 12/40");

    const panel = await openPanel();
    expect(within(panel).getByText(/Re-indexing journals/)).toBeInTheDocument();
    expect(within(panel).getByText("12/40")).toBeInTheDocument();
  });

  it("retries a failed job from the panel", async () => {
    send("journal:aiStarted", { entryId: 9, preview: "Something" });
    send("journal:aiFailed", { entryId: 9, error: "boom" });

    const panel = await openPanel();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: /Retry/ }));
    });

    expect(retryAIMetadata).toHaveBeenCalledWith("tok", 9, "metadata");
    // The row goes back to running until the main process reports the outcome.
    expect(pill()).toHaveTextContent("Something");
  });

  it("opens the entry when its row is clicked", async () => {
    send("journal:aiStarted", { entryId: 42, preview: "Tuesday" });
    const panel = await openPanel();
    await act(async () => {
      fireEvent.click(within(panel).getByText("Tuesday"));
    });
    expect(navigate).toHaveBeenCalledWith("/journal/view/42");
  });
});
