/**
 * lib/sanitize — HTML sanitisation for rich-text content.
 *
 * Documentation bodies, item documentation and the billboard are stored as raw
 * HTML and rendered with `<%- %>`. Nothing sanitised them before, so an admin
 * account (or a CSRF'd admin) could plant script that ran for every visitor.
 */

const { expect } = require("chai");
const { sanitizeHtml, sanitizeText, isSafeUrl, jsonForScript } = require("../../lib/sanitize");

describe("lib/sanitize", function () {
  describe("sanitizeHtml — removes executable content", function () {
    it("strips script tags and their contents", function () {
      const result = sanitizeHtml('Before<script>alert(1)</script>After');
      expect(result).to.not.include("script");
      expect(result).to.not.include("alert(1)");
      expect(result).to.include("Before");
      expect(result).to.include("After");
    });

    it("strips inline event handlers", function () {
      const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
      expect(result).to.not.include("onerror");
      expect(result).to.not.include("alert");
    });

    it("strips every on* handler, not just onerror", function () {
      for (const handler of ["onclick", "onload", "onmouseover", "onfocus"]) {
        const result = sanitizeHtml(`<div ${handler}="alert(1)">x</div>`);
        expect(result, `${handler} survived`).to.not.include(handler);
      }
    });

    it("strips javascript: URLs", function () {
      const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
      expect(result).to.not.include("javascript:");
    });

    it("strips javascript: URLs obfuscated with control characters", function () {
      // Browsers still honour "java\tscript:".
      const result = sanitizeHtml('<a href="java\tscript:alert(1)">click</a>');
      expect(result.toLowerCase()).to.not.include("script:");
    });

    it("strips data: URLs, which can carry an HTML document", function () {
      const result = sanitizeHtml(
        '<a href="data:text/html;base64,PHNjcmlwdD4=">click</a>',
      );
      expect(result).to.not.include("data:text/html");
    });

    it("removes iframes, objects and embeds", function () {
      for (const tag of ["iframe", "object", "embed"]) {
        const result = sanitizeHtml(`<${tag} src="//evil.example.com"></${tag}>`);
        expect(result, `${tag} survived`).to.not.include(`<${tag}`);
      }
    });

    it("removes forms, which could phish on a trusted page", function () {
      const result = sanitizeHtml(
        '<form action="//evil.example.com"><input name="password"></form>',
      );
      expect(result).to.not.include("<form");
    });

    it("strips expression() and url() from styles", function () {
      const result = sanitizeHtml(
        '<div style="background: url(javascript:alert(1))">x</div>',
      );
      expect(result).to.not.include("javascript:");
    });
  });

  describe("sanitizeHtml — preserves legitimate editor output", function () {
    it("keeps basic formatting", function () {
      const html = "<p><strong>Bold</strong> and <em>italic</em></p>";
      expect(sanitizeHtml(html)).to.equal(html);
    });

    it("keeps Word paste artefacts the existing content relies on", function () {
      const result = sanitizeHtml('<p class="MsoNormal">Pasted</p>');
      expect(result).to.include('class="MsoNormal"');
    });

    it("keeps inline styles from the allowed properties", function () {
      const result = sanitizeHtml('<span style="color: black;">Text</span>');
      expect(result).to.include("color");
      expect(result).to.include("Text");
    });

    it("keeps images served from this app", function () {
      const result = sanitizeHtml(
        '<img src="/filemanager/abc-123/download" alt="Map" width="1000" height="663" />',
      );
      expect(result).to.include('src="/filemanager/abc-123/download"');
      expect(result).to.include('width="1000"');
    });

    it("keeps relative and absolute https links", function () {
      expect(sanitizeHtml('<a href="/uploads/x.pdf">doc</a>')).to.include(
        'href="/uploads/x.pdf"',
      );
      expect(sanitizeHtml('<a href="https://example.com">site</a>')).to.include(
        'href="https://example.com"',
      );
    });

    it("keeps tables and lists", function () {
      const html =
        "<table><tbody><tr><td>Cell</td></tr></tbody></table><ul><li>Item</li></ul>";
      const result = sanitizeHtml(html);
      expect(result).to.include("<table>");
      expect(result).to.include("<li>Item</li>");
    });

    it("returns an empty string for null or undefined", function () {
      expect(sanitizeHtml(null)).to.equal("");
      expect(sanitizeHtml(undefined)).to.equal("");
    });

    it("is idempotent — sanitising twice changes nothing further", function () {
      const once = sanitizeHtml('<p class="MsoNormal">Text <strong>here</strong></p>');
      expect(sanitizeHtml(once)).to.equal(once);
    });
  });

  describe("sanitizeText", function () {
    it("strips all markup", function () {
      expect(sanitizeText("<b>bold</b>")).to.not.include("<b>");
    });

    it("drops the body of dangerous tags", function () {
      expect(sanitizeText("<script>alert(1)</script>")).to.not.include("alert");
    });
  });

  describe("isSafeUrl", function () {
    it("accepts relative and root-relative URLs", function () {
      expect(isSafeUrl("/uploads/x.pdf")).to.equal(true);
      expect(isSafeUrl("page.html")).to.equal(true);
    });

    it("accepts http and https", function () {
      expect(isSafeUrl("https://example.com")).to.equal(true);
      expect(isSafeUrl("http://example.com")).to.equal(true);
    });

    it("rejects javascript:, data: and vbscript:", function () {
      expect(isSafeUrl("javascript:alert(1)")).to.equal(false);
      expect(isSafeUrl("data:text/html,<script>")).to.equal(false);
      expect(isSafeUrl("vbscript:msgbox")).to.equal(false);
    });

    it("rejects schemes hidden behind whitespace or control characters", function () {
      expect(isSafeUrl("  javascript:alert(1)")).to.equal(false);
      expect(isSafeUrl("java\tscript:alert(1)")).to.equal(false);
      expect(isSafeUrl("java\nscript:alert(1)")).to.equal(false);
    });
  });

  describe("jsonForScript", function () {
    it("escapes < so the JSON cannot close the script element", function () {
      const result = jsonForScript({ name: "</script><script>alert(1)</script>" });
      expect(result).to.not.include("</script>");
      expect(result).to.include("\\u003c");
    });

    it("escapes the U+2028/U+2029 line separators", function () {
      // These are literal newlines to a JavaScript parser but legal in JSON.
      const result = jsonForScript({ text: "a b c" });
      expect(result).to.include("\\u2028");
      expect(result).to.include("\\u2029");
    });

    it("leaves ordinary punctuation intact", function () {
      // The old pipeline HTML-escaped these fields first, so O'Brien reached
      // the page as O&amp;#x27;Brien.
      const result = jsonForScript({ name: "O'Brien" });
      expect(result).to.include("O'Brien");
      expect(JSON.parse(result).name).to.equal("O'Brien");
    });

    it("round-trips through JSON.parse", function () {
      const value = { a: 1, b: "text", c: null, d: ["x", "y"] };
      expect(JSON.parse(jsonForScript(value))).to.deep.equal(value);
    });

    it("serialises undefined as null rather than emitting invalid JSON", function () {
      expect(jsonForScript(undefined)).to.equal("null");
    });
  });
});
