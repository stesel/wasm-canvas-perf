export function waitFor(ms: number) {
  return new Promise((_) => setTimeout(_, ms));
}

export function roundFPS(fps: number) {
  return Math.round(fps * 100) / 100;
}

export function calculateFPS(results: number[]) {
  const sum = results.reduce((acc, fps) => acc + fps, 0);
  return roundFPS(sum / results.length);
}
