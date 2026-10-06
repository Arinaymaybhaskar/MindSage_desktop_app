import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "../hooks/useAuth";

const USER = {
  username: "ada",
  email: "ada@example.com",
  created_at: "2026-01-01",
  full_name: "Ada Lovelace",
  timezone: "UTC",
};

/**
 * A stand-in for the main process: it owns the session, as
 * electron/session.js does, and announces changes on "auth:changed".
 */
function fakeMain(initial: typeof USER | null = null) {
  let session = initial;
  const listeners = new Set<() => void>();
  const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === "auth:get-session") return { userInfo: session };
    if (channel === "auth:logout") {
      session = null;
      return { ok: true };
    }
    if (channel === "auth:adopt-legacy-session") {
      session = args[0] === "legacy-jwt" ? USER : null;
      return { userInfo: session };
    }
    throw new Error(`unexpected channel ${channel}`);
  });
  const on = vi.fn((channel: string, cb: () => void) => {
    if (channel !== "auth:changed") return () => {};
    listeners.add(cb);
    return () => listeners.delete(cb);
  });
  // @ts-expect-error minimal stub of the preload bridge for tests
  window.electron = { ipcRenderer: { invoke, on } };
  return {
    invoke,
    /** Another window signed in or out: change the session and announce it. */
    change(next: typeof USER | null) {
      session = next;
      for (const cb of listeners) cb();
    },
  };
}

let auth: ReturnType<typeof useAuth>;

function Probe() {
  auth = useAuth();
  return (
    <span data-testid="user">
      {auth.checking ? "checking" : (auth.user?.username ?? "none")}
    </span>
  );
}

const renderProvider = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

beforeEach(() => {
  localStorage.clear();
});

describe("AuthProvider session", () => {
  it("asks the main process who is signed in", async () => {
    fakeMain(USER);
    renderProvider();
    expect(screen.getByTestId("user").textContent).toBe("checking");
    await waitFor(() =>
      expect(screen.getByTestId("user").textContent).toBe("ada"),
    );
  });

  it("is signed out when the main process has no session", async () => {
    fakeMain(null);
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("user").textContent).toBe("none"),
    );
  });

  it("hands a token from an older version over once, then deletes it", async () => {
    const main = fakeMain(null);
    localStorage.setItem("accessToken", "legacy-jwt");
    localStorage.setItem("authMode", "offline");
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("user").textContent).toBe("ada"),
    );
    expect(main.invoke).toHaveBeenCalledWith(
      "auth:adopt-legacy-session",
      "legacy-jwt",
    );
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("authMode")).toBeNull();
  });
});

describe("AuthProvider logout", () => {
  it("resets the state and tells the main process", async () => {
    const main = fakeMain(USER);
    renderProvider();
    await waitFor(() => expect(auth.user?.username).toBe("ada"));

    await act(() => auth.logout());

    // PrivateRoute reads the context, so this is what actually signs out.
    expect(auth.user).toBeNull();
    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(main.invoke).toHaveBeenCalledWith("auth:logout");
  });

  it("removes the auth keys and leaves everything else alone", async () => {
    fakeMain(USER);
    localStorage.setItem("colorTheme", "Sunset");
    localStorage.setItem("zoom_scale", "1.25");
    localStorage.setItem("setup_complete", "true");
    localStorage.setItem("path_on_titlebar", "false");
    localStorage.setItem("draft-journal", "an unsaved entry");

    renderProvider();
    await waitFor(() =>
      expect(localStorage.getItem("userInfo")).not.toBeNull(),
    );
    await act(() => auth.logout());

    expect(localStorage.getItem("userInfo")).toBeNull();
    expect(localStorage.getItem("colorTheme")).toBe("Sunset");
    expect(localStorage.getItem("zoom_scale")).toBe("1.25");
    expect(localStorage.getItem("setup_complete")).toBe("true");
    expect(localStorage.getItem("path_on_titlebar")).toBe("false");
    expect(localStorage.getItem("draft-journal")).toBe("an unsaved entry");
  });

  it("keeps a stable logout identity across renders", async () => {
    fakeMain(USER);
    const { rerender } = renderProvider();
    await waitFor(() => expect(auth.checking).toBe(false));
    const first = auth.logout;
    rerender(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(auth.logout).toBe(first);
  });
});

describe("AuthProvider across windows", () => {
  it("follows a sign-in made in another window", async () => {
    const main = fakeMain(null);
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("user").textContent).toBe("none"),
    );

    act(() => main.change(USER));

    await waitFor(() =>
      expect(screen.getByTestId("user").textContent).toBe("ada"),
    );
  });

  it("follows a sign-out made in another window", async () => {
    const main = fakeMain(USER);
    renderProvider();
    await waitFor(() => expect(auth.user?.username).toBe("ada"));

    act(() => main.change(null));

    await waitFor(() =>
      expect(screen.getByTestId("user").textContent).toBe("none"),
    );
  });
});
