import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuickCapture from "./quickCapture";

const showToast = vi.fn();
const create = vi.fn();
let accessToken: string | null = "tok";

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ accessToken }),
}));
vi.mock("../hooks/useToast", () => ({ useToast: () => ({ showToast }) }));
vi.mock("../api/journalService", () => ({
  default: { create: (...args: unknown[]) => create(...args) },
}));

const DRAFT_KEY = "draft-quick-capture";

beforeEach(() => {
  accessToken = "tok";
  localStorage.clear();
  showToast.mockClear();
  create.mockReset().mockResolvedValue({ id: 1 });
  window.electron = {
    ipcRenderer: { invoke: vi.fn().mockResolvedValue(undefined) },
  } as unknown as typeof window.electron;
});

afterEach(cleanup);

function type(text: string) {
  fireEvent.change(screen.getByPlaceholderText("Write your quick thought..."), {
    target: { value: text },
  });
}

describe("QuickCapture when signed out", () => {
  it("offers no writing surface, so nothing can be lost", () => {
    accessToken = null;
    render(<QuickCapture />);

    expect(screen.getByText("You are signed out")).toBeTruthy();
    expect(
      screen.queryByPlaceholderText("Write your quick thought..."),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });
});

describe("QuickCapture drafts", () => {
  it("keeps a draft after the debounce", () => {
    vi.useFakeTimers();
    try {
      render(<QuickCapture />);
      type("a half-finished thought");
      act(() => vi.advanceTimersByTime(1600));
    } finally {
      vi.useRealTimers();
    }

    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!)).toEqual({
      title: "",
      content: "a half-finished thought",
    });
  });

  it("restores a stored draft on mount", () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ title: "Monday", content: "picked up where I left" }),
    );
    render(<QuickCapture />);

    expect(screen.getByDisplayValue("Monday")).toBeTruthy();
    expect(screen.getByDisplayValue("picked up where I left")).toBeTruthy();
  });

  it("survives an unreadable draft", () => {
    localStorage.setItem(DRAFT_KEY, "{not json");
    render(<QuickCapture />);

    expect(
      screen.getByPlaceholderText("Write your quick thought..."),
    ).toBeTruthy();
  });
});

describe("QuickCapture saving", () => {
  it("keeps the draft and reports the failure when the save fails", async () => {
    create.mockRejectedValue(new Error("no session"));
    render(<QuickCapture />);
    type("do not lose this");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
    });

    expect(showToast).toHaveBeenCalledWith("no session", "danger");
    // The text is still on screen, and a later debounce still persists it.
    expect(screen.getByDisplayValue("do not lose this")).toBeTruthy();
  });

  it("clears the draft only once the entry is saved", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ title: "", content: "keep me" }),
    );
    render(<QuickCapture />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
    });

    expect(create).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({ content: "keep me" }),
    );
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
