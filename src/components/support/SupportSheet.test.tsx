import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SupportSheet from "./SupportSheet";
import PinnedSupportLink from "./PinnedSupportLink";
import { SUPPORT_REGION_KEY } from "../../utils/supportRegion";

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ showToast }) }));

const setRegion = (code: string | null) => {
  if (code) localStorage.setItem(SUPPORT_REGION_KEY, code);
  else localStorage.removeItem(SUPPORT_REGION_KEY);
};

describe("SupportSheet", () => {
  beforeEach(() => {
    localStorage.clear();
    showToast.mockReset();
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR"]);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens on the saved region with its lines, offline data only", () => {
    setRegion("UK");
    render(<SupportSheet open onClose={() => {}} />);
    expect(screen.getByText("Samaritans")).toBeInTheDocument();
    expect(screen.getAllByText("116 123").length).toBeGreaterThan(0);
    expect(screen.getByText("999")).toBeInTheDocument();
    expect(screen.getByText(/if you are under 18/i)).toBeInTheDocument();
    expect(screen.getByText("Childline")).toBeInTheDocument();
  });

  it("defaults the region from the system language", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-AU");
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-AU"]);
    render(<SupportSheet open onClose={() => {}} />);
    expect(screen.getByText("Lifeline")).toBeInTheDocument();
  });

  it("asks for a country when the region is unknown, and remembers the choice", () => {
    render(<SupportSheet open onClose={() => {}} />);
    expect(screen.getByText(/choose your country/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/where are you/i), {
      target: { value: "DE" },
    });
    expect(screen.getByText("Telefonseelsorge")).toBeInTheDocument();
    expect(localStorage.getItem(SUPPORT_REGION_KEY)).toBe("DE");
  });

  it("points elsewhere to international resources and emergency guidance", () => {
    render(<SupportSheet open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/where are you/i), {
      target: { value: "OTHER" },
    });
    expect(screen.getAllByText(/findahelpline\.com/).length).toBeGreaterThan(0);
    expect(screen.getByText(/local emergency number/i)).toBeInTheDocument();
  });

  it("voice-only lines never offer text; text lines do", () => {
    setRegion("CA");
    render(<SupportSheet open onClose={() => {}} />);
    const kids = screen.getByText("Kids Help Phone").closest("li")!;
    expect(within(kids).getByText("Text")).toBeInTheDocument();
    cleanup();
    setRegion("AU");
    render(<SupportSheet open onClose={() => {}} />);
    const kidsAu = screen.getByText("Kids Helpline").closest("li")!;
    expect(within(kidsAu).queryByText("Text")).not.toBeInTheDocument();
    expect(within(kidsAu).getByText("Call")).toBeInTheDocument();
  });

  it("Canada shows 988 as a call and as a text", () => {
    setRegion("CA");
    render(<SupportSheet open onClose={() => {}} />);
    const row = screen
      .getByText("9-8-8 Suicide Crisis Helpline")
      .closest("li")!;
    expect(within(row).getByText("Call")).toBeInTheDocument();
    expect(within(row).getByText("Text")).toBeInTheDocument();
  });

  it("text-only Shout has no call row", () => {
    setRegion("UK");
    render(<SupportSheet open onClose={() => {}} />);
    const shout = screen.getByText("Shout (text only)").closest("li")!;
    expect(within(shout).queryByText("Call")).not.toBeInTheDocument();
    expect(within(shout).getAllByText("85258").length).toBeGreaterThan(0);
  });

  it("focuses the first line when it opens", async () => {
    setRegion("US");
    render(<SupportSheet open onClose={() => {}} />);
    await waitFor(() =>
      expect(document.activeElement).toHaveTextContent(/show on my phone/i),
    );
  });

  it("Escape closes it", () => {
    setRegion("US");
    const onClose = vi.fn();
    render(<SupportSheet open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("Show on my phone draws a QR labelled with the number, not 'QR image'", () => {
    setRegion("US");
    render(<SupportSheet open onClose={() => {}} />);
    fireEvent.click(
      screen.getAllByRole("button", { name: /show on my phone/i })[0],
    );
    const qr = screen.getByRole("img", { name: "Call 988" });
    expect(qr.querySelector("path")?.getAttribute("d")?.length).toBeGreaterThan(
      50,
    );
    expect(screen.getByTestId("support-number")).toHaveTextContent("988");
  });

  it("Copy number confirms with a toast", async () => {
    setRegion("UK");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SupportSheet open onClose={() => {}} />);
    fireEvent.click(screen.getAllByRole("button", { name: /copy number/i })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("116 123"));
    expect(showToast).toHaveBeenCalledWith("Copied 116 123", "success");
  });

  it("a blocked clipboard falls back to selecting the number", async () => {
    setRegion("US");
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
    });
    const addRange = vi.spyOn(Selection.prototype, "addRange");
    render(<SupportSheet open onClose={() => {}} />);
    fireEvent.click(
      screen.getAllByRole("button", { name: /show on my phone/i })[0],
    );
    fireEvent.click(screen.getAllByRole("button", { name: /copy number/i })[0]);
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/blocked/i)),
    );
    expect(addRange).toHaveBeenCalled();
    const range = addRange.mock.calls[0][0] as Range;
    expect(range.startContainer).toBe(screen.getByTestId("support-number"));
  });
});

describe("PinnedSupportLink", () => {
  afterEach(cleanup);
  it("is a button that opens the sheet", () => {
    localStorage.setItem(SUPPORT_REGION_KEY, "US");
    render(<PinnedSupportLink />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /going through a lot\? talk to someone/i,
      }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
