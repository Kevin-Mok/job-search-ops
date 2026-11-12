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

describe("syncIndeedAlert rollout gate", () => {
  test("refuses before a search/detail fetch or Discord send even when alert enabled", async () => {
    let calls = 0;
    const request = async () => { calls++; throw new Error("Forbidden automated request"); };
    const store = createStore();
    store.sources.setKill("global", false);
    store.sources.setKill("indeed", false);
    await expect(syncIndeedAlert({ alert: createAlert(), store, pageFetcher: { fetchSearchPage: request, fetchDetailPage: request, close: request }, sendDiscordMessage: request })).rejects.toThrow(/budget = 0/);
    expect(calls).toBe(0);
    expect(store.listSyncRuns()).toHaveLength(0);
  });
});
