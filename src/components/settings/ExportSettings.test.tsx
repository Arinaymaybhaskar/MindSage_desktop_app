import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExportSettings from "./ExportSettings";

const lastImport = vi.fn();
const undoImport = vi.fn();

vi.mock("../../api/portabilityService", () => ({
  errorText: (err: unknown) => (err instanceof Error ? err.message : ""),
  portabilityService: {
    lastImport: () => lastImport(),
    undoImport: () => undoImport(),
  },
}));

const LAST = {
  at: "2026-10-20T10:00:00Z",
  source: "Day One",
  count: 12,
  edited: false,
};

beforeEach(() => {
  lastImport.mockReset();
  undoImport.mockReset();
});
afterEach(cleanup);

describe("Import & Export: last import (KAN-74)", () => {
  it("shows the last import at the top and undoes it", async () => {
    lastImport.mockResolvedValue(LAST);
    undoImport.mockResolvedValue({ removed: 12 });
    render(<ExportSettings />);

    expect(await screen.findByText("Last import")).toBeTruthy();
    expect(screen.getByText(/12 entries from Day One/)).toBeTruthy();
    expect(
      screen.getByText("Only your latest import can be undone."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      await screen.findByText("Removed the 12 imported entries."),
    ).toBeTruthy();
    expect(screen.queryByText("Last import")).toBeNull();
  });

  it("turns Undo off once an imported entry was edited", async () => {
    lastImport.mockResolvedValue({ ...LAST, edited: true });
    render(<ExportSettings />);

    expect(await screen.findByText(/Undo is off/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Undo" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows nothing when there is no import to undo", async () => {
    lastImport.mockResolvedValue(null);
    render(<ExportSettings />);
    await screen.findByText("Import data");
    expect(screen.queryByText("Last import")).toBeNull();
  });
});
