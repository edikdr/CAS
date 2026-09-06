/* /api/lyrics — see api/_proxy.js. No key: the words come from LRCLIB,
   and from lyrics.ovh for what LRCLIB has not got. */
const { lyrics, query } = require('./_proxy');

module.exports = async (req, res) => lyrics(req, res, query(req));
