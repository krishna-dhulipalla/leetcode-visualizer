import ast
import bisect
import builtins
import collections
import contextlib
import copy
import functools
import heapq
import inspect
import io
import types
import itertools
import json
import math
import operator
import string
import sys
import traceback
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, Tuple


USER_FILENAME = "<user_solution>"
MAX_STEPS = 800


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def normalize_literal(raw: str) -> str:
    return (
        raw.strip()
        .replace("null", "None")
        .replace("true", "True")
        .replace("false", "False")
    )


def parse_value(raw: str) -> Any:
    normalized = normalize_literal(raw)
    try:
        return ast.literal_eval(normalized)
    except Exception:
        if normalized:
            return normalized
        raise


def parse_testcase(raw: str) -> tuple[dict[str, Any], list[Any]]:
    named: dict[str, Any] = {}
    ordered: list[Any] = []

    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        if "=" in stripped:
            name, value = stripped.split("=", 1)
            key = name.strip()
            if key.isidentifier():
                parsed = parse_value(value)
                named[key] = parsed
                ordered.append(parsed)
                continue

        parsed = parse_value(stripped)
        if isinstance(parsed, tuple):
            ordered.extend(parsed)
        else:
            ordered.append(parsed)

    return named, ordered


def build_linked_list(values: Any, pos: Optional[int] = None) -> Optional[ListNode]:
    if values in (None, []):
        return None

    nodes = [ListNode(value) for value in values]
    for index in range(len(nodes) - 1):
        nodes[index].next = nodes[index + 1]

    if pos is not None and 0 <= pos < len(nodes):
        nodes[-1].next = nodes[pos]

    return nodes[0] if nodes else None


def build_tree(values: Any) -> Optional[TreeNode]:
    if values in (None, []):
        return None

    nodes = [None if value is None else TreeNode(value) for value in values]
    kids = collections.deque(nodes[1:])

    for node in nodes:
        if node is None:
            continue
        if kids:
            node.left = kids.popleft()
        if kids:
            node.right = kids.popleft()

    return nodes[0]


def annotation_name(annotation: Any) -> str:
    if annotation is inspect._empty:
        return ""
    return str(annotation).replace("typing.", "")


def convert_arg(param_name: str, value: Any, annotation: Any, named: dict[str, Any]) -> Any:
    hint = annotation_name(annotation)
    if ("ListNode" in hint or param_name in {"head", "list"}) and isinstance(value, list):
        return build_linked_list(value, named.get("pos"))
    if ("TreeNode" in hint or param_name in {"root", "tree"}) and isinstance(value, list):
        return build_tree(value)
    if isinstance(value, tuple) and ("List[" in hint or "list[" in hint or hint in {"list", "<class 'list'>"}):
        return list(value)
    return value


def source_segment(code: str, node: ast.AST, fallback: str = "") -> str:
    segment = ast.get_source_segment(code, node)
    return segment.strip() if segment else fallback


def target_names(node: ast.AST) -> list[str]:
    if isinstance(node, ast.Name):
        return [node.id]
    if isinstance(node, (ast.Tuple, ast.List)):
        names: list[str] = []
        for item in node.elts:
            names.extend(target_names(item))
        return names
    return []


def loop_iterator_metadata(node: ast.For, code: str) -> dict[str, Any]:
    names = target_names(node.target)
    metadata: dict[str, Any] = {
        "targetNames": names,
        "iteratorText": source_segment(code, node.iter),
    }

    iterator = node.iter
    if isinstance(iterator, ast.Name):
        metadata.update({"iteratorKind": "direct", "collectionName": iterator.id})
    elif (
        isinstance(iterator, ast.Call)
        and isinstance(iterator.func, ast.Name)
        and iterator.func.id == "enumerate"
        and iterator.args
        and isinstance(iterator.args[0], ast.Name)
    ):
        metadata.update(
            {
                "iteratorKind": "enumerate",
                "collectionName": iterator.args[0].id,
                "indexName": names[0] if names else "",
                "itemName": names[1] if len(names) > 1 else "",
            }
        )
    elif (
        isinstance(iterator, ast.Call)
        and isinstance(iterator.func, ast.Name)
        and iterator.func.id == "range"
        and len(iterator.args) == 1
        and isinstance(iterator.args[0], ast.Call)
        and isinstance(iterator.args[0].func, ast.Name)
        and iterator.args[0].func.id == "len"
        and iterator.args[0].args
        and isinstance(iterator.args[0].args[0], ast.Name)
    ):
        metadata.update(
            {
                "iteratorKind": "rangeLen",
                "collectionName": iterator.args[0].args[0].id,
                "indexName": names[0] if names else "",
            }
        )

    return metadata


