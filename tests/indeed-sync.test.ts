import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { detectIndeedBlock, parseIndeedDetailPage, parseIndeedSearchPage } from "../src/core/indeed.js";
import { syncIndeedAlert } from "../src/core/indeed-sync.js";
import { createOpenClawIndeedPageFetcher } from "../src/core/openclaw-browser.js";
import type { IndeedAlertConfig, IndeedPageFetcher } from "../src/core/types.js";
import { JobStore } from "../src/db/store.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures/indeed");
const SEARCH_URL =
  "https://ca.indeed.com/jobs?q=call+centre&l=Canada&from=subwaywebapp&sc=0kf%3Aattr%28DSQF7%29%3B&radius=50&vjk=dce1e0f08d112161";

function loadHtml(fileName: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, fileName), "utf8");
}

function createStore(): JobStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "job-ops-indeed-"));
  return new JobStore(path.join(dir, "job-ops.sqlite"));
}

function createAlert(): IndeedAlertConfig {
  return {
    id: "call-centre-canada-remote",
    label: "Call centre jobs in Canada",
    searchUrl: SEARCH_URL,
    discordTarget: "channel:123456789012345680",
    enabled: true,
    maxPages: 5
  };
}

describe("Indeed parsing", () => {
  test("parses job cards from a search page", () => {
    const cards = parseIndeedSearchPage(loadHtml("search-page-1.html"), SEARCH_URL);

    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({
      jobKey: "call01",
      title: "Call Centre Representative",
      company: "Northern Reach Services",
      locationRaw: "Remote in Canada",
      compensationText: "CA$46,000 - CA$52,000 a year"
    });
    expect(cards[0].detailUrl).toBe("https://ca.indeed.com/viewjob?jk=call01");
  });

  test("parses live-style search cards that use belowJobSnippet", () => {
    const html = `
      <main>
        <div class="job_seen_beacon">
          <h2 class="jobTitle">
            <a class="jcs-JobTitle" data-jk="live01" href="/viewjob?jk=live01">
              <span title="Bilingual Customer Service (100% Remote)">Bilingual Customer Service (100% Remote)</span>
            </a>
          </h2>
          <div class="company_location">
            <span data-testid="company-name">MT Talent Solutions Inc.</span>
            <div data-testid="text-location">Remote</div>
          </div>
          <div data-testid="belowJobSnippet">
            <ul>
              <li>Previous call center or customer service experience is an asset.</li>
              <li>New graduates are welcome to apply.</li>
            </ul>
          </div>
        </div>
      </main>
    `;

    const cards = parseIndeedSearchPage(html, SEARCH_URL);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      jobKey: "live01",
      title: "Bilingual Customer Service (100% Remote)",
      company: "MT Talent Solutions Inc.",
      locationRaw: "Remote"
    });
    expect(cards[0].summaryText).toContain("Previous call center");
  });

  test("parses live-style search cards nested inside list wrappers", () => {
    const html = `
      <main>
        <ul>
          <li>
            <div class="job_seen_beacon">
              <h2 class="jobTitle">
                <a class="jcs-JobTitle" data-jk="live01" href="/viewjob?jk=live01">
                  <span title="Call Centre Agent">Call Centre Agent</span>
                </a>
              </h2>
              <div class="company_location">
                <span data-testid="company-name">North Star Contact Centre</span>
                <div data-testid="text-location">Remote in Canada</div>
              </div>
              <div data-testid="belowJobSnippet">
                <ul>
                  <li>Handle inbound customer support calls.</li>
                </ul>
              </div>
            </div>
          </li>
          <li>
            <div class="job_seen_beacon">
              <h2 class="jobTitle">
                <a class="jcs-JobTitle" data-jk="live02" href="/viewjob?jk=live02">
                  <span title="Customer Support Representative">Customer Support Representative</span>
                </a>
              </h2>
              <div class="company_location">
                <span data-testid="company-name">Prairie Phone Support</span>
                <div data-testid="text-location">Remote</div>
              </div>
              <div data-testid="belowJobSnippet">
                <ul>
                  <li>Resolve billing and account questions.</li>
                </ul>
              </div>
            </div>
          </li>
        </ul>
      </main>
    `;

    const cards = parseIndeedSearchPage(html, SEARCH_URL);

    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.jobKey)).toEqual(["live01", "live02"]);
  });

  test("parses live-style search cards when the summary sits outside job_seen_beacon", () => {
    const html = `
      <main>
        <div class="cardOutline tapItem result job_live03">
          <div class="job_seen_beacon">
            <h2 class="jobTitle">
              <a class="jcs-JobTitle" data-jk="live03" href="/viewjob?jk=live03">
                <span title="Technical Sales Specialist">Technical Sales Specialist</span>
              </a>
            </h2>
            <div class="company_location">
              <span data-testid="company-name">Connect6 Group</span>
              <div data-testid="text-location">Remote in Ontario</div>
            </div>
          </div>
          <div data-testid="slider_container">
            <div class="slider_list">
              <div data-testid="slider_sub_item">
                <div data-testid="belowJobSnippet">
                  <ul>
                    <li>Support clients with product and service options.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    `;

    const cards = parseIndeedSearchPage(html, SEARCH_URL);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      jobKey: "live03",
      title: "Technical Sales Specialist",
      company: "Connect6 Group",
      locationRaw: "Remote in Ontario"
    });
    expect(cards[0].summaryText).toContain("Support clients");
  });

  test("detects blocked Cloudflare pages", () => {
    expect(detectIndeedBlock(loadHtml("blocked-cloudflare.html"))).toContain("Enable JavaScript and cookies");
  });

  test("parses job detail content into a normalized snapshot", () => {
    const detail = parseIndeedDetailPage(loadHtml("detail-call01.html"), "call01");

    expect(detail).toMatchObject({
      jobKey: "call01",
      title: "Call Centre Representative",
      company: "Northern Reach Services",
      locationRaw: "Remote in Canada",
      remoteEligibility: "Canada",
      employmentType: "Full-time"
    });
    expect(detail.skills).toContain("phone support");
  });
});

