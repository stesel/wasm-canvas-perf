export function waitFor(ms: number) {
  return new Promise((_) => setTimeout(_, ms));
}
