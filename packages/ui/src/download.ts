// Handing a file the page made to the browser as a download: what the website
// does with a saved picture, and what the desktop app's browser demo does in
// place of its "save as" dialog.

export function downloadBytes(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes]));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
