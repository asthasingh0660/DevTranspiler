// src/App.jsx
import { useState, useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { Code, Play, RotateCcw, CheckCircle, Loader2, Clipboard } from "lucide-react";

import CopyButton from "./components/CopyButton";
import { stripFences, hasDangerousShell, truncateOutput } from "./utils/sanitize";

import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { go } from "@codemirror/lang-go";
import { xml } from "@codemirror/lang-xml";
import { css } from "@codemirror/lang-css";

import { Toaster, toast } from "react-hot-toast";

/* ---------------------------
   Configuration: toggle ping
   ---------------------------
   NOTE (dev/prod): 
   - For local development/testing you can set ALLOW_PING = true (will perform a single ai.chat("ping") fallback;
     useful to quickly validate readiness but may consume provider tokens/requests).
   - For production, set ALLOW_PING = false so the readiness check only relies on non-network signals
     (e.g., ai.ready promise or ai.init()). You told me you'll keep this in mind — switch as needed.
*/
const ALLOW_PING = true; // <-- set true for dev/test; false for prod 

//const ALLOW_PING = import.meta.env.MODE !== 'production';

/* ---------------------------
   CodeMirror language mapping
   --------------------------- */
function getLanguageExtension(target) {
  const t = (target || "").toLowerCase();
  if (t.includes("javascript") || t === "js") return javascript({ jsx: true });
  if (t.includes("typescript") || t === "ts") return javascript({ typescript: true });
  if (t.includes("python") || t === "py") return python();
  if (t.includes("java")) return java();
  if (t === "go" || t === "golang") return go();
  if (t.includes("html") || t.includes("xml")) return xml();
  if (t.includes("css") || t.includes("scss")) return css();
  // fallback to JS highlighting so it isn't plain text
  return javascript({ jsx: true });
}

/* ---------------------------
   AI readiness helpers
   --------------------------- */

// Race a promise with a timeout
function promiseWithTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// Single attempt: try ai.ready (promise), ai.init(), then optional ai.chat('ping')
async function checkAiReadyOnce(timeoutMs = 8000, allowPing = true) {
  const ai = window?.puter?.ai;
  if (!ai) return false;

  try {
    // 1) ready promise
    if (ai.ready && typeof ai.ready.then === "function") {
      await promiseWithTimeout(ai.ready, timeoutMs);
      return true;
    }

    // 2) init() that returns a promise
    if (typeof ai.init === "function") {
      const maybePromise = ai.init();
      if (maybePromise && typeof maybePromise.then === "function") {
        await promiseWithTimeout(maybePromise, timeoutMs);
        return true;
      }
    }

    // 3) fallback ping (only if allowed)
    if (allowPing && typeof ai.chat === "function") {
      // Keep this ping minimal. Adjust or remove for production if you don't want provider calls.
      await promiseWithTimeout(ai.chat("ping"), Math.min(timeoutMs, 5000));
      return true;
    }
  } catch (err) {
    // swallow; return false below
    console.debug("checkAiReadyOnce failed:", err);
    return false;
  }

  return false;
}

// Robust check: limited retries with exponential-ish backoff
async function checkAiReadyWithRetries({ attempts = 3, baseTimeout = 8000, allowPing = true } = {}) {
  for (let i = 0; i < attempts; i++) {
    const timeoutMs = Math.round(baseTimeout * (1 + i * 0.5)); // slightly larger time on retries
    const ok = await checkAiReadyOnce(timeoutMs, allowPing);
    if (ok) return true;
    // backoff between attempts (2s, 4s, 8s capped)
    const backoff = Math.min(2000 * Math.pow(2, i), 8000);
    await new Promise((r) => setTimeout(r, backoff));
  }
  return false;
}

/* ---------------------------
   App component
   --------------------------- */
export default function App() {
  const languages = [
    "JavaScript",
    "TypeScript",
    "Python",
    "Java",
    "C++",
    "C#",
    "Ruby",
    "Go",
    "PHP",
    "Swift",
    "Kotlin",
    "HTML",
    "CSS",
  ];

  const examples = {
    JavaScript: `function helloWorld() {\n  console.log("Hello World!");\n}`,
    TypeScript: `function helloWorld(): void {\n  console.log("Hello World!");\n}`,
    Python: `def hello_world():\n    print("Hello World!")\n`,
    Java: `public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello World!");\n  }\n}`,
    "C++": `#include <iostream>\nint main() {\n  std::cout << "Hello World!" << std::endl;\n  return 0;\n}`,
    "C#": `using System;\nclass Program {\n  static void Main() {\n    Console.WriteLine("Hello World!");\n  }\n}`,
    Ruby: `def hello_world\n  puts "Hello World!"\nend`,
    Go: `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello World!")\n}\n`,
    PHP: `<?php\necho "Hello World!";\n?>`,
    Swift: `import Foundation\nprint("Hello World!")`,
    Kotlin: `fun main() {\n  println("Hello World!")\n}`,
    HTML: `<!doctype html>\n<html>\n  <body>\n    <h1>Hello World!</h1>\n  </body>\n</html>`,
    CSS: `body {\n  background: #111;\n  color: #fff;\n}`,
  };

  // state
  const [sourceLang, setSourceLang] = useState("JavaScript");
  const [targetLang, setTargetLang] = useState("Python");
  const [inputCode, setInputCode] = useState(examples["JavaScript"] ?? "");
  const [outputCode, setOutputCode] = useState("");
  const [aiReady, setAiReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // remember last auto-inserted example so we don't overwrite user edits
  const prevExampleRef = useRef(examples[sourceLang] ?? "");

  // On mount: perform robust readiness check (no polling)
  // Replace your existing "On mount: perform robust readiness check" useEffect with this:
  
useEffect(() => {
  let mounted = true;

  async function initPuter() {
    console.log("Initializing Puter...");

    // Wait until window.puter is available
    for (let i = 0; i < 20; i++) {
      if (window.puter) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    if (!window.puter) {
      console.error("Puter not found — check if script is loaded.");
      toast.error("Puter script not loaded!");
      return;
    }

    try {
      await window.puter.user();
      console.log("Puter user session OK");
    } catch (e) {
      console.warn("Puter user() failed, continuing anyway", e);
    }

    // ✅ Try native readiness first
    try {
      const ready = await window.puter.ai.ready();
      if (ready) {
        console.log("AI ready without ping");
        setAiReady(true);
        return;
      }
    } catch (e) {
      console.log("AI ready() not available, continuing fallback...");
    }

    // 🧩 Fallback (only if allowed)
    if (ALLOW_PING) {
      try {
        const res = await window.puter.ai.chat("ping");
        console.log("AI ping success:", res);
        setAiReady(true);
        return;
      } catch (e) {
        console.error("AI ping failed", e);
      }
    }

    console.warn("AI not ready — running in limited mode");
    setAiReady(false);
  }

  initPuter();

  return () => {
    mounted = false;
  };
}, []);



 // run once on mount

  // seed input with example on first mount (if empty)
  useEffect(() => {
    if (!inputCode || inputCode.trim() === "") {
      const initial = examples[sourceLang] ?? "";
      setInputCode(initial);
      prevExampleRef.current = initial;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when sourceLang changes: auto-insert example only if user hasn't modified input
  useEffect(() => {
    const newExample = examples[sourceLang] ?? "";
    const currentTrim = (inputCode || "").trim();
    const prevTrim = (prevExampleRef.current || "").trim();

    if (!currentTrim || currentTrim === prevTrim) {
      setInputCode(newExample);
      prevExampleRef.current = newExample;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceLang]);

  // convert handler
  async function handleConvert() {
    if (!inputCode.trim()) {
      toast.error("Input code cannot be empty.");
      return;
    }
    if (!aiReady) {
      toast.error("AI service not ready. Please wait.");
      return;
    }

    setIsLoading(true);
    setOutputCode("");
    const toastId = toast.loading(`Converting ${sourceLang} → ${targetLang}...`);

    try {
      const prompt = `
You are a precise code translator. Convert the following ${sourceLang} code to ${targetLang}.
Return ONLY the converted code (raw or inside a single code block). No extra explanations.
Preserve logic, function names, and comments where possible.

Source code:
${inputCode}
      `.trim();

      const res = await window.puter.ai.chat(prompt);

      // parse common shapes
      let reply = "";
      if (typeof res === "string") {
        reply = res;
      } else if (res?.message?.content) {
        reply = res.message.content;
      } else if (Array.isArray(res?.message)) {
        reply = res.message.map((m) => m.content ?? "").filter(Boolean).join("\n");
      } else {
        reply = "";
      }

      if (!reply.trim()) throw new Error("Empty AI response.");

      const cleaned = stripFences(reply);

      if (hasDangerousShell(cleaned)) {
        toast.warning("Conversion contains potentially dangerous shell commands — review before running.", { id: toastId });
      }

      const displayed = truncateOutput(cleaned, 200_000);
      setOutputCode(displayed);

      if (displayed.includes("// ...truncated")) {
        toast.success("Converted (truncated for display). Full output available for download.", { id: toastId });
      } else {
        toast.success("Conversion successful!", { id: toastId });
      }
    } catch (err) {
      console.error("Conversion error:", err);
      toast.error("Conversion failed: " + (err?.message || String(err)), { id: toastId });
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    const initial = examples[sourceLang] ?? "";
    setInputCode(initial);
    prevExampleRef.current = initial;
    setOutputCode("");
  }

  function onCopySuccess() {
    toast.success("Output copied to clipboard!");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-950 to-purple-950 flex flex-col items-center justify-start p-6 gap-8">
      <Toaster position="top-right" />

      <h1 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400 bg-clip-text text-transparent text-center mt-6">
        AI Code Converter
      </h1>

      {/* selectors & actions */}
      <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-4xl">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-300">From</label>
          <select
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            className="bg-slate-900/80 text-white px-3 py-2 rounded-xl"
            disabled={isLoading}
          >
            {languages.map((lang) => (
              <option key={"src-" + lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-300">To</label>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="bg-slate-900/80 text-white px-3 py-2 rounded-xl"
            disabled={isLoading}
          >
            {languages.map((lang) => (
              <option key={"tgt-" + lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleConvert}
            disabled={!aiReady || isLoading}
            className="px-4 py-2 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-2xl text-white flex items-center gap-2 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>{isLoading ? "Converting..." : "Convert"}</span>
          </button>

          <button
            onClick={handleReset}
            disabled={isLoading}
            className="px-4 py-2 bg-rose-500 rounded-2xl text-white flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>

      {/* editors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-7xl">
        {/* input */}
        <div className="bg-slate-900/80 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
            <Code className="w-5 h-5 text-cyan-400" />
            <span className="text-white font-semibold">Input ({sourceLang})</span>
          </div>
          <CodeMirror
            value={inputCode}
            height="420px"
            extensions={[getLanguageExtension(sourceLang)]}
            theme={dracula}
            onChange={(v) => setInputCode(v)}
          />
        </div>

        {/* output */}
        <div className="bg-slate-900/80 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-white font-semibold">Converted ({targetLang})</span>
            </div>

            <div className="flex items-center gap-2">
              <CopyButton text={outputCode} onSuccess={onCopySuccess} disabled={!outputCode} className="bg-slate-700 hover:bg-slate-600 text-white" />
            </div>
          </div>

          <CodeMirror
            value={outputCode}
            height="420px"
            extensions={[getLanguageExtension(targetLang)]}
            theme={dracula}
            editable={false}
          />
        </div>
      </div>
    </div>
  );
}





/*
import { useState, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { dracula } from "@uiw/codemirror-theme-dracula";
import {
  Code,
  Play,
  RotateCcw,
  CheckCircle,
  Clipboard,
  Loader2,
} from "lucide-react";

// Additional language imports (install these packages, see below)
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { go } from "@codemirror/lang-go";
import { xml } from "@codemirror/lang-xml";
import { css } from "@codemirror/lang-css";

function App() {
  const [aiReady, setAiReady] = useState(false); // check if ai is ready or not
  const [inputCode, setInputCode] = useState(
    `function helloWorld() {\n console.log("Hello World!");\n }`
  );
  const [outputCode, setOutputCode] = useState(""); // store data inside the output section
  const [targetLang, setTargetLang] = useState("Python"); // store the target language
  const [isLoading, setIsLoading] = useState(false); // loading state for conversion process
  const [feedback, setFeedback] = useState(""); // store feedback message
  const [copied, setCopied] = useState(false); // copy-to-clipboard visual state

  // Check if AI service is ready
  useEffect(() => {
    const checkReady = setInterval(() => {
      if (window.puter?.ai?.chat) {
        setAiReady(true);
        clearInterval(checkReady);
      }
    }, 300);
    return () => clearInterval(checkReady);
  }, []);

  // ---------- Utilities ----------

  // Strip triple-backtick fenced blocks and return inner code(s)
  function stripFences(text = "") {
    const fenceRegex = /```[a-zA-Z0-9+\-._]*\n([\s\S]*?)```/g;
    const matches = [];
    let m;
    while ((m = fenceRegex.exec(text)) !== null) {
      matches.push(m[1]);
    }
    if (matches.length > 0) {
      return matches.join("\n\n").trim();
    }
    // fallback: remove any single leading/trailing fences
    return text.replace(/^\s*```[^\n]*\n?/, "").replace(/```\s*$/, "").trim();
  }

  // Very naive dangerous shell pattern checker (informational only)
  function hasDangerousShell(text = "") {
    const dangerous = /(?:rm\s+-rf|sudo|mkfs|dd\s+if=|:(){:|forkbomb|chmod\s+777)/i;
    return dangerous.test(text);
  }

  // Map targetLang to a CodeMirror extension
  function getLanguageExtension(target) {
    const t = (target || "").toLowerCase();
    if (t.includes("javascript") || t === "js") return javascript({ jsx: true });
    if (t.includes("typescript") || t === "ts") return javascript({ typescript: true });
    if (t.includes("python") || t === "py") return python();
    if (t.includes("java")) return java();
    if (t === "go" || t === "golang") return go();
    if (t.includes("html") || t.includes("xml")) return xml();
    if (t.includes("css") || t.includes("scss")) return css();
    // fallback: use JS highlighting so it's not totally plain
    return javascript({ jsx: true });
  }

  // ---------- Convert handler ----------
  const handleConvert = async () => {
    if (!inputCode.trim()) {
      setFeedback("Input code cannot be empty.");
      return;
    }
    if (!aiReady) {
      setFeedback("AI service is not ready yet. Please wait...");
      return;
    }

    setIsLoading(true);
    setFeedback("");
    setOutputCode("");
    setCopied(false);

    try {
      const prompt = `
Convert the following JavaScript code to ${targetLang}. Only return the converted code without any explanations or additional text.

Code:
${inputCode}
      `.trim();

      const res = await window.puter.ai.chat(prompt);

      // Safely parse response into text
      let reply = "";
      if (typeof res === "string") {
        reply = res;
      } else if (res?.message?.content) {
        reply = res.message.content;
      } else if (Array.isArray(res?.message)) {
        reply = res.message
          .map((m) => m.content ?? m.context ?? "")
          .filter(Boolean)
          .join("\n");
      } else {
        reply = "";
      }

      if (!reply.trim()) throw new Error("Received empty response from AI.");

      // Clean fenced markdown and language hints
      const cleaned = stripFences(reply);

      // Basic safety / heuristics
      if (hasDangerousShell(cleaned)) {
        setFeedback("Conversion contains suspicious shell commands — review before running.");
      }

      // Limit very large outputs for UI (still set full output to state; here we keep it)
      const MAX_LENGTH = 200_000;
      if (cleaned.length > MAX_LENGTH) {
        setFeedback("Converted output is too large to display in full. Download or view truncated output.");
        setOutputCode(cleaned.slice(0, MAX_LENGTH) + "\n\n// ...truncated...");
      } else {
        setOutputCode(cleaned);
        setFeedback("✅ Conversion successful!");
      }
    } catch (error) {
      console.error("Conversion error:", error);
      setFeedback(`Conversion failed: ${error?.message ?? String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- Reset ----------
  const handleReset = () => {
    setInputCode(`function helloWorld() {\n console.log("Hello World!");\n }`);
    setOutputCode("");
    setFeedback("");
    setCopied(false);
  };

  // ---------- Copy ----------
  const handleCopy = async () => {
    if (!outputCode) return;
    try {
      await navigator.clipboard.writeText(outputCode);
      setCopied(true);
      setFeedback("📄 Output code copied to clipboard!");
      // visual copied state for 1.5s
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
      setFeedback("Failed to copy to clipboard.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-950 to-purple-950 flex flex-col items-center justify-center p-6 gap-10 relative overflow-hidden">
      <h1 className="text-5xl sm:text-7xl font-extrabold bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400 bg-clip-text text-transparent text-center drop-shadow-lg relative">
        AI Code Converter
      </h1>

      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center relative z-10">
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="bg-slate-900/80 text-white px-4 py-2 rounded-xl border border-slate-700 shadow-lg backdrop-blur-md cursor-pointer"
          disabled={isLoading}
        >
          {[
            "Python",
            "Java",
            "C++",
            "C#",
            "Ruby",
            "Go",
            "PHP",
            "Swift",
            "Kotlin",
            "TypeScript",
            "JavaScript",
          ].map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>

        <button
          onClick={handleConvert}
          disabled={!aiReady || isLoading}
          className="px-6 py-3 bg-gradient-to-r from-violet-500 to-cyan-500 hover:opacity-80 active:scale-95 text-white font-semibold rounded-2xl transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Converting...
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              Convert
            </>
          )}
        </button>

        <button
          onClick={handleReset}
          disabled={isLoading}
          className="px-6 py-3 bg-gradient-to-r from-rose-500 to-orange-500 hover:opacity-80 active:scale-95 text-white font-semibold rounded-2xl transition-all flex items-center gap-2 shadow-lg cursor-pointer"
        >
          <RotateCcw className="w-5 h-5" /> Reset
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-7xl relative z-10">
        {/* Input *//*}
        <div className="bg-slate-900/80 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md">
          <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700 flex items-center gap-2">
            <Code className="w-5 h-5 text-cyan-400" />
            <span className="text-white font-semibold">Input Code</span>
          </div>
          <CodeMirror
            value={inputCode}
            height="420px"
            extensions={[javascript({ jsx: true })]}
            theme={dracula}
            onChange={(value) => setInputCode(value)}
          />
        </div>

        {/* Output *//*}
        <div className="bg-slate-900/80 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md flex flex-col">
          <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-white font-semibold">Converted Code ({targetLang})</span>
            </div>
            <button
              onClick={handleCopy}
              disabled={!outputCode}
              className="flex items-center gap-1 text-sm px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg disabled:opacity-50"
            >
              <span className="w-4 h-4 flex items-center justify-center">
                {copied ? <CheckCircle className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
              </span>
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>

          <CodeMirror
            value={outputCode}
            height="420px"
            extensions={[getLanguageExtension(targetLang)]}
            theme={dracula}
            editable={false}
          />
        </div>
      </div>

      {feedback && (
        <p
          className={`text-center font-semibold drop-shadow-md relative z-10 ${
            feedback.includes("✅") || feedback.includes("📄")
              ? "text-emerald-400"
              : "text-rose-400"
          }`}
        >
          {feedback}
        </p>
      )}

      {!aiReady && (
        <p className="text-sm text-slate-400 relative z-10">Initializing AI... please wait</p>
      )}
    </div>
  );
}

export default App;
*/



/*
import { useState, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { dracula } from "@uiw/codemirror-theme-dracula";
import {
  Code,
  Play,
  RotateCcw,
  CheckCircle,
  Clipboard,
  Loader2,
} from "lucide-react";

function App() {
  const [aiReady, setAiReady] = useState(false); // check if ai is ready or not
  const [inputCode, setInputCode] = useState(
    `function helloWorld() {\n console.log("Hello World!");\n }`
  ); // store data inside the input section
  const [outputCode, setOutputCode] = useState(""); // store data inside the output section
  const [targetLang, setTargetLang] = useState("Python"); // store the target language
  const [isLoading, setIsLoading] = useState(false); // loading state for conversion process
  const [feedback, setFeedback] = useState(""); // store feedback message

  // Check if AI service is ready
  useEffect(() => {
    const checkReady = setInterval(() => {
      if (window.puter?.ai?.chat) {
        setAiReady(true);
        clearInterval(checkReady);
      }
    }, 300);
    return () => clearInterval(checkReady);
  }, []);

  // Handle code conversion
  const handleConvert = async () => {
    if (!inputCode.trim()) {
      setFeedback("Input code cannot be empty.");
      return;
    }
    if (!aiReady) {
      setFeedback("AI service is not ready yet. Please wait...");
      return;
    }

    setIsLoading(true);
    setFeedback("");
    setOutputCode("");

    try {
      const res = await window.puter.ai.chat(
        `
        Convert the following JavaScript code to ${targetLang}. Only return the converted code without any explanations or additional text.

        Code:
        ${inputCode}
        `
      );

      // Safely parse response
      let reply = "";
      if (typeof res === "string") {
        reply = res;
      } else if (res?.message?.content) {
        // single message object with content
        reply = res.message.content;
      } else if (Array.isArray(res?.message)) {
        // array of message objects - try content then context
        reply = res.message
          .map((m) => m.content ?? m.context ?? "")
          .filter(Boolean)
          .join("\n");
      } else {
        reply = "";
      }

      if (!reply.trim()) throw new Error("Received empty response from AI.");
      setOutputCode(reply.trim());
      setFeedback("✅ Conversion successful!");
    } catch (error) {
      console.error("Conversion error:", error);
      setFeedback(`Conversion failed: ${error?.message ?? String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setInputCode(`function helloWorld() {\n console.log("Hello World!");\n }`);
    setOutputCode("");
    setFeedback("");
  };

  const handleCopy = async () => {
    if (outputCode) {
      try {
        await navigator.clipboard.writeText(outputCode);
        setFeedback("📄 Output code copied to clipboard!");
      } catch (err) {
        setFeedback("Failed to copy to clipboard.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-950 to-purple-950 flex flex-col items-center justify-center p-6 gap-10 relative overflow-hidden">
      <h1 className="text-5xl sm:text-7xl font-extrabold bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400 bg-clip-text text-transparent text-center drop-shadow-lg relative">
        AI Code Converter
      </h1>

      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center relative z-10">
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="bg-slate-900/80 text-white px-4 py-2 rounded-xl border border-slate-700 shadow-lg backdrop-blur-md cursor-pointer"
          disabled={isLoading}
        >
          {[
            "Python",
            "Java",
            "C++",
            "C#",
            "Ruby",
            "Go",
            "PHP",
            "Swift",
            "Kotlin",
            "TypeScript",
          ].map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>

        <button
          onClick={handleConvert}
          disabled={!aiReady || isLoading}
          className="px-6 py-3 bg-gradient-to-r from-violet-500 to-cyan-500 hover:opacity-80 active:scale-95 text-white font-semibold rounded-2xl transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Converting...
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              Convert
            </>
          )}
        </button>

        <button
          onClick={handleReset}
          disabled={isLoading}
          className="px-6 py-3 bg-gradient-to-r from-rose-500 to-orange-500 hover:opacity-80 active:scale-95 text-white font-semibold rounded-2xl transition-all flex items-center gap-2 shadow-lg cursor-pointer"
        >
          <RotateCcw className="w-5 h-5" /> Reset
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-7xl relative z-10">
        {/* Input *//*}
        <div className="bg-slate-900/80 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md">
          <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700 flex items-center gap-2">
            <Code className="w-5 h-5 text-cyan-400" />
            <span className="text-white font-semibold">Input Code</span>
          </div>
          <CodeMirror
            value={inputCode}
            height="420px"
            extensions={[javascript({ jsx: true })]}
            theme={dracula}
            onChange={(value) => setInputCode(value)}
          />
        </div>

        {/* Output *//*}
        <div className="bg-slate-900/80 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md flex flex-col">
          <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-white font-semibold">Converted Code ({targetLang})</span>
            </div>
            <button
              onClick={handleCopy}
              disabled={!outputCode}
              className="flex items-center gap-1 text-sm px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg disabled:opacity-50"
            >
              <Clipboard className="w-4 h-4" />
            </button>
          </div>

          <CodeMirror
            value={outputCode}
            height="420px"
            // For simplicity we keep javascript syntax highlighting; you could map `targetLang` -> mode
            extensions={[javascript({ jsx: true })]}
            theme={dracula}
            editable={false}
          />
        </div>
      </div>

      {feedback && (
        <p
          className={`text-center font-semibold drop-shadow-md relative z-10 ${
            feedback.includes("✅") || feedback.includes("📄")
              ? "text-emerald-400"
              : "text-rose-400"
          }`}
        >
          {feedback}
        </p>
      )}

      {!aiReady && (
        <p className="text-sm text-slate-400 relative z-10">Initializing AI... please wait</p>
      )}
    </div>
  );
}

export default App;
*/
