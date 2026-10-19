import { describe, it, expect } from "vitest";
import { describeLoadFailure } from "./vectorExtension.js";
import { redact } from "../logRedact.js";

describe("describeLoadFailure", () => {
  it("names the path and the reason, and survives log redaction", () => {
    const line = describeLoadFailure(
      "/opt/MindSage/resources/app.asar.unpacked/node_modules/sqlite-vec-linux-x64/vec0.so",
      "cannot open shared object file: No such file or directory",
    );
    expect(line).toContain("vec0.so");
    expect(line).toContain("No such file or directory");
    expect(redact(line)).toBe(line);
  });

  it("stays under the redaction limit for a very long message and path", () => {
    const line = describeLoadFailure(
      `/${"deep/".repeat(60)}vec0.so`,
      "x".repeat(500),
    );
    expect(line.length).toBeLessThanOrEqual(200);
    expect(redact(line)).toBe(line);
    expect(line).toContain("vec0.so");
  });
});
