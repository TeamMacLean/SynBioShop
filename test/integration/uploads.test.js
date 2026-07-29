/**
 * File uploads and downloads.
 *
 * The previous fileUpload.test.js had the actual upload flow behind `it.skip`
 * ("This test will fail without proper authentication"), so POST /upload had
 * zero coverage. It also asserted `expect([200,301,302,401,403]).to.include(...)`
 * on a test named "should require authentication".
 */

const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const config = require("../../config");
const { signedInAgent, anonymousAgent, req } = require("../helpers/agent");
const testDb = require("../helpers/testDb");
const File = require("../../models/file");

describe("Uploads", function () {
  this.timeout(30000);

  let agent;
  let ids;

  beforeEach(async function () {
    ids = await testDb.reset();
    agent = await signedInAgent("deeks");
  });

  describe("POST /upload", function () {
    it("stores an accepted file and lists it in the file manager", async function () {
      const res = await agent
        .post("/upload")
        .attach("file", Buffer.from("sequence data"), "plasmid.gb");

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/filemanager");

      const files = await File.run();
      expect(files).to.have.lengthOf(1);
      expect(files[0].originalName).to.equal("plasmid.gb");

      // The file must actually be on disk where the record says it is.
      expect(fs.existsSync(files[0].path), `missing at ${files[0].path}`).to.equal(
        true,
      );
    });

    it("stores the file under a generated name, not the client's", async function () {
      // Trusting originalname let one upload silently overwrite another file
      // of the same name, including files other records already referenced.
      await agent
        .post("/upload")
        .attach("file", Buffer.from("a"), "report.pdf");

      const [file] = await File.run();
      expect(file.name).to.not.equal("report.pdf");
      expect(file.name).to.match(/^[0-9a-f]{32}\.pdf$/);
      // The human-facing name is preserved separately.
      expect(file.originalName).to.equal("report.pdf");
    });

    it("does not let two uploads of the same name collide", async function () {
      await agent.post("/upload").attach("file", Buffer.from("first"), "notes.txt");
      await agent.post("/upload").attach("file", Buffer.from("second"), "notes.txt");

      const files = await File.run();
      expect(files).to.have.lengthOf(2);
      expect(files[0].path).to.not.equal(files[1].path);
      expect(fs.readFileSync(files[0].path, "utf8")).to.not.equal(
        fs.readFileSync(files[1].path, "utf8"),
      );
    });

    it("refuses an HTML file, which would execute on this origin", async function () {
      // uploadRoot sits under public/, which is served statically.
      const res = await agent
        .post("/upload")
        .attach("file", Buffer.from("<script>alert(1)</script>"), "payload.html");

      expect(res.status).to.equal(302);
      const files = await File.run();
      expect(files, "the HTML file should not have been stored").to.have.lengthOf(0);
    });

    it("refuses an SVG, which can carry script", async function () {
      await agent
        .post("/upload")
        .attach("file", Buffer.from("<svg onload=alert(1)>"), "image.svg");

      expect(await File.run()).to.have.lengthOf(0);
    });

    it("refuses a file with no extension", async function () {
      await agent.post("/upload").attach("file", Buffer.from("x"), "Makefile");
      expect(await File.run()).to.have.lengthOf(0);
    });

    it("requires admin", async function () {
      const nonAdmin = await signedInAgent("testuser");
      const res = await nonAdmin
        .post("/upload")
        .attach("file", Buffer.from("x"), "notes.txt");

      expect(res.status).to.equal(403);
      expect(await File.run()).to.have.lengthOf(0);
    });

    it("refuses an anonymous upload before writing anything to disk", async function () {
      // multer used to run globally, so an anonymous client could POST a
      // multipart body to any URL and have it written to tmpDir unbounded.
      const res = await anonymousAgent()
        .post("/upload")
        .attach("file", Buffer.from("x"), "notes.txt");

      expect(res.status).to.be.oneOf([401, 302]);
      expect(await File.run()).to.have.lengthOf(0);
    });

    it("does not write temp files for an anonymous multipart POST to any route", async function () {
      const before = fs.readdirSync(path.resolve(config.tmpDir));

      await anonymousAgent()
        .post("/no-such-route-at-all")
        .attach("file", Buffer.alloc(1024, 1), "junk.bin");

      const after = fs.readdirSync(path.resolve(config.tmpDir));
      expect(after.length, "an anonymous upload left files in tmpDir").to.equal(
        before.length,
      );
    });
  });

  describe("upload size limit", function () {
    it("rejects a file above the configured maximum", async function () {
      const oversized = Buffer.alloc(config.maxUploadBytes + 1024, 0);
      const res = await agent
        .post("/upload")
        .attach("file", oversized, "huge.zip");

      expect(res.status).to.equal(413);
      expect(await File.run()).to.have.lengthOf(0);
    });
  });

  describe("POST /imageupload", function () {
    it("stores an image and returns its URL", async function () {
      // This handler read `userFile.name`, which multer never sets, so
      // path.join threw on every call — outside the try block, in an async
      // handler, hanging the request and killing the process.
      const res = await agent
        .post("/imageupload")
        .attach("userfile", Buffer.from("fake png bytes"), "diagram.png");

      expect(res.status).to.equal(200);
      expect(res.body.location).to.be.a("string");
      expect(res.body.location).to.match(/^\/uploads\/[0-9a-f]{32}\.png$/);
    });

    it("refuses a non-image", async function () {
      const res = await agent
        .post("/imageupload")
        .attach("userfile", Buffer.from("<script>"), "payload.html");

      expect(res.status).to.equal(415);
    });

    it("returns JSON, not a rendered page, when no file is sent", async function () {
      const res = await agent.post("/imageupload").type("form").send({});
      expect(res.status).to.equal(400);
      expect(res.body).to.have.property("error");
    });
  });

  describe("downloads", function () {
    let fileId;

    beforeEach(async function () {
      await agent
        .post("/upload")
        .attach("file", Buffer.from("downloadable content"), "data.txt");
      const [file] = await File.run();
      fileId = file.id;
    });

    it("serves a stored file to a signed-in user", async function () {
      const res = await agent.get(`/filemanager/${fileId}/download`);
      expect(res.status).to.equal(200);
      expect(res.text).to.equal("downloadable content");
    });

    it("refuses an anonymous download", async function () {
      // This route previously had no middleware at all.
      const res = await anonymousAgent().get(`/filemanager/${fileId}/download`);
      expect(res.status).to.not.equal(200);
    });

    it("answers 404 for an unknown id", async function () {
      const res = await agent.get(
        "/filemanager/00000000-0000-4000-8000-000000000000/download",
      );
      expect(res.status).to.equal(404);
    });

    it("answers 404, not a stack trace, when the file is missing from disk", async function () {
      const [file] = await File.run();
      fs.unlinkSync(file.path);

      const res = await agent.get(`/filemanager/${file.id}/download`);
      expect(res.status).to.equal(404);
      expect(res.text || "").to.not.include("ENOENT");
    });
  });

  describe("sequence files", function () {
    /** Uploads a sequence file against the fixture item and returns its row. */
    async function uploadSequenceFile(filename = "trace.ab1", body = "ABIF-data") {
      const res = await agent
        .post(`/premade/item/${ids.type1}/uploadSequenceFile`)
        .attach("file", Buffer.from(body), filename);

      expect(res.status).to.equal(302);
      const rows = await testDb.r
        .table("SequenceFile")
        .filter({ typeID: ids.type1 })
        .run();
      return rows;
    }

    it("stores an uploaded sequence file against the item", async function () {
      const rows = await uploadSequenceFile();

      expect(rows).to.have.lengthOf(1);
      expect(rows[0].originalName).to.equal("trace.ab1");
      expect(rows[0].typeID).to.equal(ids.type1);
      expect(fs.existsSync(rows[0].path), `missing at ${rows[0].path}`).to.equal(true);
    });

    it("stores it under a generated name, not the client's", async function () {
      const rows = await uploadSequenceFile();
      expect(rows[0].name).to.not.equal("trace.ab1");
      expect(rows[0].name).to.match(/^[0-9a-f]{32}\.ab1$/);
    });

    it("refuses a sequence file with a disallowed extension", async function () {
      const res = await agent
        .post(`/premade/item/${ids.type1}/uploadSequenceFile`)
        .attach("file", Buffer.from("<script>alert(1)</script>"), "payload.html");

      expect(res.status).to.equal(302);
      const rows = await testDb.r.table("SequenceFile").run();
      expect(rows, "the HTML file should not have been stored").to.have.lengthOf(0);
    });

    it("redirects back to the item when no file is selected", async function () {
      const res = await agent
        .post(`/premade/item/${ids.type1}/uploadSequenceFile`)
        .type("form")
        .send({});

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal(`/premade/item/${ids.type1}`);
    });

    it("shows the uploaded file on the item page", async function () {
      await uploadSequenceFile("mytrace.ab1");

      const res = await agent.get(`/premade/item/${ids.type1}`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("mytrace.ab1");
    });

    it("serves the file to a signed-in user", async function () {
      const rows = await uploadSequenceFile("trace.ab1", "SEQUENCE-BYTES");

      const res = await agent
        .get(`/sequencefilemanager/${rows[0].id}/download`)
        .buffer()
        .parse((r, cb) => {
          // .ab1 is served as binary, so supertest leaves res.text unset.
          const chunks = [];
          r.on("data", (c) => chunks.push(c));
          r.on("end", () => cb(null, Buffer.concat(chunks)));
        });

      expect(res.status).to.equal(200);
      expect(res.body.toString()).to.equal("SEQUENCE-BYTES");
      expect(res.headers["content-disposition"]).to.include("trace.ab1");
    });

    it("refuses an anonymous sequence-file download", async function () {
      const rows = await uploadSequenceFile();

      const res = await anonymousAgent().get(
        `/sequencefilemanager/${rows[0].id}/download`,
      );
      expect(res.status).to.not.equal(200);
    });

    it("answers 404 for a sequence file that does not exist", async function () {
      const res = await agent.get(
        "/sequencefilemanager/00000000-0000-4000-8000-000000000000/download",
      );
      expect(res.status).to.equal(404);
    });

    it("answers 404, not a stack trace, when the file is missing from disk", async function () {
      const rows = await uploadSequenceFile();
      fs.unlinkSync(rows[0].path);

      const res = await agent.get(`/sequencefilemanager/${rows[0].id}/download`);
      expect(res.status).to.equal(404);
      expect(res.text || "").to.not.include("ENOENT");
    });

    it("deletes a sequence file record", async function () {
      const rows = await uploadSequenceFile();

      const res = await agent
        .post(`/premade/item/${ids.type1}/deleteSequenceFile`)
        .type("form")
        .send({ sequenceFileID: rows[0].id });

      expect(res.status).to.equal(302);
      expect(await testDb.r.table("SequenceFile").get(rows[0].id).run()).to.equal(
        null,
      );
    });

    it("reports a missing id rather than querying with undefined", async function () {
      const res = await agent
        .post(`/premade/item/${ids.type1}/deleteSequenceFile`)
        .type("form")
        .send({});

      expect(res.status).to.equal(302);
    });

    it("handles deleting a sequence file that is already gone", async function () {
      const res = await agent
        .post(`/premade/item/${ids.type1}/deleteSequenceFile`)
        .type("form")
        .send({ sequenceFileID: "00000000-0000-4000-8000-000000000000" });

      expect(res.status).to.equal(302);
    });

    it("requires admin to upload or delete", async function () {
      const rows = await uploadSequenceFile();
      const nonAdmin = await signedInAgent("testuser");

      const upload = await nonAdmin
        .post(`/premade/item/${ids.type1}/uploadSequenceFile`)
        .attach("file", Buffer.from("x"), "other.ab1");
      expect(upload.status).to.equal(403);

      const remove = await nonAdmin
        .post(`/premade/item/${ids.type1}/deleteSequenceFile`)
        .type("form")
        .send({ sequenceFileID: rows[0].id });
      expect(remove.status).to.equal(403);

      expect(
        await testDb.r.table("SequenceFile").get(rows[0].id).run(),
        "the record should be untouched",
      ).to.not.equal(null);
    });
  });

  describe("deleting managed files", function () {
    let fileId;

    beforeEach(async function () {
      await agent
        .post("/upload")
        .attach("file", Buffer.from("content"), "doomed.txt");
      const [file] = await File.run();
      fileId = file.id;
    });

    it("removes the record", async function () {
      const res = await agent
        .post(`/filemanager/${fileId}/delete`)
        .type("form")
        .send({});

      expect(res.status).to.equal(302);
      expect(await File.get(fileId)).to.equal(null);
    });

    it("removes it from the file manager listing", async function () {
      await agent.post(`/filemanager/${fileId}/delete`).type("form").send({});

      // Checked via the download link rather than the name: the name also
      // appears in the queued "File uploaded successfully: doomed.txt" flash,
      // which renders on the next page load.
      const listing = await agent.get("/filemanager");
      expect(listing.text).to.not.include(`/filemanager/${fileId}/download`);
    });

    it("handles a file that is already gone", async function () {
      const res = await agent
        .post("/filemanager/00000000-0000-4000-8000-000000000000/delete")
        .type("form")
        .send({});

      expect(res.status).to.equal(302);
    });

    it("requires admin", async function () {
      const nonAdmin = await signedInAgent("testuser");
      const res = await nonAdmin
        .post(`/filemanager/${fileId}/delete`)
        .type("form")
        .send({});

      expect(res.status).to.equal(403);
      expect(await File.get(fileId)).to.not.equal(null);
    });
  });

  describe("file manager", function () {
    it("survives a record with no originalName", async function () {
      // One malformed row used to throw and 500 the whole page.
      await testDb.r
        .table("File")
        .insert({ name: "orphan", path: "/tmp/orphan", createdAt: new Date() })
        .run();

      const res = await agent.get("/filemanager");
      expect(res.status).to.equal(200);
    });

    it("lists newest uploads first", async function () {
      await testDb.r
        .table("File")
        .insert([
          {
            name: "old",
            originalName: "old.txt",
            path: "/tmp/old",
            createdAt: new Date("2020-01-01"),
          },
          {
            name: "new",
            originalName: "new.txt",
            path: "/tmp/new",
            createdAt: new Date("2026-01-01"),
          },
        ])
        .run();

      const res = await agent.get("/filemanager");
      expect(res.status).to.equal(200);
      expect(res.text.indexOf("new.txt")).to.be.lessThan(res.text.indexOf("old.txt"));
    });
  });
});
