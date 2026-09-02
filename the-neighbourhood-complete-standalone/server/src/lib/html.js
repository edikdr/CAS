/* Genius returns annotation and description bodies as HTML. It is third-party
   markup going into our page, so it is reduced to a small safe subset before it
   leaves this service: no scripts, no styles, no event handlers, no iframes. */

const ALLOWED = new Set(['p', 'br', 'em', 'i', 'strong', 'b', 'a', 'ul', 'ol', 'li', 'blockquote', 'h3', 'h4', 'small']);

export function sanitizeHtml(input) {
  if (typeof input !== 'string' || !input) return '';
  let out = input;

  /* drop entire dangerous elements with their content */
  out = out.replace(/<(script|style|iframe|object|embed|svg|form)[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/<\/?(script|style|iframe|object|embed|svg|form)[^>]*>/gi, '');

  out = out.replace(/<([a-z0-9-]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi, (whole, tag, attrs) => {
    const name = tag.toLowerCase();
    if (!ALLOWED.has(name)) return '';
    if (name !== 'a') return `<${name}>`;

    const href = /\shref\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
    const value = href ? (href[2] ?? href[3] ?? '') : '';
    if (!/^https?:\/\//i.test(value)) return '<a>';
    return `<a href="${value.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">`;
  });

  out = out.replace(/<\/([a-z0-9-]+)>/gi, (whole, tag) =>
    ALLOWED.has(tag.toLowerCase()) ? `</${tag.toLowerCase()}>` : '');

  return out.trim();
}

export function htmlToText(input) {
  return sanitizeHtml(input)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Tags whose *contents* must go too, not just the tag itself. Unwrapping a
   <script> would otherwise leave its source sitting in the page as text. */
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'form', 'noscript']);

/* Genius nests description bodies as a DOM-ish tree under description.dom */
export function domToHtml(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(domToHtml).join('');
  const tag = String(node.tag || '').toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) return '';
  const children = (node.children || []).map(domToHtml).join('');
  if (!tag || tag === 'root') return children;
  if (tag === 'a') {
    const href = node.attributes?.href || '';
    return /^https?:\/\//i.test(href) ? `<a href="${href}">${children}</a>` : children;
  }
  if (!ALLOWED.has(tag)) return children;
  return `<${tag}>${children}</${tag}>`;
}
