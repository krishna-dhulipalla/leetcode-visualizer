import React, { useEffect, useMemo, useRef, useState } from "react";
import { runTraceInBrowser } from "./pyodideRunner.js";

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

const DEFAULT_EXPECTED_OUTPUT = "4";

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
  if (value === undefined || value === null) return "undefined";
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

const VISUALIZATION_TYPES = {
  default: "default",
  pointers: "pointers",
  window: "window",
  tree: "tree",
  graph: "graph",
  dp: "dp"
};

const VISUALIZATION_OPTIONS = [
  { value: VISUALIZATION_TYPES.default, label: "Default" },
  { value: VISUALIZATION_TYPES.pointers, label: "Two pointers" },
  { value: VISUALIZATION_TYPES.window, label: "Sliding window" },
  { value: VISUALIZATION_TYPES.tree, label: "Tree" },
  { value: VISUALIZATION_TYPES.graph, label: "Graph" },
  { value: VISUALIZATION_TYPES.dp, label: "DP table" }
];

const PROBLEM_PRESETS = [
  {
    id: "koko",
    title: "875. Koko Eating Bananas",
    visualType: VISUALIZATION_TYPES.default,
    code: DEFAULT_CODE,
    testcase: DEFAULT_TESTCASE,
    expectedOutput: DEFAULT_EXPECTED_OUTPUT
  },
  {
    id: "two-sum-ii",
    title: "167. Two Sum II",
    visualType: VISUALIZATION_TYPES.pointers,
    code: `class Solution:
    def twoSum(self, numbers, target):
        l, r = 0, len(numbers) - 1
        while l < r:
            total = numbers[l] + numbers[r]
            if total == target:
                return [l + 1, r + 1]
            if total < target:
                l += 1
            else:
                r -= 1
        return []
`,
    testcase: `numbers = [2,7,11,15]
target = 9`,
    expectedOutput: "[1, 2]"
  },
  {
    id: "valid-parentheses",
    title: "20. Valid Parentheses",
    visualType: VISUALIZATION_TYPES.default,
    code: `class Solution:
    def isValid(self, s: str) -> bool:
        pairs = {")": "(", "}": "{", "]": "["}
        stack = []
        for char in s:
            if char in pairs.values():
                stack.append(char)
            elif not stack or stack[-1] != pairs[char]:
                return False
            else:
                stack.pop()
        return not stack
`,
    testcase: `s = "({[]})"`,
    expectedOutput: "true"
  },
  {
    id: "merge-intervals",
    title: "56. Merge Intervals",
    visualType: VISUALIZATION_TYPES.default,
    code: `class Solution:
    def merge(self, intervals):
        intervals.sort()
        merged = []
        for start, end in intervals:
            if not merged or merged[-1][1] < start:
                merged.append([start, end])
            else:
                merged[-1][1] = max(merged[-1][1], end)
        return merged
`,
    testcase: `intervals = [[1,3],[2,6],[8,10],[15,18]]`,
    expectedOutput: "[[1, 6], [8, 10], [15, 18]]"
  },
  {
    id: "binary-search",
    title: "704. Binary Search",
    visualType: VISUALIZATION_TYPES.pointers,
    code: `class Solution:
    def search(self, nums, target):
        l, r = 0, len(nums) - 1
        while l <= r:
            mid = (l + r) // 2
            if nums[mid] == target:
                return mid
            if nums[mid] < target:
                l = mid + 1
            else:
                r = mid - 1
        return -1
`,
    testcase: `nums = [-1,0,3,5,9,12]
target = 9`,
    expectedOutput: "4"
  },
  {
    id: "max-subarray",
    title: "53. Maximum Subarray",
    visualType: VISUALIZATION_TYPES.default,
    code: `class Solution:
    def maxSubArray(self, nums):
        best = nums[0]
        cur = 0
        for num in nums:
            cur = max(num, cur + num)
            best = max(best, cur)
        return best
`,
    testcase: `nums = [-2,1,-3,4,-1,2,1,-5,4]`,
    expectedOutput: "6"
  },
  {
    id: "climbing-stairs",
    title: "70. Climbing Stairs",
    visualType: VISUALIZATION_TYPES.dp,
    code: `class Solution:
    def climbStairs(self, n: int) -> int:
        dp = [[0] for _ in range(n + 1)]
        dp[0][0] = 1
        dp[1][0] = 1
        for i in range(2, n + 1):
            dp[i][0] = dp[i - 1][0] + dp[i - 2][0]
        return dp[n][0]
`,
    testcase: `n = 5`,
    expectedOutput: "8"
  },
  {
    id: "house-robber",
    title: "198. House Robber",
    visualType: VISUALIZATION_TYPES.dp,
    code: `class Solution:
    def rob(self, nums):
        dp = [[0] for _ in range(len(nums) + 1)]
        for i in range(1, len(nums) + 1):
            dp[i][0] = max(dp[i - 1][0], dp[i - 2][0] + nums[i - 1])
        return dp[len(nums)][0]
`,
    testcase: `nums = [2,7,9,3,1]`,
    expectedOutput: "12"
  },
  {
    id: "longest-substring",
    title: "3. Longest Substring",
    visualType: VISUALIZATION_TYPES.window,
    code: `class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        seen = set()
        left = 0
        best = 0
        for right, char in enumerate(s):
            while char in seen:
                seen.remove(s[left])
                left += 1
            seen.add(char)
            best = max(best, right - left + 1)
        return best
`,
    testcase: `s = "abcabcbb"`,
    expectedOutput: "3"
  },
  {
    id: "diameter-tree",
    title: "543. Diameter of Binary Tree",
    visualType: VISUALIZATION_TYPES.tree,
    code: `class Solution:
    def diameterOfBinaryTree(self, root: Optional[TreeNode]) -> int:
        ans = 0

        def dfs(node):
            nonlocal ans
            if not node:
                return 0
            left = dfs(node.left)
            right = dfs(node.right)
            ans = max(ans, left + right)
            return 1 + max(left, right)

        dfs(root)
        return ans
`,
    testcase: `root = [1,null,2,3,4,5]`,
    expectedOutput: "3"
  },
  {
    id: "linked-list-cycle",
    title: "141. Linked List Cycle",
    visualType: VISUALIZATION_TYPES.pointers,
    code: `class Solution:
    def hasCycle(self, head: Optional[ListNode]) -> bool:
        slow = head
        fast = head
        while fast and fast.next:
            slow = slow.next
            fast = fast.next.next
            if slow is fast:
                return True
        return False
`,
    testcase: `head = [3,2,0,-4]
pos = 1`,
    expectedOutput: "true"
  },
  {
    id: "number-islands",
    title: "200. Number of Islands",
    visualType: VISUALIZATION_TYPES.graph,
    code: `class Solution:
    def numIslands(self, grid) -> int:
        rows, cols = len(grid), len(grid[0])
        seen = set()
        islands = 0

        def dfs(r, c):
            if r < 0 or c < 0 or r == rows or c == cols:
                return
            if grid[r][c] == "0" or (r, c) in seen:
                return
            seen.add((r, c))
            dfs(r + 1, c)
            dfs(r - 1, c)
            dfs(r, c + 1)
            dfs(r, c - 1)

        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == "1" and (r, c) not in seen:
                    islands += 1
                    dfs(r, c)
        return islands
`,
    testcase: `grid = [["1","1","0"],["0","1","0"],["1","0","1"]]`,
    expectedOutput: "3"
  }
];

