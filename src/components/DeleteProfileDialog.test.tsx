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
import DeleteProfileDialog from "./DeleteProfileDialog";
import { deleteProfileDialog } from "../utils/deleteProfileDialog";

const summary = {
  entries: 3,
  trashedEntries: 1,
  goals: 2,
  trashedGoals: 0,
  photos: 4,
  recordings: 1,
  chats: 2,
  otherProfiles: 1,
  mediaBytes: 0,
};
const deleteSummary = vi.fn();
const deleteAccount = vi.fn();
vi.mock("../api/userService", () => ({
  userService: {
    deleteSummary: (...a: unknown[]) => deleteSummary(...a),
    deleteAccount: (...a: unknown[]) => deleteAccount(...a),
  },
}));
const logout = vi.fn();
const USER = { id: 1, username: "meera" };
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: USER, logout }),
}));

const renderDialog = () =>
  render(
    <MemoryRouter>
      <DeleteProfileDialog />
    </MemoryRouter>,
  );

const open = async (backupPath: string | null = null) => {
  renderDialog();
  act(() => deleteProfileDialog.open("Meera", backupPath));
  await screen.findByText(/The journal:/);
};

const hold = async (button: HTMLElement, ms = 1600) => {
  vi.useFakeTimers();
  fireEvent.pointerDown(button);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  vi.useRealTimers();
};

const typePassword = (value: string) =>
  fireEvent.change(screen.getByLabelText(/password to confirm/i), {
    target: { value },
  });

