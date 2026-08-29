import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

let shouldThrow = true;

function Boom() {
  if (shouldThrow) throw new Error("the page exploded");
  return <span>recovered</span>;
}

beforeEach(() => {
  shouldThrow = true;
  // React logs the caught error itself; the boundary's own console.error is
  // asserted separately.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("ErrorBoundary", () => {
  it("renders its children while nothing throws", () => {
    shouldThrow = false;
    render(
      <ErrorBoundary fallback={() => <span>fallback</span>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("recovered")).toBeTruthy();
    expect(screen.queryByText("fallback")).toBeNull();
  });

  it("renders the fallback with the thrown error", () => {
    render(
      <ErrorBoundary
        fallback={({ error }) => <span>caught: {error?.message}</span>}
      >
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("caught: the page exploded")).toBeTruthy();
  });

  it("restores the children when reset is called", () => {
    render(
      <ErrorBoundary
        fallback={({ reset }) => <button onClick={reset}>Try again</button>}
      >
        <Boom />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("recovered")).toBeTruthy();
  });

  it("logs the failure, since the renderer has nowhere else to report it", () => {
    render(
      <ErrorBoundary fallback={() => <span>fallback</span>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith(
      "[ErrorBoundary] Render failed:",
      expect.any(Error),
      expect.anything(),
    );
  });
});