def build_control_flow_metadata(code: str) -> list[dict[str, Any]]:
    tree = ast.parse(code, filename=USER_FILENAME)
    loops: list[dict[str, Any]] = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.For, ast.While)):
            continue

        line = getattr(node, "lineno", None)
        end_line = getattr(node, "end_lineno", line)
        if line is None or end_line is None:
            continue

        if isinstance(node, ast.For):
            record = {
                "type": "for",
                "line": line,
                "endLine": end_line,
                "column": getattr(node, "col_offset", 0),
                "text": source_segment(code, node, "").splitlines()[0].strip(),
            }
            record.update(loop_iterator_metadata(node, code))
        else:
            record = {
                "type": "while",
                "line": line,
                "endLine": end_line,
                "column": getattr(node, "col_offset", 0),
                "text": source_segment(code, node, "").splitlines()[0].strip(),
                "conditionText": source_segment(code, node.test),
            }

        loops.append(record)

    return sorted(loops, key=lambda item: (item["line"], item["column"]))


def non_finite_label(value: float) -> Optional[str]:
    if math.isinf(value):
        return "inf" if value > 0 else "-inf"
    if math.isnan(value):
        return "nan"
    return None


def display_value(value: Any, depth: int = 0, seen: Optional[set[int]] = None) -> str:
    if seen is None:
        seen = set()
    if depth > 2:
        return "..."
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        special_label = non_finite_label(value)
        if special_label:
            return special_label
    if isinstance(value, (int, float, str)):
        return json.dumps(value) if isinstance(value, str) else str(value)
    if isinstance(value, ListNode):
        serialized = serialize_linked_list(value)
        parts = [display_value(item) for item in serialized["value"]]
        tail = f" -> cycle[{serialized['cycleTo']}]" if serialized.get("cycleTo") is not None else ""
        return " -> ".join(parts) + tail
    if isinstance(value, TreeNode):
        return json.dumps(serialize_tree(value)["value"])
    if isinstance(value, (list, tuple)):
        return "[" + ", ".join(display_value(item, depth + 1, seen) for item in value[:8]) + (", ..." if len(value) > 8 else "") + "]"
    if isinstance(value, dict):
        object_id = id(value)
        if object_id in seen:
            return "{...}"
        seen.add(object_id)
        entries = list(value.items())[:8]
        body = ", ".join(f"{display_value(key, depth + 1, seen)}: {display_value(val, depth + 1, seen)}" for key, val in entries)
        return "{" + body + (", ..." if len(value) > 8 else "") + "}"
    if isinstance(value, set):
        return "{" + ", ".join(display_value(item, depth + 1, seen) for item in list(value)[:8]) + ("..." if len(value) > 8 else "") + "}"
    if isinstance(value, (types.GeneratorType, range, enumerate, zip, map, filter)) or hasattr(value, "__next__"):
        return value.__class__.__name__
    return repr(value)


def serialize_linked_list(head: Optional[ListNode]) -> dict[str, Any]:
    values = []
    seen: dict[int, int] = {}
    node = head
    cycle_to = None

    while node is not None and len(values) < 80:
        object_id = id(node)
        if object_id in seen:
            cycle_to = seen[object_id]
            break
        seen[object_id] = len(values)
        values.append(serialize_value(node.val))
        node = node.next

    return {"type": "linked-list", "value": values, "cycleTo": cycle_to}


def serialize_tree(root: Optional[TreeNode]) -> dict[str, Any]:
    if root is None:
        return {"type": "tree", "value": [], "nodes": []}

    output: list[Any] = []
    queue = collections.deque([root])
    while queue and len(output) < 120:
        node = queue.popleft()
        if node is None:
            output.append(None)
            continue
        output.append(node.val)
        queue.append(node.left)
        queue.append(node.right)

    while output and output[-1] is None:
        output.pop()

    nodes: list[dict[str, Any]] = []
    node_ids: dict[int, int] = {}
    node_queue = collections.deque()

    def node_id(node: TreeNode) -> int:
        object_id = id(node)
        if object_id not in node_ids:
            node_ids[object_id] = len(nodes)
            nodes.append({"id": node_ids[object_id], "value": serialize_value(node.val), "left": None, "right": None})
            node_queue.append(node)
        return node_ids[object_id]

    node_id(root)
    while node_queue and len(nodes) < 120:
        node = node_queue.popleft()
        current_id = node_ids[id(node)]
        if node.left is not None:
            nodes[current_id]["left"] = node_id(node.left)
        if node.right is not None:
            nodes[current_id]["right"] = node_id(node.right)

    return {
        "type": "tree",
        "value": [serialize_value(item) if item is not None else {"type": "none", "value": None, "label": "null"} for item in output],
        "nodes": nodes,
    }