const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "False",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "None",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "True",
  "try",
  "while",
  "with",
  "yield"
]);

const PYTHON_TOKEN_PATTERN =
  /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#.*|\b[A-Za-z_][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b)/g;

function isFlowLine(lineText = "") {
  return /^(if|elif|else|for|while|return|break|continue)\b/.test(lineText.trim());
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function highlightPythonLine(line) {
  PYTHON_TOKEN_PATTERN.lastIndex = 0;
  let output = "";
  let cursor = 0;
  let match = PYTHON_TOKEN_PATTERN.exec(line);

  while (match) {
    const token = match[0];
    output += escapeHtml(line.slice(cursor, match.index));

    let className = "";
    if (token.startsWith("#")) {
      className = "syntax-comment";
    } else if (token.startsWith("\"") || token.startsWith("'")) {
      className = "syntax-string";
    } else if (/^\d/.test(token)) {
      className = "syntax-number";
    } else if (PYTHON_KEYWORDS.has(token)) {
      className = "syntax-keyword";
    }

    output += className ? `<span class="${className}">${escapeHtml(token)}</span>` : escapeHtml(token);
    cursor = match.index + token.length;
    match = PYTHON_TOKEN_PATTERN.exec(line);
  }

  output += escapeHtml(line.slice(cursor));
  return output || " ";
}

function highlightPython(code) {
  return code.split("\n").map(highlightPythonLine).join("\n");
}

function editableTarget(target) {
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) || target?.isContentEditable;
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
    trees: [],
    maps: [],
    sets: [],
    scalars: [],
    objects: []
  };

  Object.entries(locals).forEach(([name, value]) => {
    if (["array", "tuple", "linked-list"].includes(value.type)) {
      groups.arrays.push({ name, value });
    } else if (value.type === "tree") {
      groups.trees.push({ name, value });
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

function changedCellKeys(currentValue, previousValue) {
  const changed = new Set();
  const currentItems = currentValue?.value || [];
  const previousItems = previousValue?.value || [];
  const length = Math.max(currentItems.length, previousItems.length);
  for (let index = 0; index < length; index += 1) {
    if (stableValue(currentItems[index]) !== stableValue(previousItems[index])) {
      changed.add(String(index));
    }
  }
  return changed;
}

function changedMatrixCellKeys(currentVariable, previousVariable) {
  const changed = new Set();
  const currentRows = matrixRows(currentVariable);
  const previousRows = matrixRows(previousVariable);
  const rowCount = Math.max(currentRows.length, previousRows.length);

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const currentRow = currentRows[rowIndex] || [];
    const previousRow = previousRows[rowIndex] || [];
    const colCount = Math.max(currentRow.length, previousRow.length);
    for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
      if (stableValue(currentRow[colIndex]) !== stableValue(previousRow[colIndex])) {
        changed.add(`${rowIndex},${colIndex}`);
      }
    }
  }

  return changed;
}

function localVariables(locals = {}) {
  return Object.entries(locals).map(([name, value]) => ({ name, value }));
}

function scalarInteger(variable) {
  const value = variable?.value;
  return value?.type === "scalar" && Number.isInteger(value.value) ? value.value : null;
}

function sequenceItems(variable) {
  const value = variable?.value;
  if (!value) return [];
  if (["array", "tuple", "linked-list"].includes(value.type)) return value.value || [];
  if (value.type === "scalar" && typeof value.value === "string") {
    return [...value.value].map((character) => ({ type: "scalar", value: character, label: JSON.stringify(character) }));
  }
  return [];
}

function isSequenceVariable(variable) {
  return sequenceItems(variable).length > 0 || ["array", "tuple", "linked-list"].includes(variable?.value?.type);
}

function isTreeVariable(variable) {
  return variable?.value?.type === "tree";
}

function treeNodes(variable) {
  const explicitNodes = variable?.value?.nodes;
  if (Array.isArray(explicitNodes)) return explicitNodes;

  const levelValues = variable?.value?.value || [];
  if (!levelValues.length) return [];

  // BFS reconstruction: iterate non-null nodes and assign children in order.
  // The 2*i+1 / 2*i+2 formula only works for complete binary trees;
  // LeetCode arrays like [1,2,3,null,null,4,null,5] need BFS assignment.
  const nodes = levelValues.map((value, index) =>
    isNullSerialized(value) ? null : { id: index, value, left: null, right: null }
  );

  let childCursor = 1;
  for (let i = 0; i < levelValues.length && childCursor < levelValues.length; i++) {
    if (nodes[i] === null) continue;
    // assign left child
    if (childCursor < levelValues.length) {
      nodes[i].left = nodes[childCursor] ? childCursor : null;
      childCursor++;
    }
    // assign right child
    if (childCursor < levelValues.length) {
      nodes[i].right = nodes[childCursor] ? childCursor : null;
      childCursor++;
    }
  }

  return nodes.filter(Boolean);
}

function matrixRows(variable) {
  const rows = variable?.value?.value;
  if (!Array.isArray(rows)) return [];
  if (!rows.every((row) => ["array", "tuple"].includes(row?.type) && Array.isArray(row.value))) return [];
  return rows.map((row) => row.value);
}

function isTableVariable(variable) {
  if (matrixRows(variable).length > 0) return true;
  return ["dp", "memo", "table"].includes(variable?.name) && sequenceItems(variable).length > 0;
}

function isGraphVariable(variable) {
  return variable?.value?.type === "map" || matrixRows(variable).length > 0;
}

function variableByName(locals, name) {
  if (!name) return null;
  const value = locals?.[name];
  return value ? { name, value } : null;
}

function buildVisualizationChoices(locals = {}, traceArgs = {}) {
  const variables = localVariables(locals);
  const scalars = variables.filter((variable) => scalarInteger(variable) !== null);

  // Include tree variables from the original function arguments too,
  // since during recursion the local `root` is often a single subtree node.
  const localTrees = variables.filter(isTreeVariable);
  const argTrees = localVariables(traceArgs).filter(isTreeVariable);
  const treeNames = new Set(localTrees.map((t) => t.name));
  const allTrees = [...localTrees, ...argTrees.filter((t) => !treeNames.has(t.name))];

  return {
    sequences: variables.filter(isSequenceVariable),
    scalars,
    trees: allTrees,
    graphs: variables.filter(isGraphVariable),
    tables: variables.filter(isTableVariable)
  };
}

function evaluateIndexExpression(expression, locals = {}) {
  const compact = expression.replace(/\s+/g, "");
  if (!compact || !/^[A-Za-z0-9_+\-]+$/.test(compact)) return null;
  const terms = compact.match(/[+-]?(?:[A-Za-z_]\w*|\d+)/g);
  if (!terms || terms.join("") !== compact) return null;

  let total = 0;
  for (const term of terms) {
    const sign = term.startsWith("-") ? -1 : 1;
    const raw = term.replace(/^[+-]/, "");
    if (/^\d+$/.test(raw)) {
      total += sign * Number(raw);
      continue;
    }
    const variable = variableByName(locals, raw);
    const value = scalarInteger(variable);
    if (value === null) return null;
    total += sign * value;
  }
  return total;
}

function valueMatches(a, b) {
  return stableValue(a) === stableValue(b) || valueLabel(a) === valueLabel(b);
}

function addHighlight(map, name, key) {
  if (!name || key === null || key === undefined) return;
  if (!map.has(name)) map.set(name, new Set());
  map.get(name).add(String(key));
}

function directSubscriptHighlights(lineText = "", locals = {}) {
  const highlights = new Map();
  localVariables(locals).forEach((variable) => {
    if (!isSequenceVariable(variable)) return;
    const pattern = new RegExp(`\\b${escapeRegExp(variable.name)}\\s*((?:\\[[^\\]]+\\])+)`, "g");
    let match = pattern.exec(lineText);
    while (match) {
      const indexes = [...match[1].matchAll(/\[([^\]]+)\]/g)]
        .map((part) => evaluateIndexExpression(part[1], locals))
        .filter((index) => index !== null);
      if (indexes.length) {
        addHighlight(highlights, variable.name, indexes.join(","));
      }
      match = pattern.exec(lineText);
    }
  });
  return highlights;
}

