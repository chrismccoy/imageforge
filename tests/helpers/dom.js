/**
 * DOM slice helper
 */

"use strict";

function dataWidget(html, name, closeTag) {
  return new RegExp(`data-widget="${name}"[\\s\\S]*?<\\/${closeTag}>`).exec(
    html
  )[0];
}

function attrTag(html, attr, tag) {
  const match = new RegExp(
    `<${tag}\\b[^>]*\\b${attr}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`
  ).exec(html);
  return match ? match[0] : null;
}

module.exports = { dataWidget, attrTag };
