// src/App.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { go } from "@codemirror/lang-go";
import { xml } from "@codemirror/lang-xml";
import { css } from "@codemirror/lang-css";
import { dracula } from "@uiw/codemirror-theme-dracula";
import {
  ArrowRightLeft, Code2, RotateCcw, CheckCircle,
  Loader2, Zap, AlertTriangle, Clock, Play, Terminal,
  XCircle, GitCompare, FileCode,
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import CopyButton from "./components/CopyButton";

/* ─── Config ─────────────────────────────────────────────────────── */
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : "/api/v1";
const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 120;

/* ─── Languages ──────────────────────────────────────────────────── */
const LANGUAGES = [
  "JavaScript","TypeScript","Python","Java",
  "C++","C#","Ruby","Go","PHP","Swift","Kotlin",
];
const EXAMPLES = {
  JavaScript:`function fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nconsole.log(fibonacci(10));`,
  TypeScript:`function fibonacci(n: number): number {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nconsole.log(fibonacci(10));`,
  Python:`def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n - 1) + fibonacci(n - 2)\n\nprint(fibonacci(10))`,
  Java:`public class Main {\n    static int fibonacci(int n) {\n        if (n <= 1) return n;\n        return fibonacci(n - 1) + fibonacci(n - 2);\n    }\n\n    public static void main(String[] args) {\n        System.out.println(fibonacci(10));\n    }\n}`,
  "C++":`#include <iostream>\n\nint fibonacci(int n) {\n    if (n <= 1) return n;\n    return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nint main() {\n    std::cout << fibonacci(10) << std::endl;\n    return 0;\n}`,
  "C#":`using System;\n\nclass Program {\n    static int Fibonacci(int n) {\n        if (n <= 1) return n;\n        return Fibonacci(n - 1) + Fibonacci(n - 2);\n    }\n\n    static void Main() {\n        Console.WriteLine(Fibonacci(10));\n    }\n}`,
  Ruby:`def fibonacci(n)\n  return n if n <= 1\n  fibonacci(n - 1) + fibonacci(n - 2)\nend\n\nputs fibonacci(10)`,
  Go:`package main\n\nimport "fmt"\n\nfunc fibonacci(n int) int {\n    if n <= 1 {\n        return n\n    }\n    return fibonacci(n-1) + fibonacci(n-2)\n}\n\nfunc main() {\n    fmt.Println(fibonacci(10))\n}`,
  PHP:`<?php\nfunction fibonacci($n) {\n    if ($n <= 1) return $n;\n    return fibonacci($n - 1) + fibonacci($n - 2);\n}\n\necho fibonacci(10);\n?>`,
  Swift:`func fibonacci(_ n: Int) -> Int {\n    if n <= 1 { return n }\n    return fibonacci(n - 1) + fibonacci(n - 2)\n}\n\nprint(fibonacci(10))`,
  Kotlin:`fun fibonacci(n: Int): Int {\n    if (n <= 1) return n\n    return fibonacci(n - 1) + fibonacci(n - 2)\n}\n\nfun main() {\n    println(fibonacci(10))\n}`,
};

/* ─── CodeMirror lang map ─────────────────────────────────────────── */
function getLangExtension(lang) {
  const t = (lang || "").toLowerCase();
  if (t.includes("javascript") || t === "js") return javascript({ jsx: true });
  if (t.includes("typescript") || t === "ts") return javascript({ typescript: true });
  if (t.includes("python") || t === "py") return python();
  if (t.includes("java") && !t.includes("script")) return java();
  if (t === "go" || t === "golang") return go();
  if (t.includes("html") || t.includes("xml")) return xml();
  if (t.includes("css") || t.includes("scss")) return css();
  return javascript({ jsx: true });
}

/* ─── Badges ─────────────────────────────────────────────────────── */
function LangBadge({ lang }) {
  const colors = {
    JavaScript:"bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    TypeScript:"bg-blue-500/20 text-blue-300 border-blue-500/30",
    Python:"bg-green-500/20 text-green-300 border-green-500/30",
    Java:"bg-orange-500/20 text-orange-300 border-orange-500/30",
    "C++":"bg-purple-500/20 text-purple-300 border-purple-500/30",
    "C#":"bg-violet-500/20 text-violet-300 border-violet-500/30",
    Ruby:"bg-red-500/20 text-red-300 border-red-500/30",
    Go:"bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    PHP:"bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    Swift:"bg-orange-400/20 text-orange-200 border-orange-400/30",
    Kotlin:"bg-pink-500/20 text-pink-300 border-pink-500/30",
  };
  const cls = colors[lang] || "bg-slate-500/20 text-slate-300 border-slate-500/30";
  return <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded border ${cls}`}>{lang}</span>;
}

/* ─── Pure-JS diff (no npm package needed) ───────────────────────── */
// Myers diff algorithm — produces array of {type: 'equal'|'insert'|'delete', line}
function computeDiff(oldText, newText) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result = [];

  // Simple LCS-based line diff
  const m = oldLines.length, n = newLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i+1][j+1] + 1
        : Math.max(dp[i+1][j], dp[i][j+1]);

  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ type: "equal", line: oldLines[i], oldNum: i+1, newNum: j+1 });
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j+1] >= dp[i+1][j])) {
      result.push({ type: "insert", line: newLines[j], newNum: j+1 });
      j++;
    } else {
      result.push({ type: "delete", line: oldLines[i], oldNum: i+1 });
      i++;
    }
  }
  return result;
}

/* ─── Diff view component ────────────────────────────────────────── */
function DiffView({ oldCode, newCode, sourceLang, targetLang }) {
  const diff = computeDiff(oldCode, newCode);
  const added   = diff.filter(d => d.type === "insert").length;
  const removed = diff.filter(d => d.type === "delete").length;

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#0d0d14] border-b border-white/5 text-xs">
        <span className="text-slate-500">{sourceLang} → {targetLang}</span>
        <span className="text-emerald-400">+{added} added</span>
        <span className="text-red-400">-{removed} removed</span>
        <span className="text-slate-600">{diff.filter(d => d.type === "equal").length} unchanged</span>
      </div>

      {/* Diff lines */}
      <div className="flex-1 overflow-auto font-mono text-sm" style={{ maxHeight: "calc(100vh - 260px)" }}>
        <table className="w-full border-collapse">
          <tbody>
            {diff.map((entry, idx) => {
              const isAdd = entry.type === "insert";
              const isDel = entry.type === "delete";
              const rowBg = isAdd ? "bg-emerald-950/40" : isDel ? "bg-red-950/40" : "";
              const textColor = isAdd ? "text-emerald-300" : isDel ? "text-red-300" : "text-slate-300";
              const marker = isAdd ? "+" : isDel ? "-" : " ";
              const markerColor = isAdd ? "text-emerald-500 bg-emerald-950/60" : isDel ? "text-red-500 bg-red-950/60" : "text-slate-600 bg-transparent";

              return (
                <tr key={idx} className={`${rowBg} hover:brightness-110`}>
                  {/* Old line number */}
                  <td className="w-10 text-right pr-2 py-0.5 text-slate-600 select-none border-r border-white/5 text-xs">
                    {entry.oldNum ?? ""}
                  </td>
                  {/* New line number */}
                  <td className="w-10 text-right pr-2 py-0.5 text-slate-600 select-none border-r border-white/5 text-xs">
                    {entry.newNum ?? ""}
                  </td>
                  {/* Marker */}
                  <td className={`w-6 text-center py-0.5 select-none font-bold ${markerColor}`}>
                    {marker}
                  </td>
                  {/* Code */}
                  <td className={`pl-2 py-0.5 whitespace-pre ${textColor}`}>
                    {entry.line}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Terminal panel ─────────────────────────────────────────────── */
function TerminalPanel({ result, isRunning, onClose }) {
  if (!result && !isRunning) return null;
  const output = result?.stdout || result?.compile_output || result?.stderr;
  return (
    <div className="border-t border-white/5 bg-[#06060a]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs text-slate-400 uppercase tracking-widest">Terminal</span>
          {result?.time && <span className="text-xs text-slate-600 flex items-center gap-1"><Clock className="w-3 h-3" />{result.time}s</span>}
        </div>
        <button onClick={onClose} className="text-slate-600 hover:text-slate-400 transition-colors">
          <XCircle className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 font-mono text-sm min-h-20 max-h-48 overflow-auto">
        {isRunning && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Running in sandbox…</span></div>}
        {result && !isRunning && (
          <>
            {result.stdout && <pre className="text-emerald-300 whitespace-pre-wrap">{result.stdout}</pre>}
            {result.compile_output && <pre className="text-yellow-300 whitespace-pre-wrap">{"[Compile Error]\n"}{result.compile_output}</pre>}
            {result.stderr && !result.compile_output && <pre className="text-red-300 whitespace-pre-wrap">{"[Runtime Error]\n"}{result.stderr}</pre>}
            {!output && <span className="text-slate-600 italic">No output produced.</span>}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── API helpers ────────────────────────────────────────────────── */
async function submitConversion(sourceLang, targetLang, inputCode) {
  const res = await fetch(`${API_BASE}/convert`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_lang: sourceLang, target_lang: targetLang, input_code: inputCode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err?.detail;
    throw new Error(Array.isArray(detail) ? detail.map(d => d.msg).join(", ") : detail || `Server error ${res.status}`);
  }
  return res.json();
}

async function pollJobStatus(jobId) {
  const res = await fetch(`${API_BASE}/convert/${jobId}/status`);
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json();
}

async function executeCode(code, language) {
  const res = await fetch(`${API_BASE}/execute`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, language }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Execution error ${res.status}`);
  }
  return res.json();
}

