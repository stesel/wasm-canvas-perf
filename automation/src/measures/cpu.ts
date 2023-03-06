import puppeteer from "puppeteer";
import * as fs from "fs/promises";
import {
  CPU_COUNT,
  CPU_TIMEOUT,
  MAX_PARTICLES,
  MIN_PARTICLES,
  PARTICLES_STEP,
} from "./consts";
import {
  calculateCPUPercentage,
  getActiveTime,
  getUrl,
  waitFor,
} from "./utils";

export function measureCPU(version: "js" | "wasm") {
  let csv = "Particles\tCPU(%)\n";

  async function runBrowser() {
    for (
      let particles = MIN_PARTICLES;
      particles <= MIN_PARTICLES * 5;
      particles += PARTICLES_STEP
    ) {
      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.goto(getUrl(version, particles));

      const cdp = await page.target().createCDPSession();

      await cdp.send("Performance.enable", {
        timeDomain: "timeTicks",
      });

      const { timestamp: initialTimestamp, activeTime: initialActiveTime } =
        getActiveTime(await cdp.send("Performance.getMetrics"));

      let lastTimestamp = initialTimestamp;
      let cumulativeActiveTime = initialActiveTime;

      for (let i = 0; i < CPU_COUNT; i++) {
        await waitFor(CPU_TIMEOUT);
        const { timestamp, activeTime } = getActiveTime(
          await cdp.send("Performance.getMetrics")
        );

        lastTimestamp = timestamp;
        cumulativeActiveTime = activeTime;
      }

      const cpu = calculateCPUPercentage(
        Math.min(cumulativeActiveTime / (lastTimestamp - initialTimestamp), 1)
      );

      csv += `${particles}\t${cpu}\n`;

      await browser.close();
    }
  }

  runBrowser().then(async () => {
    await fs.mkdir("./dist", {}).catch(() => {});
    await fs.writeFile(`./dist/${version}-cpu.csv`, csv);
  });
}
