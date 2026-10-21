import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JournalForm from "./journalForm";
import { prepareToRestart } from "../utils/unsavedWork";
import journalService from "../api/journalService";

// A stable object: the form re-loads its entry whenever the user changes.
const session = { user: { id: 1, username: "ada" }, checking: false };
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
  session.user = { id: 1, username: "ada" };
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
    expect(localStorage.getItem("draft:1:journal") ?? "").not.toContain(
      "half a thought",
    );
    expect(prepareToRestart()).toEqual({ ok: true });
    expect(localStorage.getItem("draft:1:journal")).toContain("half a thought");
  });

  it("keeps a new entry's draft per profile, so another profile never sees it (KAN-380)", async () => {
    const first = await open("/journal/new");
    fireEvent.change(editor(first.container), {
      target: { value: "ada's private thought" },
    });
    expect(prepareToRestart()).toEqual({ ok: true });
    first.unmount();
    expect(localStorage.getItem("draft-journal")).toBeNull();

    session.user = { id: 2, username: "bo" };
    const second = await open("/journal/new");
    expect(editor(second.container).value).toBe("");
    second.unmount();

    session.user = { id: 1, username: "ada" };
    const again = await open("/journal/new");
    expect(editor(again.container).value).toBe("ada's private thought");
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

describe("JournalForm saving a new entry", () => {
  it("sends one create and no follow-up update that could wipe AI title and tags", async () => {
    vi.mocked(journalService.create).mockResolvedValue({
      id: 9,
      image_key: null,
      audio_key: null,
    } as never);
    vi.mocked(journalService.update).mockClear();
    const { container } = await open("/journal/new");
    fireEvent.change(editor(container), { target: { value: "a new entry" } });
    await act(async () => {
      fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    });
    expect(journalService.create).toHaveBeenCalledTimes(1);
    expect(journalService.update).not.toHaveBeenCalled();
  });
});

describe("mood slider default (KAN-383)", () => {
  const save = async (view: Awaited<ReturnType<typeof open>>) => {
    fireEvent.change(editor(view.container), { target: { value: "text" } });
    await act(async () => {
      fireEvent.submit(view.container.querySelector("form") as HTMLFormElement);
    });
  };
  const saved = () =>
    [
      ...vi.mocked(journalService.create).mock.calls,
      ...vi.mocked(journalService.update).mock.calls,
    ].at(-1)!;

  beforeEach(() => {
    vi.mocked(journalService.create)
      .mockReset()
      .mockResolvedValue({
        id: 9,
      } as never);
    vi.mocked(journalService.update)
      .mockReset()
      .mockResolvedValue({
        id: 5,
      } as never);
    vi.mocked(journalService.getOne).mockResolvedValue({
      id: 5,
      title: "Walk",
      content: "A saved entry",
      mood_tags: [],
      mood_score: null,
    } as never);
  });

  it.each(["/journal/new", "/journal/edit/5"])(
    "shows Not set and saves null when untouched on %s",
    async (path) => {
      const view = await open(path);
      expect(view.getByText("Not set", { selector: "span" })).toBeTruthy();
      await save(view);
      expect(saved().at(-1)).toMatchObject({ mood_score: null });
    },
  );

  it("saves the mood the person picks", async () => {
    const view = await open("/journal/new");
    fireEvent.change(view.getByTestId("mood-slider"), {
      target: { value: "4" },
    });
    expect(view.getByText("Great", { selector: "span" })).toBeTruthy();
    await save(view);
    expect(journalService.create).toHaveBeenCalledWith(
      expect.objectContaining({ mood_score: 4 }),
    );
  });

  it("shows and keeps an existing mood on edit", async () => {
    vi.mocked(journalService.getOne).mockResolvedValue({
      id: 5,
      title: "Walk",
      content: "A saved entry",
      mood_tags: [],
      mood_score: 5,
    } as never);
    const view = await open("/journal/edit/5");
    expect(view.getByText("Excellent", { selector: "span" })).toBeTruthy();
    await save(view);
    expect(journalService.update).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ mood_score: 5 }),
    );
  });
});
