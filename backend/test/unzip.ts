import yauzl from "yauzl";

export interface UnzippedEntry {
  name: string;
  content: Buffer;
}

/**
 * Fully read a ZIP buffer into {name, content} entries. Used by download
 * tests to assert the archive really contains every photo's bytes.
 */
export const unzipBuffer = (zip: Buffer): Promise<UnzippedEntry[]> =>
  new Promise((resolve, reject) => {
    yauzl.fromBuffer(zip, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err || new Error("no zipfile"));
      const entries: UnzippedEntry[] = [];
      zipfile.on("entry", (entry) => {
        zipfile.openReadStream(entry, (rsErr, stream) => {
          if (rsErr || !stream) return reject(rsErr || new Error("no stream"));
          const chunks: Buffer[] = [];
          stream.on("data", (c) => chunks.push(c as Buffer));
          stream.on("end", () => {
            entries.push({
              name: entry.fileName,
              content: Buffer.concat(chunks),
            });
            zipfile.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zipfile.on("end", () => resolve(entries));
      zipfile.on("error", reject);
      zipfile.readEntry();
    });
  });