function directIterationHighlights(lineText = "", locals = {}) {
  const sequenceHighlights = new Map();
  const entryHighlights = new Map();
  const match = lineText.trim().match(/^for\s+([A-Za-z_]\w*)\s+in\s+([A-Za-z_]\w*)\s*:/);
  if (!match) return { sequenceHighlights, entryHighlights };

  const [, itemName, collectionName] = match;
  const itemValue = locals[itemName];
  const collection = variableByName(locals, collectionName);
  if (!itemValue || !collection) return { sequenceHighlights, entryHighlights };

  const items = sequenceItems(collection);
  if (items.length) {
    const matches = items.map((value, index) => ({ value, index })).filter((item) => valueMatches(item.value, itemValue));
    if (matches.length === 1) addHighlight(sequenceHighlights, collectionName, matches[0].index);
  } else if (collection.value.type === "set") {
    const matches = (collection.value.value || []).map((value, index) => ({ value, index })).filter((item) => valueMatches(item.value, itemValue));
    if (matches.length === 1) addHighlight(entryHighlights, collectionName, matches[0].index);
  } else if (collection.value.type === "map") {
    const matches = (collection.value.value || [])
      .map((entry, index) => ({ entry, index }))
      .filter((item) => valueMatches(item.entry.key, itemValue));
    if (matches.length === 1) addHighlight(entryHighlights, collectionName, matches[0].index);
  }

  return { sequenceHighlights, entryHighlights };
}

function buildActiveHighlights(frame) {
  const lineText = frame?.displayLineText || frame?.lineText || "";
  const locals = frame?.locals || {};
  const sequenceHighlights = directSubscriptHighlights(lineText, locals);
  const iteration = directIterationHighlights(lineText, locals);

  iteration.sequenceHighlights.forEach((keys, name) => {
    keys.forEach((key) => addHighlight(sequenceHighlights, name, key));
  });

  return {
    sequences: sequenceHighlights,
    entries: iteration.entryHighlights
  };
}

function selectRole(options, selectedName, preferredNames = [], allowEmpty = false) {
  if (allowEmpty && selectedName === "") return "";
  if (selectedName && options.some((option) => option.name === selectedName)) return selectedName;
  const preferred = preferredNames.find((name) => options.some((option) => option.name === name));
  return preferred || options[0]?.name || "";
}