def serialize_value(value: Any, depth: int = 0, seen: Optional[set[int]] = None) -> dict[str, Any]:
    if seen is None:
        seen = set()
    if depth > 5:
        return {"type": "object", "value": "...", "label": "..."}

    if value is None:
        return {"type": "none", "value": None, "label": "null"}
    if isinstance(value, bool):
        return {"type": "scalar", "value": value, "label": "true" if value else "false"}
    if isinstance(value, float):
        special_label = non_finite_label(value)
        if special_label:
            return {"type": "scalar", "value": None, "label": special_label}
    if isinstance(value, (int, float, str)):
        return {"type": "scalar", "value": value, "label": display_value(value)}
    if isinstance(value, ListNode):
        return serialize_linked_list(value)
    if isinstance(value, TreeNode):
        return serialize_tree(value)
    if isinstance(value, tuple):
        return {"type": "tuple", "value": [serialize_value(item, depth + 1, seen) for item in value], "label": display_value(value)}
    if isinstance(value, list):
        return {"type": "array", "value": [serialize_value(item, depth + 1, seen) for item in value], "label": display_value(value)}
    if isinstance(value, dict):
        object_id = id(value)
        if object_id in seen:
            return {"type": "object", "value": "{...}", "label": "{...}"}
        seen.add(object_id)
        entries = [
            {"key": serialize_value(key, depth + 1, seen), "value": serialize_value(val, depth + 1, seen)}
            for key, val in value.items()
        ]
        return {"type": "map", "value": entries, "label": display_value(value)}
    if isinstance(value, set):
        return {"type": "set", "value": [serialize_value(item, depth + 1, seen) for item in value], "label": display_value(value)}
    if isinstance(value, (types.GeneratorType, range, enumerate, zip, map, filter)) or hasattr(value, "__next__"):
        return {"type": "iterator", "value": value.__class__.__name__, "label": value.__class__.__name__}

    if hasattr(value, "__dict__"):
        attrs = {
            key: serialize_value(val, depth + 1, seen)
            for key, val in vars(value).items()
            if not key.startswith("_")
        }
        return {"type": "object", "value": attrs, "label": value.__class__.__name__}

    return {"type": "object", "value": repr(value), "label": repr(value)}


def safe_locals(frame_locals: dict[str, Any]) -> dict[str, dict[str, Any]]:
    hidden = {"self", "__class__"}
    return {
        key: serialize_value(value)
        for key, value in frame_locals.items()
        if key not in hidden and not key.startswith("__") and not key.startswith(".") and not callable(value)
    }


def find_callable(namespace: dict[str, Any], function_name: Optional[str] = None):
    if "Solution" in namespace:
        solution = namespace["Solution"]()
        methods = [
            name
            for name, member in inspect.getmembers(solution, predicate=inspect.ismethod)
            if not name.startswith("_")
        ]
        if function_name and hasattr(solution, function_name):
            return getattr(solution, function_name), f"Solution.{function_name}"
        if methods:
            return getattr(solution, methods[0]), f"Solution.{methods[0]}"

    callables = [
        (name, value)
        for name, value in namespace.items()
        if callable(value) and not name.startswith("_") and name not in BASE_GLOBALS
    ]
    if function_name:
        for name, value in callables:
            if name == function_name:
                return value, name
    if callables:
        return callables[0][1], callables[0][0]

    raise ValueError("No callable solution function was found.")


BASE_GLOBALS = {
    "Any",
    "Dict",
    "List",
    "Optional",
    "Set",
    "Tuple",
    "ListNode",
    "TreeNode",
    "collections",
    "math",
}


ALLOWED_IMPORTS = {
    "array",
    "bisect",
    "collections",
    "copy",
    "functools",
    "heapq",
    "itertools",
    "math",
    "operator",
    "string",
    "typing",
}


def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root_name = name.split(".", 1)[0]
    if level != 0 or root_name not in ALLOWED_IMPORTS:
        raise ImportError(f"Import '{name}' is not allowed in the visualizer runner.")
    return builtins.__import__(name, globals, locals, fromlist, level)


SAFE_BUILTINS = {
    "__build_class__": builtins.__build_class__,
    "__import__": safe_import,
    "ArithmeticError": ArithmeticError,
    "AssertionError": AssertionError,
    "AttributeError": AttributeError,
    "BaseException": BaseException,
    "Exception": Exception,
    "False": False,
    "IndexError": IndexError,
    "KeyError": KeyError,
    "LookupError": LookupError,
    "NameError": NameError,
    "None": None,
    "NotImplementedError": NotImplementedError,
    "RuntimeError": RuntimeError,
    "StopIteration": StopIteration,
    "True": True,
    "TypeError": TypeError,
    "ValueError": ValueError,
    "ZeroDivisionError": ZeroDivisionError,
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "chr": chr,
    "dict": dict,
    "divmod": divmod,
    "enumerate": enumerate,
    "filter": filter,
    "float": float,
    "hash": hash,
    "int": int,
    "isinstance": isinstance,
    "issubclass": issubclass,
    "iter": iter,
    "len": len,
    "list": list,
    "map": map,
    "max": max,
    "min": min,
    "next": next,
    "object": object,
    "ord": ord,
    "pow": pow,
    "print": print,
    "range": range,
    "repr": repr,
    "reversed": reversed,
    "round": round,
    "set": set,
    "slice": slice,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
}


