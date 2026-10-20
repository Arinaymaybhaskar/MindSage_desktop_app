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

  describe("when SQLite starts its message with a long path (KAN-375)", () => {
    const posix =
      "/tmp/claude-0/-home-user-MindSage-desktop-app/fa33e90e-a864-5006-b949-31b87d686dcc/scratchpad/wt/node_modules/sqlite-vec-linux-x64/vec0.so";
    const win =
      "C:\\Users\\Someone Long\\AppData\\Local\\Programs\\MindSage\\resources\\app.asar.unpacked\\node_modules\\sqlite-vec-windows-x64\\vec0.dll";

    it("keeps the reason and the path tail for a 90+ char POSIX path", () => {
      expect(posix.length).toBeGreaterThan(90);
      const line = describeLoadFailure(posix, `${posix}: invalid ELF header`);
      expect(line).toContain("invalid ELF header");
      expect(line).toContain("sqlite-vec-linux-x64/vec0.so");
      expect(line).not.toContain("claude-0");
      expect(line.length).toBeLessThanOrEqual(200);
      expect(line.split("vec0.so")).toHaveLength(2);
      const out = redact(line);
      expect(out).toBe(line);
      expect(out).toContain("invalid ELF header");
    });

    it("keeps the reason for a long Windows path with backslashes", () => {
      const line = describeLoadFailure(
        win,
        `${win}: %1 is not a valid Win32 application.`,
      );
      expect(line).toContain("not a valid Win32 application");
      expect(line).toContain("sqlite-vec-windows-x64\\vec0.dll");
      expect(line).not.toContain("AppData");
      expect(line.length).toBeLessThanOrEqual(200);
      expect(redact(line)).toBe(line);
    });

    it("handles a Windows message with the path in forward slashes or a \\\\?\\ prefix", () => {
      const line = describeLoadFailure(
        win,
        `The specified module could not be found.\r\n\\\\?\\${win}`,
      );
      expect(line).toContain("The specified module could not be found.");
      expect(line).not.toContain("AppData");
      expect(line.length).toBeLessThanOrEqual(200);
    });

    it("copes with SQLite retrying with the suffix added (seen for real)", () => {
      const line = describeLoadFailure(
        posix,
        `${posix}.so: cannot open shared object file: No such file or directory`,
      );
      expect(line).toContain(
        "Search index unavailable: cannot open shared object file: No such file or directory (extension: ",
      );
      expect(line).toContain("sqlite-vec-linux-x64/vec0.so");
    });

    it("keeps the reason when the message has no path at all", () => {
      const line = describeLoadFailure(posix, "no such module: vec0");
      expect(line).toContain("no such module: vec0");
      expect(line).toContain("sqlite-vec-linux-x64/vec0.so");
      expect(redact(line)).toBe(line);
    });

    it("cuts a very long reason but still ends with the path tail", () => {
      const line = describeLoadFailure(
        posix,
        `${posix}: ${"why ".repeat(100)}`,
      );
      expect(line.length).toBeLessThanOrEqual(200);
      expect(line).toContain("why why");
      expect(line).toContain("vec0.so");
      expect(redact(line)).toBe(line);
    });

    it("still works with a short path", () => {
      const line = describeLoadFailure(
        "/tmp/vec0.so",
        "/tmp/vec0.so: file too short",
      );
      expect(line).toBe(
        "Search index unavailable: file too short (extension: /tmp/vec0.so)",
      );
    });
  });
});
