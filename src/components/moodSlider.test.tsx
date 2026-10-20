import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MoodSlider } from "./moodSlider";

afterEach(cleanup);

const LABELS = ["Bad", "Neutral", "Good", "Great", "Excellent"];

describe("MoodSlider", () => {
  it.each([0, 50, undefined, null, NaN])(
    "falls back to 3 and Good when the value is %s",
    (value) => {
      render(<MoodSlider value={value as number} onChange={() => {}} />);
      const slider = screen.getByTestId("mood-slider") as HTMLInputElement;
      expect(Number(slider.value)).toBe(3);
      expect(screen.getByText("Good", { selector: "span" })).toBeTruthy();
    },
  );

  it.each([1, 2, 3, 4, 5])("thumb %s and label agree", (value) => {
    render(<MoodSlider value={value} onChange={() => {}} />);
    const slider = screen.getByTestId("mood-slider") as HTMLInputElement;
    expect(Number(slider.value)).toBe(value);
    expect(
      screen.getByText(LABELS[value - 1], { selector: "span" }),
    ).toBeTruthy();
  });
});
