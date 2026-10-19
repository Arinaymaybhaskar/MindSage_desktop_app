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

const lineCard = (name: string) =>
  screen.getByText(name, { selector: "p" }).closest("li") as HTMLElement;

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

  it("opens on the saved region with its lines and the emergency number", () => {
    setRegion("UK");
    render(<SupportSheet open onClose={() => {}} />);
    expect(screen.getByText("Samaritans")).toBeInTheDocument();
    expect(screen.getAllByText("116 123").length).toBeGreaterThan(0);
    expect(screen.getByText("999")).toBeInTheDocument();
    expect(screen.getByText(/Under 18\?/).closest("li")).toHaveTextContent(
      /Childline · 0800 1111/,
    );
    expect(screen.getByText(/Showing lines for/)).toHaveTextContent(
      "United Kingdom",
    );
  });

  it("India lists Tele-MANAS and iCall, and Childline for under 18s", () => {
    setRegion("IN");
    render(<SupportSheet open onClose={() => {}} />);
    expect(screen.getByText("Tele-MANAS")).toBeInTheDocument();
    expect(screen.getByText("iCall")).toBeInTheDocument();
    expect(screen.getAllByText("+91 91529 87821").length).toBeGreaterThan(0);
    expect(screen.getByText(/Under 18\?/).closest("li")).toHaveTextContent(
      /Childline · 1098/,
    );
  });

  it("defaults the region from the system language and says so", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-AU");
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-AU"]);
    render(<SupportSheet open onClose={() => {}} />);
    expect(screen.getByText("Lifeline")).toBeInTheDocument();
    expect(
      screen.getByText(/Based on this PC's time zone and region/),
    ).toHaveTextContent("Australia");
  });

  it("asks for a country when the region is unknown, and remembers the choice", () => {
    render(<SupportSheet open onClose={() => {}} />);
    expect(screen.getByText(/choose your country/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Other countries/ }));
    fireEvent.click(screen.getByRole("button", { name: "Germany" }));
    expect(screen.getByText("Telefonseelsorge")).toBeInTheDocument();
    expect(localStorage.getItem(SUPPORT_REGION_KEY)).toBe("DE");
  });

  it("Change opens the country list", () => {
    setRegion("UK");
    render(<SupportSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("button", { name: "Canada" })).toBeInTheDocument();
  });

  it("points elsewhere to international resources and emergency guidance", () => {
    setRegion("UK");
    render(<SupportSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Other countries/ }));
    fireEvent.click(screen.getByRole("button", { name: "Somewhere else" }));
    expect(screen.getAllByText(/findahelpline\.com/).length).toBeGreaterThan(0);
    expect(screen.getByText(/local emergency number/i)).toBeInTheDocument();
    expect(localStorage.getItem(SUPPORT_REGION_KEY)).toBeNull();
  });

  it("voice-only lines never offer text; text lines do", () => {
    setRegion("IN");
    render(<SupportSheet open onClose={() => {}} />);
    expect(
      within(lineCard("Tele-MANAS")).queryByText("Text"),
    ).not.toBeInTheDocument();
    expect(
      within(lineCard("Tele-MANAS")).getByText("Call"),
    ).toBeInTheDocument();
    cleanup();
    setRegion("CA");
    render(<SupportSheet open onClose={() => {}} />);
    const row = lineCard("9-8-8 Suicide Crisis Helpline");
    expect(within(row).getByText("Call")).toBeInTheDocument();
    expect(within(row).getByText("Text")).toBeInTheDocument();
  });

  it("an under-18 voice-only line has no text action", () => {
    setRegion("AU");
    render(<SupportSheet open onClose={() => {}} />);
    const young = screen.getByText(/Under 18\?/).closest("li")!;
    expect(
      within(young).queryByRole("button", { name: /to text/i }),
    ).not.toBeInTheDocument();
    expect(
      within(young).getByRole("button", { name: /to call 1800 55 1800/i }),
    ).toBeInTheDocument();
  });

  it("text-only Shout has no call row", () => {
    setRegion("UK");
    render(<SupportSheet open onClose={() => {}} />);
    const shout = lineCard("Shout (text only)");
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

  it("Show on my phone opens the QR inside that line's card, labelled with the number", () => {
    setRegion("IN");
    render(<SupportSheet open onClose={() => {}} />);
    const card = lineCard("Tele-MANAS");
    fireEvent.click(
      within(card).getByRole("button", { name: /show on my phone/i }),
    );
    const qr = within(card).getByRole("img", { name: "Call 14416" });
    expect(qr.querySelector("path")?.getAttribute("d")?.length).toBeGreaterThan(
      50,
    );
    expect(
      within(card).getByText(/Point your phone's camera here/),
    ).toBeTruthy();
    expect(
      within(card).getByText(/opens 14416 in your phone's dialler/),
    ).toBeTruthy();
    // another line's card has none
    expect(
      within(lineCard("iCall")).queryByRole("img"),
    ).not.toBeInTheDocument();
  });

  it("the pressed Show on my phone button toggles the QR off again", () => {
    setRegion("US");
    render(<SupportSheet open onClose={() => {}} />);
    const button = screen.getAllByRole("button", {
      name: /show on my phone/i,
    })[0];
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(button);
    expect(screen.queryByRole("img", { name: "Call 988" })).toBeNull();
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
