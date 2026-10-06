import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

let shouldThrow = true;

function Fragile() {
  if (shouldThrow) throw new Error("render exploded");
  return <p>page content</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    shouldThrow = true;
    // React logs caught render errors; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a recovery screen instead of a blank window", () => {
    render(
      <ErrorBoundary scope="page">
        <Fragile />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("render exploded");
    expect(screen.getByText(/kept as a draft/)).toBeInTheDocument();
  });

  it("recovers on Try again once the cause is gone", () => {
    render(
      <ErrorBoundary scope="page">
        <Fragile />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    fireEvent.click(screen.getByText("Try again"));
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("recovers when the route changes", () => {
    const { rerender } = render(
      <ErrorBoundary scope="page" resetKey="/broken">
        <Fragile />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    rerender(
      <ErrorBoundary scope="page" resetKey="/journals">
        <Fragile />
      </ErrorBoundary>,
    );
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("does not touch stored drafts", () => {
    localStorage.setItem("draft-journal", '{"content":"half a thought"}');
    render(
      <ErrorBoundary scope="app">
        <Fragile />
      </ErrorBoundary>,
    );
    expect(localStorage.getItem("draft-journal")).toBe(
      '{"content":"half a thought"}',
    );
  });
});
