import React, { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_CODE = `from typing import List

class Solution:
    def minEatingSpeed(self, piles: List[int], h: int) -> int:
        left, right = 1, max(piles)
        ans = right

        while left <= right:
            mid = (left + right) // 2
            totalTime = 0
            for pile in piles:
                totalTime += (pile + mid - 1) // mid
            if totalTime <= h:
                ans = mid
                right = mid - 1
            else:
                left = mid + 1

        return ans
`;

const DEFAULT_TESTCASE = `piles = [3,6,7,11]
h = 8`;

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h4v14H7zm6 0h4v14h-4z" />
    </svg>
  );
}

function StepBackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 6h2v12H7zm12 0v12l-9-6z" />
    </svg>
  );
}

function StepForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 6h2v12h-2zM5 6v12l9-6z" />
    </svg>
  );
}

function RunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6.8v10.4L17 12z" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.1 7.1A7 7 0 1 1 5 12H3a9 9 0 1 0 2.64-6.36L3 3v7h7z" />
    </svg>
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function valueLabel(value) {
  if (!value) return "undefined";
  if (value.label !== undefined) return value.label;
  if (value.type === "array" || value.type === "tuple") {
    return `[${value.value.map(valueLabel).join(", ")}]`;
  }
  if (value.type === "map") {
    return `{${value.value.map((entry) => `${valueLabel(entry.key)}: ${valueLabel(entry.value)}`).join(", ")}}`;
  }
  return String(value.value ?? "undefined");
}

