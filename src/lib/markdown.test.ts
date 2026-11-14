import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("escapes raw HTML before formatting", () => {
    const html = renderMarkdown('<script>alert("x")</script> isn\'t safe');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
    expect(html).toContain("&#39;");
  });

  it("renders bold and money", () => {
    expect(renderMarkdown("You have **$4,283.59** due.")).toContain(
      "<strong>$4,283.59</strong>"
    );
  });

  it("renders italic and inline code without touching code contents", () => {
    const html = renderMarkdown("This is *important* and `**not bold**`.");
    expect(html).toContain("<em>important</em>");
    expect(html).toContain("<code>**not bold**</code>");
    expect(html).not.toContain("<strong>not bold</strong>");
  });

  it("renders bullet and numbered lists", () => {
    expect(renderMarkdown("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
    expect(renderMarkdown("1. first\n2. second")).toBe("<ol><li>first</li><li>second</li></ol>");
  });

  it("keeps single newlines inside a paragraph", () => {
    expect(renderMarkdown("line one\nline two")).toBe("<p>line one<br>line two</p>");
    expect(renderMarkdown("one\n\ntwo")).toBe("<p>one</p><p>two</p>");
  });

  it("renders ATX headings as h3", () => {
    expect(renderMarkdown("### Account Snapshot")).toBe("<h3>Account Snapshot</h3>");
    expect(renderMarkdown("### **Bold** heading")).toBe("<h3><strong>Bold</strong> heading</h3>");
  });

  it("flushes paragraphs and lists around headings", () => {
    expect(renderMarkdown("Intro\n### Next")).toBe("<p>Intro</p><h3>Next</h3>");
    expect(renderMarkdown("- one\n### Next\n- two")).toBe(
      "<ul><li>one</li></ul><h3>Next</h3><ul><li>two</li></ul>"
    );
  });

  it("keeps escaped content inside headings", () => {
    const html = renderMarkdown("### <script>alert('x')</script>");
    expect(html).not.toContain("<script>");
    expect(html).toBe("<h3>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;</h3>");
  });

  it("does not create links or raw markup", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toContain("<a");
    expect(html).toContain("[click](javascript:alert(1))");
  });
});
