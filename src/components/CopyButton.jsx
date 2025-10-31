// src/components/CopyButton.jsx
import { useState } from "react";
import { Clipboard, Check } from "lucide-react";

/**
 * CopyButton
 * Props:
 * - text (string): content to copy
 * - onSuccess (fn): optional callback called after successful copy
 * - onError (fn): optional callback for error
 * - disabled (bool)
 * - className (string) extra classes
 */
export default function CopyButton({ text = "", onSuccess, onError, disabled = false, className = "" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (disabled || !text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (typeof onSuccess === "function") onSuccess();
      // revert icon after short time
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed", err);
      if (typeof onError === "function") onError(err);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled || !text}
      className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${className}`}
    >
      <span className="w-4 h-4 flex items-center justify-center">
        {copied ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
      </span>
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