function resolveVisualizationRoles(type, roles, choices) {
  if (type === VISUALIZATION_TYPES.pointers) {
    return {
      sequence: selectRole(choices.sequences, roles.sequence, ["nums", "arr", "piles", "s"]),
      pointerA: selectRole(choices.scalars, roles.pointerA, ["left", "l", "slow", "start", "i"]),
      pointerB: selectRole(choices.scalars, roles.pointerB, ["right", "r", "fast", "end", "j", "mid"], true)
    };
  }
  if (type === VISUALIZATION_TYPES.window) {
    return {
      sequence: selectRole(choices.sequences, roles.sequence, ["s", "nums", "arr"]),
      start: selectRole(choices.scalars, roles.start, ["left", "l", "start", "i"]),
      end: selectRole(choices.scalars, roles.end, ["right", "r", "end", "j"])
    };
  }
  if (type === VISUALIZATION_TYPES.tree) {
    return {
      tree: selectRole(choices.trees, roles.tree, ["root", "tree"])
    };
  }
  if (type === VISUALIZATION_TYPES.graph) {
    return {
      graph: selectRole(choices.graphs, roles.graph, ["graph", "adj", "adjacency"]),
      active: selectRole(choices.scalars, roles.active, ["node", "cur", "current", "u", "v"], true)
    };
  }
  if (type === VISUALIZATION_TYPES.dp) {
    return {
      table: selectRole(choices.tables, roles.table, ["dp", "memo", "table"]),
      index: selectRole(choices.scalars, roles.index, ["i", "j", "amount", "idx", "index"], true),
      row: selectRole(choices.scalars, roles.row, ["i", "row", "r"], true),
      col: selectRole(choices.scalars, roles.col, ["j", "col", "c"], true)
    };
  }
  return {};
}

