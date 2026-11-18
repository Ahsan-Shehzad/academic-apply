const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Store } = require("../desktop/store.cjs");
const { Connectors } = require("../desktop/connectors.cjs");
const { rawFetch } = require("../desktop/discovery.cjs");
const { readBoards } = require("../desktop/employer-feeds.cjs");
const { accessIssue } = require("../desktop/source-access.cjs");
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-source-check-")),
    store = await Store.open(root),
    connectors = new Connectors(store);
  let next = 0;
  const sources = connectors.catalog();
  const results = [];
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (next < sources.length) {
        const source = sources[next++];
        let result;
        try {
          result = await connectors.test(
            source.id,
            null,
            AbortSignal.timeout(30000),
          );
        } catch (error) {
          result = {
            connectorId: source.id,
            ...accessIssue(error),
          };
        }
        results.push({
          ...result,
          name: source.name,
          url: source.base,
          access: source.access,
          guideUrl: source.guideUrl,
          checkedAt: new Date().toISOString(),
        });
        console.log(
          `${results.length}/${sources.length} ${source.id} ${result.status}`,
        );
        fs.writeFileSync(
          "qa/source-access-live.json",
          JSON.stringify(
            { checkedAt: new Date().toISOString(), results },
            null,
            2,
          ),
        );
      }
    }),
  );
  const apiSamples = [];
  for (const [provider, board] of [
    ["greenhouse", "greenhouse"],
    ["lever", "mistral"],
    ["ashby", "ashby"],
  ]) {
    try {
      const feed = await readBoards(
        provider,
        [board],
        rawFetch,
        AbortSignal.timeout(30000),
      );
      apiSamples.push({
        provider,
        board,
        status: feed.jobs.length ? "available" : "empty",
        records: feed.jobs.length,
      });
    } catch (error) {
      apiSamples.push({
        provider,
        board,
        status: "unavailable",
        message: error.message,
      });
    }
  }
  const report = {
    checkedAt: new Date().toISOString(),
    note: "Release-time public access check. available means candidate links/feed records were returned, not that every listing is relevant or importable. Manual and unconfigured sources were method-reviewed, not scraped.",
    results: results.sort((a, b) => a.connectorId.localeCompare(b.connectorId)),
    apiSamples,
  };
  fs.writeFileSync(
    "qa/source-access-live.json",
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    "resources/source-access-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      counts: results.reduce(
        (a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a),
        {},
      ),
      apiSamples,
    }),
  );
  store.close();
})();
