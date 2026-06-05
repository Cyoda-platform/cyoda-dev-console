/**
 * Strip the project root prefix from an absolute path.
 * Returns the relative portion without a leading slash, or the original
 * value if it does not start with root. Returns undefined when abs is absent.
 */
export function toRelativePath(abs: string | undefined, root: string): string | undefined {
  if (!abs) return undefined;
  return abs.startsWith(root) ? abs.slice(root.length).replace(/^[/\\]+/, "") : abs;
}
