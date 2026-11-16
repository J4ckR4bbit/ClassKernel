// The website's addresses, apart from the view so they can be tested in Node.

/** "#/galvanic-cell" (or "#galvanic-cell") → the tool's id, or null for the list or an unknown tool. */
export function toolFromHash(hash: string, tools: Array<{ id: string }>): string | null {
  const id = decodeURIComponent(hash.replace(/^#\/?/, "")).trim();
  return tools.some((t) => t.id === id) ? id : null;
}

/** The address for a tool; empty for the list of tools. */
export function toolHash(id: string | null): string {
  return id ? `#/${id}` : "";
}
