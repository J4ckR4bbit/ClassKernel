// A class's name is also the name of its folder, so it has to be one Windows
// will take, and no two classes can share it.

/**
 * A typed class name as a folder name: without the characters Windows won't
 * have in one, and without the spaces and full stops it drops from the end
 * (which would leave the folder named differently from the class).
 */
export function safeClassName(typed: string): string {
  return typed
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/[\s.]+$/, "")
    .trim();
}

/**
 * The class that already has this name, if any. Folder names on Windows
 * ignore case, so "10a" is taken once "10A" exists. `except` leaves one class
 * out: the class being renamed, so only its capitals can change.
 */
export function classNameTaken<T extends { name: string }>(name: string, classes: T[], except?: string): T | undefined {
  const wanted = name.trim().toLowerCase();
  return classes.find((c) => c.name !== except && c.name.trim().toLowerCase() === wanted);
}