describe("DeleteProfileDialog", () => {
  beforeEach(() => {
    deleteSummary.mockResolvedValue(summary);
    deleteAccount.mockReset();
    logout.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    act(() => deleteProfileDialog.close());
  });

  it("renders nothing until it is opened", () => {
    renderDialog();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists what goes and what stays, by name", async () => {
    await open("C:/Docs/backup.mindsage");
    expect(
      screen.getByRole("heading", { name: "Delete Meera's profile?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /The journal: 4 entries, 4 photos, 1 voice note and 2 Ask conversations/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 goals and their progress/)).toBeInTheDocument();
    expect(
      screen.getByText("The media folder and the search index"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Exports and backups you saved elsewhere, like C:\/Docs/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Recovery tools can sometimes/)).toBeTruthy();
  });

  it("says the safety copies are replaced when other profiles exist", async () => {
    await open();
    expect(
      screen.getByText(/replaced by one new copy made after the delete/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/this is the last profile here/)).toBeNull();
  });

  it("lists the safety copies as removed for the last profile", async () => {
    deleteSummary.mockResolvedValue({ ...summary, otherProfiles: 0 });
    await open();
    expect(screen.getByText(/this is the last profile here/)).toBeTruthy();
  });

  it("Hold to delete is off until the password is typed", async () => {
    await open();
    const holdButton = screen.getByRole("button", { name: /hold to delete/i });
    expect(holdButton).toBeDisabled();
    typePassword("secret");
    expect(holdButton).toBeEnabled();
  });

  it("a plain click or a short hold deletes nothing", async () => {
    await open();
    typePassword("secret");
    const holdButton = screen.getByRole("button", { name: /hold to delete/i });
    fireEvent.click(holdButton);
    await hold(holdButton, 800);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("holding Enter in the password field holds the button; a short press deletes nothing (KAN-384)", async () => {
    deleteAccount.mockResolvedValue({ lastProfile: false, filesPending: 0 });
    await open();
    const field = screen.getByLabelText(/password to confirm/i);
    fireEvent.keyDown(field, { key: "Enter" }); // empty password: nothing
    fireEvent.keyUp(field, { key: "Enter" });
    typePassword("secret");
    vi.useFakeTimers();
    fireEvent.keyDown(field, { key: "Enter" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    fireEvent.keyUp(field, { key: "Enter" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(deleteAccount).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(
      screen.getByRole("button", { name: /keep holding/i }),
    ).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    vi.useRealTimers();
    expect(deleteAccount).toHaveBeenCalledWith({ password: "secret" });
  });

  it("deletes after the hold, sending the password, and shows the done screen", async () => {
    deleteAccount.mockResolvedValue({
      lastProfile: false,
      backupsRemoved: false,
      backupsReplaced: true,
      filesPending: 2,
    });
    await open();
    typePassword("secret");
    await hold(screen.getByRole("button", { name: /hold to delete/i }));
    expect(deleteAccount).toHaveBeenCalledWith({ password: "secret" });
    expect(
      await screen.findByText("Your profile was deleted"),
    ).toBeInTheDocument();
    expect(screen.getByText(/were replaced by a new one/)).toBeInTheDocument();
    expect(
      screen.getByText(/2 files are in use by another program/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/may stay readable/)).toBeNull();
  });

  it("says the text may stay in the database file when the WAL could not be folded back", async () => {
    deleteAccount.mockResolvedValue({
      lastProfile: false,
      backupsRemoved: false,
      backupsReplaced: true,
      filesPending: 0,
      walFolded: false,
    });
    await open();
    typePassword("secret");
    await hold(screen.getByRole("button", { name: /hold to delete/i }));
    expect(
      await screen.findByText(/may stay readable inside the database file/),
    ).toBeInTheDocument();
  });

  it("puts back the settings the delete wiped, without the display cache, before Choose a profile (KAN-376)", async () => {
    localStorage.clear();
    localStorage.setItem("userInfo", '{"username":"meera"}');
    localStorage.setItem("theme", "dark");
    deleteAccount.mockImplementation(async () => {
      localStorage.clear(); // the main process wipes the store
      return {
        lastProfile: false,
        backupsRemoved: false,
        filesPending: 0,
        localStorageErased: true,
      };
    });
    await open();
    typePassword("secret");
    await hold(screen.getByRole("button", { name: /hold to delete/i }));
    await screen.findByText("Your profile was deleted");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(localStorage.getItem("userInfo")).toBeNull();
    expect(screen.queryByText(/could not wipe its window storage/)).toBeNull();
  });

  it("never puts back the deleted profile's drafts, keeps another profile's (KAN-380)", async () => {
    localStorage.clear();
    localStorage.setItem("draft:1:journal", "deleted profile text");
    localStorage.setItem("draft:1:quick-capture", "deleted profile quick");
    localStorage.setItem("draft:2:journal", "other profile text");
    localStorage.setItem("draft-journal", "old unscoped draft");
    deleteAccount.mockImplementation(async () => {
      localStorage.clear(); // the main process wipes the store
      return {
        lastProfile: false,
        backupsRemoved: false,
        filesPending: 0,
        localStorageErased: true,
      };
    });
    await open();
    typePassword("secret");
    await hold(screen.getByRole("button", { name: /hold to delete/i }));
    await screen.findByText("Your profile was deleted");
    expect(Object.keys(localStorage)).toEqual(["draft:2:journal"]);
  });

  it("says the name may stay on disk when the window storage could not be wiped", async () => {
    deleteAccount.mockResolvedValue({
      lastProfile: false,
      backupsRemoved: false,
      filesPending: 0,
      localStorageErased: false,
    });
    await open();
    typePassword("secret");
    await hold(screen.getByRole("button", { name: /hold to delete/i }));
    expect(
      await screen.findByText(/name and email may stay readable/),
    ).toBeInTheDocument();
  });

  it("a wrong password stays in the dialog with the message and clears the field", async () => {
    deleteAccount.mockRejectedValue(
      new Error(
        "Error invoking remote method 'user:delete-account': Error: Incorrect password. 4 attempts left.",
      ),
    );
    await open();
    typePassword("nope");
    await hold(screen.getByRole("button", { name: /hold to delete/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect password. 4 attempts left.",
    );
    expect(screen.getByLabelText(/password to confirm/i)).toHaveValue("");
    expect(screen.queryByText("Your profile was deleted")).toBeNull();
  });

  it("Keep my profile and Escape close it without deleting", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Keep my profile" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => deleteProfileDialog.open("Meera"));
    await screen.findByText(/The journal:/);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("the done screen stays up and Choose a profile signs out", async () => {
    deleteAccount.mockResolvedValue({
      lastProfile: false,
      backupsRemoved: false,
    });
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      configurable: true,
    });
    await open();
    typePassword("secret");
    await hold(screen.getByRole("button", { name: /hold to delete/i }));
    const done = await screen.findByRole("status");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(within(done).getByText("Your profile was deleted")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose a profile" }));
    expect(logout).toHaveBeenCalled();
  });
});
