import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Trash from "./Trash";
import { deletedAgoLabel, goneForGoodLabel } from "../utils/trashLabels";

const showToast = vi.fn();
vi.mock("../hooks/useToast", () => ({ useToast: () => ({ showToast }) }));

const contents = {
  retentionDays: 30,
  entries: [
    {
      id: 1,
      title: "A walk",
      preview: "by the river",
      mood_score: 4,
      has_image: 0,
      has_audio: 0,
      created_at: "2026-10-01T09:00:00Z",
      deleted_at: "2026-10-10T09:00:00Z",
      days_left: 21,
    },
    {
      id: 2,
      title: null,
      preview: "no title here",
      mood_score: null,
      has_image: 0,
      has_audio: 0,
      created_at: "2026-10-02T09:00:00Z",
      deleted_at: "2026-10-18T09:00:00Z",
      days_left: 1,
    },
  ],
  goals: [
    {
      id: 7,
      title: "Run 10 km",
      description: null,
      current_value: 3,
      target_value: 10,
      unit: "km",
      is_completed: 0,
      created_at: "2026-09-01T09:00:00Z",
      deleted_at: "2026-10-17T09:00:00Z",
      days_left: 29,
      log_count: 5,
    },
  ],
};

let progressHandler: (p: { done: number; total: number }) => void;
const invoke = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockImplementation(async (channel: string) => {
    if (channel === "trash:list") return contents;
    if (channel === "trash:restore") return { entries: 1, goals: 0 };
    return {
      entries: 1,
      goals: 0,
      files: 0,
      filesPending: 0,
    };
  });
  window.electron = {
    ipcRenderer: {
      invoke,
      on: (channel: string, fn: typeof progressHandler) => {
        if (channel === "trash:progress") progressHandler = fn;
        return () => {};
      },
    },
  } as unknown as typeof window.electron;
});
afterEach(cleanup);

const mount = async () => {
  render(
    <MemoryRouter>
      <Trash />
    </MemoryRouter>,
  );
  await act(async () => {});
};

describe("labels", () => {
  it("the chip reads naturally", () => {
    expect(goneForGoodLabel(21)).toBe("Gone for good in 21 days");
    expect(goneForGoodLabel(1)).toBe("Gone for good in 1 day");
    expect(goneForGoodLabel(0)).toBe("Gone for good today");
  });

  it("says how long ago something was deleted", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    expect(deletedAgoLabel("2026-10-18T09:00:00Z", now)).toBe("deleted today");
    expect(deletedAgoLabel("2026-10-17T09:00:00Z", now)).toBe(
      "deleted yesterday",
    );
    expect(deletedAgoLabel("2026-10-06T09:00:00Z", now)).toBe(
      "deleted 12 days ago",
    );
  });
});

const hold = async (button: HTMLElement) => {
  vi.useFakeTimers();
  fireEvent.pointerDown(button);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1600);
  });
  vi.useRealTimers();
};

describe("Trash page", () => {
  it("lists entries and goals with their chips, dates and meta", async () => {
    await mount();
    expect(screen.getByText("A walk")).toBeInTheDocument();
    expect(screen.getByText(/^Untitled · /)).toBeInTheDocument();
    expect(screen.getByText("Run 10 km")).toBeInTheDocument();
    expect(
      screen.getAllByTestId("days-left").map((n) => n.textContent),
    ).toEqual([
      "Gone for good in 21 days",
      "Gone for good in 1 day",
      "Gone for good in 29 days",
    ]);
    expect(screen.getByText(/Goal · deleted .* · 5 check-ins/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Journal/ })).toBeInTheDocument();
  });

  it("marks what is going soon differently from what is not", async () => {
    await mount();
    const [far, soon] = screen.getAllByTestId("days-left");
    expect(far.className).not.toBe(soon.className);
  });

  it("says when the trash is empty", async () => {
    invoke.mockImplementation(async () => ({
      retentionDays: 30,
      entries: [],
      goals: [],
    }));
    await mount();
    expect(screen.getByText("The trash is empty")).toBeInTheDocument();
    expect(screen.getByText("Empty trash…")).toBeDisabled();
  });

  it("restores one row with its own button", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Restore A walk"));
    });
    expect(invoke).toHaveBeenCalledWith("trash:restore", {
      entryIds: [1],
      goalIds: [],
    });
    expect(showToast).toHaveBeenCalledWith("Restored 1 item(s)", "success");
  });

  it("restores exactly the selected items", async () => {
    await mount();
    expect(screen.queryByText("Restore selected")).toBeNull();
    fireEvent.click(screen.getByLabelText("Select A walk"));
    fireEvent.click(screen.getByLabelText("Select goal Run 10 km"));
    expect(screen.getByRole("status")).toHaveTextContent("2 selected");
    await act(async () => {
      fireEvent.click(screen.getByText("Restore selected"));
    });
    expect(invoke).toHaveBeenCalledWith("trash:restore", {
      entryIds: [1],
      goalIds: [7],
    });
  });

  it("asks before deleting for good, says what that means, and needs a hold", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Delete A walk forever"));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("cannot be undone");
    expect(dialog).toHaveTextContent("Backups made earlier");
    const holdButton = within(dialog).getByRole("button", {
      name: /hold to delete forever/i,
    });
    fireEvent.click(holdButton); // a plain click does nothing
    expect(invoke).not.toHaveBeenCalledWith(
      "trash:delete-forever",
      expect.anything(),
    );

    fireEvent.click(within(dialog).getByText("Cancel"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith(
      "trash:delete-forever",
      expect.anything(),
    );
  });

  it("deletes that row for good once held", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Delete A walk forever"));
    await hold(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /hold to delete forever/i,
      }),
    );
    expect(invoke).toHaveBeenCalledWith("trash:delete-forever", {
      entryIds: [1],
      goalIds: [],
    });
  });

  it("deletes the selection for good once held", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Select A walk"));
    fireEvent.click(screen.getByText("Delete selected forever"));
    await hold(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /hold to delete forever/i,
      }),
    );
    expect(invoke).toHaveBeenCalledWith("trash:delete-forever", {
      entryIds: [1],
      goalIds: [],
    });
  });

  it("empties the whole trash only after a hold, with progress", async () => {
    let finish!: () => void;
    invoke.mockImplementation(async (channel: string) => {
      if (channel === "trash:list") return contents;
      if (channel === "trash:empty") {
        await new Promise<void>((r) => (finish = r));
        return {
          entries: 2,
          goals: 1,
          files: 0,
          filesPending: 0,
        };
      }
      return {};
    });
    await mount();
    fireEvent.click(screen.getByText("Empty trash…"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("all 3 item(s)");
    expect(invoke).not.toHaveBeenCalledWith("trash:empty");

    await hold(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /hold to empty trash/i,
      }),
    );
    expect(invoke).toHaveBeenCalledWith("trash:empty");
    act(() => progressHandler({ done: 2, total: 3 }));
    expect(screen.getByRole("status")).toHaveTextContent("2 of 3");
    await act(async () => finish());
  });
});
