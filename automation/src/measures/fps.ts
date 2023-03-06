import puppeteer from "puppeteer";
import * as fs from "fs/promises";
import { calculateFPS, getUrl, waitFor } from "./utils";
import {
  FPS_COUNT,
  FPS_TIMEOUT,
  MAX_PARTICLES,
  MIN_PARTICLES,
  PARTICLES_STEP,
} from "./consts";

declare global {
  interface Window {
    __FPS__?: number;
  }
}

export function measureFPS(version: "js" | "wasm") {
  let csv = "Particles\tFPS\n";

  async function runBrowser() {
    for (
      let particles = MIN_PARTICLES;
      particles <= MAX_PARTICLES;
      particles += PARTICLES_STEP
    ) {
      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.goto(getUrl(version, particles));
  
      const results: number[] = [];
  
      while (results.length < FPS_COUNT) {
        await waitFor(FPS_TIMEOUT);
        const fps = await page.evaluate(() => window.__FPS__ || 0);
        results.push(fps);
      }
  
      csv += `${particles}\t${calculateFPS(results)}\n`;
  
      await browser.close();
    }
  }

  runBrowser().then(async () => {
    await fs.mkdir("./dist", {}).catch(() => {});
    await fs.writeFile(`./dist/${version}-fps.csv`, csv);
  });
}
