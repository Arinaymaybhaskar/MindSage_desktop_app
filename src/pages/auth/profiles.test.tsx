import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Profiles from "./profiles";

const listProfiles = vi.fn();
const loginCall = vi.fn();
const authLogin = vi.fn();

vi.mock("../../api/authService", () => ({
  authService: {
    listProfiles: () => listProfiles(),
    login: (...args: unknown[]) => loginCall(...args),
  },
}));
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ login: authLogin }),
}));

const PROFILES = [
  {
    id: 1,
    username: "ada",
    full_name: "Ada Lovelace",
    avatar: "data:image/png;base64,AAAA",
  },
  { id: 2, username: "grace", full_name: null, avatar: null },
];

function renderAt(state?: { select: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/profiles", state }]}>
      <Routes>
        <Route path="/profiles" element={<Profiles />} />
        <Route path="/" element={<div>home</div>} />
        <Route path="/register" element={<div>register page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listProfiles.mockReset().mockResolvedValue(PROFILES);
  loginCall.mockReset();
  authLogin.mockReset();
});

afterEach(cleanup);

describe("Profiles picker", () => {
  it("shows every profile with its picture or initials, and an add tile", async () => {
    renderAt();
    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("@ada")).toBeTruthy();
    expect(screen.getByText("grace")).toBeTruthy();
    // Grace has no picture, so her initial stands in.
    expect(screen.getByText("G")).toBeTruthy();
    expect(document.querySelector('img[src^="data:image/png"]')).toBeTruthy();

    fireEvent.click(screen.getByText("Add new user"));
    expect(await screen.findByText("register page")).toBeTruthy();
  });

  it("asks for the chosen profile's password, then signs in", async () => {
    loginCall.mockResolvedValue({ userInfo: { username: "ada" } });
    renderAt();
    fireEvent.click(await screen.findByText("Ada Lovelace"));

    expect(screen.getByText("Welcome back, Ada Lovelace")).toBeTruthy();
    fireEvent.change(await screen.findByPlaceholderText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByLabelText("Keep me signed in"));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByText("home");
    expect(loginCall).toHaveBeenCalledWith({
      identifier: "ada",
      password: "secret",
      rememberMe: true,
    });
    expect(authLogin).toHaveBeenCalledWith({ username: "ada" });
  });

  it("says so when the password is wrong, and stays on the profile", async () => {
    loginCall.mockRejectedValue(new Error("Incorrect password"));
    renderAt();
    fireEvent.click(await screen.findByText("grace"));
    fireEvent.change(await screen.findByPlaceholderText("Password"), {
      target: { value: "nope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("That password isn't right. Try again."),
    ).toBeTruthy();
    expect(screen.getByText("Welcome back, grace")).toBeTruthy();
    expect(authLogin).not.toHaveBeenCalled();
  });

  it("goes back to the grid", async () => {
    renderAt();
    fireEvent.click(await screen.findByText("grace"));
    fireEvent.click(await screen.findByText("Not you? Choose another profile"));
    await waitFor(() =>
      expect(screen.getByText("Who's journaling?")).toBeTruthy(),
    );
  });

  it("opens straight on a profile that was just registered", async () => {
    renderAt({ select: "grace" });
    expect(await screen.findByText("Welcome back, grace")).toBeTruthy();
  });

  it("offers only the add tile when there are no profiles", async () => {
    listProfiles.mockResolvedValue([]);
    renderAt();
    expect(
      await screen.findByText(
        "No profiles yet. Add one to start your journal.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Add new user")).toBeTruthy();
  });
});
