import "server-only";
/** A file name safe to keep under sources/: no folders, no control characters. */
export function sourceName(name: string) {
  return name
    .replace(/[\\/]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
}

export const DOMAIN = /^[a-z0-9][a-z0-9-]{0,60}$/;
