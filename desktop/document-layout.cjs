"use strict";
const fs = require("node:fs");
const { assertLayer } = require("./keyword-layer.cjs");
const { icon, networkIcon, sectionIcon } = require("./cv-icons.cjs");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  Tab,
  TabStopType,
  ExternalHyperlink,
  LevelFormat,
} = require("docx");

const DOCUMENT_STYLE = Object.freeze({
  version: 5,
  blue: "1F4E79",
  black: "000000",
  font: "Calibri",
  bodySize: 22,
});
const WIDTH = 9638; // A4 with 20 mm margins, in twips.
const recordSections =
  /^(Education|Teaching and Academic Appointments|Research Experience|Professional Experience|Academic and Professional Experience|Selected Research and Applied Projects|Selected Projects|Honours and Awards)$/;
const publicationSection = /Publications|Manuscripts Under Review/;

function textRuns(text, options = {}) {
  const { authorSurname, ...runOptions } = options;
  const surname = String(authorSurname || "").replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const author = surname ? `\\b(?:[A-Z]\\.\\s*)+${surname}\\b` : "(?!)";
  const parts = String(text).split(
    new RegExp(`(https:\\/\\/doi\\.org\\/[^\\s]+|${author})`, "g"),
  );
  return parts.filter(Boolean).map((part) =>
    part.startsWith("https://doi.org/")
      ? new ExternalHyperlink({
          link: part.replace(/[.,;]+$/, ""),
          children: [
            new TextRun({
              text: part,
              color: DOCUMENT_STYLE.black,
              size: runOptions.size,
              underline: {},
            }),
          ],
        })
      : new TextRun({
          text: part,
          color: DOCUMENT_STYLE.black,
          ...runOptions,
          bold:
            !!runOptions.bold ||
            (!!surname && new RegExp(`^${author}$`).test(part)),
        }),
  );
}

