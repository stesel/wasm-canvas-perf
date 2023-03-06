import type { Protocol } from "puppeteer";
import { BASE_URL } from "./consts";

export function getUrl(version: "js" | "wasm", particles: number) {
  return `${BASE_URL}${version}/?particles=${particles}`;
}

export function waitFor(ms: number) {
  return new Promise((_) => setTimeout(_, ms));
}

export function roundNumber(fps: number) {
  return Math.round(fps * 100) / 100;
}

export function calculateCPUPercentage(cpu: number) {
  return roundNumber(cpu * 100);
}

export function calculateFPS(results: number[]) {
  const sum = results.reduce((acc, fps) => acc + fps, 0);
  return roundNumber(sum / results.length);
}

export function getActiveTime(
  metrics: Protocol.Performance.GetMetricsResponse
): {
  timestamp: number;
  activeTime: number;
} {
  const activeTime = metrics.metrics
    .filter((m) => m.name.includes("Duration"))
    .map((m) => m.value)
    .reduce((a, b) => a + b);
  return {
    timestamp: metrics.metrics.find((m) => m.name === "Timestamp")?.value || 0,
    activeTime,
  };
}
