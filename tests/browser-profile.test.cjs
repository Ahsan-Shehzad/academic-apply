const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright-core");
const {
  Browser,
  chromePath,
  detectChromeProfiles,
  readDevToolsActivePort,
} = require("../desktop/browser.cjs");
const { PublicPageBrowser } = require("../desktop/public-page-browser.cjs");
const { PortalMcpServer } = require("../desktop/portal-mcp.cjs");
const { Store } = require("../desktop/store.cjs");

test("detectChromeProfiles reads profiles from Local State and skips System Profile", () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-userdata-"));
  try {
    fs.mkdirSync(path.join(userDataDir, "Default"), { recursive: true });
    fs.mkdirSync(path.join(userDataDir, "Profile 1"), { recursive: true });
    fs.mkdirSync(path.join(userDataDir, "System Profile"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataDir, "Local State"),
      JSON.stringify({
        profile: {
          info_cache: {
            Default: { name: "Personal", user_name: "person@example.org" },
            "Profile 1": { name: "Research", user_name: "lab@example.edu" },
          },
        },
      }),
    );

    const detected = detectChromeProfiles(userDataDir);
    assert.equal(detected.exists, true);
    assert.deepEqual(
      detected.profiles.map((p) => [p.directory, p.name, p.userName]),
      [
        ["Default", "Personal", "person@example.org"],
        ["Profile 1", "Research", "lab@example.edu"],
      ],
    );
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("Browser.profileTarget switches cleanly between dedicated and google profile modes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-profile-mode-"));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-dir-"));
  const store = await Store.open(root);
  try {
    fs.mkdirSync(path.join(userDataDir, "Profile 2"), { recursive: true });
    const browser = new Browser(store, {});

    const dedicated = browser.profileTarget();
    assert.equal(dedicated.mode, "dedicated");
    assert.equal(dedicated.userDataDir, path.join(root, "chrome-profile"));
    assert.equal(dedicated.profileDirectory, "");

    store.put("settings", {
      ...store.settings(),
      chromeProfileMode: "google",
      chromeUserDataDir: userDataDir,
      chromeProfileDirectory: "Profile 2",
    });

    const google = browser.profileTarget();
    assert.equal(google.mode, "google");
    assert.equal(google.userDataDir, userDataDir);
    assert.equal(google.profileDirectory, "Profile 2");
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("Browser.importFromChromeProfile copies Local State and session storage into dedicated profile", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-import-"));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-src-"));
  const store = await Store.open(root);
  try {
    const srcProfile = path.join(userDataDir, "Profile 1");
    fs.mkdirSync(path.join(srcProfile, "Network"), { recursive: true });
    fs.mkdirSync(path.join(srcProfile, "Local Storage", "leveldb"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(srcProfile, "Session Storage"), { recursive: true });

    fs.writeFileSync(
      path.join(userDataDir, "Local State"),
      JSON.stringify({
        os_crypt: { encrypted_key: "synthetic" },
        profile: {
          info_cache: {
            "Profile 1": { name: "Synthetic", user_name: "user@example.org" },
          },
        },
      }),
    );
    fs.writeFileSync(path.join(srcProfile, "Preferences"), '{"ok":true}');
    fs.writeFileSync(path.join(srcProfile, "Network", "Cookies"), "SQLite");
    fs.writeFileSync(
      path.join(srcProfile, "Local Storage", "leveldb", "000003.log"),
      "lsdata",
    );
    fs.writeFileSync(
      path.join(srcProfile, "Session Storage", "CURRENT"),
      "MANIFEST-000001",
    );

    const browser = new Browser(store, {});
    const res = await browser.importFromChromeProfile("Profile 1", userDataDir);
    assert.equal(res.importedProfile.directory, "Profile 1");
    assert.ok(res.copiedCount >= 5);

    const destRoot = path.join(root, "chrome-profile");
    assert.ok(fs.existsSync(path.join(destRoot, "Local State")));
    assert.ok(fs.existsSync(path.join(destRoot, "Default", "Network", "Cookies")));
    assert.ok(
      fs.existsSync(
        path.join(destRoot, "Default", "Local Storage", "leveldb", "000003.log"),
      ),
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("PortalMcpServer.openPortalsForLogin opens clean Chrome instead of Playwright launch", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-portal-login-"));
  const store = await Store.open(root);
  let calledWith = null;
  let playwrightLaunched = false;
  try {
    const server = new PortalMcpServer({
      browser: {
        async launch() {
          playwrightLaunched = true;
          throw new Error("Should not launch Playwright during clean login");
        },
        async openCleanChrome(urls) {
          calledWith = urls;
          return {
            mode: "dedicated",
            userDataDir: path.join(root, "chrome-profile"),
            profileDirectory: "",
            urls,
            message: "Opened clean Chrome.",
          };
        },
      },
    });
    const res = await server.openPortalsForLogin(["linkedin", "indeed"]);
    assert.equal(playwrightLaunched, false);
    assert.ok(Array.isArray(calledWith) && calledWith.length === 2);
    assert.match(calledWith[0], /linkedin\.com/i);
    assert.match(calledWith[1], /indeed\.com/i);
    assert.equal(res.mode, "dedicated");
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Hardened Chrome flags clear navigator.webdriver in automation context", async () => {
  const chrome = chromePath();
  assert.ok(chrome, "Installed Chrome is required");
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-wd-check-"));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chrome,
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation", "--disable-component-update"],
  });
  try {
    const page = await context.newPage();
    await page.setContent("<html><body>ok</body></html>");
    const webdriver = await page.evaluate(() => navigator.webdriver);
    assert.equal(webdriver, false);
  } finally {
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
});

test("Browser.openContext spawns real Chrome via CDP and PublicPageBrowser reuses real Chrome", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-real-chrome-"));
  const store = await Store.open(root);
  const browser = new Browser(store, {});
  try {
    const context = await browser.launch();
    assert.ok(browser.cdpBrowser, "Expected connectOverCDP browser instance");
    assert.ok(browser.chromeProcess, "Expected spawned real Chrome process");
    assert.equal(browser.attachedExistingChrome, false);

    const page = await context.newPage();
    await page.setContent("<html><body><h1>Vacancy test</h1></body></html>");
    const wd = await page.evaluate(() => navigator.webdriver);
    assert.equal(wd, false);
    await page.close();

    // Verify PublicPageBrowser routes through real Chrome when provided
    const mockHtml =
      "<html><body><main>" + "Research fellow in AI ".repeat(30) + "</main></body></html>";
    let unrouted = false;
    let tabClosed = false;
    const fakeBrowser = {
      async launch() {
        return {
          async newPage() {
            let currentUrl = "https://example.edu/jobs/1";
            return {
              async route(_pat, handler) {
                this._handler = handler;
              },
              async unrouteAll() {
                unrouted = true;
              },
              async goto(url) {
                currentUrl = url;
                return { ok: () => true, status: () => 200 };
              },
              async waitForFunction() {},
              url() {
                return currentUrl;
              },
              async content() {
                return mockHtml;
              },
              async close() {
                tabClosed = true;
              },
            };
          },
        };
      },
    };
    const publicBrowser = new PublicPageBrowser({
      browser: fakeBrowser,
      validateUrl: async () => true,
    });
    const rendered = await publicBrowser.read("https://example.edu/jobs/1");
    assert.equal(rendered.method, "real_chrome");
    assert.equal(rendered.html, mockHtml);
    assert.equal(unrouted, true);
    assert.equal(tabClosed, true);
  } finally {
    await browser.close();
    store.close();
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 200,
    });
  }
});

test("readDevToolsActivePort parses Chrome DevToolsActivePort and close preserves external Chrome", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-dt-port-"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-ext-close-"));
  const store = await Store.open(root);
  try {
    fs.writeFileSync(
      path.join(dir, "DevToolsActivePort"),
      "9222\n/devtools/browser/abc-123\n",
    );
    assert.deepEqual(readDevToolsActivePort(dir), {
      port: 9222,
      wsPath: "/devtools/browser/abc-123",
    });

    let cdpBrowserCloseSent = false;
    let cdpClientClosed = false;
    const browser = new Browser(store, {});
    browser.attachedExistingChrome = true;
    browser.chromeProcess = { killed: false, kill() { throw new Error("Must not kill external Chrome"); } };
    browser.cdpBrowser = {
      async newBrowserCDPSession() {
        return {
          async send() {
            cdpBrowserCloseSent = true;
          },
        };
      },
      async close() {
        cdpClientClosed = true;
      },
    };
    await browser.close();
    assert.equal(cdpBrowserCloseSent, false);
    assert.equal(cdpClientClosed, true);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
