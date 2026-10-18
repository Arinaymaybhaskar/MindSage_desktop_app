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
import { daysLeftLabel } from "../utils/trashLabels";

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
    return { entries: 1, goals: 0, files: 0, searchCleanupPending: 0 };
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

describe("daysLeftLabel", () => {
  it("reads naturally", () => {
    expect(daysLeftLabel(21)).toBe("21 days left");
    expect(daysLeftLabel(1)).toBe("1 day left");
    expect(daysLeftLabel(0)).toBe("Deleting soon");
  });
});

describe("Trash page", () => {
  it("lists entries and goals with their days-left badges", async () => {
    await mount();
    expect(screen.getByText("A walk")).toBeInTheDocument();
    expect(screen.getByText("Untitled entry")).toBeInTheDocument();
    expect(screen.getByText("Run 10 km")).toBeInTheDocument();
    expect(
      screen.getAllByTestId("days-left").map((n) => n.textContent),
    ).toEqual(["21 days left", "1 day left", "29 days left"]);
  });

  it("says when the trash is empty", async () => {
    invoke.mockImplementation(async () => ({
      retentionDays: 30,
      entries: [],
      goals: [],
    }));
    await mount();
    expect(screen.getByText("The trash is empty")).toBeInTheDocument();
    expect(screen.getByText("Empty trash")).toBeDisabled();
  });

  it("restore and delete are off until something is selected", async () => {
    await mount();
    expect(screen.getByText("Restore").closest("button")).toBeDisabled();
    expect(screen.getByText("Delete forever").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Select A walk"));
    expect(screen.getByText("Restore").closest("button")).toBeEnabled();
  });

  it("restores exactly the selected items", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Select A walk"));
    fireEvent.click(screen.getByLabelText("Select goal Run 10 km"));
    await act(async () => {
      fireEvent.click(screen.getByText("Restore"));
    });
    expect(invoke).toHaveBeenCalledWith("trash:restore", {
      entryIds: [1],
      goalIds: [7],
    });
    expect(showToast).toHaveBeenCalledWith("Restored 1 item(s)", "success");
  });

  it("asks before deleting for good, and says what that means", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Select A walk"));
    fireEvent.click(screen.getByText("Delete forever"));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("cannot be undone");
    expect(dialog).toHaveTextContent("Backups made earlier");
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

  it("deletes the selection for good once confirmed", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Select A walk"));
    fireEvent.click(screen.getByText("Delete forever"));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByText("Delete forever"),
      );
    });
    expect(invoke).toHaveBeenCalledWith("trash:delete-forever", {
      entryIds: [1],
      goalIds: [],
    });
  });

  it("empties the whole trash only after confirming, with progress", async () => {
    let finish!: () => void;
    invoke.mockImplementation(async (channel: string) => {
      if (channel === "trash:list") return contents;
      if (channel === "trash:empty") {
        await new Promise<void>((r) => (finish = r));
        return { entries: 2, goals: 1, files: 0, searchCleanupPending: 0 };
      }
      return {};
    });
    await mount();
    fireEvent.click(screen.getByText("Empty trash"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("all 3 item(s)");
    expect(invoke).not.toHaveBeenCalledWith("trash:empty");

    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByText("Empty trash"),
      );
    });
    expect(invoke).toHaveBeenCalledWith("trash:empty");
    act(() => progressHandler({ done: 2, total: 3 }));
    expect(screen.getByRole("status")).toHaveTextContent("2 of 3");
    await act(async () => finish());
  });

  it("warns when search could not be cleared yet", async () => {
    invoke.mockImplementation(async (channel: string) =>
      channel === "trash:list"
        ? contents
        : { entries: 1, goals: 0, files: 0, searchCleanupPending: 1 },
    );
    await mount();
    fireEvent.click(screen.getByLabelText("Select A walk"));
    fireEvent.click(screen.getByText("Delete forever"));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByText("Delete forever"),
      );
    });
    expect(showToast).toHaveBeenCalledWith(
      "Deleted. Search will finish clearing them when it is running.",
      "success",
    );
  });
});
