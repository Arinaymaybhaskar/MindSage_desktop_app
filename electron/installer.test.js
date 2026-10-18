import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nsh = fs.readFileSync(path.join(root, "assets/installer.nsh"), "utf8");
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

// The prompt itself can only be exercised by running the Windows uninstaller,
// which is part of the packaged run at the end of the phase. What can be
// pinned here is every property that makes it safe.
describe("NSIS uninstall cleanup (assets/installer.nsh)", () => {
  const body = nsh.slice(nsh.indexOf("!macro customUnInstall"));

  it("is the include electron-builder picks up (buildResources is assets/)", () => {
    expect(pkg.build.directories.buildResources).toBe("assets");
    expect(pkg.build.nsis.include).toBeUndefined(); // default assets/installer.nsh
    expect(body).toMatch(/!macro customUnInstall/);
  });

  it("asks with the agreed wording, names the folder, and defaults to No", () => {
    expect(body).toContain("Also delete your journal and settings?");
    expect(body).toContain("$APPDATA\\${APP_FILENAME}");
    expect(body).toMatch(/MB_YESNO[^\n]*MB_DEFBUTTON2/);
    expect(body).toMatch(/IDNO mindsageKeepData/);
  });

  it("never deletes during an update or a silent uninstall", () => {
    const guard = body.indexOf("${ifNot} ${isUpdated}");
    const silent = body.indexOf("${ifNot} ${Silent}");
    const rmdir = body.indexOf("RMDir /r");
    expect(guard).toBeGreaterThan(-1);
    expect(silent).toBeGreaterThan(guard);
    expect(rmdir).toBeGreaterThan(silent);
  });

  it("leaves --delete-app-data to electron-builder", () => {
    expect(body).toContain("--delete-app-data");
  });

  it("deletes only the current user's app folder, never a path outside %APPDATA%", () => {
    const removals = body.match(/RMDir \/r "[^"]*"/g);
    expect(removals).toEqual([
      'RMDir /r "$APPDATA\\${APP_FILENAME}"',
      'RMDir /r "$APPDATA\\${APP_PACKAGE_NAME}"',
    ]);
    expect(body).toContain("SetShellVarContext current");
  });

  it("matches the folder Electron actually uses for userData", () => {
    // userData is %APPDATA%\<productName>; APP_FILENAME is the productName.
    expect(pkg.build.productName).toBe("MindSage");
  });

  const hasMakensis = spawnSync("makensis", ["-VERSION"]).status === 0;
  it.skipIf(!hasMakensis)("compiles under makensis", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nsh-"));
    const stub = path.join(dir, "stub.nsi");
    // Stand-ins for what electron-builder defines around the macro.
    fs.writeFileSync(
      stub,
      [
        '!include "LogicLib.nsh"',
        '!include "FileFunc.nsh"',
        '!define APP_FILENAME "MindSage"',
        '!define APP_PACKAGE_NAME "mindsage-desktop-app"',
        "Unicode true",
        `OutFile "${path.join(dir, "stub.exe")}"`,
        "!macro _isUpdated _a _b _t _f",
        "  StrCmp $R9 updated `${_t}` `${_f}`",
        "!macroend",
        '!define isUpdated `"" isUpdated ""`',
        `!include "${path.join(root, "assets/installer.nsh")}"`,
        "Section",
        "  !insertmacro customUnInstall",
        "SectionEnd",
      ].join("\n"),
    );
    expect(() =>
      execFileSync("makensis", ["-WX", "-V1", stub], { stdio: "pipe" }),
    ).not.toThrow();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
