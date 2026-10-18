import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JournalForm from "./journalForm";
import { prepareToRestart } from "../utils/unsavedWork";

// A stable object: the form re-loads its entry whenever the user changes.
const session = { user: { username: "ada" }, checking: false };
vi.mock("../hooks/useAuth", () => ({ useAuth: () => session }));
vi.mock("../api/journalService", () => ({
  default: {
    getOne: vi.fn().mockResolvedValue({
      id: 5,
      title: "Walk",
      content: "A saved entry",
      mood_tags: [],
    }),
    create: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("../api/whisperService", () => ({
  default: { onLiveData: () => () => {}, start: vi.fn(), stop: vi.fn() },
}));
vi.mock("../api/mediaService", () => ({ mediaService: {} }));
vi.mock("../api/ollamaService", () => ({ ollamaService: {} }));

beforeEach(() => {
  localStorage.clear();
  window.electron = {
    ipcRenderer: { invoke: vi.fn().mockResolvedValue(undefined) },
  } as unknown as typeof window.electron;
});
afterEach(cleanup);

async function open(path: string) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/journal/new" element={<JournalForm />} />
        <Route path="/journal/edit/:id" element={<JournalForm />} />
        <Route path="*" element={<div>elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  return view;
}

const editor = (container: HTMLElement) =>
  container.querySelector("textarea") as HTMLTextAreaElement;

describe("JournalForm and restarting to update", () => {
  it("writes a new entry's text to its draft before a restart, so it can restart", async () => {
    const { container } = await open("/journal/new");
    fireEvent.change(editor(container), {
      target: { value: "half a thought" },
    });
    // Well inside the 1.5 s autosave delay: only the flush can have saved it.
    expect(localStorage.getItem("draft-journal") ?? "").not.toContain(
      "half a thought",
    );
    expect(prepareToRestart()).toEqual({ ok: true });
    expect(localStorage.getItem("draft-journal")).toContain("half a thought");
  });

  it("allows a restart on an entry that has not been changed", async () => {
    await open("/journal/edit/5");
    expect(prepareToRestart()).toEqual({ ok: true });
  });

  it("refuses a restart while an existing entry has unsaved edits", async () => {
    const { container } = await open("/journal/edit/5");
    fireEvent.change(editor(container), {
      target: { value: "A saved entry, but I kept typing" },
    });
    expect(prepareToRestart().ok).toBe(false);
  });

  it("stops guarding once the form is closed", async () => {
    const { container, unmount } = await open("/journal/edit/5");
    fireEvent.change(editor(container), { target: { value: "changed" } });
    expect(prepareToRestart().ok).toBe(false);
    unmount();
    expect(prepareToRestart()).toEqual({ ok: true });
  });
});
