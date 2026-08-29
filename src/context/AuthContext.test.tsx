import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "../hooks/useAuth";

const USER = {
  username: "ada",
  email: "ada@example.com",
  created_at: "2026-01-01",
  full_name: "Ada Lovelace",
  timezone: "UTC",
};

let auth: ReturnType<typeof useAuth>;

function Probe() {
  auth = useAuth();
  return <span data-testid="token">{auth.accessToken ?? "none"}</span>;
}

describe("AuthProvider logout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("resets the session state, not just storage", () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    act(() => auth.login("token-abc", USER));
    expect(screen.getByTestId("token").textContent).toBe("token-abc");

    act(() => auth.logout());

    // PrivateRoute reads the context, so this is what actually signs out.
    expect(auth.accessToken).toBeNull();
    expect(auth.user).toBeNull();
    expect(screen.getByTestId("token").textContent).toBe("none");
  });

  it("removes the auth keys and leaves everything else alone", () => {
    localStorage.setItem("authMode", "offline");
    localStorage.setItem("colorTheme", "Sunset");
    localStorage.setItem("zoom_scale", "1.25");
    localStorage.setItem("setup_complete", "true");
    localStorage.setItem("path_on_titlebar", "false");
    localStorage.setItem("draft-journal", "an unsaved entry");

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    act(() => auth.login("token-abc", USER));
    act(() => auth.logout());

    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("userInfo")).toBeNull();
    expect(localStorage.getItem("authMode")).toBeNull();

    expect(localStorage.getItem("colorTheme")).toBe("Sunset");
    expect(localStorage.getItem("zoom_scale")).toBe("1.25");
    expect(localStorage.getItem("setup_complete")).toBe("true");
    expect(localStorage.getItem("path_on_titlebar")).toBe("false");
    expect(localStorage.getItem("draft-journal")).toBe("an unsaved entry");
  });

  it("keeps a stable logout identity across renders", () => {
    const { rerender } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    const first = auth.logout;
    rerender(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(auth.logout).toBe(first);
  });
});
