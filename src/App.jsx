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
    <div className="min-h-screen bg-gradient-to-br from-pink-100 via-yellow-100 to-mint-100 flex flex-col items-center justify-center p-6 gap-10 relative overflow-hidden font-['Fredoka']">
  {/* Title */}
  <h1 className="text-5xl sm:text-7xl font-extrabold text-center text-pink-600 drop-shadow-[2px_2px_0px_#fff]">
    AI Code Converter
  </h1>

  {/* Controls */}
  <div className="flex flex-col sm:flex-row gap-4 justify-center items-center relative z-10">
    <select
      value={targetLang}
      onChange={(e) => setTargetLang(e.target.value)}
      className="bg-pastel-mint border-2 border-pink-200 text-pink-700 font-semibold px-4 py-2 rounded-xl shadow-[2px_2px_0px_#4444] cursor-pointer"
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
      className="px-6 py-3 bg-gradient-to-r from-pink-300 to-lavender-300 hover:opacity-80 text-purple-800 font-bold rounded-2xl transition-all flex items-center gap-2 shadow-[2px_2px_0px_#333] disabled:opacity-50"
    >
      {isLoading ? "Converting..." : "Convert"}
    </button>

    <button
      onClick={handleReset}
      disabled={isLoading}
      className="px-6 py-3 bg-gradient-to-r from-mint-200 to-sky-200 hover:opacity-80 text-teal-700 font-bold rounded-2xl transition-all flex items-center gap-2 shadow-[2px_2px_0px_#333]"
    >
      Reset
    </button>
  </div>

  {/* Panels */}
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-6xl relative z-10">
    {/* Input */}
    <div className="bg-pastel-blue border-2 border-pink-300 rounded-2xl shadow-[4px_4px_0px_#333] overflow-hidden">
      <div className="bg-pink-200 px-4 py-2 border-b-2 border-pink-400 flex items-center gap-2">
        <span className="text-purple-800 font-bold">Input Code</span>
      </div>
      <CodeMirror
        value={inputCode}
        height="420px"
        extensions={[javascript({ jsx: true })]}
        theme={dracula}
        onChange={(value) => setInputCode(value)}
      />
    </div>

    {/* Output */}
    <div className="bg-pastel-yellow border-2 border-purple-300 rounded-2xl shadow-[4px_4px_0px_#333] overflow-hidden flex flex-col">
      <div className="bg-purple-200 px-4 py-2 border-b-2 border-purple-400 flex items-center justify-between">
        <span className="text-pink-800 font-bold">Converted Code ({targetLang})</span>
        <button
          onClick={handleCopy}
          disabled={!outputCode}
          className="px-3 py-1 bg-pink-300 hover:bg-pink-400 text-purple-900 text-sm rounded-lg shadow-[2px_2px_0px_#333] disabled:opacity-50"
        >
          Copy
        </button>
      </div>
      <CodeMirror
        value={outputCode}
        height="420px"
        extensions={[javascript({ jsx: true })]}
        theme={dracula}
        editable={false}
      />
    </div>
  </div>

  {/* Feedback */}
  {feedback && (
    <p
      className={`text-center font-bold drop-shadow-[1px_1px_0px_#fff] ${
        feedback.includes("✅") || feedback.includes("📄")
          ? "text-green-600"
          : "text-red-500"
      }`}
    >
      {feedback}
    </p>
  )}

  {!aiReady && (
    <p className="text-sm text-purple-700 bg-pink-100 px-4 py-2 rounded-xl border-2 border-purple-300 shadow-[2px_2px_0px_#333]">
      Initializing AI... please wait
    </p>
  )}
</div>

  );
}

export default App;