import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoodTagSelector } from "./moodOptions";

afterEach(cleanup);

describe("MoodTagSelector", () => {
  it("does not add the parent mood to saved sub-moods it only displays", () => {
    const onChange = vi.fn();
    render(
      <MoodTagSelector
        selected={["Peaceful", "Content"]}
        onChange={onChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still reports the user's own change", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <MoodTagSelector
        selected={["Peaceful", "Content"]}
        onChange={onChange}
      />,
    );
    fireEvent.click(getByTestId("mood-tag-Content"));
    expect(onChange).toHaveBeenLastCalledWith(["Happy", "Peaceful"]);
  });
});
