export const clientSessionRoots = [
  ".inkos/sessions",
  ".inkos/chat-requests",
  ".inkos/tasks",
  ".inkos/uploads",
];
export function isClientSessionPath(path: unknown): boolean {
  return (
    typeof path === "string" &&
    (path === ".inkos/harness.sqlite" ||
      path.startsWith(".inkos/harness.sqlite-") ||
      clientSessionRoots.some(
        (root) => path === root || path.startsWith(root + "/"),
      ))
  );
}
