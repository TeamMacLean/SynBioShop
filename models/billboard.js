const thinky = require('../lib/thinky');
const type = thinky.type;

const Billboard = thinky.createModel('Billboard', {
    id: type.string(),
    text: type.string().required(),
    enabled: type.boolean().required()
});

module.exports = Billboard;