def make_namespace() -> dict[str, Any]:
    return {
        "__builtins__": SAFE_BUILTINS,
        "__name__": "__solution__",
        "Any": Any,
        "Dict": Dict,
        "List": List,
        "Optional": Optional,
        "Set": Set,
        "Tuple": Tuple,
        "ListNode": ListNode,
        "TreeNode": TreeNode,
        "bisect": bisect,
        "collections": collections,
        "copy": copy,
        "defaultdict": collections.defaultdict,
        "Counter": collections.Counter,
        "deque": collections.deque,
        "functools": functools,
        "heapq": heapq,
        "itertools": itertools,
        "math": math,
        "operator": operator,
        "string": string,
        "inf": math.inf,
    }


def build_args(target, named: dict[str, Any], ordered: list[Any]):
    signature = inspect.signature(target)
    params = list(signature.parameters.values())
    args = []
    raw_index = 0

    for param in params:
        if param.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
            continue

        if param.name in named:
            raw_value = named[param.name]
        elif raw_index < len(ordered):
            raw_value = ordered[raw_index]
            raw_index += 1
        elif param.default is not inspect._empty:
            raw_value = param.default
        else:
            raise ValueError(f"Missing testcase value for parameter '{param.name}'.")

        args.append(convert_arg(param.name, raw_value, param.annotation, named))

    return args, [param.name for param in params if param.kind not in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD)]


def run_trace(payload: dict[str, Any]) -> dict[str, Any]:
    code = payload.get("code", "")
    testcase = payload.get("testcase", "")
    function_name = payload.get("functionName") or None
    source_lines = code.splitlines()
    control_flow = build_control_flow_metadata(code)
    warnings = []
    stdout_buffer = io.StringIO()

    namespace = make_namespace()
    compiled = compile(code, USER_FILENAME, "exec")
    with contextlib.redirect_stdout(stdout_buffer):
        exec(compiled, namespace)

    target, call_name = find_callable(namespace, function_name)
    named, ordered = parse_testcase(testcase)
    args, param_names = build_args(target, named, ordered)

    frames = []
    step_count = 0

    def tracer(frame, event, arg):
        nonlocal step_count
        if frame.f_code.co_filename != USER_FILENAME:
            return tracer
        if frame.f_code.co_name.startswith("<") and frame.f_code.co_name.endswith(">"):
            return tracer

        if event == "line":
            step_count += 1
            if step_count > MAX_STEPS:
                raise RuntimeError(f"Trace exceeded {MAX_STEPS} steps. Try a smaller testcase.")
            line_number = frame.f_lineno
            line_text = source_lines[line_number - 1] if 0 <= line_number - 1 < len(source_lines) else ""
            frames.append(
                {
                    "event": "line",
                    "line": line_number,
                    "lineText": line_text,
                    "locals": safe_locals(frame.f_locals),
                }
            )
        elif event == "return":
            frames.append(
                {
                    "event": "return",
                    "line": frame.f_lineno,
                    "lineText": "return",
                    "locals": safe_locals(frame.f_locals),
                    "returnValue": serialize_value(arg),
                }
            )
        return tracer

    sys.settrace(tracer)
    try:
        with contextlib.redirect_stdout(stdout_buffer):
            result = target(*args)
    finally:
        sys.settrace(None)

    return {
        "ok": True,
        "callName": call_name,
        "params": param_names,
        "args": {name: serialize_value(value) for name, value in zip(param_names, args)},
        "frames": frames,
        "result": serialize_value(result),
        "sourceLines": source_lines,
        "controlFlow": control_flow,
        "stdout": stdout_buffer.getvalue(),
        "warnings": warnings,
    }


def extract_error_location(exc: Exception) -> tuple[Optional[int], str]:
    if isinstance(exc, SyntaxError):
        return exc.lineno, (exc.text or "").strip()

    for frame in reversed(traceback.extract_tb(exc.__traceback__)):
        if frame.filename == USER_FILENAME:
            return frame.lineno, frame.line or ""

    return None, ""


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        print(json.dumps(run_trace(payload), allow_nan=False))
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
        print(json.dumps(error_payload, allow_nan=False))


if __name__ == "__main__" and not globals().get("__PYODIDE_RUNNER__"):
    main()
