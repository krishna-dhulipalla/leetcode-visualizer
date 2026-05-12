# LeetCode Solution Visualizer

A local React app for replaying Python LeetCode solutions step by step. The app runs the submitted solution through a small Python trace runner and records locals after executed lines, then visualizes arrays, linked lists, trees, maps, sets, scalars, and return values.

## Run

```powershell
npm install
npm run dev
```

The app is served at `http://localhost:5173`.

`npm run dev` builds the React frontend and starts the local trace API. Use `npm run build` after frontend edits, then `npm run start` to serve the existing build.

## Current Scope

- Python `class Solution` methods and top-level functions.
- Standard LeetCode-style inputs as either named lines:

```text
piles = [3,6,7,11]
h = 8
```

- Or raw positional lines:

```text
[3,6,7,11]
8
```

- Basic LeetCode harness conversion for `ListNode`, `TreeNode`, and linked-list cycle `pos`.
- A deterministic trace engine without LLM-based explanation or algorithm detection.

## Not Yet Covered

- Design-problem operation arrays such as `["MinStack","push","getMin"]`.
- Interactive helper APIs such as `guess`, `isBadVersion`, `Robot`, or `Master`.
- Automatic LeetCode problem fetching.
