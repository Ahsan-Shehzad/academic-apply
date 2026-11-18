const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { Store } = require("../desktop/store.cjs");
const { Discovery } = require("../desktop/discovery.cjs");
const { defaultSearch } = require("../desktop/core.cjs");
test("AI discovery shortlists only fetched source URLs and verifies pages before saving", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-ai-discovery-"));
  const store = await Store.open(root);
  try {
    const vacancy =
      "https://www.academictransfer.com/en/jobs/123/lecturer-computing";
    const search = {
      ...defaultSearch(),
      countries: ["Netherlands"],
      sources: ["academictransfer"],
    };
    let options;
    const providers = {
      run: async (prompt, settings) => {
        options = settings;
        return JSON.stringify({
          jobs: [{ url: vacancy, title: "Lecturer in Computing" }],
        });
      },
    };
    const discovery = new Discovery(store, providers);
    discovery.fetchPage = async (url) =>
      url === vacancy
        ? {
            url,
            html: `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Lecturer in Computing", hiringOrganization: { name: "Example University" }, jobLocation: { address: { addressCountry: "NL" } }, description: "Teach computer science and conduct research in speech AI, machine learning and interpretable AI. A PhD in computing and relevant teaching experience are essential.", validThrough: "2099-12-01" })}</script>`,
          }
        : {
            url,
            html: '<a href="/en/jobs/123/lecturer-computing">Lecturer in Computing</a>',
          };
    const result = await discovery.aiSearch(
      search,
      () => {},
      new AbortController().signal,
    );
    assert.equal(result.added, 1);
    assert.equal(
      store.get("jobs", result.jobIds[0]).institution,
      "Example University",
    );
    assert.equal(options.webSearch, undefined);
    assert.deepEqual(
      options.outputSchema.properties.jobs.items.properties.url.enum,
      [vacancy],
    );
    providers.run = async () =>
      JSON.stringify({ jobs: [{ url: "https://untrusted.example/invented" }] });
    await assert.rejects(
      discovery.aiSearch(search, () => {}, new AbortController().signal),
      /outside the verified candidate pool/,
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("unreadable connector candidates report the source failure without invoking AI", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "academic-ai-source-error-"),
  );
  const store = await Store.open(root);
  try {
    let invoked = false;
    const discovery = new Discovery(store, {
      run: async () => {
        invoked = true;
      },
    });
    discovery.fetchPage = async () => {
      throw new Error("HTTP 403");
    };
    const logs = [];
    await assert.rejects(
      discovery.aiSearch(
        {
          ...defaultSearch(),
          countries: ["Netherlands"],
          sources: ["academictransfer"],
        },
        (update) => logs.push(update),
        new AbortController().signal,
      ),
      /No readable vacancy links/,
    );
    assert.equal(invoked, false);
    assert.ok(
      logs.some(
        (line) => line.level === "warning" && line.message.includes("403"),
      ),
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
