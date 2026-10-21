import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";

const pickImport = vi.fn();
const commitImport = vi.fn();

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { username: "ada" }, checking: false }),
}));
vi.mock("../api/setupService", () => ({
  setupService: {
    getStatus: vi.fn().mockResolvedValue({
      ollamaInstalled: true,
      ollamaRunning: true,
      embeddingReady: true,
      generationReady: true,
    }),
    onProgress: () => () => {},
  },
  appPrefsService: { get: vi.fn().mockResolvedValue(null) },
}));
vi.mock("../api/portabilityService", async (orig) => ({
  ...(await orig()),
  portabilityService: {
    pickImport: () => pickImport(),
    commitImport: () => commitImport(),
  },
}));

afterEach(cleanup);

const renderSetup = async () => {
  await act(async () => {
    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>,
    );
  });
};

const choose = () =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Choose a file/ }));
  });

describe("Your entries step (KAN-80)", () => {
  it("lists the supported formats when the file is not one", async () => {
    pickImport.mockResolvedValue({
      canceled: false,
      format: null,
      warnings: ["Supported: a MindSage backup, Day One JSON, Journey."],
    });
    await renderSetup();
    await choose();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Supported: a MindSage backup, Day One JSON",
    );
  });

  it("lets setup finish while a large import is still running", async () => {
    pickImport.mockResolvedValue({
      canceled: false,
      format: "dayone",
      formatName: "Day One",
      toImport: 5000,
    });
    commitImport.mockReturnValue(new Promise(() => {}));
    await renderSetup();
    await choose();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Import" }));
    });
    expect(screen.getByText(/in the background/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Finish/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Skip for now/ })).toBeEnabled();
  });
});
