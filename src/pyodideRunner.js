import runnerSource from "../server/python_trace_runner.py?raw";

const PYODIDE_VERSION = "0.29.4";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_SCRIPT_URL = `${PYODIDE_INDEX_URL}pyodide.js`;

let pyodidePromise;
let scriptPromise;

function loadPyodideScript() {
  if (window.loadPyodide) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PYODIDE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Pyodide runtime from the CDN."));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

async function loadRuntime() {
  if (pyodidePromise) return pyodidePromise;

  pyodidePromise = (async () => {
    await loadPyodideScript();
    const pyodide = await window.loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    pyodide.globals.set("__PYODIDE_RUNNER__", true);
    pyodide.runPython(runnerSource);
    return pyodide;
  })();

  return pyodidePromise;
}

const TRACE_WRAPPER = `
import json

payload = json.loads(__trace_payload_json)
try:
    __trace_result_json = json.dumps(run_trace(payload), allow_nan=False)
except Exception as exc:
    error_line, error_line_text = extract_error_location(exc)
    error_payload = {
        "ok": False,
        "error": str(exc),
        "traceback": traceback.format_exc(limit=8),
    }
    if error_line is not None:
        error_payload["errorLine"] = error_line
        error_payload["errorLineText"] = error_line_text
    __trace_result_json = json.dumps(error_payload, allow_nan=False)
__trace_result_json
`;

export async function runTraceInBrowser(payload) {
  const pyodide = await loadRuntime();
  pyodide.globals.set("__trace_payload_json", JSON.stringify(payload));
  const resultJson = pyodide.runPython(TRACE_WRAPPER);
  return JSON.parse(resultJson);
}

export { PYODIDE_VERSION };
