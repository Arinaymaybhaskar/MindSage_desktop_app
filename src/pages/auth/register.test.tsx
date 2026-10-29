import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Register from "./register";

const checkUsername = vi.fn();
const register = vi.fn();

vi.mock("../../api/authService", () => ({
  authService: {
    checkUsername: (name: string) => checkUsername(name),
    register: (details: unknown) => register(details),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/profiles" element={<div>profiles page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  checkUsername.mockReset().mockResolvedValue({ available: true });
  register.mockReset().mockResolvedValue({ user: { id: 2, username: "ada" } });
});

afterEach(cleanup);

describe("Register", () => {
  it("asks for no email or full name", () => {
    renderPage();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.queryByLabelText(/full name/i)).toBeNull();
    expect(screen.getByLabelText("Photo (optional)")).toBeTruthy();
  });

  it("says inline when the profile name is already used", async () => {
    checkUsername.mockResolvedValue({ available: false });
    renderPage();
    type("Profile name", "ada");
    expect(
      await screen.findByText("This name is already used on this PC."),
    ).toBeTruthy();
    expect(checkUsername).toHaveBeenCalledWith("ada");
  });

  it("sends an emoji or non-Latin name as typed and shows the rule's reason", async () => {
    checkUsername.mockResolvedValue({
      available: false,
      error: "Profile name can use letters, numbers, emoji, spaces and _ . ' -",
    });
    renderPage();
    type("Profile name", "मीरा 🌙/");
    expect(await screen.findByText(/can use letters/)).toBeTruthy();
    expect(checkUsername).toHaveBeenCalledWith("मीरा 🌙/");
  });

  it("blocks a weak password inline, then creates the profile", async () => {
    renderPage();
    type("Profile name", "ada");
    await screen.findByText("This name is free.");
    const submit = screen.getByRole("button", { name: "Create profile" });

    type("Password", "password");
    expect(
      await screen.findByText(/too easy to guess/, undefined, {
        timeout: 5000,
      }),
    ).toBeTruthy();
    expect(submit).toHaveProperty("disabled", true);

    type("Password", "violet-harbour-58-quietly");
    await waitFor(() => expect(submit).toHaveProperty("disabled", false));
    fireEvent.click(submit);

    expect(await screen.findByText("profiles page")).toBeTruthy();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "ada",
        password: "violet-harbour-58-quietly",
        photo: undefined,
      }),
    );
    expect(register.mock.calls[0][0]).not.toHaveProperty("email");
  });
});
