import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalSearch from "./GlobalSearch";

const search = vi.hoisted(() => vi.fn());
const status = vi.hoisted(() => vi.fn());

// One stable object: a new user each render would re-run the effects forever.
const auth = { user: { username: "ada" }, checking: false };
vi.mock("../hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("../api/journalService", () => ({
  default: { getRecent: async () => [] },
}));
vi.mock("../api/searchService", () => ({
  searchService: { search, status },
}));

const counts = (ok: number, pending: number) => ({
  success: true,
  available: true,
  total: ok + pending,
  ok,
  pending,
  failed: 0,
  gaveUp: 0,
  missing: 0,
});

const type = (text: string) =>
  fireEvent.change(screen.getByTestId("global-search-input"), {
    target: { value: text },
  });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  search.mockReset().mockResolvedValue([]);
  status.mockReset();
  render(
    <MemoryRouter>
      <GlobalSearch onClose={() => {}} />
    </MemoryRouter>,
  );
});
afterEach(() => {
  cleanup();
});

describe("search while indexing (KAN-494)", () => {
  it("says search is rebuilding with progress", async () => {
    status.mockResolvedValue(counts(2, 8));
    type("harbour");
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(
        /Search is rebuilding: 2 of 10 items ready/,
      ),
    );
  });

  it("shows no rebuilding banner when the model is unreachable (KAN-497)", async () => {
    status.mockResolvedValue({ ...counts(0, 4), waiting: true });
    type("harbour");
    await waitFor(() => expect(status).toHaveBeenCalled());
    await waitFor(() => expect(search).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("asks again when indexing ends, without retyping", async () => {
    status.mockResolvedValueOnce(counts(2, 8)).mockResolvedValue(counts(10, 0));
    type("harbour");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2), {
      timeout: 6000,
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
