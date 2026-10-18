import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UpdateBar from "./UpdateBar";
import { registerUnsavedWork, UNSAVED_REASON } from "../utils/unsavedWork";

type Handler = (payload: unknown) => void;
let handlers: Record<string, Handler>;
let initial: unknown;
const invoke = vi.fn();

const emit = (channel: string, payload: unknown) =>
  act(() => handlers[channel](payload));

beforeEach(() => {
  handlers = {};
  initial = { phase: "idle" };
  invoke.mockReset();
  invoke.mockImplementation(async (channel: string) => {
    if (channel === "update:get-state") return initial;
    if (channel === "update:install") return { success: true };
    return undefined;
  });
  window.electron = {
    ipcRenderer: {
      invoke,
      on: (channel: string, fn: Handler) => {
        handlers[channel] = fn;
        return () => delete handlers[channel];
      },
    },
  } as unknown as typeof window.electron;
});
afterEach(cleanup);

const mount = async () => {
  render(<UpdateBar />);
  await act(async () => {}); // let the initial get-state settle
};

describe("UpdateBar", () => {
  it("shows nothing until an update exists (checks are opt-in)", async () => {
    await mount();
    expect(screen.queryByRole("status")).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith("update:check");
  });

  it("follows available -> progress -> downloaded", async () => {
    await mount();
    emit("update:available", { version: "1.4.0" });
    expect(screen.getByRole("status")).toHaveTextContent("Downloading 1.4.0…");
    emit("update:progress", { percent: 42 });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Downloading 1.4.0 (42%)",
    );
    emit("update:downloaded", { version: "1.4.0" });
    expect(screen.getByText("Restart to update")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "MindSage 1.4.0 is ready to install.",
    );
  });

  it("keeps offering the downloaded update if a later check fails", async () => {
    await mount();
    emit("update:downloaded", { version: "1.4.0" });
    emit("update:error", { message: "late failure" });
    emit("update:available", { version: "1.5.0" });
    expect(screen.getByText("Restart to update")).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent("late failure");
  });

  it("picks up an update that finished before the window mounted", async () => {
    initial = { phase: "ready", version: "1.4.0" };
    await mount();
    expect(screen.getByText("Restart to update")).toBeInTheDocument();
  });

  it("says a failed download will be retried later, without a Restart button", async () => {
    await mount();
    emit("update:error", { message: "The update could not be downloaded." });
    expect(screen.getByRole("status")).toHaveTextContent(
      "The update could not be downloaded.",
    );
    expect(screen.queryByText("Restart to update")).toBeNull();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("never restarts by itself", async () => {
    await mount();
    emit("update:downloaded", { version: "1.4.0" });
    await act(async () => {});
    expect(invoke).not.toHaveBeenCalledWith("update:install");
  });

  it("saves drafts, then restarts when nothing is mid-edit", async () => {
    const flush = vi.fn();
    const off = registerUnsavedWork({ flush, isDirty: () => false });
    await mount();
    emit("update:downloaded", { version: "1.4.0" });
    await act(async () => {
      fireEvent.click(screen.getByText("Restart to update"));
    });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("update:install");
    off();
  });

  it("refuses to restart while an entry has unsaved changes", async () => {
    const off = registerUnsavedWork({ isDirty: () => true });
    await mount();
    emit("update:downloaded", { version: "1.4.0" });
    await act(async () => {
      fireEvent.click(screen.getByText("Restart to update"));
    });
    expect(screen.getByTestId("update-notice")).toHaveTextContent(
      UNSAVED_REASON,
    );
    expect(invoke).not.toHaveBeenCalledWith("update:install");
    off();
  });

  it("reports it when the main process refuses the install", async () => {
    invoke.mockImplementation(async (channel: string) =>
      channel === "update:install"
        ? { success: false, error: "No update has been downloaded yet" }
        : { phase: "idle" },
    );
    await mount();
    emit("update:downloaded", { version: "1.4.0" });
    await act(async () => {
      fireEvent.click(screen.getByText("Restart to update"));
    });
    expect(screen.getByTestId("update-notice")).toHaveTextContent(
      "No update has been downloaded yet",
    );
    expect(screen.getByText("Restart to update")).not.toBeDisabled();
  });
});
