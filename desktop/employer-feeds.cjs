"use strict";
function endpoint(provider, board) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(board))
    throw new Error("Use an employer board identifier, not a URL.");
  if (provider === "greenhouse")
    return `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
  if (provider === "lever")
    return `https://api.lever.co/v0/postings/${board}?mode=json`;
  if (provider === "ashby")
    return `https://api.ashbyhq.com/posting-api/job-board/${board}`;
  throw new Error("Unsupported public employer API");
}
async function readBoards(provider, boards, fetcher, signal) {
  const jobs = [],
    failures = [];
  for (const board of boards) {
    try {
      const page = await fetcher(endpoint(provider, board), signal);
      const data = JSON.parse(page.html);
      const rows = provider === "lever" ? data : data.jobs;
      if (!Array.isArray(rows))
        throw new Error("Unexpected public API response");
      for (const row of rows) {
        if (row.isListed === false) continue;
        const url = row.absolute_url || row.hostedUrl || row.jobUrl;
        if (!url || !/^https:\/\//.test(url)) continue;
        jobs.push({
          url,
          title: row.title || row.text || "",
          board,
          html: `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: row.title || row.text, description: row.content || row.descriptionHtml || row.descriptionPlain || row.description || "", hiringOrganization: { name: data.meta?.name || board }, jobLocation: { address: { addressLocality: row.location?.name || row.categories?.location || row.location || "", addressCountry: row.address?.postalAddress?.addressCountry || "" } }, url, datePosted: row.publishedAt || row.updated_at }).replace(/</g, "\\u003c")}</script>`,
        });
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      failures.push({ board, message: error.message });
    }
  }
  if (!jobs.length && failures.length)
    throw new Error(failures.map((x) => `${x.board}: ${x.message}`).join("; "));
  return { jobs, failures };
}
module.exports = { endpoint, readBoards };
