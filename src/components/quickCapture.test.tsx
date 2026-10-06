import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuickCapture from "./quickCapture";

let accessToken: string | null = null;
const create = vi.fn();
const invoke = vi.fn().mockResolvedValue(undefined);

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ accessToken }),
}));
vi.mock("../api/journalService", () => ({
  default: { create: (...args: unknown[]) => create(...args) },
}));
vi.mock("react-hot-toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("./QuickCaptureTitleBar", () => ({ default: () => null }));

const DRAFT_KEY = "quick-capture-draft";
const contentBox = () => screen.getByPlaceholderText(/quick thought/);

describe("QuickCapture", () => {
  beforeEach(() => {
    localStorage.clear();
    accessToken = null;
    create.mockReset();
    invoke.mockClear();
    Object.defineProperty(window, "electron", {
      value: { ipcRenderer: { invoke } },
      configurable: true,
    });
  });
  afterEach(cleanup);

  it("keeps typed text when logged out and never calls create", () => {
    render(<QuickCapture />);
    fireEvent.change(contentBox(), { target: { value: "an idea" } });

    expect(screen.getByText(/Log in to MindSage to save/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });

    expect(create).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!)).toMatchObject({
      content: "an idea",
    });
  });

  it("restores the draft when the window opens again", () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ title: "t", content: "from last time" }),
    );
    render(<QuickCapture />);
    expect(contentBox()).toHaveValue("from last time");
  });

  it("keeps the draft when the save fails", async () => {
    accessToken = "tok";
    create.mockRejectedValue(new Error("db locked"));
    render(<QuickCapture />);
    fireEvent.change(contentBox(), { target: { value: "do not lose me" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    expect(contentBox()).toHaveValue("do not lose me");
    expect(localStorage.getItem(DRAFT_KEY)).toContain("do not lose me");
  });

  it("clears the draft only after a successful save", async () => {
    accessToken = "tok";
    create.mockResolvedValue({ id: 7 });
    render(<QuickCapture />);
    fireEvent.change(contentBox(), { target: { value: "saved" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("quick-capture:close"),
    );
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
