// A spreadsheet the teacher picked (an <input type="file"> File) as sheets of
// cell text: every sheet of an .xlsx, or a .csv as one sheet. Papa works out
// the .csv separator, so the semicolon files SA-locale Excel saves read too.

import Papa from "papaparse";
import { ReadSheet, readXlsx } from "./xlsxRead";

export async function readSpreadsheetFile(file: File): Promise<ReadSheet[]> {
  if (/\.csv$/i.test(file.name)) return [{ name: "CSV", rows: Papa.parse<string[]>(await file.text()).data }];
  return readXlsx(new Uint8Array(await file.arrayBuffer()));
}