function CodeEditor({ code, setCode, currentLine, errorLine }) {
  const gutterRef = useRef(null);
  const syntaxRef = useRef(null);
  const lineHighlightRef = useRef(null);
  const textareaRef = useRef(null);
  const highlightedCode = useMemo(() => highlightPython(code), [code]);
  const lineCount = Math.max(code.split("\n").length, 18);
  const lines = Array.from({ length: lineCount }, (_, index) => index + 1);
  const syncGutterScroll = (event) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
    if (lineHighlightRef.current) {
      lineHighlightRef.current.scrollTop = event.currentTarget.scrollTop;
      lineHighlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
    if (syntaxRef.current) {
      syntaxRef.current.scrollTop = event.currentTarget.scrollTop;
      syntaxRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  };
  const restoreSelection = (start, end) => {
    window.requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(start, end);
    });
  };
  const handleKeyDown = (event) => {
    if (event.key !== "Tab") return;

    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const indent = "    ";

    if (start === end && !event.shiftKey) {
      setCode(`${code.slice(0, start)}${indent}${code.slice(end)}`);
      restoreSelection(start + indent.length, start + indent.length);
      return;
    }

    const lineStart = start === 0 ? 0 : code.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = code.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? code.length : nextBreak;
    const block = code.slice(lineStart, lineEnd);
    const linesInBlock = block.split("\n");

    if (event.shiftKey) {
      let removedBeforeSelection = 0;
      let removedTotal = 0;
      const unindented = linesInBlock.map((line, index) => {
        const removeCount = line.startsWith(indent) ? indent.length : line.startsWith("\t") ? 1 : 0;
        if (index === 0) removedBeforeSelection = removeCount;
        removedTotal += removeCount;
        return line.slice(removeCount);
      }).join("\n");
      setCode(`${code.slice(0, lineStart)}${unindented}${code.slice(lineEnd)}`);
      restoreSelection(Math.max(lineStart, start - removedBeforeSelection), Math.max(lineStart, end - removedTotal));
      return;
    }

    const indented = linesInBlock.map((line) => `${indent}${line}`).join("\n");
    setCode(`${code.slice(0, lineStart)}${indented}${code.slice(lineEnd)}`);
    restoreSelection(start + indent.length, end + indent.length * linesInBlock.length);
  };

  return (
    <section className="panel code-panel">
      <div className="panel-header">
        <span>Code</span>
        <span className="file-status">solution.py <span /></span>
      </div>
      <div className="editor-shell">
        <div className="line-gutter" ref={gutterRef} aria-hidden="true">
          {lines.map((line) => (
            <div
              key={line}
              className={`${line === currentLine ? "active-line" : ""} ${line === errorLine ? "error-line" : ""}`}
            >
              {line}
            </div>
          ))}
        </div>
        <div className="code-input-wrap">
          <div className="line-highlight-layer" ref={lineHighlightRef} aria-hidden="true">
            {lines.map((line) => (
              <div
                key={line}
                className={`${line === currentLine ? "active-code-line" : ""} ${line === errorLine ? "error-code-line" : ""}`}
              />
            ))}
          </div>
          <pre className="syntax-layer" ref={syntaxRef} aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
          <textarea
            ref={textareaRef}
            spellCheck="false"
            wrap="off"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={syncGutterScroll}
            aria-label="Python solution code"
          />
        </div>
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

function ArrayValue({ variable, changed, previousValue, activeKeys = new Set() }) {
  const items = variable.value.value || [];
  const rows = matrixRows(variable);
  const cycleTo = variable.value.cycleTo;
  const changedKeys = rows.length ? changedMatrixCellKeys(variable, previousValue ? { name: variable.name, value: previousValue } : null) : changedCellKeys(variable.value, previousValue);

  const cellClassName = (key) =>
    `array-cell ${activeKeys.has(key) ? "active-cell" : ""} ${changedKeys.has(key) ? "changed-cell" : ""}`;

  return (
    <div className={`array-block ${changed ? "changed" : ""}`}>
      <div className="variable-title">
        <span>{variable.name}</span>
        <small>{rows.length ? `${rows.length} rows` : variable.value.type === "linked-list" ? "linked list" : `${items.length} items`}</small>
      </div>
      {rows.length ? (
        <div className="matrix-cells">
          {rows.map((row, rowIndex) => (
            <div className="matrix-row" key={`${variable.name}-${rowIndex}`}>
              <div className="array-index">[{rowIndex}]</div>
              {row.map((cell, colIndex) => {
                const key = `${rowIndex},${colIndex}`;
                return (
                  <div className="array-cell-wrap" key={key}>
                    <div className={cellClassName(key)}>{valueLabel(cell)}</div>
                    <div className="array-index">[{colIndex}]</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="array-cells">
          {items.length === 0 ? (
          <span className="empty-state">(empty)</span>
          ) : (
            items.map((item, index) => (
              <div className="array-cell-wrap" key={`${variable.name}-${index}`}>
                <div className={cellClassName(String(index))}>{valueLabel(item)}</div>
                <div className="array-index">[{index}]</div>
              </div>
            ))
          )}
        </div>
      )}
      {cycleTo !== null && cycleTo !== undefined && <div className="cycle-note">cycle points to index {cycleTo}</div>}
    </div>
  );
}

function TreeValue({ variable, changed }) {
  const nodes = treeNodes(variable);
  const root = nodes[0];

  return (
    <div className={`tree-block ${changed ? "changed" : ""}`}>
      <div className="variable-title">
        <span>{variable.name}</span>
        <small>{nodes.length} nodes</small>
      </div>
      {root ? (
        <div className="tree-summary">
          <span>root</span>
          <strong>{valueLabel(root.value)}</strong>
        </div>
      ) : (
        <span className="empty-state">(empty tree)</span>
      )}
    </div>
  );
}

function scalarChangeDisplay(name, value, previousLocals, changed) {
  if (!changed.has(name) || !["scalar", "none"].includes(value.type)) return valueLabel(value);
  const previousValue = previousLocals?.[name];
  if (previousValue === undefined) return `new: ${valueLabel(value)}`;
  return `${valueLabel(previousValue)} -> ${valueLabel(value)}`;
}

function ScalarsPanel({ variables, changed, previousLocals = {} }) {
  return (
    <div className="value-list">
      {variables.length === 0 ? (
        <span className="empty-state">(empty)</span>
      ) : (
        variables.map(({ name, value }) => (
          <div className={`value-row ${changed.has(name) ? "changed" : ""}`} key={name}>
            <span>{name}</span>
            <strong>{scalarChangeDisplay(name, value, previousLocals, changed)}</strong>
          </div>
        ))
      )}
    </div>
  );
}

function MapPanel({ variables, changed, activeEntries = new Map() }) {
  if (!variables.length) return <span className="empty-state">(empty)</span>;

  return (
    <div className="map-stack">
      {variables.map(({ name, value }) => {
        const activeKeys = activeEntries.get(name) || new Set();
        return (
          <div className={`map-block ${changed.has(name) ? "changed" : ""}`} key={name}>
            <div className="variable-title">
              <span>{name}</span>
              <small>{value.value.length} entries</small>
            </div>
            {value.value.length === 0 ? (
              <span className="empty-state">(empty)</span>
            ) : (
              value.value.map((entry, index) => (
                <div className={`map-entry ${activeKeys.has(String(index)) ? "active-entry" : ""}`} key={`${name}-${index}`}>
                  <span>{valueLabel(entry.key)}</span>
                  <strong>{valueLabel(entry.value)}</strong>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function SetPanel({ variables, changed, activeEntries = new Map() }) {
  if (!variables.length) return <span className="empty-state">(empty)</span>;

  return (
    <div className="map-stack">
      {variables.map(({ name, value }) => {
        const activeKeys = activeEntries.get(name) || new Set();
        return (
          <div className={`map-block ${changed.has(name) ? "changed" : ""}`} key={name}>
            <div className="variable-title">
              <span>{name}</span>
              <small>{value.value.length} items</small>
            </div>
            {value.value.length === 0 ? (
              <span className="empty-state">(empty)</span>
            ) : (
              value.value.map((item, index) => (
                <div className={`map-entry ${activeKeys.has(String(index)) ? "active-entry" : ""}`} key={`${name}-${index}`}>
                  <span>{index}</span>
                  <strong>{valueLabel(item)}</strong>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function RoleSelect({ label, value, options, onChange, optional = false }) {
  return (
    <label className="role-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {optional ? <option value="">None</option> : null}
        {!options.length && !optional ? <option value="">No compatible variable</option> : null}
        {options.map((option) => (
          <option key={option.name} value={option.name}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function VisualizationControls({ type, setType, roles, setRole, choices, resolvedRoles }) {
  const selectedTable = choices.tables.find((option) => option.name === resolvedRoles.table);
  const selectedTableIsMatrix = matrixRows(selectedTable).length > 0;

  return (
    <div className="visual-controls">
      <label className="role-select visual-type-select">
        <span>Visual</span>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          {VISUALIZATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {type === VISUALIZATION_TYPES.pointers ? (
        <>
          <RoleSelect label="Sequence" value={resolvedRoles.sequence} options={choices.sequences} onChange={(value) => setRole("sequence", value)} />
          <RoleSelect label="Pointer A" value={resolvedRoles.pointerA} options={choices.scalars} onChange={(value) => setRole("pointerA", value)} />
          <RoleSelect label="Pointer B" value={resolvedRoles.pointerB} options={choices.scalars} onChange={(value) => setRole("pointerB", value)} optional />
        </>
      ) : null}

      {type === VISUALIZATION_TYPES.window ? (
        <>
          <RoleSelect label="Sequence" value={resolvedRoles.sequence} options={choices.sequences} onChange={(value) => setRole("sequence", value)} />
          <RoleSelect label="Start" value={resolvedRoles.start} options={choices.scalars} onChange={(value) => setRole("start", value)} />
          <RoleSelect label="End" value={resolvedRoles.end} options={choices.scalars} onChange={(value) => setRole("end", value)} />
        </>
      ) : null}

      {type === VISUALIZATION_TYPES.tree ? (
        <RoleSelect label="Tree" value={resolvedRoles.tree} options={choices.trees} onChange={(value) => setRole("tree", value)} />
      ) : null}

      {type === VISUALIZATION_TYPES.graph ? (
        <>
          <RoleSelect label="Graph" value={resolvedRoles.graph} options={choices.graphs} onChange={(value) => setRole("graph", value)} />
          <RoleSelect label="Active" value={resolvedRoles.active} options={choices.scalars} onChange={(value) => setRole("active", value)} optional />
        </>
      ) : null}

      {type === VISUALIZATION_TYPES.dp ? (
        <>
          <RoleSelect label="Table" value={resolvedRoles.table} options={choices.tables} onChange={(value) => setRole("table", value)} />
          {selectedTableIsMatrix ? (
            <>
              <RoleSelect label="Row" value={resolvedRoles.row} options={choices.scalars} onChange={(value) => setRole("row", value)} optional />
              <RoleSelect label="Col" value={resolvedRoles.col} options={choices.scalars} onChange={(value) => setRole("col", value)} optional />
            </>
          ) : (
            <RoleSelect label="Index" value={resolvedRoles.index} options={choices.scalars} onChange={(value) => setRole("index", value)} optional />
          )}
        </>
      ) : null}
    </div>
  );
}

function GuidanceMessage({ children }) {
  return <div className="guidance-message">{children}</div>;
}

function SequenceCells({ variable, markers = [], range = null }) {
  const items = sequenceItems(variable);

  if (!variable || !items.length) {
    return <GuidanceMessage>Choose an array, list, linked list, or string sequence.</GuidanceMessage>;
  }

  return (
    <div className="guided-cells">
      {items.map((item, index) => {
        const cellMarkers = markers.filter((marker) => marker.index === index);
        const inRange = range && index >= range.start && index <= range.end;
        return (
          <div className={`guided-cell-wrap ${inRange ? "in-window" : ""}`} key={`${variable.name}-${index}`}>
            <div className="pointer-tags">
              {cellMarkers.map((marker) => (
                <span key={marker.label}>{marker.label}</span>
              ))}
            </div>
            <div className={`guided-cell ${cellMarkers.length ? "pointed" : ""}`}>{valueLabel(item)}</div>
            <div className="array-index">[{index}]</div>
          </div>
        );
      })}
    </div>
  );
}

function PointerVisualization({ locals, roles }) {
  const sequence = variableByName(locals, roles.sequence);
  const pointerA = variableByName(locals, roles.pointerA);
  const pointerB = variableByName(locals, roles.pointerB);
  const itemCount = sequenceItems(sequence).length;
  const markers = [
    pointerA ? { label: roles.pointerA, index: scalarInteger(pointerA) } : null,
    pointerB ? { label: roles.pointerB, index: scalarInteger(pointerB) } : null
  ].filter((marker) => marker && marker.index !== null);
  const outOfRange = markers.filter((marker) => marker.index < 0 || marker.index >= itemCount);

  return (
    <div className="guided-render">
      {outOfRange.length ? (
        <GuidanceMessage>
          {outOfRange.map((marker) => `${marker.label}=${marker.index}`).join(", ")} outside {roles.sequence}; no arrow drawn for those values.
        </GuidanceMessage>
      ) : null}
      <SequenceCells variable={sequence} markers={markers} />
    </div>
  );
}

function WindowVisualization({ locals, roles }) {
  const sequence = variableByName(locals, roles.sequence);
  const startVariable = variableByName(locals, roles.start);
  const endVariable = variableByName(locals, roles.end);
  const start = scalarInteger(startVariable);
  const end = scalarInteger(endVariable);
  const itemCount = sequenceItems(sequence).length;
  const validRange = start !== null && end !== null && start <= end && start >= 0 && end < itemCount ? { start, end } : null;
  const markers = [
    start !== null ? { label: roles.start, index: start } : null,
    end !== null ? { label: roles.end, index: end } : null
  ].filter(Boolean);

  return (
    <div className="guided-render">
      {!validRange ? <GuidanceMessage>Select integer start and end variables to highlight the active window.</GuidanceMessage> : null}
      <SequenceCells variable={sequence} markers={markers} range={validRange} />
    </div>
  );
}

function isNullSerialized(value) {
  return value?.type === "none" || value?.label === "null" || value?.value === null;
}

function findCurrentNodeValue(locals, treeName) {
  // During recursion, the local variable with the same name as the tree arg
  // (e.g. `root`) is often a subtree node. Extract its val to highlight it.
  const localVar = locals?.[treeName];
  if (!localVar) return null;
  // If it's still a full tree, don't highlight anything special
  if (localVar.type === "tree") {
    const vals = localVar.value || [];
    if (vals.length > 1) return null;
    // Single-node tree: highlight that node's val
    if (vals.length === 1 && !isNullSerialized(vals[0])) {
      return vals[0].value !== undefined ? vals[0].value : vals[0].label;
    }
    return null;
  }
  // If it's an object (TreeNode serialized as object with val attribute)
  if (localVar.type === "object" && typeof localVar.value === "object" && localVar.value?.val) {
    const v = localVar.value.val;
    return v.value !== undefined ? v.value : v.label;
  }
  return null;
}

function TreeVisualization({ locals, roles, traceArgs }) {
  // Try to get the tree from locals first, then fall back to traceArgs
  // for the full tree (during recursion, local `root` is just a subtree node)
  let tree = variableByName(locals, roles.tree);
  let fullTree = variableByName(traceArgs, roles.tree);

  // Decide which to render: prefer the one with more nodes
  const localNodes = treeNodes(tree);
  const argNodes = treeNodes(fullTree);
  const useArgTree = fullTree && argNodes.length > localNodes.length;
  const displayTree = useArgTree ? fullTree : tree;
  const nodes = useArgTree ? argNodes : localNodes;

  // Find which node is currently being visited (for highlighting)
  const currentVal = useArgTree ? findCurrentNodeValue(locals, roles.tree) : null;

  if (!displayTree || !nodes.length) {
    return <GuidanceMessage>Choose a TreeNode variable from the trace.</GuidanceMessage>;
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const positions = new Map();
  const levels = [];
  const visited = new Set([nodes[0].id]);
  const queue = [{ id: nodes[0].id, depth: 0 }];

  while (queue.length) {
    const { id, depth } = queue.shift();
    const node = byId.get(id);
    if (!node) continue;
    if (!levels[depth]) levels[depth] = [];
    levels[depth].push(node);

    [node.left, node.right].forEach((childId) => {
      if (childId !== null && childId !== undefined && byId.has(childId) && !visited.has(childId)) {
        visited.add(childId);
        queue.push({ id: childId, depth: depth + 1 });
      }
    });
  }

  const nodeRadius = 18;
  const levelSpacing = 52;
  const width = 720;
  const height = Math.max(110, nodeRadius * 2 + 16 + (levels.length - 1) * levelSpacing);

  // Position nodes: use a width-division approach per level
  levels.forEach((levelNodes, depth) => {
    levelNodes.forEach((node, index) => {
      positions.set(node.id, {
        x: Math.round(((index + 1) / (levelNodes.length + 1)) * width),
        y: nodeRadius + 8 + depth * levelSpacing
      });
    });
  });

  const visibleNodes = nodes.filter((node) => positions.has(node.id));
  const edges = visibleNodes.flatMap((node) => {
    const children = [node.left, node.right];
    return children
      .filter((childId) => childId !== null && childId !== undefined && positions.has(childId))
      .map((childId) => ({ from: positions.get(node.id), to: positions.get(childId), key: `${node.id}-${childId}` }));
  });

  return (
    <div className="guided-render tree-render">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${displayTree.name} tree visualization`}>
        {edges.map((edge) => (
          <line key={edge.key} x1={edge.from.x} y1={edge.from.y} x2={edge.to.x} y2={edge.to.y} />
        ))}
        {visibleNodes.map((node) => {
          const position = positions.get(node.id);
          const nodeVal = node.value?.value !== undefined ? node.value.value : node.value?.label;
          const isCurrent = currentVal !== null && String(nodeVal) === String(currentVal);
          return (
            <g key={node.id} transform={`translate(${position.x} ${position.y})`} className={isCurrent ? "tree-node-active" : ""}>
              <circle r={nodeRadius} className={isCurrent ? "active" : ""} />
              <text textAnchor="middle" dominantBaseline="central">{valueLabel(node.value)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function GraphVisualization({ locals, roles }) {
  const graph = variableByName(locals, roles.graph);
  const active = scalarInteger(variableByName(locals, roles.active));

  if (!graph) {
    return <GuidanceMessage>Choose an adjacency map or adjacency-list variable.</GuidanceMessage>;
  }

  const rows =
    graph.value.type === "map"
      ? graph.value.value.map((entry) => ({ key: valueLabel(entry.key), value: valueLabel(entry.value) }))
      : matrixRows(graph).map((row, index) => ({ key: String(index), value: `[${row.map(valueLabel).join(", ")}]` }));

  return (
    <div className="guided-render graph-render">
      {rows.map((row) => (
        <div className={`graph-row ${active !== null && String(active) === row.key ? "active" : ""}`} key={row.key}>
          <span>{row.key}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function DpVisualization({ locals, roles }) {
  const table = variableByName(locals, roles.table);
  const rows = matrixRows(table);
  const oneDimensionalItems = rows.length ? [] : sequenceItems(table);
  const activeRow = scalarInteger(variableByName(locals, roles.row));
  const activeCol = scalarInteger(variableByName(locals, roles.col));
  const activeIndex = scalarInteger(variableByName(locals, roles.index));

  if (!table || (!rows.length && !oneDimensionalItems.length)) {
    return <GuidanceMessage>Choose a 1D or 2D DP variable such as dp, memo, or table.</GuidanceMessage>;
  }

  if (!rows.length) {
    return (
      <div className="guided-render dp-render">
        <div className="dp-row">
          {oneDimensionalItems.map((cell, index) => (
            <div
              className={`dp-cell ${index === activeIndex ? "active-cell" : ""}`}
              key={index}
            >
              <span>{valueLabel(cell)}</span>
              <small>[{index}]</small>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="guided-render dp-render">
      {rows.map((row, rowIndex) => (
        <div className="dp-row" key={rowIndex}>
          {row.map((cell, colIndex) => (
            <div
              className={`dp-cell ${rowIndex === activeRow ? "active-row" : ""} ${colIndex === activeCol ? "active-col" : ""} ${
                rowIndex === activeRow && colIndex === activeCol ? "active-cell" : ""
              }`}
              key={`${rowIndex}-${colIndex}`}
            >
              {valueLabel(cell)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GuidedVisualization({ type, locals, roles, traceArgs }) {
  if (type === VISUALIZATION_TYPES.pointers) return <PointerVisualization locals={locals} roles={roles} />;
  if (type === VISUALIZATION_TYPES.window) return <WindowVisualization locals={locals} roles={roles} />;
  if (type === VISUALIZATION_TYPES.tree) return <TreeVisualization locals={locals} roles={roles} traceArgs={traceArgs} />;
  if (type === VISUALIZATION_TYPES.graph) return <GraphVisualization locals={locals} roles={roles} />;
  if (type === VISUALIZATION_TYPES.dp) return <DpVisualization locals={locals} roles={roles} />;
  return null;
}

function Visualization({ frame, previousFrame, sourceLines, traceArgs, visualType, setVisualType, visualRoles, setVisualRoles }) {
  const groups = useMemo(() => categorizeVariables(frame?.locals), [frame]);
  const changed = useMemo(() => changedNames(frame?.locals, previousFrame?.locals), [frame, previousFrame]);
  const activeHighlights = useMemo(() => buildActiveHighlights(frame), [frame]);
  const visualizationLocals = useMemo(() => ({ ...(traceArgs || {}), ...(frame?.locals || {}) }), [frame, traceArgs]);
  const choices = useMemo(() => buildVisualizationChoices(visualizationLocals, traceArgs), [visualizationLocals, traceArgs]);
  const resolvedRoles = useMemo(() => resolveVisualizationRoles(visualType, visualRoles, choices), [choices, visualRoles, visualType]);
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
  const setRole = (name, value) => setVisualRoles((current) => ({ ...current, [name]: value }));

  return (
    <div className={`visual-grid ${visualType !== VISUALIZATION_TYPES.default ? "with-guidance" : ""}`}>
      <div className="execution-strip">
        <span>{stateLabel} {lineNumber ?? "-"}</span>
        <code>{lineText.trim() || sourceLines?.[lineNumber - 1] || "Waiting for trace"}</code>
        <em>{frame?.changed?.length ? `Changed ${frame.changed.join(", ")}` : "Current State"}</em>
      </div>

      <section className="guided-panel">
        <VisualizationControls
          type={visualType}
          setType={setVisualType}
          roles={visualRoles}
          setRole={setRole}
          choices={choices}
          resolvedRoles={resolvedRoles}
        />
        {visualType !== VISUALIZATION_TYPES.default ? (
          <GuidedVisualization type={visualType} locals={visualizationLocals} roles={resolvedRoles} traceArgs={traceArgs} />
        ) : null}
      </section>

      <section className="panel data-panel arrays-panel">
        <div className="panel-header">
          <span>{groups.trees.length ? "Arrays / Lists / Trees" : "Arrays / Lists"}</span>
        </div>
        <div className="panel-body">
          {groups.arrays.length === 0 && groups.trees.length === 0 ? (
            <span className="empty-state">(empty)</span>
          ) : (
            <>
              {groups.arrays.map((variable) => (
                <ArrayValue
                  key={variable.name}
                  variable={variable}
                  changed={changed.has(variable.name)}
                  previousValue={previousFrame?.locals?.[variable.name]}
                  activeKeys={activeHighlights.sequences.get(variable.name)}
                />
              ))}
              {groups.trees.map((variable) => (
                <TreeValue key={variable.name} variable={variable} changed={changed.has(variable.name)} />
              ))}
            </>
          )}
        </div>
      </section>

      <section className="panel data-panel">
        <div className="panel-header">
          <span>Scalars</span>
        </div>
        <div className="panel-body">
          <ScalarsPanel variables={[...groups.scalars, ...groups.objects]} changed={changed} previousLocals={previousFrame?.locals} />
        </div>
      </section>

      <section className="panel data-panel">
        <div className="panel-header">
          <span>Maps / Dicts</span>
        </div>
        <div className="panel-body">
          <MapPanel variables={groups.maps} changed={changed} activeEntries={activeHighlights.entries} />
        </div>
      </section>

      <section className="panel data-panel">
        <div className="panel-header">
          <span>Sets</span>
        </div>
        <div className="panel-body">
          <SetPanel variables={groups.sets} changed={changed} activeEntries={activeHighlights.entries} />
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

function ResultBar({ trace, error, errorLine, expectedOutput }) {
  if (error) {
    return <div className="status-bar error">Trace failed{errorLine ? ` on line ${errorLine}` : ""}: {error}</div>;
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
  const [selectedPreset, setSelectedPreset] = useState(PROBLEM_PRESETS[0].id);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [testcase, setTestcase] = useState(DEFAULT_TESTCASE);
  const [expectedOutput, setExpectedOutput] = useState(DEFAULT_EXPECTED_OUTPUT);
  const [trace, setTrace] = useState(null);
  const [error, setError] = useState("");
  const [errorLine, setErrorLine] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isRawLogOpen, setIsRawLogOpen] = useState(false);
  const [traceMode, setTraceMode] = useState(TRACE_MODES.updates);
  const [visualType, setVisualType] = useState(VISUALIZATION_TYPES.default);
  const [visualRoles, setVisualRoles] = useState({});
  const [theme, setTheme] = useState(() => window.localStorage.getItem("leetcode-visualizer-theme") || "dark");
  const rawFrames = trace?.frames || [];
  const visibleFrames = useMemo(() => buildTraceFrames(rawFrames, traceMode), [rawFrames, traceMode]);
  const playback = useTracePlayback(visibleFrames);
  const currentFrame = visibleFrames[playback.step];
  const previousFrame = visibleFrames[playback.step - 1];
  const runIdRef = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("leetcode-visualizer-theme", theme);
  }, [theme]);

  function selectRawStep(rawIndex) {
    const visibleIndex = visibleFrames.findIndex((frame) => frame.rawIndex >= rawIndex);
    playback.setStep(visibleIndex >= 0 ? visibleIndex : visibleFrames.length - 1);
  }

  function applyPreset(presetId) {
    const preset = PROBLEM_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setSelectedPreset(preset.id);
    setCode(preset.code);
    setTestcase(preset.testcase);
    setExpectedOutput(preset.expectedOutput);
    setTrace(null);
    setError("");
    setErrorLine(null);
    setIsRawLogOpen(false);
    setTraceMode(TRACE_MODES.updates);
    setVisualType(preset.visualType || VISUALIZATION_TYPES.default);
    setVisualRoles({});
  }

  async function runTrace() {
    if (isRunning) return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setIsRunning(true);
    setError("");
    setErrorLine(null);

    try {
      const payload = await runTraceInBrowser({ code, testcase });
      if (runId !== runIdRef.current) return;
      if (!payload.ok) {
        setTrace(null);
        setError(payload.error || "Trace failed.");
        setErrorLine(payload.errorLine ?? null);
        return;
      }
      setTrace(payload);
      setIsRawLogOpen(false);
    } catch (requestError) {
      setTrace(null);
      setError(requestError.message);
      setErrorLine(null);
    } finally {
      if (runId === runIdRef.current) {
        setIsRunning(false);
      }
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        runTrace();
        return;
      }

      if (editableTarget(event.target)) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        playback.setStep(playback.step + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        playback.setStep(playback.step - 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playback, runTrace]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">C</span>
          <strong>LeetCode Solution Visualizer</strong>
        </div>
        <label className="preset-select">
          <span>Preset:</span>
          <select value={selectedPreset} onChange={(event) => applyPreset(event.target.value)}>
            {PROBLEM_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.title}
              </option>
            ))}
          </select>
        </label>
        <label className="language-select">
          <span>Language:</span>
          <select defaultValue="python">
            <option value="python">Python</option>
          </select>
        </label>
        <button className="primary-button" type="button" onClick={runTrace} disabled={isRunning}>
          <RunIcon />
          {isRunning ? "Loading / tracing..." : "Run Trace"}
        </button>
        <button className="secondary-button theme-toggle" type="button" onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
          {theme === "dark" ? "Light" : "Dark"}
        </button>
        <button className="secondary-button" type="button" onClick={() => { setTrace(null); setError(""); setErrorLine(null); }}>
          <ResetIcon />
          Reset
        </button>
      </header>

      <div className="workspace">
        <div className="left-column">
          <CodeEditor code={code} setCode={setCode} currentLine={currentFrame?.displayLine ?? currentFrame?.line} errorLine={errorLine} />
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
          <TraceLog
            frames={rawFrames}
            currentRawStep={currentFrame?.rawIndex ?? 0}
            selectRawStep={selectRawStep}
            isOpen={isRawLogOpen}
            setIsOpen={setIsRawLogOpen}
          />
        </div>

        <section className="panel right-column">
          <div className="panel-header">
            <span>Trace / Visualization</span>
            <span className="trace-meta">{rawFrames.length} raw snapshots</span>
          </div>
          <Playback frames={visibleFrames} rawCount={rawFrames.length} playback={playback} traceMode={traceMode} setTraceMode={setTraceMode} />
          <Visualization
            frame={currentFrame}
            previousFrame={previousFrame}
            sourceLines={trace?.sourceLines}
            traceArgs={trace?.args}
            visualType={visualType}
            setVisualType={setVisualType}
            visualRoles={visualRoles}
            setVisualRoles={setVisualRoles}
          />
        </section>
      </div>

      <ResultBar trace={trace} error={error} errorLine={errorLine} expectedOutput={expectedOutput} />
    </main>
  );
}

export default App;
