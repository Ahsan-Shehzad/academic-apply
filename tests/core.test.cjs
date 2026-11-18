const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  matchJob,
  canonicalUrl,
  deadlineInfo,
  nextRun,
  inside,
  JobSchema,
  parseJson,
} = require("../desktop/core.cjs");
const {
  robotsAllowed,
  privateAddress,
  extractListing,
  listingLinks,
} = require("../desktop/discovery.cjs");
const {
  auditContent,
  cvContent,
  addAcademicSections,
} = require("../desktop/documents.cjs");
const { orderAcademicSections } = require("../desktop/academic-content.cjs");
const { Store } = require("../desktop/store.cjs");
const { Tasks } = require("../desktop/tasks.cjs");
const { publicFacts } = require("../desktop/profile.cjs");
test("academic CV separates appointment types and orders evidence for the advertised track", () => {
  const profile = {
    personal: { name: "Candidate", summary: "An academic researcher." },
    education: [],
    experience: [
      {
        title: "Lecturer",
        organization: "Earlier university",
        start: "2018-01-01",
        end: "2020-01-01",
        bullets: ["Teaching"],
      },
      {
        title: "Research Associate",
        organization: "Research university",
        start: "2020-01-01",
        end: "2025-01-01",
        bullets: ["Research"],
      },
      {
        title: "Lecturer",
        organization: "Current university",
        start: "2024-01-01",
        ongoing: true,
        bullets: ["Teaching"],
      },
      {
        title: "Data Scientist",
        organization: "Company",
        start: "2019-01-01",
        end: "2020-01-01",
        bullets: ["Analytics"],
      },
    ],
  };
  const faculty = orderAcademicSections(cvContent(profile), {
    title: "Lecturer",
  });
  const appointments = faculty.sections.find(
    (s) => s.heading === "Teaching and Academic Appointments",
  );
  assert.ok(
    appointments.text.indexOf("Current university") <
      appointments.text.indexOf("Earlier university"),
  );
  assert.ok(!appointments.text.includes("Research university"));
  const research = orderAcademicSections(cvContent(profile), {
    title: "Postdoctoral Researcher",
  });
  assert.ok(
    research.sections.findIndex((s) => s.heading === "Research Experience") <
      research.sections.findIndex(
        (s) => s.heading === "Teaching and Academic Appointments",
      ),
  );
});

