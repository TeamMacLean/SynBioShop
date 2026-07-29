/**
 * Documentation subjects and documents.
 *
 * Most of this controller was untested. Writing these tests found that subject
 * deletion had never worked at all: the handler called `subject.deleteAll(...)`,
 * a method this ORM does not implement, so every attempt threw and returned a
 * 500 while leaving the subject and its contents in place.
 */

const { expect } = require("chai");
const { signedInAgent, anonymousAgent } = require("../helpers/agent");
const testDb = require("../helpers/testDb");
const Subject = require("../../models/subject");
const Document = require("../../models/document");

const GHOST = "00000000-0000-4000-8000-000000000000";

describe("Documentation", function () {
  this.timeout(30000);

  let agent;
  let ids;

  beforeEach(async function () {
    ids = await testDb.reset();
    agent = await signedInAgent("deeks");
  });

  describe("browsing", function () {
    it("lists subjects on the index", async function () {
      const res = await agent.get("/docs");
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Test Subject");
    });

    it("shows a subject with its documents", async function () {
      const res = await agent.get(`/docs/${ids.subject}`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Test Document");
    });

    it("shows a document", async function () {
      const res = await agent.get(`/docs/item/${ids.document}`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Fixture document body");
    });

    it("redirects to a real route for a missing subject", async function () {
      // This used to redirect to /documents, which is not a registered route,
      // so the user landed on the 404 page via a pointless round-trip.
      const res = await agent.get(`/docs/${GHOST}`);
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/docs");

      const followed = await agent.get(res.headers.location);
      expect(followed.status, "the redirect target must exist").to.equal(200);
    });

    it("answers 404 for a missing document", async function () {
      const res = await agent.get(`/docs/item/${GHOST}`);
      expect(res.status).to.equal(404);
    });
  });

  describe("creating subjects", function () {
    it("renders the new-subject form", async function () {
      const res = await agent.get("/docs/new");
      expect(res.status).to.equal(200);
    });

    it("creates a top-level subject", async function () {
      const res = await agent
        .post("/docs/new")
        .type("form")
        .send({ name: "Cloning" });

      expect(res.status).to.equal(302);

      const created = (await Subject.filter({ name: "Cloning" }).run())[0];
      expect(created, "subject should exist").to.not.equal(undefined);
      expect(res.headers.location).to.equal(`/docs/${created.id}`);
    });

    it("pre-fills the parent on the add-sub-subject form", async function () {
      const res = await agent.get(`/docs/${ids.subject}/addsubject`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include(ids.subject);
      // The form posts to /docs/new, carrying the parent in the body.
      expect(res.text).to.include('action="/docs/new"');
    });

    it("creates a nested subject under a parent", async function () {
      await agent
        .post("/docs/new")
        .type("form")
        .send({ name: "Nested Topic", parentSubjectID: ids.subject });

      const created = (await Subject.filter({ name: "Nested Topic" }).run())[0];
      expect(created, "nested subject should exist").to.not.equal(undefined);
      expect(created.subjectID).to.equal(ids.subject);
    });

    it("does not rename the parent when the add-sub-subject URL is posted to", async function () {
      // That POST binding used to map to the rename branch, so submitting a
      // child name here silently renamed the parent instead.
      const res = await agent
        .post(`/docs/${ids.subject}/addsubject`)
        .type("form")
        .send({ name: "Should Not Rename Parent" });

      expect(res.status).to.equal(404);
      expect((await Subject.get(ids.subject)).name).to.equal("Test Subject");
    });

    it("rejects a subject with no name instead of storing a blank one", async function () {
      const before = (await Subject.run()).length;

      const res = await agent.post("/docs/new").type("form").send({ name: "" });
      expect(res.status).to.equal(302);

      expect((await Subject.run()).length, "no subject should be created").to.equal(
        before,
      );
    });
  });

  describe("renaming subjects", function () {
    it("renders the rename form", async function () {
      const res = await agent.get(`/docs/${ids.subject}/rename`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Test Subject");
    });

    it("renames a subject", async function () {
      const res = await agent
        .post(`/docs/${ids.subject}/rename`)
        .type("form")
        .send({ name: "Renamed Subject" });

      expect(res.status).to.equal(302);
      expect((await Subject.get(ids.subject)).name).to.equal("Renamed Subject");
    });

    it("answers 404 rather than 500 when renaming a missing subject", async function () {
      const res = await agent
        .post(`/docs/${GHOST}/rename`)
        .type("form")
        .send({ name: "Ghost" });

      expect(res.status).to.equal(404);
    });

    it("answers 404 for the rename form of a missing subject", async function () {
      const res = await agent.get(`/docs/${GHOST}/rename`);
      expect(res.status).to.equal(404);
    });
  });

  describe("enabling and disabling", function () {
    it("disables and re-enables a subject", async function () {
      await agent.post(`/docs/${ids.subject}/disable`).type("form").send({});
      expect((await Subject.get(ids.subject)).disabled).to.equal(true);

      await agent.post(`/docs/${ids.subject}/enable`).type("form").send({});
      expect((await Subject.get(ids.subject)).disabled).to.equal(false);
    });

    it("disables and re-enables a document", async function () {
      await agent.post(`/docs/item/${ids.document}/disable`).type("form").send({});
      expect((await Document.get(ids.document)).disabled).to.equal(true);

      await agent.post(`/docs/item/${ids.document}/enable`).type("form").send({});
      expect((await Document.get(ids.document)).disabled).to.equal(false);
    });

    it("answers 404 rather than 500 for a missing record", async function () {
      for (const path of [
        `/docs/${GHOST}/disable`,
        `/docs/${GHOST}/enable`,
        `/docs/item/${GHOST}/disable`,
        `/docs/item/${GHOST}/enable`,
      ]) {
        const res = await agent.post(path).type("form").send({});
        expect(res.status, `${path} returned ${res.status}`).to.equal(404);
      }
    });
  });

  describe("deleting a subject", function () {
    it("actually deletes it", async function () {
      // Regression: this threw "subject.deleteAll is not a function" on every
      // call, so deletion silently never happened.
      const res = await agent.post(`/docs/${ids.subject}/delete`).type("form").send({});

      expect(res.status).to.equal(302);
      expect(await Subject.get(ids.subject)).to.equal(null);
    });

    it("deletes the documents it contained", async function () {
      await agent.post(`/docs/${ids.subject}/delete`).type("form").send({});
      expect(
        await Document.get(ids.document),
        "child documents should not be orphaned",
      ).to.equal(null);
    });

    it("deletes nested subjects and their documents", async function () {
      const child = await new Subject({
        name: "Child",
        subjectID: ids.subject,
      }).save();
      const grandchild = await new Subject({
        name: "Grandchild",
        subjectID: child.id,
      }).save();
      const childDoc = await new Document({
        title: "Child Doc",
        content: "x",
        subjectID: grandchild.id,
      }).save();

      await agent.post(`/docs/${ids.subject}/delete`).type("form").send({});

      expect(await Subject.get(child.id), "child subject remained").to.equal(null);
      expect(
        await Subject.get(grandchild.id),
        "grandchild subject remained",
      ).to.equal(null);
      expect(await Document.get(childDoc.id), "nested document remained").to.equal(
        null,
      );
    });

    it("leaves unrelated subjects alone", async function () {
      const other = await new Subject({ name: "Unrelated" }).save();

      await agent.post(`/docs/${ids.subject}/delete`).type("form").send({});

      expect(await Subject.get(other.id)).to.not.equal(null);
    });

    it("terminates even if a subject's parent chain points at itself", async function () {
      // A corrupted chain would otherwise loop forever.
      const looped = await new Subject({ name: "Looped" }).save();
      await testDb.r
        .table("Subject")
        .get(looped.id)
        .update({ subjectID: looped.id })
        .run();

      const res = await agent.post(`/docs/${looped.id}/delete`).type("form").send({});
      expect(res.status).to.equal(302);
      expect(await Subject.get(looped.id)).to.equal(null);
    });

    it("answers 404 for a subject that does not exist", async function () {
      const res = await agent.post(`/docs/${GHOST}/delete`).type("form").send({});
      expect(res.status).to.equal(404);
    });
  });

  describe("deleting a document", function () {
    it("removes it and leaves the subject in place", async function () {
      await agent.post(`/docs/item/${ids.document}/delete`).type("form").send({});

      expect(await Document.get(ids.document)).to.equal(null);
      expect(await Subject.get(ids.subject)).to.not.equal(null);
    });
  });

  describe("editing documents", function () {
    it("renders the edit form", async function () {
      const res = await agent.get(`/docs/item/${ids.document}/edit`);
      expect(res.status).to.equal(200);
    });

    it("updates title and content", async function () {
      await agent
        .post(`/docs/item/${ids.document}/edit`)
        .type("form")
        .send({
          id: ids.document,
          subjectID: ids.subject,
          title: "Updated Title",
          content: "<p>Updated body</p>",
        });

      const updated = await Document.get(ids.document);
      expect(updated.title).to.equal("Updated Title");
      expect(updated.content).to.include("Updated body");
    });
  });

  describe("rearrange", function () {
    it("renders the rearrange page", async function () {
      const res = await agent.get("/docs/rearrange");
      expect(res.status).to.equal(200);
    });

    it("includes nested subjects and their documents in the payload", async function () {
      const child = await new Subject({
        name: "Nested For Rearrange",
        subjectID: ids.subject,
      }).save();
      await new Document({
        title: "Nested Doc",
        content: "x",
        subjectID: child.id,
      }).save();

      const res = await agent.get("/docs/rearrange");
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Nested For Rearrange");
      expect(res.text).to.include("Nested Doc");
    });
  });

  describe("access control", function () {
    it("requires admin for every mutation", async function () {
      const nonAdmin = await signedInAgent("testuser");

      for (const path of [
        "/docs/new",
        "/docs/rearrange",
        `/docs/${ids.subject}/rename`,
        `/docs/${ids.subject}/disable`,
        `/docs/${ids.subject}/delete`,
        `/docs/item/${ids.document}/delete`,
      ]) {
        const res = await nonAdmin.post(path).type("form").send({ name: "x" });
        expect(res.status, `${path} was allowed`).to.equal(403);
      }

      // Nothing changed.
      expect(await Subject.get(ids.subject)).to.not.equal(null);
      expect(await Document.get(ids.document)).to.not.equal(null);
    });

    it("requires admin for the edit forms", async function () {
      const nonAdmin = await signedInAgent("testuser");

      for (const path of [
        "/docs/new",
        "/docs/rearrange",
        `/docs/${ids.subject}/rename`,
        `/docs/item/${ids.document}/edit`,
      ]) {
        const res = await nonAdmin.get(path);
        expect(res.status, `${path} was reachable`).to.equal(403);
      }
    });

    it("leaves read-only browsing open to anonymous visitors", async function () {
      // These three routes carry no isAuthenticated middleware, unlike every
      // sibling. Asserted as-is so a deliberate change is a visible decision
      // rather than an accident.
      for (const url of ["/docs", `/docs/${ids.subject}`, `/docs/item/${ids.document}`]) {
        const res = await anonymousAgent().get(url);
        expect(res.status, `${url} returned ${res.status}`).to.equal(200);
      }
    });
  });
});
