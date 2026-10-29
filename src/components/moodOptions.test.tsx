import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoodTagSelector } from "./moodOptions";
import { tagService } from "../api/tagService";

vi.mock("../api/tagService", () => ({
  tagService: { addCustomWord: vi.fn() },
}));

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

describe("a word of your own (KAN-94)", () => {
  const own = [{ name: "खुशी", family: "Happy" as const }];

  it("shows the user's words under their family and keeps them on edit", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <MoodTagSelector
        selected={["खुशी", "Rainy"]}
        customWords={own}
        onChange={onChange}
      />,
    );
    expect(getByTestId("mood-tag-खुशी")).toBeTruthy();
    fireEvent.click(getByTestId("mood-tag-Content"));
    // An imported tag with no family is not dropped by the edit.
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining(["Happy", "खुशी", "Rainy", "Content"]),
    );
  });

  it("cannot add a word until a family is picked, then selects it", async () => {
    vi.mocked(tagService.addCustomWord).mockResolvedValue({
      name: "उदास",
      family: "Sad",
    });
    const onChange = vi.fn();
    const onCustomWordAdded = vi.fn();
    const { getByTestId } = render(
      <MoodTagSelector
        selected={[]}
        onChange={onChange}
        onCustomWordAdded={onCustomWordAdded}
      />,
    );
    fireEvent.change(getByTestId("own-word"), {
      target: { value: "उदास" },
    });
    expect(getByTestId("own-word-add")).toHaveProperty("disabled", true);
    fireEvent.change(getByTestId("own-word-family"), {
      target: { value: "Sad" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("own-word-add"));
    });
    expect(tagService.addCustomWord).toHaveBeenCalledWith("उदास", "Sad");
    expect(onCustomWordAdded).toHaveBeenCalledWith({
      name: "उदास",
      family: "Sad",
    });
    expect(onChange).toHaveBeenLastCalledWith(["Sad", "उदास"]);
  });

  it("selects the built-in word a typed one matches, without listing a copy", async () => {
    vi.mocked(tagService.addCustomWord).mockResolvedValue({
      name: "Content",
      family: "Happy",
    });
    const onChange = vi.fn();
    const onCustomWordAdded = vi.fn();
    const { getByTestId } = render(
      <MoodTagSelector
        selected={[]}
        onChange={onChange}
        onCustomWordAdded={onCustomWordAdded}
      />,
    );
    fireEvent.change(getByTestId("own-word"), {
      target: { value: "CONTÉNT" },
    });
    fireEvent.change(getByTestId("own-word-family"), {
      target: { value: "Happy" },
    });
    await act(async () => {
      fireEvent.click(getByTestId("own-word-add"));
    });
    expect(onCustomWordAdded).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(["Happy", "Content"]);
  });
});
