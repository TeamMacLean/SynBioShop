const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { getApp } = require("../helpers/agent");
const testDb = require("../helpers/testDb");
const thinky = require("../../lib/thinky");

describe("Sequence uploads in the browser", function () {
  this.timeout(30000);

  let browser;
  let context;
  let page;
  let server;
  let baseURL;
  let startedServer = false;
  let ids;

  before(async function () {
    server = getApp();
    await thinky.ready();
    if (!server.listening) {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      startedServer = true;
    }
    baseURL = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHANNEL
        ? { channel: process.env.PLAYWRIGHT_CHANNEL }
        : {}),
    });
  });

  after(async function () {
    if (browser) await browser.close();
    if (startedServer && server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(async function () {
    ids = await testDb.reset();
    context = await browser.newContext();
    // Exercise the real CSP and bundle without contacting any CDN or service.
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === baseURL
        ? route.continue()
        : route.abort(),
    );
    page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(`${baseURL}/signin`);
    await page.getByLabel(/Username/).fill("deeks");
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await Promise.all([
      page.waitForURL(`${baseURL}/`),
      page.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);

    const response = await page.goto(`${baseURL}/premade/item/${ids.type1}`);
    assert.equal(response.status(), 200);
    assert.ok(response.headers()["content-security-policy"]);
    await page.getByRole("button", { name: "Upload sequence files" }).click();
    await page.getByRole("dialog", { name: "Add sequence files here" }).waitFor();
  });

  afterEach(async function () {
    if (context) await context.close();
  });

  async function confirmAndDownload(files) {
    await page.locator("#my-awesome-dropzone .dz-success").nth(files.length - 1).waitFor();
    assert.equal(await page.locator("#my-awesome-dropzone .dz-error").count(), 0);

    await Promise.all([
      page.waitForNavigation(),
      page.getByRole("button", { name: "Confirm additional uploaded files" }).click(),
    ]);
    await page.getByRole("heading", { name: "Sequence files", exact: true }).waitFor();

    for (const file of files) {
      const row = page.locator(".col6").filter({
        has: page.getByText(file.name, { exact: true }),
      });
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        row.getByRole("link", { name: "Download" }).click(),
      ]);
      assert.equal(download.suggestedFilename(), file.name);
      const chunks = [];
      for await (const chunk of await download.createReadStream()) chunks.push(chunk);
      assert.deepEqual(Buffer.concat(chunks), file.buffer);
    }
  }

  it("opens the file chooser and saves two sequence files on a saved entry", async function () {
    const files = [
      { name: "forward.ab1", mimeType: "application/octet-stream", buffer: Buffer.from("ABIF-forward") },
      { name: "reverse.ab1", mimeType: "application/octet-stream", buffer: Buffer.from("ABIF-reverse") },
    ];
    const uploads = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/uploadSequenceFile")) {
        uploads.push(request);
      }
    });

    // A backend-only upload test misses this: the blocked CDN script left the
    // visible drop area with no click handler and never opened a file chooser.
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#my-awesome-dropzone .dz-message").click(),
    ]);
    await chooser.setFiles(files);
    await confirmAndDownload(files);
    assert.equal(uploads.length, 2, "each selected file must be submitted separately");
  });

  it("accepts a sequence file dropped onto the upload area", async function () {
    const file = {
      name: "dropped.ab1",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("ABIF-dropped"),
    };
    const transfer = await page.evaluateHandle(({ name, mimeType, bytes }) => {
      /* global DataTransfer */
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], name, { type: mimeType }));
      return data;
    }, { name: file.name, mimeType: file.mimeType, bytes: [...file.buffer] });
    try {
      await page.locator("#my-awesome-dropzone").dispatchEvent("drop", { dataTransfer: transfer });
    } finally {
      await transfer.dispose();
    }
    await confirmAndDownload([file]);
  });
});
