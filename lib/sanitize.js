/**
 * HTML sanitisation for rich-text content.
 *
 * Documentation bodies, item documentation and the billboard are authored in
 * TinyMCE, stored as raw HTML and rendered with `<%- %>`. Nothing sanitised
 * them on the way in or out, so an admin account — or a CSRF'd admin — could
 * plant script that ran for every visitor. The billboard is the worst of these:
 * it renders on every page for every user.
 *
 * The `xss` package was already a dependency but was only applied to error
 * strings in lib/renderError.js.
 */

const xss = require("xss");

/**
 * Tags and attributes the editor legitimately produces.
 *
 * Deliberately permissive about presentation — existing content carries Word
 * paste artefacts like `class="MsoNormal"` and inline `style` — and strict
 * about anything that can execute: no <script>, <iframe>, <object>, <embed>,
 * <form>, and no `on*` handlers (the library drops unlisted attributes).
 */
const WHITELIST = {
  a: ["href", "title", "target", "rel", "class", "style"],
  abbr: ["title"],
  b: ["class", "style"],
  blockquote: ["cite", "class", "style"],
  br: [],
  caption: ["class", "style"],
  code: ["class"],
  col: ["span", "width", "class", "style"],
  colgroup: ["span", "width", "class", "style"],
  dd: ["class", "style"],
  div: ["class", "style", "id"],
  dl: ["class", "style"],
  dt: ["class", "style"],
  em: ["class", "style"],
  figcaption: ["class", "style"],
  figure: ["class", "style"],
  h1: ["class", "style", "id"],
  h2: ["class", "style", "id"],
  h3: ["class", "style", "id"],
  h4: ["class", "style", "id"],
  h5: ["class", "style", "id"],
  h6: ["class", "style", "id"],
  hr: ["class", "style"],
  i: ["class", "style"],
  img: ["src", "alt", "title", "width", "height", "class", "style"],
  li: ["class", "style"],
  ol: ["class", "style", "start", "type"],
  p: ["class", "style"],
  pre: ["class", "style"],
  s: ["class", "style"],
  small: ["class", "style"],
  span: ["class", "style"],
  strong: ["class", "style"],
  sub: ["class", "style"],
  sup: ["class", "style"],
  table: ["width", "border", "cellpadding", "cellspacing", "class", "style"],
  tbody: ["class", "style"],
  td: ["colspan", "rowspan", "width", "height", "align", "valign", "class", "style"],
  tfoot: ["class", "style"],
  th: ["colspan", "rowspan", "width", "height", "align", "valign", "class", "style"],
  thead: ["class", "style"],
  tr: ["class", "style"],
  u: ["class", "style"],
  ul: ["class", "style"],
};

/**
 * URL schemes permitted in href/src.
 *
 * Relative and site-absolute URLs are the normal case (uploads are served from
 * /uploads and /filemanager). `javascript:` and `data:` are excluded — the
 * former executes, the latter can carry an HTML document.
 */
function isSafeUrl(value) {
  const trimmed = String(value).trim();

  // Reject anything with a scheme other than http/https, including obfuscated
  // forms like "java\tscript:" that browsers still honour.
  const withoutControlChars = trimmed.replace(/[\u0000-\u0020]/g, "");
  if (/^[a-z0-9.+-]*:/i.test(withoutControlChars)) {
    return /^https?:/i.test(withoutControlChars);
  }

  // No scheme: a relative or root-relative URL.
  return true;
}

const filter = new xss.FilterXSS({
  whiteList: WHITELIST,
  // Drop the contents of dangerous tags too, rather than leaving the script
  // body as visible text.
  stripIgnoreTagBody: ["script", "style", "iframe", "object", "embed", "form"],
  css: {
    whiteList: {
      color: true,
      "background-color": true,
      "font-family": true,
      "font-size": true,
      "font-style": true,
      "font-weight": true,
      "text-align": true,
      "text-decoration": true,
      "text-indent": true,
      "line-height": true,
      margin: true,
      "margin-top": true,
      "margin-bottom": true,
      "margin-left": true,
      "margin-right": true,
      padding: true,
      "padding-top": true,
      "padding-bottom": true,
      "padding-left": true,
      "padding-right": true,
      border: true,
      "border-collapse": true,
      width: true,
      height: true,
      "max-width": true,
      float: true,
      "vertical-align": true,
      display: true,
    },
  },
  safeAttrValue(tag, name, value, cssFilter) {
    if ((name === "href" || name === "src") && !isSafeUrl(value)) {
      return "";
    }
    return xss.safeAttrValue(tag, name, value, cssFilter);
  },
});

/**
 * Sanitises rich text for storage and display.
 *
 * @param {string} html - Editor output.
 * @returns {string} The same content with executable constructs removed.
 */
function sanitizeHtml(html) {
  if (html === undefined || html === null) return "";
  return filter.process(String(html));
}

/**
 * Strips markup entirely, for fields that should be plain text.
 *
 * @param {string} text
 * @returns {string}
 */
function sanitizeText(text) {
  if (text === undefined || text === null) return "";
  return xss(String(text), { whiteList: {}, stripIgnoreTagBody: true });
}

/**
 * Serialises a value for embedding inside a <script> element.
 *
 * Escapes the three sequences that can break out of, or corrupt, a script
 * block: `<` (which starts `</script>`), and the U+2028/U+2029 line separators,
 * which are literal newlines to a JavaScript parser.
 *
 * @param {any} value
 * @returns {string} JSON safe to place inside a script element.
 */
function jsonForScript(value) {
  return JSON.stringify(value === undefined ? null : value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

module.exports = { sanitizeHtml, sanitizeText, isSafeUrl, jsonForScript };
