const Document = require("../models/document");
const { sanitizeHtml } = require("../lib/sanitize");
const renderError = require("../lib/renderError");
const Flash = require("../lib/flash");
const Log = require("../lib/log");
const Subject = require("../models/subject");

const docs = {};
docs.subject = {};
docs.document = {};

function getTopLevelSubjects() {
  return Subject.filter((s) => {
    return s.hasFields("subjectID").not().or(s("subjectID").eq(""));
  });
}

docs.index = (req, res) => {
  getTopLevelSubjects()
    .getJoin({ documents: true, subjects: { documents: true } })
    .then((subjects) => {
      return res.render("documents/index", { subjects });
    })
    .catch((err) => renderError(err, res));
};

docs.rearrange = (req, res) => {
  getTopLevelSubjects()
    .getJoin({ documents: true, subjects: { documents: true } })
    .then((subjects) => {
      const output = [];

      subjects.map((subject) => {
        const obj = {
          id: subject.id,
          name: subject.name,
          position: subject.position,
          documents: [],
          subjects: [],
        };

        subject.documents.map((document) => {
          obj.documents.push({
            id: document.id,
            name: document.title,
            position: document.position,
          });
        });
        subject.subjects.map((s) => {
          const ss = {
            id: s.id,
            name: s.name,
            position: s.position,
            documents: [],
          };
          obj.subjects.push(ss);
          s.documents.map((d) => {
            ss.documents.push({
              id: d.id,
              name: d.title,
              position: d.position,
            });
          });
        });
        output.push(obj);
      });

      return res.render("documents/rearrange", { subjects: output });
    })
    .catch((err) => renderError(err, res));
};

docs.rearrangeSave = async (req, res) => {
  let newOrder;
  try {
    newOrder = JSON.parse(req.body.newOrder);
  } catch (err) {
    // The parse was outside any try/catch, so a malformed body threw
    // synchronously and the client received a raw stack trace.
    return res.status(400).json({ error: "Malformed layout data." });
  }

  if (!Array.isArray(newOrder)) {
    return res.status(400).json({ error: "Layout data must be a list." });
  }

  // Collect the intended positions first, de-duplicated by id. The previous
  // version queued the same subject twice whenever it had both `subjects` and
  // `documents`, so two concurrent saves raced on one row.
  const subjectPositions = new Map();
  const documentPositions = new Map();

  function collect(obj) {
    if (!obj || typeof obj !== "object" || typeof obj.id !== "string") return;

    const isLeaf = !("documents" in obj) && !("subjects" in obj);
    if (isLeaf) {
      documentPositions.set(obj.id, obj.position);
      return;
    }

    subjectPositions.set(obj.id, obj.position);
    for (const child of obj.subjects || []) collect(child);
    for (const child of obj.documents || []) collect(child);
  }

  newOrder.forEach(collect);

  /**
   * Applies one position update.
   *
   * The old implementation wrote `.catch((err) => bad)`, which *returns* the
   * reject function instead of calling it — so a failure left the promise
   * unsettled, Promise.all never resolved, and the request hung forever with
   * the layout half-saved.
   */
  async function applyPosition(Model, id, position) {
    const doc = await Model.get(id);
    if (!doc) {
      // Deleted in another tab. Skip it rather than failing the whole save.
      Log.warn(`Rearrange skipped missing record ${id}`);
      return;
    }
    doc.position = position;
    await doc.save();
  }

  try {
    await Promise.all([
      ...[...subjectPositions].map(([id, pos]) =>
        applyPosition(Subject, id, pos),
      ),
      ...[...documentPositions].map(([id, pos]) =>
        applyPosition(Document, id, pos),
      ),
    ]);

    Flash.success(req, "Document layout saved successfully.");
    return res.sendStatus(200);
  } catch (err) {
    Flash.error(req, "We couldn't save the new layout. Please try again.");
    Log.error("Rearrange failed: " + (err && err.message));
    // sendStatus() already ends the response; chaining .json() onto it threw
    // ERR_HTTP_HEADERS_SENT.
    return res.status(500).json({ error: "Could not save the new layout." });
  }
};

