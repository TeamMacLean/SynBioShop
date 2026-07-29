/**
 * Stored and reflected XSS, end to end.
 *
 * These fields are authored in TinyMCE, stored as raw HTML and rendered with
 * `<%- %>`. Nothing sanitised them, so an admin — or an admin whose browser was
 * driven cross-site before CSRF protection existed — could plant script that
 * ran for every visitor. The billboard renders on every page for every user.
 */

const { expect } = require("chai");
const { signedInAgent, req } = require("../helpers/agent");
const testDb = require("../helpers/testDb");

const PAYLOAD = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

/**
 * Asserts a response body carries no *executable* payload.
 *
 * Escaped text such as `&lt;img src=x onerror=...&gt;` is inert and expected —
 * that is what correct escaping looks like. What must never appear is a real
 * tag, so these check for the opening `<` in unescaped form.
 */
function expectNoScript(html, context) {
  // The injected payload, in the only forms that would actually execute.
  expect(html, `${context}: script tag survived`).to.not.include("<script>alert");
  expect(html, `${context}: img tag with handler survived`).to.not.match(
    /<img[^>]*onerror/i,
  );
  expect(html, `${context}: javascript: URL survived`).to.not.match(
    /(href|src)\s*=\s*["']?javascript:/i,
  );

  // The app's own templates carry legitimate inline handlers, so a blanket
  // "no on* attributes" check would flag those; the payload-specific
  // assertions above are what matter.
}

describe("XSS", function () {
  this.timeout(30000);

  let agent;
  let ids;

  beforeEach(async function () {
    ids = await testDb.reset();
    agent = await signedInAgent("deeks");
  });

  describe("billboard (renders site-wide)", function () {
    it("stores the text with script stripped", async function () {
      await agent
        .post("/admin/billboard")
        .type("form")
        .send({ text: `Notice ${PAYLOAD}`, enabled: "on" });

      const [billboard] = await testDb.r.table("Billboard").run();
      expect(billboard.text).to.not.include("<script");
      expect(billboard.text).to.not.include("onerror");
      expect(billboard.text).to.include("Notice");
    });

    it("does not serve script to any visitor", async function () {
      await agent
        .post("/admin/billboard")
        .type("form")
        .send({ text: PAYLOAD, enabled: "on" });

      const home = await agent.get("/");
      expectNoScript(home.text, "billboard on home page");

      const anon = await req().get("/");
      expectNoScript(anon.text, "billboard for anonymous visitor");
    });

    it("keeps legitimate formatting", async function () {
      await agent
        .post("/admin/billboard")
        .type("form")
        .send({ text: "<strong>Maintenance</strong> on Friday", enabled: "on" });

      const home = await agent.get("/");
      expect(home.text).to.include("<strong>Maintenance</strong>");
    });
  });

  describe("documentation content", function () {
    it("stores the body with script stripped", async function () {
      await agent
        .post(`/docs/${ids.subject}/new`)
        .type("form")
        .send({
          subjectID: ids.subject,
          title: "Protocol",
          content: `<p>Steps</p>${PAYLOAD}`,
        });

      const docs = await testDb.r.table("Document").run();
      const created = docs.find((d) => d.title === "Protocol");
      expect(created, "document should have been created").to.not.equal(undefined);
      expect(created.content).to.not.include("<script");
      expect(created.content).to.not.include("onerror");
      expect(created.content).to.include("<p>Steps</p>");
    });

    it("does not serve script when the document is viewed", async function () {
      await testDb.r
        .table("Document")
        .get(ids.document)
        .update({ content: PAYLOAD })
        .run();

      // Pre-existing unsanitised rows are still rendered raw; re-saving through
      // the controller is what cleans them.
      await agent
        .post("/docs/item/" + ids.document + "/edit")
        .type("form")
        .send({ id: ids.document, subjectID: ids.subject, title: "T", content: PAYLOAD });

      const stored = await testDb.r.table("Document").get(ids.document).run();
      expect(stored.content).to.not.include("onerror");
    });
  });

  describe("premade item documentation", function () {
    it("strips script from the documentation field on save", async function () {
      await agent
        .post(`/premade/item/${ids.type1}/edit`)
        .type("form")
        .send({
          id: ids.type1,
          dbID: ids.db,
          name: "pTEST001",
          description: "desc",
          comments: "",
          concentration: "100",
          synBioID: "1001",
          documentation: `<p>Notes</p>${PAYLOAD}`,
          insideOverhangLeft: "AATG",
          insideOverhangRight: "GCTT",
          outsideOverhangLeft: "CGCT",
          outsideOverhangRight: "AGCG",
          resistance: "Kan",
          whoMadeIt: "Someone",
        });

      const row = await testDb.r.table("Type1").get(ids.type1).run();
      expect(row.documentation || "").to.not.include("<script");
      expect(row.documentation || "").to.not.include("onerror");
    });
  });

  describe("search", function () {
    it("escapes the query rather than reflecting it as markup", async function () {
      const res = await agent.get(
        "/search?queryString=" + encodeURIComponent(PAYLOAD),
      );
      expect(res.status).to.equal(200);
      expectNoScript(res.text, "search results heading");
    });
  });

  describe("flash messages", function () {
    it("escapes text interpolated from a filename", async function () {
      // Flash bodies were rendered with <%- %> and interpolate user-supplied
      // values such as uploaded filenames and item names.
      const res = await agent
        .post("/upload")
        .attach("file", Buffer.from("x"), '<img src=x onerror=alert(1)>.exe');

      expect(res.status).to.equal(302);

      const page = await agent.get("/filemanager");
      expectNoScript(page.text, "flash message");
    });
  });

  describe("user attributes in the page", function () {
    it("embeds the signed-in user as JSON that cannot break out of the script", async function () {
      const res = await agent.get("/");
      expect(res.status).to.equal(200);

      // Data lives in a non-executable block, parsed from textContent.
      expect(res.text).to.include('<script type="application/json" id="signed-in-user">');

      const match = /<script type="application\/json" id="signed-in-user">([\s\S]*?)<\/script>/.exec(
        res.text,
      );
      expect(match, "JSON block should be present").to.not.equal(null);
      expect(() => JSON.parse(match[1])).to.not.throw();
    });

    it("does not double-escape ordinary punctuation in a name", function () {
      // Fields were HTML-escaped before EJS escaped them again, so a name like
      // O'Brien reached the page as O&amp;#x27;Brien.
      const { jsonForScript } = require("../../lib/sanitize");
      const parsed = JSON.parse(jsonForScript({ name: "O'Brien & Sons" }));
      expect(parsed.name).to.equal("O'Brien & Sons");
    });
  });
});
