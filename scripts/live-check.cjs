const fs = require("node:fs");
const path = require("node:path");
const { Store } = require("../desktop/store.cjs");
const { Providers } = require("../desktop/providers.cjs");
const { fetchPage, listingLinks } = require("../desktop/discovery.cjs");
(async () => {
  const root = path.resolve(".test-data/live");
  const store = await Store.open(root);
  const providers = new Providers(store);
  const results = { at: new Date().toISOString(), providers: [], sources: [] };
  try {
    for (const provider of ["codex", "antigravity"]) {
      const result = await providers.health(provider, true);
      results.providers.push({
        provider,
        status: result.status,
        message: result.message,
        version: result.version,
        models: result.models?.map((m) => m.id),
        inferencePassed: !!result.inferenceAt,
      });
      console.log(provider, result.status, result.message);
    }
    for (const url of [
      "https://euraxess.ec.europa.eu/jobs/search?keywords=computer",
      "https://www.academictransfer.com/en/jobs/",
      "https://uniroles.com.au/",
      "https://careers.kaust.edu.sa/",
    ]) {
      try {
        const page = await fetchPage(url);
        const links = listingLinks(page.html, page.url);
        results.sources.push({ url, status: "readable", links: links.length });
        console.log(url, "readable", links.length, "links");
      } catch (error) {
        results.sources.push({
          url,
          status: "unavailable",
          error: error.message,
        });
        console.log(url, error.message);
      }
    }
    fs.mkdirSync("qa", { recursive: true });
    fs.writeFileSync("qa/live-results.json", JSON.stringify(results, null, 2));
  } finally {
    providers.close();
    store.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
