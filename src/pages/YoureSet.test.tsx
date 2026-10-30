import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import YoureSet from "./YoureSet";

let emit: (p: unknown) => void = () => {};
const navigate = vi.fn();
const pickImport = vi.fn();
const commitImport = vi.fn();

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));
vi.mock("../api/setupService", () => ({
  setupService: {
    onProgress: (cb: (p: unknown) => void) => {
      emit = cb;
      return () => {};
    },
  },
}));

vi.mock("../api/portabilityService", async (orig) => ({
  ...(await orig()),
  portabilityService: {
    pickImport: () => pickImport(),
    commitImport: () => commitImport(),
  },
}));

afterEach(cleanup);

const renderIt = async () => {
  await act(async () => {
    render(
      <MemoryRouter>
        <YoureSet />
      </MemoryRouter>,
    );
  });
};
const choose = () =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Choose a file/ }));
  });

describe("You're set screen (KAN-81)", () => {
  it("has no toggles, shows download progress, one Start writing button (KAN-433)", async () => {
    await renderIt();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/Windows Hello|Pro/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => {
      emit({ phase: "pulling-model", model: "qwen3:4b", percent: 42 });
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Downloading qwen3:4b: 42%",
    );
    await act(async () => {
      emit({ phase: "pulling-model", model: "qwen3:4b", percent: 100 });
    });
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("lists skipped files and offers no Import for an empty one (KAN-488)", async () => {
    pickImport.mockResolvedValue({
      canceled: false,
      format: "csv",
      formatName: "CSV",
      toImport: 0,
      warnings: ["empty.csv is empty, so there is nothing to import"],
    });
    await renderIt();
    await choose();
    expect(screen.getByText(/empty\.csv is empty/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
  });

  it("lists the supported formats when the file is not one (KAN-80)", async () => {
    pickImport.mockResolvedValue({
      canceled: false,
      format: null,
      warnings: ["Supported: a MindSage backup, Day One JSON, Journey."],
    });
    await renderIt();
    await choose();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Supported: a MindSage backup, Day One JSON",
    );
  });

  it("keeps Continue enabled while a large import runs (KAN-436)", async () => {
    pickImport.mockResolvedValue({
      canceled: false,
      format: "dayone",
      formatName: "Day One",
      toImport: 5000,
    });
    commitImport.mockReturnValue(new Promise(() => {}));
    await renderIt();
    expect(screen.getByRole("button", { name: "Start writing" })).toBeEnabled();
    await choose();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Import" }));
    });
    expect(screen.getByText(/in the background/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start writing" })).toBeEnabled();
  });
});
