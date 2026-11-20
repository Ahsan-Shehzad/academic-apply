const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { chromium } = require("playwright-core"),
  { PublicPageBrowser } = require("../desktop/public-page-browser.cjs"),
  { extractListing } = require("../desktop/discovery.cjs");
(async () => {
  const url =
    "https://www.academictransfer.com/en/jobs/fixture/javascript-vacancy";
  const description =
    "Research and teach speech AI and natural language processing. Essential requirements include a PhD in computer science and relevant teaching experience. Submit an academic CV, a research statement and academic transcripts. This is a full-time position with research, teaching, supervision and collaborative duties. The post is open to applicants with research experience in artificial intelligence, computational linguistics and related fields. Applications close on 31 December 2099.";
  const posting = {
    "@type": "JobPosting",
    title: "Lecturer in Speech AI",
    hiringOrganization: { name: "Example University" },
    jobLocation: { address: { addressCountry: "NL" } },
    description,
    validThrough: "2099-12-31",
  };
  const content =
    "<h1>Lecturer in Speech AI</h1><p>" +
    description +
    '</p><script type="application/ld+json">' +
    JSON.stringify(posting) +
    '</script><a href="https://www.academictransfer.com/en/jobs/fixture/apply">Apply now</a>';
  const html =
    '<html><body><main>Loading the vacancy</main><script>setTimeout(()=>document.querySelector("main").innerHTML=' +
    JSON.stringify(content).replace(/</g, "\\u003c") +
    ",250)</script></body></html>";
  const reader = new PublicPageBrowser({
    launch: async (options) => {
      const browser = await chromium.launch(options);
      return {
        newContext: async (settings) => {
          const context = await browser.newContext(settings),
            route = context.route.bind(context);
          context.route = (pattern, handler) =>
            route(pattern, (r) =>
              r.request().url() === url
                ? r.fulfill({
                    status: 200,
                    contentType: "text/html",
                    body: html,
                  })
                : handler(r),
            );
          return context;
        },
        close: () => browser.close(),
      };
    },
  });
  try {
    const page = await reader.read(url, new AbortController().signal),
      job = extractListing(page.html, page.url, {});
    assert.equal(job.title, "Lecturer in Speech AI");
    assert.equal(job.institution, "Example University");
    assert.equal(job.country, "Netherlands");
    assert.equal(job.deadline, "2099-12-31");
    assert.match(job.description, /academic transcripts/);
    assert.match(job.applicationUrl, /\/apply$/);
    assert.equal(page.method, "headless_chrome");
    fs.mkdirSync("qa", { recursive: true });
    const report = {
      realChrome: true,
      headless: true,
      javascriptRendered: true,
      fullDescriptionCharacters: job.description.length,
      employerAndCountryAndDeadlineAndApplyLink: true,
      fixtureNetworkIntercepted: true,
      personalProfileUntouched: true,
    };
    fs.writeFileSync(
      "qa/public-browser-check.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await reader.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
