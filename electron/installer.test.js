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
  });

  // Which constructs enclose a line: the one test that matters for a path
  // that deletes the user's only copy of their journal.
  function enclosing(text, marker) {
    const stack = [];
    for (const line of text.split("\n")) {
      const l = line.trim();
      if (l.includes(marker)) return stack.slice();
      if (/^\$\{(if|ifNot)\}/i.test(l)) stack.push(l);
      else if (/^\$\{endIf\}/i.test(l)) stack.pop();
    }
    return null;
  }

  it("deletes only when not updating, not silent, and no --delete-app-data flag", () => {
    expect(enclosing(body, 'RMDir /r "$APPDATA')).toEqual([
      "${ifNot} ${isUpdated}",
      "${ifNot} ${Silent}",
      "${if} ${Errors}", // GetOptions sets Errors when the flag is absent
    ]);
  });

  it("deletes only on an explicit Yes, and every other answer keeps the data", () => {
    expect(body).toMatch(
      /IDYES mindsageDeleteData\s+Goto mindsageKeepData\s+mindsageDeleteData:\s+RMDir/,
    );
    expect(body).not.toMatch(/IDNO mindsage/);
  });

  it("names and removes the same folder, in the current user's shell context", () => {
    const sw = body.indexOf("SetShellVarContext current");
    expect(sw).toBeGreaterThan(-1);
    expect(sw).toBeLessThan(body.indexOf("MessageBox"));
    expect(sw).toBeLessThan(body.indexOf("RMDir /r"));
    expect(body.indexOf("SetShellVarContext all")).toBeGreaterThan(
      body.indexOf("mindsageKeepData:"),
    );
    const names = body.match(/\$APPDATA\\\$\{APP_FILENAME\}/g);
    expect(names).toHaveLength(2); // once in the text, once in RMDir
  });

  it("leaves --delete-app-data to electron-builder", () => {
    expect(body).toContain("--delete-app-data");
  });

  it("removes exactly one folder", () => {
    expect(body.match(/RMDir \/r "[^"]*"/g)).toEqual([
      'RMDir /r "$APPDATA\\${APP_FILENAME}"',
    ]);
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
        "Var installMode",
        "Unicode true",
        `OutFile "${path.join(dir, "stub.exe")}"`,
        "!macro _isUpdated _a _b _t _f",
        "  StrCmp $R9 updated `${_t}` `${_f}`",
        "!macroend",
        '!define isUpdated `"" isUpdated ""`',
        `!include "${path.join(root, "assets/installer.nsh")}"`,
        "Section",
        "  StrCpy $installMode all",
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
