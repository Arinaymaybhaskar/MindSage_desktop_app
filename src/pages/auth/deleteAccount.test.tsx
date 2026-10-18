import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteAccount } from "./deleteAccount";

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
const pickExportPath = vi.fn();
const exportJournal = vi.fn();
vi.mock("../../api/userService", () => ({
  userService: {
    deleteSummary: (...a: unknown[]) => deleteSummary(...a),
    deleteAccount: (...a: unknown[]) => deleteAccount(...a),
  },
}));
vi.mock("../../api/portabilityService", () => ({
  portabilityService: {
    pickExportPath: (...a: unknown[]) => pickExportPath(...a),
    exportJournal: (...a: unknown[]) => exportJournal(...a),
  },
}));
const logout = vi.fn();
vi.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ logout }) }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <DeleteAccount />
    </MemoryRouter>,
  );

const click = (name: RegExp | string) =>
  fireEvent.click(screen.getByRole("button", { name }));

async function toPassword() {
  renderPage();
  await screen.findByText(/3 journal entries/);
  click(/delete without a backup/i);
  click("Continue");
}

describe("DeleteAccount", () => {
  beforeEach(() => {
    deleteSummary.mockResolvedValue(summary);
    deleteAccount.mockReset();
    pickExportPath.mockReset();
    exportJournal.mockReset();
  });
  afterEach(cleanup);

  it("shows what will be deleted and blocks Continue until a backup decision", async () => {
    renderPage();
    await screen.findByText(/3 journal entries/);
    expect(screen.getByText(/1 entry in the Trash/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("a failed backup blocks and says nothing was deleted", async () => {
    pickExportPath.mockResolvedValue("C:/x.zip");
    exportJournal.mockRejectedValue(new Error("disk full"));
    renderPage();
    await screen.findByText(/3 journal entries/);
    click(/save a backup/i);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /disk full.*Nothing has been deleted/s,
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("a cancelled save dialog leaves the decision open", async () => {
    pickExportPath.mockResolvedValue(null);
    renderPage();
    await screen.findByText(/3 journal entries/);
    click(/save a backup/i);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /save a backup/i }),
      ).toBeEnabled(),
    );
    expect(exportJournal).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("a saved backup unlocks Continue", async () => {
    pickExportPath.mockResolvedValue("C:/x.zip");
    exportJournal.mockResolvedValue({ success: true, count: 3 });
    renderPage();
    await screen.findByText(/3 journal entries/);
    click(/save a backup/i);
    await screen.findByText(/Backup saved \(3 entries\)/);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("requires a password before the hold step", async () => {
    await toPassword();
    fireEvent.submit(
      screen.getByLabelText(/confirm your password/i).closest("form")!,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /enter your password/i,
    );
    expect(screen.queryByText("Last step")).not.toBeInTheDocument();
  });

  it("deletes only after the hold, sending the password", async () => {
    deleteAccount.mockResolvedValue({
      lastProfile: false,
      backupsRemoved: false,
    });
    await toPassword();
    fireEvent.change(screen.getByLabelText(/confirm your password/i), {
      target: { value: "secret" },
    });
    click("Continue");
    await screen.findByText("Last step");
    vi.useFakeTimers();
    const hold = screen.getByRole("button", { name: /hold to delete/i });
    fireEvent.pointerDown(hold);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(deleteAccount).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    vi.useRealTimers();
    expect(deleteAccount).toHaveBeenCalledWith({ password: "secret" });
    expect(
      await screen.findByText("Your profile was deleted"),
    ).toBeInTheDocument();
  });

  it("a wrong password returns to the password step with the message", async () => {
    deleteAccount.mockRejectedValue(
      new Error(
        "Error invoking remote method 'user:delete-account': Error: Incorrect password. 4 attempts left.",
      ),
    );
    await toPassword();
    fireEvent.change(screen.getByLabelText(/confirm your password/i), {
      target: { value: "nope" },
    });
    click("Continue");
    await screen.findByText("Last step");
    vi.useFakeTimers();
    const hold = screen.getByRole("button", { name: /hold to delete/i });
    fireEvent.pointerDown(hold);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    vi.useRealTimers();
    expect(deleteAccount).toHaveBeenCalledWith({ password: "nope" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect password. 4 attempts left.",
    );
    expect(screen.getByLabelText(/confirm your password/i)).toHaveValue("");
  });
});
