import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "../hooks/useAuth";

let auth: ReturnType<typeof useAuth>;

function Probe() {
  auth = useAuth();
  return <span>{auth.accessToken ?? "signed out"}</span>;
}

const user = {
  username: "u",
  email: "u@x",
  created_at: "",
  full_name: "U",
  timezone: "UTC",
};

describe("AuthProvider", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("logout ends the session in state, not just in storage", () => {
    localStorage.setItem("accessToken", "tok");
    localStorage.setItem("userInfo", JSON.stringify(user));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText("tok")).toBeInTheDocument();

    act(() => auth.logout());

    expect(screen.getByText("signed out")).toBeInTheDocument();
    expect(auth.user).toBeNull();
  });

  it("logout keeps the device's settings and drafts", () => {
    localStorage.setItem("accessToken", "tok");
    localStorage.setItem("userInfo", JSON.stringify(user));
    localStorage.setItem("authMode", "offline");
    localStorage.setItem("colorTheme", "{}");
    localStorage.setItem("zoom_scale", "110");
    localStorage.setItem("draft-journal", "{}");
    localStorage.setItem("quick-capture-draft", "{}");
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    act(() => auth.logout());

    expect(Object.keys(localStorage).sort()).toEqual([
      "colorTheme",
      "draft-journal",
      "quick-capture-draft",
      "zoom_scale",
    ]);
  });

  it("follows a login made in another window", () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText("signed out")).toBeInTheDocument();

    localStorage.setItem("accessToken", "from-main-window");
    localStorage.setItem("userInfo", JSON.stringify(user));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "accessToken" }));
    });

    expect(screen.getByText("from-main-window")).toBeInTheDocument();
  });

  it("keeps logout's identity stable across renders", () => {
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
