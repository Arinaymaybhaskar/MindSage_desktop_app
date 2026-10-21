import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeleteProfileCard from "./DeleteProfileCard";
import { deleteProfileDialog } from "../../utils/deleteProfileDialog";

const pickExportPath = vi.fn();
const exportJournal = vi.fn();
vi.mock("../../api/portabilityService", () => ({
  portabilityService: {
    pickExportPath: (...a: unknown[]) => pickExportPath(...a),
    exportJournal: (...a: unknown[]) => exportJournal(...a),
  },
}));

const click = (name: RegExp | string) =>
  fireEvent.click(screen.getByRole("button", { name }));

describe("DeleteProfileCard", () => {
  beforeEach(() => {
    pickExportPath.mockReset();
    exportJournal.mockReset();
  });
  afterEach(() => {
    cleanup();
    act(() => deleteProfileDialog.close());
  });

  it("opens the dialog for this profile", () => {
    render(<DeleteProfileCard name="Meera" />);
    click(/delete profile…/i);
    expect(deleteProfileDialog.get()).toMatchObject({
      open: true,
      name: "Meera",
      backupPath: null,
    });
  });

  it("a saved backup is passed on so the dialog can mention it", async () => {
    pickExportPath.mockResolvedValue("C:/Docs/b.mindsage");
    exportJournal.mockResolvedValue({ success: true, count: 3 });
    render(<DeleteProfileCard name="Meera" />);
    click(/make a backup first/i);
    expect(await screen.findByText(/Backup saved \(3 entries\)/)).toBeTruthy();
    click(/delete profile…/i);
    expect(deleteProfileDialog.get().backupPath).toBe("C:/Docs/b.mindsage");
  });

  it("a failed backup blocks deleting until it works or is skipped", async () => {
    pickExportPath.mockResolvedValue("C:/x.zip");
    exportJournal.mockRejectedValue(new Error("disk full"));
    render(<DeleteProfileCard name="Meera" />);
    click(/make a backup first/i);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /disk full.*Nothing has been deleted/s,
    );
    expect(
      screen.getByRole("button", { name: /delete profile…/i }),
    ).toBeDisabled();
    click(/go on without a backup/i);
    expect(
      screen.getByRole("button", { name: /delete profile…/i }),
    ).toBeEnabled();
  });

  it("a cancelled save dialog changes nothing", async () => {
    pickExportPath.mockResolvedValue(null);
    render(<DeleteProfileCard name="Meera" />);
    click(/make a backup first/i);
    await act(async () => {});
    expect(exportJournal).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /delete profile…/i }),
    ).toBeEnabled();
  });
});