async function writeDocx(file, content, email, options = {}) {
  const isLetter = options.type === "Cover letter" || !!content.letter;
  const isCv =
    options.type === "Academic CV" ||
    /curriculum vitae/i.test(content.subtitle || "");
  const children = [
    new Paragraph({
      text: content.title,
      heading: HeadingLevel.TITLE,
      keepNext: true,
      spacing: { after: 80 },
    }),
  ];
  children.push(
    new Paragraph({
      text: options.type === "Cover letter" ? "Cover Letter" : content.subtitle,
      style: "DocumentSubtitle",
      keepNext: true,
      spacing: { after: 100 },
    }),
  );
  const contact = options.contact;
  const contactLines = contact
    ? [
        ...(isCv && contact.location ? [[{ label: contact.location }]] : []),
        [
          ...contact.emails.map((e) => ({ label: e, url: `mailto:${e}` })),
          ...contact.phones.map((p) => ({
            label: p,
            url: `tel:${p.replace(/[^+\d]/g, "")}`,
          })),
        ],
        ...(isCv ? [contact.links.slice(0, 4), contact.links.slice(4)] : []),
      ].filter((line) => line.length)
    : [];
  for (const line of contactLines)
    children.push(
      new Paragraph({
        children: line.flatMap((item, index) => [
          ...(index
            ? [new TextRun({ text: "  |  ", size: 19, color: "666666" })]
            : []),
          ...(item.url
            ? [
                new ExternalHyperlink({
                  link: item.url,
                  children: [
                    ...icon(networkIcon(item.url), 10),
                    new TextRun({
                      text: item.label,
                      color: "000000",
                      size: 19,
                      underline: {},
                    }),
                  ],
                }),
              ]
            : [
                ...icon("i-location", 10),
                new TextRun({ text: item.label, color: "000000", size: 19 }),
              ]),
        ]),
        keepNext: true,
        spacing: { after: 80 },
      }),
    );
  if (email && !contact)
    children.push(
      new Paragraph({
        children: [
          new ExternalHyperlink({
            link: `mailto:${email}`,
            children: [new TextRun({ text: email, color: "000000", size: 20 })],
          }),
        ],
        keepNext: true,
        spacing: { after: isLetter ? 240 : 160 },
      }),
    );
  if (isLetter && content.letter) {
    children.push(
      new Paragraph({
        text: content.letter.date,
        keepNext: true,
        spacing: { after: 160 },
      }),
    );
    children.push(
      new Paragraph({
        text: content.letter.recipient,
        keepNext: true,
        spacing: { after: 160 },
      }),
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${options.type === "Reference letter" ? "Reference for" : "Application for"} ${content.letter.subject}`,
            bold: true,
            color: "000000",
          }),
        ],
        keepNext: true,
        spacing: { after: 200 },
      }),
    );
  }
  for (const section of content.sections) {
    if (section.heading)
      children.push(
        new Paragraph({
          children: [
            ...(!isCv ? icon(sectionIcon(section.heading), 12) : []),
            new TextRun({ text: section.heading }),
          ],
          heading: HeadingLevel.HEADING_1,
          keepNext: true,
          spacing: { before: 180, after: 90 },
        }),
      );
    const records = isCv && recordSections.test(section.heading);
    const citations = isCv && publicationSection.test(section.heading);
    const blocks = section.text.split(/\n\s*\n/).filter((s) => s.trim());
    for (const [blockIndex, block] of blocks.entries()) {
      const lines = block.split("\n").filter((s) => s.trim());
      for (const [lineIndex, raw] of lines.entries()) {
        const bullet = /^[•*\-]\s+/.test(raw);
        const line = bullet ? raw.replace(/^[•*\-]\s+/, "") : raw;
        const recordTitle =
          (records ||
            (isCv && section.heading === "Technical and Teaching Skills")) &&
          lineIndex === 0 &&
          lines.length > 1 &&
          !bullet;
        const meta =
          records &&
          /^(Education|Teaching and Academic Appointments|Research Experience|Professional Experience|Academic and Professional Experience)$/.test(
            section.heading,
          ) &&
          !bullet &&
          lineIndex > 0 &&
          !/^(Thesis:)/.test(line);
        const citationFirst = citations && lineIndex === 0;
        let runs;
        if (recordTitle && line.includes("\t")) {
          const [title, dates] = line.split("\t");
          runs = [
            ...textRuns(title, { bold: true }),
            new TextRun({ children: [new Tab()] }),
            ...textRuns(dates, { size: 20 }),
          ];
        } else if (
          isCv &&
          section.heading === "Technical and Teaching Skills" &&
          line.includes(":")
        ) {
          const split = line.indexOf(":");
          runs = [
            ...textRuns(line.slice(0, split + 1), { bold: true }),
            ...textRuns(line.slice(split + 1)),
          ];
        } else
          runs = textRuns(line, {
            authorSurname: citations
              ? content.title.trim().split(/\s+/).at(-1)
              : "",
            bold: recordTitle,
            ...(citations ? { size: 21 } : {}),
            ...(meta ? { italics: true, size: 21 } : {}),
          });
        children.push(
          new Paragraph({
            children: runs,
            ...(bullet
              ? { numbering: { reference: "academic-bullets", level: 0 } }
              : {}),
            ...(citations
              ? { indent: { left: 360, hanging: citationFirst ? 360 : 0 } }
              : {}),
            tabStops: [{ type: TabStopType.RIGHT, position: WIDTH }],
            spacing: {
              before:
                blockIndex > 0 && lineIndex === 0 ? (records ? 120 : 90) : 0,
              after: isLetter
                ? 110
                : citations
                  ? lineIndex === lines.length - 1
                    ? 80
                    : 30
                  : bullet
                    ? 45
                    : 60,
              line: isLetter ? 264 : 252,
            },
            keepNext:
              (recordTitle || (records && meta) || citationFirst) &&
              lineIndex < lines.length - 1,
            keepLines: citations || recordTitle || (records && !bullet),
            widowControl: true,
          }),
        );
      }
    }
  }
  if (assertLayer(options.keywordLayer))
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: options.keywordLayer.text,
            vanish: true,
            size: 2,
            color: "000000",
          }),
        ],
        run: { vanish: true },
        spacing: { before: 0, after: 0, line: 1 },
      }),
    );
  const footer = () =>
    new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: `${content.title}  |  `,
              size: 17,
              color: "000000",
            }),
            new TextRun({
              children: [
                "Page ",
                PageNumber.CURRENT,
                " of ",
                PageNumber.TOTAL_PAGES,
              ],
              size: 17,
              color: "000000",
            }),
          ],
        }),
      ],
    });
  const doc = new Document({
    creator: content.title,
    title: content.subtitle,
    description: "Academic application document",
    keywords: assertLayer(options.keywordLayer)
      ? options.keywordLayer.terms.join(", ")
      : undefined,
    styles: {
      default: {
        document: {
          run: { font: DOCUMENT_STYLE.font, size: 22, color: "000000" },
          paragraph: { spacing: { line: 252, after: 80 } },
        },
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          run: {
            font: "Calibri",
            size: 44,
            bold: true,
            color: DOCUMENT_STYLE.blue,
          },
          paragraph: { keepNext: true },
        },
        {
          id: "DocumentSubtitle",
          name: "Document Subtitle",
          basedOn: "Normal",
          next: "Normal",
          run: { size: 23, bold: true, color: DOCUMENT_STYLE.blue },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: {
            font: "Calibri",
            size: 25,
            bold: true,
            color: DOCUMENT_STYLE.blue,
          },
          paragraph: { keepNext: true },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          run: { size: 23, bold: true, color: DOCUMENT_STYLE.blue },
          paragraph: { keepNext: true },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "academic-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                run: { color: "000000", font: "Calibri" },
                paragraph: { indent: { left: 300, hanging: 180 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: 1134,
              bottom: 1134,
              left: 1134,
              right: 1134,
              header: 540,
              footer: 540,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: content.title,
                    size: 18,
                    color: "000000",
                  }),
                  new TextRun({ children: [new Tab()] }),
                  new TextRun({
                    text: isCv
                      ? "Academic Curriculum Vitae"
                      : isLetter
                        ? "Cover Letter"
                        : content.subtitle,
                    size: 18,
                    color: "000000",
                  }),
                ],
                tabStops: [{ type: TabStopType.RIGHT, position: WIDTH }],
              }),
            ],
          }),
        },
        footers: { default: footer(), first: footer() },
        children,
      },
    ],
  });
  fs.writeFileSync(file, await Packer.toBuffer(doc));
}
module.exports = { writeDocx, DOCUMENT_STYLE };
