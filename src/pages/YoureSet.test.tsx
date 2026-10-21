import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import YoureSet from "./YoureSet";

const updateSettings = vi.fn().mockResolvedValue({});
const setFeature = vi.fn().mockResolvedValue({});
const navigate = vi.fn();

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));
vi.mock("../api/userService", () => ({
  userService: {
    getSettings: () =>
      Promise.resolve({ journal_reminder: 0, reminder_time: "20:00" }),
    updateSettings: (p: unknown) => updateSettings(p),
  },
}));
vi.mock("../api/aiFeaturesService", () => ({
  aiFeaturesService: {
    get: () => Promise.resolve({ suggestions: true }),
    set: (...a: unknown[]) => setFeature(...a),
  },
}));
vi.mock("../api/helloService", () => ({
  helloAvailable: () => Promise.resolve(false),
}));

afterEach(cleanup);

describe("You're set screen (KAN-81)", () => {
  it("saves each toggle at once, shows the time only when on, hides Hello", async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <YoureSet />
        </MemoryRouter>,
      );
    });
    expect(screen.queryByLabelText("Reminder time")).toBeNull();
    expect(screen.queryByText(/Windows Hello/)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Remind me/));
    });
    expect(updateSettings).toHaveBeenCalledWith({ journal_reminder: true });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Reminder time"), {
        target: { value: "07:30" },
      });
    });
    expect(updateSettings).toHaveBeenCalledWith({ reminder_time: "07:30" });

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Suggest prompts/));
    });
    expect(setFeature).toHaveBeenCalledWith("suggestions", false);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });
});
