# LeetCode Visualizer — Review & Suggestions

## Architecture Overview

Your app has a clean two-part architecture:
- **Frontend**: React (Vite-built) — code editor, playback controls, variable visualization
- **Backend**: Express server + Python trace runner — executes user code via `sys.settrace()` and returns snapshots

The Python tracer is well-engineered: sandboxed builtins, allowed-import whitelist, step limit (800), 4s timeout, `ListNode`/`TreeNode` harness support. Solid work.

---

## 🐛 Bugs Found

### 1. Operator precedence bug in `convert_arg()` (Python)
```python
# server/python_trace_runner.py, line 122-123
if "ListNode" in hint or param_name in {"head", "list"} and isinstance(value, list):
    return build_linked_list(value, named.get("pos"))
if "TreeNode" in hint or param_name in {"root", "tree"} and isinstance(value, list):
    return build_tree(value)
```
`and` binds tighter than `or`, so this reads as:
```python
if "ListNode" in hint or (param_name in {"head", "list"} and isinstance(value, list)):
```
If the annotation contains "ListNode", the `isinstance(value, list)` check is skipped — which may be fine. But if the intent was `(name match OR annotation match) AND is a list`, it's wrong. Should be:
```python
if ("ListNode" in hint or param_name in {"head", "list"}) and isinstance(value, list):
```

### 2. `valueLabel()` returns `"undefined"` for falsy values
```jsx
// src/App.jsx, line 80
if (!value) return "undefined";
```
This catches `0`, `false`, `""`, and `null` — all legitimate Python values. A value of `0` would show as `"undefined"` instead of `"0"`. Should be:
```jsx
if (value === undefined || value === null) return "undefined";
```

### 3. No `vite.config.js` — `@vitejs/plugin-react` is never loaded
You have `@vitejs/plugin-react` in dependencies but no `vite.config.js`. Vite won't process JSX correctly in production builds without it. This may work in dev because of Vite's default esbuild JSX handling, but it's fragile and may fail on edge cases (e.g., files without `.jsx` extension).

### 4. `dist/` folder in `.gitignore` but committed
The `.gitignore` has `dist/` but the `dist/` folder is in the repo. This causes confusion — built assets have hardcoded hashes (`index-C2L_vXB8.js`) that become stale after rebuilds.

### 5. Missing `meta` description
```html
<!-- index.html — no meta description for SEO -->
<title>LeetCode Solution Visualizer</title>
```

### 6. Code editor line gutter doesn't scroll in sync
The `line-gutter` and `textarea` are in a CSS grid but have no scroll-sync logic. If the code is long enough to scroll, the gutter numbers will drift out of alignment with the textarea lines.

---

## 💡 Suggestions

### High-Impact Features
| Feature | Why It Matters |
|---|---|
| **Syntax highlighting** | A plain textarea is functional but learners benefit hugely from colored keywords. Consider [CodeMirror 6](https://codemirror.net/) or even a lightweight regex-based highlighter. |
| **Pointer/index visualization** | For two-pointer, sliding window, and binary search problems, showing `left`, `right`, `mid` as arrows over the array would be transformative. |
| **Tree visualization** | Trees are serialized but rendered as flat arrays. A simple canvas/SVG tree layout would make tree problems much more intuitive. |
| **Shareable URLs** | Encode code + testcase in a URL hash or short-link so learners can share specific problems with friends or on Discord. |
| **Problem presets** | A dropdown with 10-15 classic problems (Two Sum, Valid Parentheses, Merge Intervals, etc.) pre-loaded would reduce friction for new users. |

### Quality-of-Life
- **Keyboard shortcuts**: `Ctrl+Enter` to run trace, arrow keys to step
- **Dark/light mode toggle**: You already have a solid dark theme; offer a light alternative
- **Diff view for changed values**: Beyond the amber highlight, show `old → new` for scalar changes
- **Export trace as JSON**: Let users download or copy the trace for debugging offline
- **Error location highlighting**: When the Python runner returns an error, highlight the offending line in the editor

### Code Quality
- **Split `App.jsx`** (~626 lines) into separate component files: `CodeEditor.jsx`, `Playback.jsx`, `Visualization.jsx`, `TraceLog.jsx`
- **Add a `vite.config.js`** to properly configure the React plugin
- **Move `express` to `devDependencies`** if you intend to deploy the frontend statically (see GitHub Pages section below)

---

## 🌐 GitHub Pages vs Vercel

### The Core Problem

Your app **cannot run on GitHub Pages as-is** because it has a **server-side component**:

```
Frontend (React) ──fetch("/api/trace")──► Express server ──spawn──► python_trace_runner.py
```

GitHub Pages is **static-only** — it serves HTML/CSS/JS files. It cannot run Node.js or Python.

### Option A: Keep the Backend, Use a Different Host

| Host | Free Tier | Python Support | Effort |
|---|---|---|---|
| **Vercel** | Yes | Via Serverless Functions (needs rewrite) | Medium |
| **Render** | Yes (750h/mo) | Full container, can run Express + Python | Low |
| **Railway** | $5 credit/mo | Full container | Low |
| **Fly.io** | Free tier | Full container, Dockerfile | Medium |

**Render or Railway** are the easiest — deploy your Express server + Python runner as a single container with zero code changes.

### Option B: Move Python Execution to the Browser (GitHub Pages Compatible)

This is the bigger architectural shift, but it would make the app **fully static**:

1. **[Pyodide](https://pyodide.org/)** — A full CPython compiled to WebAssembly. You'd load Pyodide in the browser, run the trace runner entirely client-side, and eliminate the server.
   - Pros: No backend needed, GitHub Pages works, scales infinitely, zero hosting cost
   - Cons: ~15MB initial download for Pyodide, cold start latency, `sys.settrace()` works but has [quirks in Pyodide](https://pyodide.org/en/stable/usage/faq.html)
   - Effort: **Medium** — your `python_trace_runner.py` would need minor adaptations but the core logic stays the same

2. **[Skulpt](https://skulpt.org/)** — A lighter Python-in-JS interpreter
   - Pros: Much smaller payload (~500KB)
   - Cons: Incomplete Python stdlib, no `sys.settrace()`, would need a completely different trace approach

**My recommendation**: If you want GitHub Pages, go with **Pyodide**. Your tracer already uses standard CPython APIs, so the port would be straightforward. The flow becomes:

```
Browser loads Pyodide (WASM) → Runs python_trace_runner.py in-browser → No server needed
```

### Option C: Hybrid — Static Frontend on GitHub Pages + API Elsewhere

Deploy the Vite build to GitHub Pages, but point `fetch("/api/trace")` to a separate backend on Render/Railway. You'd need to set the API URL via an environment variable at build time.

---

## Summary

> [!IMPORTANT]
> The project is well-structured and the trace engine is genuinely impressive. The main bugs are the operator precedence issue in `convert_arg()` and the falsy-value display bug in `valueLabel()`. For GitHub Pages, the **Pyodide path** is the cleanest solution — it removes all hosting dependencies and makes the app fully self-contained.
