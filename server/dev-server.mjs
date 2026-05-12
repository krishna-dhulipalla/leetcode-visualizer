import express from "express";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const runnerPath = path.join(__dirname, "python_trace_runner.py");
const distPath = path.join(root, "dist");
const indexPath = path.join(distPath, "index.html");
const port = Number(process.env.PORT || 5173);

const app = express();
app.use(express.json({ limit: "2mb" }));

function runPythonTrace(payload) {
  return new Promise((resolve, reject) => {
    const candidates = process.env.PYTHON
      ? [[process.env.PYTHON, []]]
      : process.platform === "win32"
        ? [["python", []], ["py", ["-3"]]]
        : [["python3", []], ["python", []]];

    let lastError = null;

    const tryNext = (index) => {
      if (index >= candidates.length) {
        reject(lastError || new Error("Python executable was not found."));
        return;
      }

      const [command, prefixArgs] = candidates[index];
      const child = spawn(command, [...prefixArgs, runnerPath], {
        cwd: root,
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill();
          reject(new Error("Trace timed out after 4 seconds."));
        }
      }, 4000);

      child.on("error", (error) => {
        clearTimeout(timeout);
        lastError = error;
        if (!settled) {
          settled = true;
          tryNext(index + 1);
        }
      });

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (settled) return;
        settled = true;

        if (code !== 0) {
          reject(new Error(stderr || `Python runner exited with code ${code}.`));
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(new Error(`Trace runner returned invalid JSON. ${error.message}`));
        }
      });

      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    };

    tryNext(0);
  });
}

app.post("/api/trace", async (req, res) => {
  try {
    const result = await runPythonTrace(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Trace failed."
    });
  }
});

if (!fs.existsSync(indexPath)) {
  console.warn("dist/index.html was not found. Run `npm run build` before `npm run start`.");
}

app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.method !== "GET") {
    next();
    return;
  }

  res.sendFile(indexPath);
});

app.listen(port, () => {
  console.log(`LeetCode Solution Visualizer running at http://localhost:${port}`);
});
