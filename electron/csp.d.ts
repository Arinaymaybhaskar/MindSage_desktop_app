import type { Plugin } from "vite";

export function buildCsp(options?: { dev?: boolean }): string;
export function cspPlugin(): Plugin;
