import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SetupGate from "./SetupGate";

const navigate = vi.fn();
let auth: { user: unknown; checking: boolean } = {
  user: null,
  checking: false,
};

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => auth }));

const mount = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SetupGate />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  navigate.mockReset();
  (window as unknown as { electron: unknown }).electron = {
    ipcRenderer: {},
  };
});
afterEach(cleanup);

describe("SetupGate", () => {
  it("stays out of the way while signed out, so a profile comes first", () => {
    auth = { user: null, checking: false };
    mount();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("waits for the session check", () => {
    auth = { user: { id: 1 }, checking: true };
    mount();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens setup once a profile is signed in", () => {
    auth = { user: { id: 1 }, checking: false };
    mount();
    expect(navigate).toHaveBeenCalledWith("/setup", { replace: true });
  });

  it("does nothing after setup is done", () => {
    localStorage.setItem("setup_complete", "1");
    auth = { user: { id: 1 }, checking: false };
    mount();
    expect(navigate).not.toHaveBeenCalled();
  });
});
