import { Cluster } from "puppeteer-cluster";
import puppeteer from "puppeteer";

let clusterInstance: Cluster<any, any> | null = null;

export async function getCluster() {
  if (!clusterInstance) {
    clusterInstance = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_CONTEXT,
      maxConcurrency: 4, // safe parallel jobs
      puppeteer,
      timeout: 60000,
      monitor: false,
      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    clusterInstance.task(async ({ page, data: { html } }) => {
      await page.setContent(html, { waitUntil: "networkidle0" });
      return await page.pdf({ format: "A4", printBackground: true });
    });
  }

  return clusterInstance;
}
