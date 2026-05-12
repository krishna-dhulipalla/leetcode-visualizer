# LeetCode Solution Visualizer

LeetCode Solution Visualizer helps programmers understand how their Python solutions change state while they run. Instead of reading a long raw trace or mentally simulating every line, users can replay the execution and inspect the variables, arrays, maps, sets, and return values at each meaningful snapshot.

The goal is to make debugging and learning easier for LeetCode-style problems. The app focuses on what changed in memory, so users can see how their data structures evolve across loops, conditions, stack operations, pointer movement, and final returns.

## What It Does

- Runs a Python `Solution` method or top-level function against a LeetCode-style testcase.
- Captures execution snapshots from a deterministic Python trace runner.
- Visualizes arrays, linked lists, trees, maps, sets, scalars, and return values.
- Provides multiple trace modes:
  - `Updates`: focuses on snapshots where variables or data structures changed.
  - `Flow`: includes updates plus branch, loop, and return context.
  - `Raw`: shows the full executed-line trace.
- Lets users replay, step through, scrub, and inspect the solution state without relying on LLM-generated explanations.

## Development

```powershell
npm install
npm run dev
```

`npm run dev` builds the React frontend and starts the trace API. Use `npm run build` after frontend edits, then `npm run start` to serve the existing build.

## Supported Inputs

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