describe("syncIndeedAlert", () => {
  test("syncs up to five pages, stops early on duplicate-only pages, and delivers only prospective leads once", async () => {
    const store = createStore();
    const deliveries: Array<{ target: string; message: string }> = [];
    let closed = false;

    const htmlByUrl = new Map<string, string>([
      [SEARCH_URL, loadHtml("search-page-1.html")],
      [`${SEARCH_URL}&start=10`, loadHtml("search-page-2.html")],
      [`${SEARCH_URL}&start=20`, loadHtml("search-page-3-duplicates.html")],
      ["https://ca.indeed.com/viewjob?jk=call01", loadHtml("detail-call01.html")],
      ["https://ca.indeed.com/viewjob?jk=vagueloc01", loadHtml("detail-vagueloc01.html")],
      ["https://ca.indeed.com/viewjob?jk=faroffice01", loadHtml("detail-faroffice01.html")]
    ]);
    const requestedSearchUrls: string[] = [];
    const requestedDetailUrls: string[] = [];

    const pageFetcher: IndeedPageFetcher = {
      async fetchSearchPage(url) {
        requestedSearchUrls.push(url);
        const html = htmlByUrl.get(url);
        if (!html) {
          throw new Error(`Unexpected search URL: ${url}`);
        }
        return html;
      },
      async fetchDetailPage(_jobKey, url) {
        requestedDetailUrls.push(url);
        const html = htmlByUrl.get(url);
        if (!html) {
          throw new Error(`Unexpected detail URL: ${url}`);
        }
        return html;
      },
      async close() {
        closed = true;
      }
    };

    const summary = await syncIndeedAlert({
      alert: createAlert(),
      store,
      pageFetcher,
      sendDiscordMessage: async (payload) => {
        deliveries.push(payload);
        return { deliveryId: `delivery-${deliveries.length}` };
      }
    });

    expect(summary.pagesFetched).toBe(3);
    expect(summary.detailPagesFetched).toBe(3);
    expect(summary.cardsSeen).toBe(5);
    expect(summary.cardsFilteredBeforeDetail).toBe(2);
    expect(summary.ingest.created).toBe(3);
    expect(summary.deliveriesSucceeded).toBe(2);
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0].message).toContain("Call Centre Representative");
    expect(deliveries[1].message).toContain("needs_review");
    expect(requestedSearchUrls).not.toContain(`${SEARCH_URL}&start=30`);
    expect(requestedDetailUrls).toHaveLength(3);
    expect(closed).toBe(true);

    expect(store.getLead("northern-reach-services-call-centre-representative")?.reviewStatus).toBe("shortlisted");
    expect(store.getLead("maple-mutual-contact-centre-agent")?.reviewStatus).toBe("needs_review");
    expect(store.getLead("prairie-warranty-customer-service-agent")?.reviewStatus).toBe("rejected");

    const secondSummary = await syncIndeedAlert({
      alert: createAlert(),
      store,
      pageFetcher: {
        async fetchSearchPage(url) {
          const html = htmlByUrl.get(url);
          if (!html) {
            throw new Error(`Unexpected search URL: ${url}`);
          }
          return html;
        },
        async fetchDetailPage(_jobKey, url) {
          const html = htmlByUrl.get(url);
          if (!html) {
            throw new Error(`Unexpected detail URL: ${url}`);
          }
          return html;
        },
        async close() {}
      },
      sendDiscordMessage: async (payload) => {
        deliveries.push(payload);
        return { deliveryId: `delivery-${deliveries.length}` };
      }
    });

    expect(secondSummary.ingest.created).toBe(0);
    expect(secondSummary.ingest.updated).toBe(3);
    expect(secondSummary.deliveriesSucceeded).toBe(0);
    expect(deliveries).toHaveLength(2);
  });

  test("downgrades detail-page failures to completed_with_errors and keeps surviving leads", async () => {
    const store = createStore();
    let closed = false;

    const summary = await syncIndeedAlert({
      alert: createAlert(),
      store,
      pageFetcher: {
        async fetchSearchPage(url) {
          if (url === SEARCH_URL) return loadHtml("search-page-1.html");
          if (url === `${SEARCH_URL}&start=10`) return loadHtml("search-page-2.html");
          if (url === `${SEARCH_URL}&start=20`) return loadHtml("search-page-3-duplicates.html");
          throw new Error(`Unexpected search URL: ${url}`);
        },
        async fetchDetailPage(jobKey, url) {
          if (jobKey === "vagueloc01") {
            throw new Error("Indeed returned a blocked page: Enable JavaScript and cookies to continue");
          }
          if (url === "https://ca.indeed.com/viewjob?jk=call01") return loadHtml("detail-call01.html");
          if (url === "https://ca.indeed.com/viewjob?jk=faroffice01") return loadHtml("detail-faroffice01.html");
          throw new Error(`Unexpected detail URL: ${url}`);
        },
        async close() {
          closed = true;
        }
      },
      sendDiscordMessage: async () => ({ deliveryId: "delivery-1" })
    });

    expect(summary.status).toBe("completed_with_errors");
    expect(summary.detailPagesFetched).toBe(2);
    expect(summary.ingest.created).toBe(2);
    expect(store.getLead("northern-reach-services-call-centre-representative")?.reviewStatus).toBe("shortlisted");
    expect(store.getLead("maple-mutual-contact-centre-agent")).toBeUndefined();
    expect(closed).toBe(true);
  });

  test("fails a sync run when Indeed returns a blocked page", async () => {
    const store = createStore();
    let closed = false;

    await expect(
      syncIndeedAlert({
        alert: createAlert(),
        store,
        pageFetcher: {
          async fetchSearchPage() {
            throw new Error("Indeed returned a blocked page: Enable JavaScript and cookies to continue");
          },
          async fetchDetailPage() {
            throw new Error("detail fetch should not run");
          },
          async close() {
            closed = true;
          }
        },
        sendDiscordMessage: async () => ({ deliveryId: "never" })
      })
    ).rejects.toThrow("Enable JavaScript and cookies to continue");

    const runs = store.listSyncRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      alertId: "call-centre-canada-remote",
      status: "failed"
    });
    expect(closed).toBe(true);
  });

  test("fails a sync run before navigation when the OpenClaw gateway preflight is unreachable", async () => {
    const store = createStore();
    const pageFetcher = createOpenClawIndeedPageFetcher({
      alert: createAlert(),
      runCommand: async (args) => {
        if (args[0] === "status") {
          return [
            "[memory] fts unavailable: no such module: fts5",
            JSON.stringify({
              gateway: {
                url: "ws://127.0.0.1:19001",
                reachable: false,
                error: "connect failed: connect EPERM 127.0.0.1:19001 - Local (undefined:undefined)"
              }
            })
          ].join("\n");
        }

        throw new Error(`Unexpected browser command: ${args.join(" ")}`);
      }
    });

    await expect(
      syncIndeedAlert({
        alert: createAlert(),
        store,
        pageFetcher,
        sendDiscordMessage: async () => ({ deliveryId: "never" })
      })
    ).rejects.toThrow("OpenClaw gateway is not reachable");

    const runs = store.listSyncRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      alertId: "call-centre-canada-remote",
      status: "failed",
      pagesFetched: 0,
      detailPagesFetched: 0
    });
    expect(runs[0].errorMessage).toContain("OpenClaw gateway is not reachable");
  });
});
