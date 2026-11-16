// Writes latest.json: the file installed copies of ClassKernel read (from the
// newest GitHub release) to learn that a newer version exists, where its
// installer is and what its signature must be. Used by the release workflow:
//
//   node scripts/latest-json.mjs <version> <nsis folder> <owner/repo> <output file>
//
// Without a signature beside the installer (a build made without the signing
// key) it writes nothing and says so, and the release goes out without one.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The update file's contents for one Windows installer. */
export function latestJson({ version, repo, installer, signature, notes, date }) {
  return {
    version,
    notes,
    pub_date: date,
    platforms: {
      "windows-x86_64": {
        signature,
        url: `https://github.com/${repo}/releases/download/v${version}/${encodeURIComponent(installer)}`,
      },
    },
  };
}

function main([version, dir, repo, out]) {
  if (!version || !dir || !repo || !out) {
    console.error("Usage: node scripts/latest-json.mjs <version> <nsis folder> <owner/repo> <output file>");
    process.exit(1);
  }
  const sig = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith("-setup.exe.sig")) : undefined;
  if (!sig) {
    console.log("No signed installer here, so no update file was written.");
    return;
  }
  const installer = sig.replace(/\.sig$/, "");
  const json = latestJson({
    version,
    repo,
    installer,
    signature: readFileSync(join(dir, sig), "utf8").trim(),
    notes: `ClassKernel ${version}`,
    date: new Date().toISOString(),
  });
  writeFileSync(out, JSON.stringify(json, null, 2) + "\n");
  console.log(`Wrote ${out} for ${installer}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