function stableValue(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const TRACE_MODES = {
  updates: "updates",
  flow: "flow",
  raw: "raw"
};

const TRACE_MODE_OPTIONS = [
  { value: TRACE_MODES.updates, label: "Updates" },
  { value: TRACE_MODES.flow, label: "Flow" },
  { value: TRACE_MODES.raw, label: "Raw" }
];

function isFlowLine(lineText = "") {
  return /^(if|elif|else|for|while|return|break|continue)\b/.test(lineText.trim());
}

function annotateTraceFrame(frame, index, frames) {
  const previousFrame = frames[index - 1];
  const changed = index === 0 ? [] : [...changedNames(frame.locals, previousFrame?.locals)];
  const changeSource = previousFrame && changed.length ? previousFrame : null;

  return {
    ...frame,
    rawIndex: index,
    changed,
    displayLine: changeSource?.line ?? frame.line,
    displayLineText: changeSource?.lineText ?? frame.lineText,
    displayMode: index === 0 ? "initial" : changeSource ? "update" : frame.event === "return" ? "return" : "line"
  };
}

function buildTraceFrames(frames, mode) {
  const annotated = frames.map((frame, index) => annotateTraceFrame(frame, index, frames));
  if (mode === TRACE_MODES.raw) return annotated;

  const filtered = annotated.filter((frame, index) => {
    if (index === 0 || frame.event === "return") return true;
    if (frame.changed.length > 0) return true;
    return mode === TRACE_MODES.flow && isFlowLine(frame.lineText);
  });

  return filtered.length ? filtered : annotated;
}

function useTracePlayback(frames) {
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    setStep(0);
    setIsPlaying(false);
  }, [frames]);

  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return undefined;

    const interval = window.setInterval(() => {
      setStep((current) => {
        if (current >= frames.length - 1) {
          window.clearInterval(interval);
          setIsPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 650 / speed);

    return () => window.clearInterval(interval);
  }, [frames.length, isPlaying, speed]);

  return {
    step,
    setStep: (next) => setStep(clamp(next, 0, Math.max(frames.length - 1, 0))),
    isPlaying,
    setIsPlaying,
    speed,
    setSpeed
  };
}

function categorizeVariables(locals = {}) {
  const groups = {
    arrays: [],
    maps: [],
    sets: [],
    scalars: [],
    objects: []
  };

  Object.entries(locals).forEach(([name, value]) => {
    if (["array", "tuple", "linked-list", "tree"].includes(value.type)) {
      groups.arrays.push({ name, value });
    } else if (value.type === "map") {
      groups.maps.push({ name, value });
    } else if (value.type === "set") {
      groups.sets.push({ name, value });
    } else if (["scalar", "none"].includes(value.type)) {
      groups.scalars.push({ name, value });
    } else {
      groups.objects.push({ name, value });
    }
  });

  return groups;
}

function changedNames(current, previous) {
  const changed = new Set();
  const names = new Set([...Object.keys(current || {}), ...Object.keys(previous || {})]);
  names.forEach((name) => {
    if (stableValue(current?.[name]) !== stableValue(previous?.[name])) {
      changed.add(name);
    }
  });
  return changed;
}

function CodeEditor({ code, setCode, currentLine }) {
  const lineCount = Math.max(code.split("\n").length, 18);
  const lines = Array.from({ length: lineCount }, (_, index) => index + 1);

  return (
    <section className="panel code-panel">
      <div className="panel-header">
        <span>Code</span>
        <span className="file-status">solution.py <span /></span>
      </div>
      <div className="editor-shell">
        <div className="line-gutter" aria-hidden="true">
          {lines.map((line) => (
            <div key={line} className={line === currentLine ? "active-line" : ""}>
              {line}
            </div>
          ))}
        </div>
        <textarea
          spellCheck="false"
          wrap="off"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-label="Python solution code"
        />
      </div>
    </section>
  );
}

function TextInputPanel({ title, value, setValue, footer, minLines = 5 }) {
  return (
    <section className="panel input-panel">
      <div className="panel-header">
        <span>{title}</span>
        {footer}
      </div>
      <textarea
        className="input-textarea"
        spellCheck="false"
        rows={minLines}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </section>
  );
}

function ArrayValue({ variable, changed }) {
  const items = variable.value.value || [];
  const cycleTo = variable.value.cycleTo;

  return (
    <div className={`array-block ${changed ? "changed" : ""}`}>
      <div className="variable-title">
        <span>{variable.name}</span>
        <small>{variable.value.type === "linked-list" ? "linked list" : `${items.length} items`}</small>
      </div>
      <div className="array-cells">
        {items.length === 0 ? (
          <span className="empty-state">(empty)</span>
        ) : (
          items.map((item, index) => (
            <div className="array-cell-wrap" key={`${variable.name}-${index}`}>
              <div className="array-cell">{valueLabel(item)}</div>
              <div className="array-index">[{index}]</div>
            </div>
          ))
        )}
      </div>
      {cycleTo !== null && cycleTo !== undefined && <div className="cycle-note">cycle points to index {cycleTo}</div>}
    </div>
  );
}

function ScalarsPanel({ variables, changed }) {
  return (
    <div className="value-list">
      {variables.length === 0 ? (
        <span className="empty-state">(empty)</span>
      ) : (
        variables.map(({ name, value }) => (
          <div className={`value-row ${changed.has(name) ? "changed" : ""}`} key={name}>
            <span>{name}</span>
            <strong>{valueLabel(value)}</strong>
          </div>
        ))
      )}
    </div>
  );
}

function MapPanel({ variables, changed }) {
  if (!variables.length) return <span className="empty-state">(empty)</span>;

  return (
    <div className="map-stack">
      {variables.map(({ name, value }) => (
        <div className={`map-block ${changed.has(name) ? "changed" : ""}`} key={name}>
          <div className="variable-title">
            <span>{name}</span>
            <small>{value.value.length} entries</small>
          </div>
          {value.value.length === 0 ? (
            <span className="empty-state">(empty)</span>
          ) : (
            value.value.map((entry, index) => (
              <div className="map-entry" key={`${name}-${index}`}>
                <span>{valueLabel(entry.key)}</span>
                <strong>{valueLabel(entry.value)}</strong>
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

function Visualization({ frame, previousFrame, sourceLines }) {
  const groups = useMemo(() => categorizeVariables(frame?.locals), [frame]);
  const changed = useMemo(() => changedNames(frame?.locals, previousFrame?.locals), [frame, previousFrame]);
  const lineText = frame?.displayLineText || frame?.lineText || "";
  const lineNumber = frame?.displayLine ?? frame?.line;
  const stateLabel =
    frame?.displayMode === "initial"
      ? "Initial state at line"
      : frame?.displayMode === "update"
        ? "State after line"
        : frame?.event === "return"
          ? "Returned at line"
          : "Executing line";

  return (
    <div className="visual-grid">
      <div className="execution-strip">
        <span>{stateLabel} {lineNumber ?? "-"}</span>
        <code>{lineText.trim() || sourceLines?.[lineNumber - 1] || "Waiting for trace"}</code>
        <em>{frame?.changed?.length ? `Changed ${frame.changed.join(", ")}` : "Current State"}</em>
      </div>

      <section className="panel data-panel arrays-panel">
        <div className="panel-header">
          <span>Arrays / Lists</span>
        </div>
        <div className="panel-body">
          {groups.arrays.length === 0 ? (
            <span className="empty-state">(empty)</span>
          ) : (
            groups.arrays.map((variable) => (
              <ArrayValue key={variable.name} variable={variable} changed={changed.has(variable.name)} />
            ))
          )}
        </div>
      </section>

      <section className="panel data-panel">
        <div className="panel-header">
          <span>Scalars</span>
        </div>
        <div className="panel-body">
          <ScalarsPanel variables={[...groups.scalars, ...groups.objects]} changed={changed} />
        </div>
      </section>

      <section className="panel data-panel">
        <div className="panel-header">
          <span>Maps / Dicts</span>
        </div>
        <div className="panel-body">
          <MapPanel variables={groups.maps} changed={changed} />
        </div>
      </section>

      <section className="panel data-panel">
        <div className="panel-header">
          <span>Sets</span>
        </div>
        <div className="panel-body">
          <ScalarsPanel variables={groups.sets.map((item) => ({ ...item, value: { ...item.value, label: valueLabel(item.value) } }))} changed={changed} />
        </div>
      </section>
    </div>
  );
}

function Playback({ frames, rawCount, playback, traceMode, setTraceMode }) {
  const { step, setStep, isPlaying, setIsPlaying, speed, setSpeed } = playback;
  const max = Math.max(frames.length - 1, 0);

  return (
    <div className="playback">
      <button className="icon-button" type="button" onClick={() => setStep(step - 1)} disabled={!frames.length || step === 0} title="Previous step">
        <StepBackIcon />
      </button>
      <button className="play-button" type="button" onClick={() => setIsPlaying(!isPlaying)} disabled={!frames.length} title={isPlaying ? "Pause" : "Play"}>
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button className="icon-button" type="button" onClick={() => setStep(step + 1)} disabled={!frames.length || step === max} title="Next step">
        <StepForwardIcon />
      </button>

      <div className="speed-group" aria-label="Playback speed">
        {[0.5, 1, 2].map((option) => (
          <button key={option} className={speed === option ? "selected" : ""} type="button" onClick={() => setSpeed(option)}>
            {option}x
          </button>
        ))}
      </div>

      <div className="mode-group" aria-label="Trace mode">
        {TRACE_MODE_OPTIONS.map((option) => (
          <button key={option.value} className={traceMode === option.value ? "selected" : ""} type="button" onClick={() => setTraceMode(option.value)}>
            {option.label}
          </button>
        ))}
      </div>

      <div className="step-count">
        Snapshot {frames.length ? step + 1 : 0} / {frames.length}
        {rawCount && rawCount !== frames.length ? <small>{rawCount} raw</small> : null}
      </div>

      <input
        className="timeline"
        type="range"
        min="0"
        max={max}
        value={step}
        disabled={!frames.length}
        onChange={(event) => setStep(Number(event.target.value))}
        aria-label="Trace step"
      />
    </div>
  );
}

function TraceLog({ frames, currentRawStep, selectRawStep, isOpen, setIsOpen }) {
  return (
    <section className={`panel trace-log ${isOpen ? "expanded" : ""}`}>
      <button className="trace-log-toggle" type="button" onClick={() => setIsOpen((open) => !open)}>
        <span>Raw Trace / Event Log</span>
        <strong>{isOpen ? "Hide" : "Show"} {frames.length} snapshots</strong>
      </button>
      {isOpen ? <div className="log-list">
        {frames.length === 0 ? (
          <div className="empty-log">Run the trace to see each executed line.</div>
        ) : (
          frames.map((frame, index) => (
            <button
              type="button"
              className={`log-row ${index === currentRawStep ? "selected" : ""}`}
              key={`${frame.line}-${index}`}
              onClick={() => selectRawStep(index)}
            >
              <span className="log-index">{index + 1}</span>
              <span className="log-message">
                {frame.event === "return" ? "Return value" : frame.lineText.trim() || `Line ${frame.line}`}
              </span>
              <code>{frame.event === "return" ? valueLabel(frame.returnValue) : `line ${frame.line}`}</code>
            </button>
          ))
        )}
      </div> : null}
    </section>
  );
}

function ResultBar({ trace, error, expectedOutput }) {
  if (error) {
    return <div className="status-bar error">Trace failed: {error}</div>;
  }

  if (!trace?.ok) {
    return <div className="status-bar idle">Ready. Paste a Python LeetCode solution and testcase, then run trace.</div>;
  }

  const result = valueLabel(trace.result);
  const expected = expectedOutput.trim();
  const matches = expected && expected === result;

  return (
    <div className={`status-bar ${matches ? "success" : "ready"}`}>
      <span>{trace.callName}({trace.params.join(", ")})</span>
      <span>Result: <strong>{result}</strong></span>
      {expected ? <span>{matches ? "Matches expected output" : `Expected ${expected}`}</span> : null}
    </div>
  );
}

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [testcase, setTestcase] = useState(DEFAULT_TESTCASE);
  const [expectedOutput, setExpectedOutput] = useState("4");
  const [trace, setTrace] = useState(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isRawLogOpen, setIsRawLogOpen] = useState(false);
  const [traceMode, setTraceMode] = useState(TRACE_MODES.updates);
  const rawFrames = trace?.frames || [];
  const visibleFrames = useMemo(() => buildTraceFrames(rawFrames, traceMode), [rawFrames, traceMode]);
  const playback = useTracePlayback(visibleFrames);
  const currentFrame = visibleFrames[playback.step];
  const previousFrame = visibleFrames[playback.step - 1];
  const abortRef = useRef(null);

  function selectRawStep(rawIndex) {
    const visibleIndex = visibleFrames.findIndex((frame) => frame.rawIndex >= rawIndex);
    playback.setStep(visibleIndex >= 0 ? visibleIndex : visibleFrames.length - 1);
  }

  async function runTrace() {
    setIsRunning(true);
    setError("");
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const response = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, testcase }),
        signal: abortRef.current.signal
      });
      const payload = await response.json();
      if (!payload.ok) {
        setTrace(null);
        setError(payload.error || "Trace failed.");
        return;
      }
      setTrace(payload);
      setIsRawLogOpen(false);
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setTrace(null);
        setError(requestError.message);
      }
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">C</span>
          <strong>LeetCode Solution Visualizer</strong>
        </div>
        <label className="language-select">
          <span>Language:</span>
          <select defaultValue="python">
            <option value="python">Python</option>
          </select>
        </label>
        <button className="primary-button" type="button" onClick={runTrace} disabled={isRunning}>
          <RunIcon />
          {isRunning ? "Tracing..." : "Run Trace"}
        </button>
        <button className="secondary-button" type="button" onClick={() => setTrace(null)}>
          <ResetIcon />
          Reset
        </button>
      </header>

      <div className="workspace">
        <div className="left-column">
          <CodeEditor code={code} setCode={setCode} currentLine={currentFrame?.displayLine ?? currentFrame?.line} />
          <TextInputPanel
            title="Testcase Input"
            value={testcase}
            setValue={setTestcase}
            footer={<span className="tab-label">Raw</span>}
            minLines={6}
          />
          <TextInputPanel
            title="Expected Output"
            value={expectedOutput}
            setValue={setExpectedOutput}
            footer={<span className="optional-label">Optional</span>}
            minLines={2}
          />
        </div>

        <section className="panel right-column">
          <div className="panel-header">
            <span>Trace / Visualization</span>
            <button className="raw-log-shortcut" type="button" onClick={() => setIsRawLogOpen((open) => !open)} disabled={!rawFrames.length}>
              {isRawLogOpen ? "Hide raw log" : `${rawFrames.length} raw snapshots`}
            </button>
          </div>
          <Playback frames={visibleFrames} rawCount={rawFrames.length} playback={playback} traceMode={traceMode} setTraceMode={setTraceMode} />
          <Visualization frame={currentFrame} previousFrame={previousFrame} sourceLines={trace?.sourceLines} />
          <TraceLog
            frames={rawFrames}
            currentRawStep={currentFrame?.rawIndex ?? 0}
            selectRawStep={selectRawStep}
            isOpen={isRawLogOpen}
            setIsOpen={setIsRawLogOpen}
          />
        </section>
      </div>

      <ResultBar trace={trace} error={error} expectedOutput={expectedOutput} />
    </main>
  );
}

export default App;
