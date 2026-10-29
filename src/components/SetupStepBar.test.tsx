import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SetupStepBar } from "./SetupStepBar";

it("reads Step 1 of 2 on Profile and Step 2 of 2 on Local AI", () => {
  const { rerender } = render(<SetupStepBar step={1} />);
  expect(screen.getByTestId("setup-step")).toHaveTextContent(
    "Step 1 of 2: Profile",
  );
  rerender(<SetupStepBar step={2} />);
  expect(screen.getByTestId("setup-step")).toHaveTextContent(
    "Step 2 of 2: Local AI",
  );
});
