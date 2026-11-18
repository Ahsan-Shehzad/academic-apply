const fs = require("node:fs");
const path = require("node:path");
const cheerio = require("cheerio");
const { Resvg } = require("@resvg/resvg-js");
const source =
  process.argv[2] ||
  path.resolve("../Job-application-related-data/final-cv/index.html");
const $ = cheerio.load(fs.readFileSync(source, "utf8"));
const output = path.resolve("resources/cv-icons");
fs.mkdirSync(output, { recursive: true });
const colors = {
  linkedin: "0A66C2",
  scholar: "4285F4",
  webofscience: "5E33BF",
  scopus: "E9711C",
  orcid: "A6CE39",
  github: "181717",
  researchgate: "00CCBB",
};
let count = 0;
$("symbol[id]").each((_, element) => {
  const id = $(element).attr("id");
  if (/whatsapp|wechat/.test(id)) return;
  const brand = id.startsWith("i-brand-");
  const color = brand ? colors[id.slice(8)] || "1F4E79" : "1F4E79";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${$(element).attr("viewBox") || "0 0 24 24"}" fill="#${color}">${$(element).html()}</svg>`;
  fs.writeFileSync(path.join(output, id + ".svg"), svg);
  fs.writeFileSync(
    path.join(output, id + ".png"),
    new Resvg(svg, { fitTo: { mode: "width", value: 96 } }).render().asPng(),
  );
  count++;
});
console.log(count, "original CV symbols exported");
