import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

import { createReopener } from "./windowReopen.js";

const fakeWindow = (over = {}) => {
  const w = new EventEmitter();
  w.destroyed = false;
  w.isDestroyed = () => w.destroyed;
  w.isMinimized = () => false;
  w.show = vi.fn();
  w.restore = vi.fn();
  w.focus = vi.fn();
  return Object.assign(w, over);
};

const setup = (current) => {
  let win = current;
  const created = [];
  const create = vi.fn(async () => {
    const w = fakeWindow();
    created.push(w);
    return w;
  });
  const adopt = vi.fn((w) => (win = w));
  const onCreated = vi.fn();
  const reopen = createReopener({
    getWindow: () => win,
    create,
    adopt,
    onCreated,
  });
  return {
    reopen,
    create,
    adopt,
    onCreated,
    created,
    get win() {
      return win;
    },
  };
};

describe("reopening the main window", () => {
  it("shows the existing window instead of creating another", async () => {
    const existing = fakeWindow();
    const t = setup(existing);
    await t.reopen();
    expect(existing.show).toHaveBeenCalled();
    expect(t.create).not.toHaveBeenCalled();
  });

  it("restores a minimized window", async () => {
    const existing = fakeWindow({ isMinimized: () => true });
    await setup(existing).reopen();
    expect(existing.restore).toHaveBeenCalled();
  });

  it("creates one when there is none, keeps it, and replays the status", async () => {
    const t = setup(undefined);
    const win = await t.reopen();
    expect(t.create).toHaveBeenCalledTimes(1);
    expect(t.adopt).toHaveBeenCalledWith(win);
    expect(t.onCreated).toHaveBeenCalledWith(win);
    expect(t.win).toBe(win);
  });

  it("shows the new window once it can paint", async () => {
    const t = setup(undefined);
    const win = await t.reopen();
    expect(win.show).not.toHaveBeenCalled();
    win.emit("ready-to-show");
    expect(win.show).toHaveBeenCalledTimes(1);
  });

  it("replaces a destroyed window", async () => {
    const dead = fakeWindow({ destroyed: true });
    const t = setup(dead);
    await t.reopen();
    expect(t.create).toHaveBeenCalledTimes(1);
  });

  it("two activations at once create one window", async () => {
    const t = setup(undefined);
    await Promise.all([t.reopen(), t.reopen()]);
    expect(t.create).toHaveBeenCalledTimes(1);
  });

  it("repeated reopen after closing never stacks more than one window", async () => {
    const t = setup(undefined);
    for (let i = 0; i < 3; i++) {
      const w = await t.reopen();
      w.destroyed = true; // the person closes it again
    }
    expect(t.create).toHaveBeenCalledTimes(3);
    expect(t.created.filter((w) => !w.destroyed)).toHaveLength(0);
  });
});