test("academic citations separate submitted manuscripts from published and accepted work", () => {
  const profile = {
    publications: [
      { title: "Published work", year: 2025, status: "published" },
      { title: "Accepted work", year: 2026, status: "accepted" },
      {
        title: "Submitted manuscript",
        year: 2026,
        status: "under_review",
        venue: "Journal",
      },
    ],
  };
  const result = addAcademicSections({ sections: [] }, profile, "");
  const published = result.sections.find(
    (s) => s.heading === "Peer Reviewed Publications",
  ).text;
  const review = result.sections.find(
    (s) => s.heading === "Manuscripts Under Review",
  ).text;
  assert.ok(!published.includes("Submitted manuscript"));
  assert.ok(published.includes("Status: accepted"));
  assert.ok(review.includes("Status: under review"));
  assert.ok(review.includes("Submitted to Journal"));
});
test("matching separates specialist research and broad computing teaching", () => {
  const profile = {
    education: [{ degree: "PhD", ongoing: false }],
    experience: [{ title: "Lecturer" }],
  };
  const research = matchJob(
    {
      title: "Postdoctoral researcher in speech AI",
      description: "PhD; multimodal graph learning for cognitive impairment",
      official: true,
      deadline: "2026-12-01",
    },
    profile,
  );
  const teaching = matchJob(
    {
      title: "Lecturer in Computer Science",
      description: "PhD, computing teaching and software engineering",
      official: true,
      deadline: "2026-12-01",
    },
    profile,
  );
  assert.equal(research.track, "Research");
  assert.ok(research.score >= 70);
  assert.equal(teaching.track, "Teaching / faculty");
  assert.ok(teaching.score >= 40);
  assert.ok(teaching.gaps.some((g) => g.includes("sponsorship")));
});
test("deduplication strips tracking but preserves vacancy identifiers", () => {
  assert.equal(
    canonicalUrl("https://jobs.example/role/2/?utm_source=x#apply"),
    "https://jobs.example/role/2",
  );
  assert.notEqual(
    canonicalUrl("https://jobs.example/apply?id=1"),
    canonicalUrl("https://jobs.example/apply?id=2"),
  );
});
test("deadline uncertainty is preserved and closing urgency is computed", () => {
  assert.equal(
    deadlineInfo({ deadline: null, deadlineText: "Until filled" }).kind,
    "unknown",
  );
  assert.equal(
    deadlineInfo(
      { deadline: "2026-11-18", deadlineTimezone: "Not stated" },
      new Date("2026-11-16T00:00:00Z"),
    ).kind,
    "urgent",
  );
  assert.match(
    deadlineInfo({ deadline: "2026-11-18", deadlineTimezone: "Not stated" })
      .label,
    /time not stated/,
  );
});
test("weekly schedules honor timezone and skip a completed occurrence", () => {
  const schedule = { day: 1, time: "09:00", timezone: "Asia/Shanghai" };
  assert.equal(
    nextRun(schedule, new Date("2026-11-15T01:00:00Z")),
    "2026-11-16T01:00:00.000Z",
  );
  assert.equal(
    nextRun(schedule, new Date("2026-11-16T01:01:00Z")),
    "2026-11-23T01:00:00.000Z",
  );
  const dst = { day: 1, time: "09:00", timezone: "Europe/London" };
  assert.equal(
    nextRun(dst, new Date("2026-03-28T00:00:00Z")),
    "2026-03-30T08:00:00.000Z",
  );
});
test("paths cannot escape package and application roots", () => {
  assert.ok(inside("C:\\data", "C:\\data\\package\\cv.pdf"));
  assert.ok(!inside("C:\\data", "C:\\database\\cv.pdf"));
  assert.ok(!inside("C:\\data", "C:\\data\\..\\private.pdf"));
});
test("robots exclusions respect longer allow rules", () => {
  const robots = "User-agent: *\nDisallow: /private\nAllow: /private/public\n";
  assert.equal(robotsAllowed(robots, "/jobs"), true);
  assert.equal(robotsAllowed(robots, "/private/file"), false);
  assert.equal(robotsAllowed(robots, "/private/public/job"), true);
});
test("untrusted URLs cannot resolve to local or private addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.18.1.2",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(privateAddress(address), true, address);
  assert.equal(privateAddress("8.8.8.8"), false);
});
test("structured job extraction preserves eligibility and official link evidence", () => {
  const html =
    '<html><head><script type="application/ld+json">' +
    JSON.stringify({
      "@type": "JobPosting",
      title: "Lecturer in Computing",
      hiringOrganization: { name: "Example University" },
      description:
        "<p>PhD required. Teaching software engineering. Submit a CV and cover letter.</p>",
      validThrough: "2026-12-01T17:00:00+10:00",
      jobLocation: { address: { addressCountry: "AU" } },
      datePosted: "2026-11-10",
    }) +
    '</script></head><body><main><h1>Lecturer</h1><a href="https://careers.example.edu/apply/12">Apply now</a></main></body></html>';
  const job = extractListing(html, "https://example.edu/jobs/12");
  assert.equal(job.institution, "Example University");
  assert.equal(job.country, "Australia");
  assert.equal(job.deadline, "2026-12-01T17:00:00+10:00");
  assert.equal(job.deadlineTimezone, "Advertised offset");
  assert.equal(job.official, true);
  assert.equal(job.applicationUrl, "https://careers.example.edu/apply/12");
  assert.deepEqual(job.requiredDocuments, ["Academic CV", "Cover letter"]);
});
test("listing links exclude unrelated hosts and account navigation", () => {
  const html =
    '<a href="/jobs/123">Lecturer in Computing</a><a href="https://evil.example/jobs/2">Postdoc</a><a href="/jobs/privacy">Privacy policy</a>';
  assert.deepEqual(listingLinks(html, "https://example.edu/search"), [
    { url: "https://example.edu/jobs/123", title: "Lecturer in Computing" },
  ]);
});

