/*
 * Handing a generated file to the browser.
 *
 * `saveBytes` in `js/downloads.js`, with the leak fixed: the old downloads
 * table built one object URL per row on every render and revoked none of them,
 * so every generation left a blob behind. The URL is made when a button is
 * pressed and revoked a minute later, which is long enough for the download to
 * start and short enough not to accumulate.
 */
export function saveAs(
  data: string | Uint8Array,
  filename: string,
  type: string,
): void {
  /*
   * A `Uint8Array` is a perfectly good `BlobPart`; TypeScript 5.7 only objects
   * because its buffer could in principle be a `SharedArrayBuffer`, which a
   * PDF or an SQLite export never is.
   */
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 60000);
}
