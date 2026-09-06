/* /api/genius/* — see api/_proxy.js. The catch-all segment is the Genius
   endpoint being asked for: `health`, `search`, `songs/123`, `referents`. */
const { genius, query } = require('../_proxy');

module.exports = async (req, res) => {
  const params = query(req);
  const raw = (req.query && req.query.path) || [];
  const endpoint = (Array.isArray(raw) ? raw.join('/') : String(raw || ''))
    .replace(/^\/+|\/+$/g, '');
  /* `path` is the route's own segment and would be forwarded to Genius as
     a query parameter, which it does not understand. */
  params.delete('path');
  const search = params.toString();
  return genius(req, res, endpoint, search ? `?${search}` : '');
};
