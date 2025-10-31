// src/utils/sanitize.js
// Small utility helpers for cleaning up AI model responses and basic guards.

/**
 * stripFences(text)
 * Removes triple-backtick fenced code blocks and returns their inner content.
 * If multiple fenced blocks exist, joins them with blank line.
 * If no fences are present, strips stray leading/trailing triple-backticks.
 */
export function stripFences(text = "") {
  if (typeof text !== "string") return "";
  const fenceRegex = /```[a-zA-Z0-9+\-._]*\n([\s\S]*?)```/g;
  const matches = [];
  let m;
  while ((m = fenceRegex.exec(text)) !== null) {
    matches.push(m[1]);
  }
  if (matches.length > 0) {
    return matches.join("\n\n").trim();
  }
  // fallback: remove single leading/trailing fences if present
  return text.replace(/^\s*```[^\n]*\n?/, "").replace(/```\s*$/, "").trim();
}

/**
 * hasDangerousShell(text)
 * Quick heuristic to detect obviously dangerous shell commands in the converted output.
 * This is NOT foolproof — only a lightweight warning for the UI.
 */
export function hasDangerousShell(text = "") {
  if (typeof text !== "string") return false;
  const dangerous = /(?:rm\s+-rf|sudo\b|mkfs\b|dd\s+if=|:(){:|forkbomb|chmod\s+777|curl\s+--|wget\s+--)/i;
  return dangerous.test(text);
}

/**
 * truncateOutput(text, maxLen = 200000)
 * Truncates output for display while returning a truncated notice.
 */
export function truncateOutput(text = "", maxLen = 200000) {
  if (typeof text !== "string") return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n\n// ...truncated (full output available for download) ...";
}