/* ─── App ────────────────────────────────────────────────────────── */
export default function App() {
  const [sourceLang, setSourceLang] = useState("JavaScript");
  const [targetLang, setTargetLang] = useState("Python");
  const [inputCode, setInputCode]   = useState(EXAMPLES["JavaScript"]);
  const [outputCode, setOutputCode] = useState("");
  const [isLoading, setIsLoading]   = useState(false);
  const [warning, setWarning]       = useState("");
  const [jobStatus, setJobStatus]   = useState("");
  const [backendReady, setBackendReady] = useState(null);
  const [elapsedMs, setElapsedMs]   = useState(0);
  const [isRunning, setIsRunning]   = useState(false);
  const [execResult, setExecResult] = useState(null);
  const [showTerminal, setShowTerminal] = useState(false);
  // Diff view toggle
  const [viewMode, setViewMode]     = useState("code"); // "code" | "diff"

  const prevExampleRef  = useRef(EXAMPLES["JavaScript"]);
  const pollTimerRef    = useRef(null);
  const startTimeRef    = useRef(null);
  const elapsedTimerRef = useRef(null);

  useEffect(() => {
    async function checkBackend() {
      try {
        const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        setBackendReady(data.status === "ok" || data.status === "degraded");
      } catch {
        setBackendReady(false);
        toast.error("Cannot reach backend. Is Docker running?", { duration: 6000 });
      }
    }
    checkBackend();
  }, []);

  useEffect(() => {
    const newExample = EXAMPLES[sourceLang] ?? "";
    const currentTrim = (inputCode || "").trim();
    const prevTrim = (prevExampleRef.current || "").trim();
    if (!currentTrim || currentTrim === prevTrim) {
      setInputCode(newExample);
      prevExampleRef.current = newExample;
    }
  }, [sourceLang]);

  useEffect(() => () => {
    clearTimeout(pollTimerRef.current);
    clearInterval(elapsedTimerRef.current);
  }, []);

  function handleSwapLangs() {
    if (isLoading) return;
    setSourceLang(targetLang); setTargetLang(sourceLang);
    if (outputCode) {
      setInputCode(outputCode);
      prevExampleRef.current = outputCode;
      setOutputCode(""); setExecResult(null); setShowTerminal(false); setViewMode("code");
    }
  }

  function handleReset() {
    clearTimeout(pollTimerRef.current); clearInterval(elapsedTimerRef.current);
    const initial = EXAMPLES[sourceLang] ?? "";
    setInputCode(initial); prevExampleRef.current = initial;
    setOutputCode(""); setWarning(""); setJobStatus("");
    setElapsedMs(0); setIsLoading(false);
    setExecResult(null); setShowTerminal(false); setViewMode("code");
  }

  const startPolling = useCallback((jobId, toastId, attempt = 0) => {
    if (attempt >= POLL_MAX_ATTEMPTS) {
      clearInterval(elapsedTimerRef.current);
      setIsLoading(false); setJobStatus("failed");
      toast.error("Conversion timed out.", { id: toastId }); return;
    }
    pollTimerRef.current = setTimeout(async () => {
      try {
        const data = await pollJobStatus(jobId);
        setJobStatus(data.status);
        if (data.status === "done") {
          clearInterval(elapsedTimerRef.current);
          setOutputCode(data.output_code ?? ""); setIsLoading(false);
          if (data.has_dangerous_output) setWarning("Output contains potentially dangerous shell patterns.");
          toast.success(`Converted${data.duration_ms ? ` in ${data.duration_ms}ms` : ""}${data.cache_hit ? " ⚡" : ""}`, { id: toastId });
        } else if (data.status === "failed") {
          clearInterval(elapsedTimerRef.current); setIsLoading(false);
          toast.error(`Failed: ${data.error_message || "Unknown error"}`, { id: toastId });
        } else { startPolling(jobId, toastId, attempt + 1); }
      } catch (err) {
        clearInterval(elapsedTimerRef.current); setIsLoading(false);
        toast.error(`Polling error: ${err.message}`, { id: toastId });
      }
    }, POLL_INTERVAL_MS);
  }, []);

  async function handleConvert() {
    if (!inputCode.trim()) { toast.error("Please enter some code."); return; }
    if (!backendReady) { toast.error("Backend not reachable."); return; }
    clearTimeout(pollTimerRef.current); clearInterval(elapsedTimerRef.current);
    setIsLoading(true); setOutputCode(""); setWarning(""); setJobStatus("queued");
    setElapsedMs(0); setExecResult(null); setShowTerminal(false); setViewMode("code");
    startTimeRef.current = Date.now();
    elapsedTimerRef.current = setInterval(() => setElapsedMs(Date.now() - startTimeRef.current), 100);
    const toastId = toast.loading(`Converting ${sourceLang} → ${targetLang}…`);
    try {
      const data = await submitConversion(sourceLang, targetLang, inputCode);
      if (data.status === "done" && data.output_code) {
        clearInterval(elapsedTimerRef.current);
        setOutputCode(data.output_code); setIsLoading(false); setJobStatus("done");
        toast.success("Converted instantly ⚡ (cache hit)", { id: toastId }); return;
      }
      setJobStatus(data.status); startPolling(data.job_id, toastId);
    } catch (err) {
      clearInterval(elapsedTimerRef.current); setIsLoading(false); setJobStatus("failed");
      toast.error(err.message || "Failed to submit.", { id: toastId });
    }
  }

  async function handleRun() {
    if (!outputCode.trim()) { toast.error("No converted code to run."); return; }
    setIsRunning(true); setExecResult(null); setShowTerminal(true);
    try {
      const result = await executeCode(outputCode, targetLang);
      setExecResult(result);
      if (result.status === "Accepted") toast.success("Executed successfully ✓");
      else toast.error(`Execution: ${result.status}`);
    } catch (err) {
      toast.error(err.message || "Execution failed.");
      setExecResult({ status: "Error", status_id: -1, stderr: err.message });
    } finally { setIsRunning(false); }
  }

  const hasOutput = Boolean(outputCode);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col" style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
      <Toaster position="top-right" toastOptions={{ style: { background: "#1e1e2e", color: "#cdd6f4", border: "1px solid #313244" }, success: { iconTheme: { primary: "#a6e3a1", secondary: "#1e1e2e" } }, error: { iconTheme: { primary: "#f38ba8", secondary: "#1e1e2e" } } }} />

      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
            <Code2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest text-white uppercase">DevTranspiler</h1>
            <p className="text-[10px] text-slate-500 tracking-wider">AI-powered code conversion</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {backendReady === null && <><span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /><span className="text-xs text-slate-400">Connecting…</span></>}
          {backendReady === true  && <><span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" /><span className="text-xs text-slate-400">API Ready</span></>}
          {backendReady === false && <><span className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-red-400">Backend offline</span></>}
        </div>
      </header>

      {/* Toolbar */}
      <div className="border-b border-white/5 px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 uppercase tracking-widest">From</span>
          <select value={sourceLang} onChange={e => setSourceLang(e.target.value)} disabled={isLoading} className="bg-[#13131a] text-white text-sm px-3 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:border-violet-500/50 cursor-pointer disabled:opacity-50">
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <button onClick={handleSwapLangs} disabled={isLoading} className="p-1.5 rounded-lg border border-white/10 hover:border-violet-500/50 hover:bg-violet-500/10 text-slate-400 hover:text-violet-300 transition-all disabled:opacity-40 cursor-pointer">
          <ArrowRightLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 uppercase tracking-widest">To</span>
          <select value={targetLang} onChange={e => setTargetLang(e.target.value)} disabled={isLoading} className="bg-[#13131a] text-white text-sm px-3 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:border-cyan-500/50 cursor-pointer disabled:opacity-50">
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {/* View mode toggle — only when output exists */}
        {hasOutput && (
          <div className="flex items-center rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => setViewMode("code")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all ${viewMode === "code" ? "bg-violet-500/20 text-violet-300" : "text-slate-500 hover:text-slate-300"}`}
            >
              <FileCode className="w-3.5 h-3.5" /> Code
            </button>
            <button
              onClick={() => setViewMode("diff")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all border-l border-white/10 ${viewMode === "diff" ? "bg-violet-500/20 text-violet-300" : "text-slate-500 hover:text-slate-300"}`}
            >
              <GitCompare className="w-3.5 h-3.5" /> Diff
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleReset} disabled={isLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all disabled:opacity-40 cursor-pointer">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          {hasOutput && (
            <button onClick={handleRun} disabled={isRunning || isLoading} className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 transition-all disabled:opacity-40 cursor-pointer">
              {isRunning ? <><Loader2 className="w-4 h-4 animate-spin" />Running…</> : <><Play className="w-4 h-4" />Run</>}
            </button>
          )}
          <button onClick={handleConvert} disabled={!backendReady || isLoading} className="flex items-center gap-2 px-5 py-1.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white transition-all disabled:opacity-40 shadow-lg shadow-violet-900/30 cursor-pointer active:scale-95">
            {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Converting…</> : <><Zap className="w-4 h-4" />Convert</>}
          </button>
        </div>
      </div>

      {warning && (
        <div className="mx-6 mt-3 flex items-start gap-2 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{warning}</span>
        </div>
      )}

      {/* Editors */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-white/5">

        {/* Input panel */}
        <div className="flex flex-col border-b lg:border-b-0 border-white/5">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-[#0d0d14]">
            <div className="flex items-center gap-2">
              <Code2 className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-400 uppercase tracking-widest">Input</span>
              <LangBadge lang={sourceLang} />
            </div>
            <span className="text-xs text-slate-600">{inputCode.length} chars</span>
          </div>
          <CodeMirror value={inputCode} height="calc(100vh - 220px)" extensions={[getLangExtension(sourceLang)]} theme={dracula} onChange={v => setInputCode(v)} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }} />
        </div>

        {/* Output panel */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-[#0d0d14]">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-400 uppercase tracking-widest">
                {viewMode === "diff" ? "Diff" : "Output"}
              </span>
              <LangBadge lang={targetLang} />
            </div>
            <CopyButton text={outputCode} disabled={!outputCode} onSuccess={() => toast.success("Copied!")} className="bg-white/5 hover:bg-white/10 text-slate-300 text-xs border border-white/10" />
          </div>

          <div className="flex-1 relative flex flex-col">
            {/* Empty state */}
            {!hasOutput && !isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-600 pointer-events-none select-none">
                <Code2 className="w-10 h-10 opacity-20" />
                <p className="text-xs tracking-wider uppercase">Converted code will appear here</p>
              </div>
            )}

            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0a0a0f]/80 backdrop-blur-sm z-10">
                <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
                <p className="text-xs text-slate-400 tracking-wider">
                  {{ queued: "Queued — waiting for worker…", processing: "Worker is translating…" }[jobStatus] ?? "Processing…"}
                </p>
                {elapsedMs > 0 && <p className="text-xs text-slate-600 flex items-center gap-1"><Clock className="w-3 h-3" />{(elapsedMs / 1000).toFixed(1)}s</p>}
              </div>
            )}

            {/* Code view */}
            {viewMode === "code" && (
              <div className="flex-1">
                <CodeMirror value={outputCode} height={showTerminal ? "calc(100vh - 420px)" : "calc(100vh - 220px)"} extensions={[getLangExtension(targetLang)]} theme={dracula} editable={false} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false }} />
              </div>
            )}

            {/* Diff view */}
            {viewMode === "diff" && hasOutput && (
              <div className="flex-1 bg-[#0d0d14] overflow-auto">
                <DiffView oldCode={inputCode} newCode={outputCode} sourceLang={sourceLang} targetLang={targetLang} />
              </div>
            )}

            {/* Terminal */}
            {showTerminal && (
              <TerminalPanel result={execResult} isRunning={isRunning} onClose={() => { setShowTerminal(false); setExecResult(null); }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}