test("public board extraction uses employer identity and the advertised deadline", () => {
  const job = extractListing(
    '<main><h1>Postdoctoral Researcher in Speech AI</h1><time datetime="2026-12-11T22:59:59.000Z">11 Dec</time><time datetime="2026-11-12T06:00:00Z">Posted</time><a href="/en/employer/leiden/"><img alt="Leiden University"></a><p>Machine learning research. PhD required.</p></main>',
    "https://www.academictransfer.com/en/jobs/1/speech",
    { id: "academictransfer", kind: "board", countries: ["Netherlands"] },
  );
  assert.equal(job.institution, "Leiden University");
  assert.equal(job.deadline, "2026-12-11T22:59:59.000Z");
  assert.equal(job.deadlineTimezone, "Advertised offset");
  assert.equal(job.official, false);
});
test("document content rejects invisible manipulation and unresolved placeholders", () => {
  assert.ok(
    auditContent({
      sections: [{ heading: "Awards", text: "\uFFFD Academic award" }],
    }).errors.some((e) => e.includes("replacement character")),
  );
  assert.equal(
    auditContent({
      sections: [{ heading: "Profile", text: "A qualified lecturer." }],
    }).errors.length,
    0,
  );
  assert.ok(
    auditContent({ sections: [{ heading: "", text: "[TODO] text\u200B" }] })
      .errors.length === 2,
  );
});
test("AI context removes private records and referee contacts", () => {
  const p = {
    personal: {
      name: "Candidate",
      private_information: { passport: "secret" },
      contact: {
        emails: [{ value: "x@y.org" }],
        phones: [{ number: "private" }],
        addresses: [{ city: "Home" }],
      },
    },
    references: [{ email: "referee@private.org" }],
  };
  const safe = publicFacts(p);
  assert.equal(safe.personal.private_information, undefined);
  assert.equal(safe.personal.contact.addresses, undefined);
  assert.equal(safe.references, undefined);
  assert.equal(p.personal.private_information.passport, "secret");
});
test("provider JSON parser supports fenced output and rejects invalid output", () => {
  assert.deepEqual(parseJson('```json\n{"x":1}\n```'), { x: 1 });
  assert.throws(() => parseJson("not valid"));
});
test("SQLite persists facts and marks interrupted work without resubmitting", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-store-"));
  const store = await Store.open(dir);
  store.put("tasks", { id: "task", status: "running" });
  store.put("applications", { id: "app", status: "submission_uncertain" });
  store.close();
  const reopened = await Store.open(dir);
  assert.equal(reopened.get("tasks", "task").status, "interrupted");
  assert.equal(
    reopened.get("applications", "app").status,
    "submission_uncertain",
  );
  assert.ok(fs.existsSync(path.join(dir, "academicapply.sqlite.bak")));
  reopened.close();
});
test("task queue serializes mutation and records cancellation", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-tasks-"));
  const store = await Store.open(dir);
  const tasks = new Tasks(store);
  const sequence = [];
  tasks.start("test", "First", async () => {
    sequence.push(1);
    await new Promise((r) => setTimeout(r, 30));
    sequence.push(2);
    return { message: "done" };
  });
  const second = tasks.start("test", "Second", async () => {
    sequence.push(3);
  });
  tasks.cancel(second.id);
  await tasks.idle();
  assert.deepEqual(sequence, [1, 2]);
  assert.equal(store.get("tasks", second.id).status, "cancelled");
  store.close();
});
