// Read-only peek at the app database. Run under Electron-as-Node, because
// better-sqlite3 is built for Electron's ABI:
//   ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron scripts/qa/db.cjs <db> "<sql>"
// Prints the rows as JSON. Never writes: the connection is read-only.
const Database = require("better-sqlite3");

const [file, sql] = process.argv.slice(2);
try {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  console.log(JSON.stringify(db.prepare(sql).all()));
  db.close();
  process.exit(0);
} catch (err) {
  console.error(String(err?.message ?? err));
  process.exit(1);
}
