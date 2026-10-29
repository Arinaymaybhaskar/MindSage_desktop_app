import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoodSlider } from "./moodSlider";

afterEach(cleanup);

const LABELS = ["Heavy", "Low", "Steady", "Good", "Bright"];

describe("MoodSlider", () => {
  it.each([0, 50, undefined, null, NaN])(
    "shows Not set, not a mood, when the value is %s",
    (value) => {
      render(<MoodSlider value={value} onChange={() => {}} />);
      expect(screen.getByText("Not set", { selector: "span" })).toBeTruthy();
      for (const label of LABELS)
        expect(screen.queryByText(label, { selector: "span" })).toBeNull();
    },
  );

  it("does not call onChange until the person picks a mood", () => {
    const onChange = vi.fn();
    render(<MoodSlider value={null} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    const slider = screen.getByTestId("mood-slider");
    fireEvent.change(slider, { target: { value: "4" } });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it.each([1, 2, 3, 4, 5])("thumb %s and label agree", (value) => {
    render(<MoodSlider value={value} onChange={() => {}} />);
    const slider = screen.getByTestId("mood-slider") as HTMLInputElement;
    expect(Number(slider.value)).toBe(value);
    expect(
      screen.getByText(LABELS[value - 1], { selector: "span" }),
    ).toBeTruthy();
  });
});
