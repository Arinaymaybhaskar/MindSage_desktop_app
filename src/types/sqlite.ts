/**
 * Shapes that leak through the IPC boundary from `better-sqlite3`.
 *
 * SQLite has no boolean type, so flags round-trip as INTEGER 0/1. Renderer
 * code should treat these as truthy/falsy rather than comparing to `true`.
 */
export type SqliteBoolean = number | boolean;

/** What `Statement.run()` resolves to, returned verbatim by several handlers. */
export interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number;
}
