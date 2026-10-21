import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AskFooter from "./AskFooter";

afterEach(cleanup);

describe("AskFooter", () => {
  it("says what Ask is and what its answers are made of", () => {
    render(<AskFooter />);
    const text = screen.getByTestId("ask-disclaimer").textContent;
    expect(text).toContain("Ask is a reflection tool, not advice or therapy.");
    expect(text).toContain("Answers come from your entries and can be wrong.");
    expect(text).toContain("Check the sources.");
  });

  it("shows the keys", () => {
    render(<AskFooter />);
    expect(screen.getAllByText("Enter")).toHaveLength(2);
    expect(screen.getByText("Shift")).toBeInTheDocument();
  });
});
