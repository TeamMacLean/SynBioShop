const thinky = require('../lib/thinky');
const type = thinky.type;
const r = thinky.r;

const Subject = thinky.createModel('Subject', {
    id: type.string(),
    subjectID: type.string(),
    position: type.number().default(0),
    name: type.string().required(),
    createdAt: type.date().default(r.now()),
    disabled: type.boolean().default(false)
});

/**
 * Deletes this subject along with its documents and any nested subjects.
 *
 * The controller previously called `subject.deleteAll({documents: true,
 * subjects: true})` — an API this ORM never implemented. Deleting a
 * documentation subject therefore threw "subject.deleteAll is not a function"
 * and returned a 500 every time, leaving the subject and all of its content in
 * place. Deletion has simply never worked.
 *
 * @returns {Promise<number>} Total records removed, including this one.
 */
Subject.define('deleteCascade', function () {
    const rootID = this.id;

    return (async () => {
        let removed = 0;
        // Iterative rather than recursive, with a visited set: a corrupted
        // parent chain that points at itself would otherwise loop forever.
        const seen = new Set();
        const queue = [rootID];

        while (queue.length) {
            const id = queue.shift();
            if (!id || seen.has(id)) continue;
            seen.add(id);

            const children = await r.table('Subject').filter({subjectID: id}).run();
            for (const child of children) queue.push(child.id);

            const docs = await r.table('Document').filter({subjectID: id}).delete().run();
            removed += docs.deleted || 0;
        }

        const subjects = await r
            .table('Subject')
            .getAll(...seen)
            .delete()
            .run();

        return removed + (subjects.deleted || 0);
    })();
});

module.exports = Subject;
const Document = require('./document');

Subject.hasMany(Subject, 'subjects', 'id', 'subjectID');
Subject.hasMany(Document, 'documents', 'id', 'subjectID');