//NEW LAYOUT
docs.subject.new = (req, res) => {
  const parentSubjectID = req.params.subjectID;
  getTopLevelSubjects()
    .then((subjects) => {
      return res.render("documents/subject/new", { parentSubjectID, subjects });
    })
    .catch((err) => renderError(err, res));
};

docs.subject.rename = (req, res) => {
  const parentSubjectID = req.params.subjectID;

  Subject.get(parentSubjectID)
    .then((subject) => {
      if (!subject) {
        return res.status(404).render("404");
      }

      getTopLevelSubjects()
        .then((subjects) => {
          return res.render("documents/subject/rename", { subject, subjects });
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

docs.subject.show = (req, res) => {
  const subjectID = req.params.subjectID;
  Subject.get(subjectID)
    .getJoin({ documents: true, subjects: { documents: true } })
    .then((subject) => {
      if (!subject) {
        Flash.error(req, "The requested subject could not be found.");
        return res.redirect("/docs");
      }
      getTopLevelSubjects()
        .then((subjects) => {
          return res.render("documents/subject/show", { subject, subjects });
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => {
      if (
        err.name === "DocumentNotFoundError" ||
        err.message.includes("not found")
      ) {
        Flash.error(req, "The requested subject could not be found.");
        return res.redirect("/docs");
      }
      renderError(err, res);
    });
};

docs.subject.disable = (req, res) => {
  const id = req.params.subjectID;
  Subject.get(id)
    .then((subject) => {
      // Model.get resolves null for a missing record; without this the next
      // line threw and the request 500'd instead of answering 404.
      if (!subject) {
        return res.status(404).render("404");
      }

      subject.disabled = true;
      subject
        .save()
        .then((saved) => {
          return res.redirect(`/docs/${id}`);
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

docs.subject.enable = (req, res) => {
  const id = req.params.subjectID;
  Subject.get(id)
    .then((subject) => {
      // Model.get resolves null for a missing record; without this the next
      // line threw and the request 500'd instead of answering 404.
      if (!subject) {
        return res.status(404).render("404");
      }

      subject.disabled = false;
      subject
        .save()
        .then((saved) => {
          return res.redirect(`/docs/${id}`);
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

docs.subject.delete = async (req, res) => {
  const id = req.params.subjectID;
  try {
    const subject = await Subject.get(id);
    if (!subject) {
      return res.status(404).render("404");
    }

    const removed = await subject.deleteCascade();
    Log.info(`Deleted subject ${id} and ${removed - 1} nested record(s).`);
    Flash.success(req, `"${subject.name}" and its contents were deleted.`);
    return res.redirect("/docs");
  } catch (err) {
    return renderError(err, res);
  }
};

docs.subject.save = (req, res) => {
  const name = req.body.name;
  const parentSubjectID = req.body.parentSubjectID;
  const subjectID = req.params.subjectID;

  if (!name || String(name).trim() === "") {
    Flash.error(req, "A name is required.");
    return res.redirect(subjectID ? `/docs/${subjectID}/rename` : "/docs/new");
  }

  if (subjectID) {
    Subject.get(subjectID)
      .then((subject) => {
        // Model.get resolves null for a missing record, so this used to throw
        // on `subject.name` and surface as a 500 rather than a 404.
        if (!subject) {
          return res.status(404).render("404");
        }

        subject.name = name;

        subject
          .save()
          .then(() => {
            return res.redirect(`/docs/${subject.id}`);
          })
          .catch((err) => renderError(err, res));
      })
      .catch((err) => renderError(err, res));
  } else {
    const newSubject = new Subject({ name });
    if (parentSubjectID) {
      newSubject.subjectID = parentSubjectID;
    }
    newSubject
      .save()
      .then((savedSubject) => {
        return res.redirect(`/docs/${savedSubject.id}`);
      })
      .catch((err) => renderError(err, res));
  }
};

docs.document.show = (req, res) => {
  const itemID = req.params.itemID;
  Document.get(itemID)
    .getJoin({ subject: true })
    .then((document) => {
      // A missing document used to be handed to the template as `null`, which
      // threw while rendering and turned a mistyped URL into a 500.
      if (!document) {
        return res.status(404).render("404");
      }

      getTopLevelSubjects()
        .then((subjects) => {
          return res.render("documents/item/show", { document, subjects });
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

docs.document.disable = (req, res) => {
  const id = req.params.itemID;
  Document.get(id)
    .then((document) => {
      // Model.get resolves null for a missing record; without this the next
      // line threw and the request 500'd instead of answering 404.
      if (!document) {
        return res.status(404).render("404");
      }

      document.disabled = true;
      document
        .save()
        .then((saved) => {
          return res.redirect(`/docs/item/${id}`);
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

docs.document.enable = (req, res) => {
  const id = req.params.itemID;
  Document.get(id)
    .then((document) => {
      // Model.get resolves null for a missing record; without this the next
      // line threw and the request 500'd instead of answering 404.
      if (!document) {
        return res.status(404).render("404");
      }

      document.disabled = false;
      document
        .save()
        .then((saved) => {
          return res.redirect(`/docs/item/${id}`);
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

docs.document.delete = (req, res) => {
  const id = req.params.itemID;
  Document.get(id)
    .then((document) => {
      if (!document) {
        return renderError(new Error("Document not found"), res);
      }
      // Store subjectID before deleting
      const subjectID = document.subjectID;
      document
        .delete()
        .then(() => {
          // Redirect to the subject page (not /docs/item/)
          return res.redirect(subjectID ? `/docs/${subjectID}` : "/docs");
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

docs.document.save = (req, res) => {
  const subjectID = req.body.subjectID;
  const title = req.body.title;
  const id = req.body.id;
  // Sanitised once here so both the create and update branches store safe
  // markup. views/documents/item/show.ejs renders it with <%- %>.
  const content = sanitizeHtml(req.body.content);

  Subject.get(subjectID)
    .getJoin({ documents: true })
    .then((subject) => {
      if (id) {
        Document.get(id)
          .then((document) => {
            document.title = req.body.title;
            // Rendered with <%- %> in views/documents/item/show.ejs.
            document.content = sanitizeHtml(req.body.content);
            document
              .save()
              .then(() => {
                // document.subject = subject;
                return res.redirect(`/docs/item/${document.id}`);
              })
              .catch((error) => {
                return renderError(error, res);
              });
          })
          .catch((error) => {
            return renderError(error, res);
          });
      } else {
        const doc = new Document({
          subjectID,
          title,
          content,
        });
        doc
          .save()
          .then((saved) => {
            saved.subject = subject;
            getTopLevelSubjects()
              .then((subjects) => {
                return res.render("documents/item/show", {
                  document: saved,
                  subjects,
                });
              })
              .catch((err) => renderError(err, res));
          })
          .catch((error) => renderError(error, res));
      }
    })
    .catch((error) => renderError(error, res));
};

docs.document.new = (req, res) => {
  const subjectID = req.params.subjectID;

  Subject.get(subjectID)
    .then((subject) => {
      getTopLevelSubjects()
        .then((subjects) => {
          return res.render("documents/item/edit", { subject, subjects });
        })
        .catch((err) => renderError(err, res));
    })
    .catch((error) => renderError(error, res));
};

docs.document.edit = (req, res) => {
  const itemID = req.params.itemID;

  Document.get(itemID)
    .getJoin({ subject: true })
    .then((document) => {
      getTopLevelSubjects()
        .then((subjects) => {
          return res.render("documents/item/edit", {
            subject: document.subject,
            document,
            subjects,
          });
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

module.exports = docs;
