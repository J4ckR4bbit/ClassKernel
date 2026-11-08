// Which files in the data folder are ClassKernel's own. Kept on its own so
// both the sender (offline.ts, batchSync.ts) and restore (repo.ts) can use it
// without importing each other.

/**
 * Whether a file (relative to the data folder) is one of ClassKernel's own:
 * the .csv and .md files it writes. Everything else that may sit in the
 * folder is left alone, never sent, joined or taken in: a desktop.ini, a PDF
 * or spreadsheet saved there, Excel's "~$" lock files, temp files, and
 * anything in a hidden folder (a deleted layout template's .trash-… folder).
 * Reading one of those as text would fail and stop the whole send.
 */
export function isDataFile(rel: string): boolean {
  const parts = rel.split("/");
  const name = parts[parts.length - 1];
  if (parts.some((part) => part.startsWith("."))) return false;
  if (name.startsWith("~$") || name.endsWith(".tmp.classkernel")) return false;
  return /\.(csv|md)$/i.test(name);
}
