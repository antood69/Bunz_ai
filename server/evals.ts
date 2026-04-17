/**
 * Evaluation Pipelines — regression testing for AI workflows.
 * Define test cases with input prompts and expected output criteria.
 * Run suites to verify workflows still produce correct results.
 */

import { v4 as uuidv4 } from "uuid";
import { Router, type Request, type Response } from "express";
import { dbRun, dbAll, dbGet } from "./lib/db";
import { modelRouter } from "./ai";

interface TestCase {
  id: string;
  name: string;
  input: string;
  expectedOutput?: string;
  assertions: string[]; // natural language: "must mention pricing", "should be under 500 words"
}

interface TestResult {
  caseId: string;
  status: "pass" | "fail";
  output: string;
  assertionResults: Array<{ assertion: string; pass: boolean; reason: string }>;
  durationMs: number;
  tokens: number;
}

/** Run an evaluation suite */
async function runEvalSuite(suiteId: string): Promise<{ status: string; results: TestResult[] }> {
  const suite = await dbGet("SELECT * FROM eval_suites WHERE id = ?", suiteId) as any;
  if (!suite) throw new Error("Suite not found");

  const testCases: TestCase[] = JSON.parse(suite.test_cases || "[]");
  const results: TestResult[] = [];
  let allPass = true;

  for (const tc of testCases) {
    const start = Date.now();
    try {
      // Run the input through the AI
      const output = await modelRouter.chat({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: tc.input }],
        systemPrompt: "Respond to the request. Be thorough and accurate.",
      });

      // Evaluate assertions using AI judge
      const assertionResults: Array<{ assertion: string; pass: boolean; reason: string }> = [];

      if (tc.assertions.length > 0) {
        const judgeResult = await modelRouter.chat({
          model: "gpt-5.4-mini",
          messages: [{
            role: "user",
            content: `Evaluate whether this AI output passes each assertion. Return ONLY a JSON array.

OUTPUT:
${output.content.slice(0, 2000)}

ASSERTIONS:
${tc.assertions.map((a, i) => `${i + 1}. ${a}`).join("\n")}

${tc.expectedOutput ? `EXPECTED OUTPUT (for reference):\n${tc.expectedOutput.slice(0, 500)}` : ""}

Return ONLY a JSON array:
[{"assertion": "...", "pass": true/false, "reason": "brief explanation"}]`,
          }],
          systemPrompt: "You are a strict test evaluator. Judge each assertion against the output honestly.",
        });

        const jsonMatch = judgeResult.content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          for (const r of parsed) {
            assertionResults.push({ assertion: r.assertion, pass: !!r.pass, reason: r.reason || "" });
          }
        }
      }

      const casePass = assertionResults.length === 0 || assertionResults.every(r => r.pass);
      if (!casePass) allPass = false;

      results.push({
        caseId: tc.id,
        status: casePass ? "pass" : "fail",
        output: output.content.slice(0, 1000),
        assertionResults,
        durationMs: Date.now() - start,
        tokens: output.usage.totalTokens,
      });
    } catch (err: any) {
      allPass = false;
      results.push({
        caseId: tc.id, status: "fail",
        output: `Error: ${err.message}`,
        assertionResults: [], durationMs: Date.now() - start, tokens: 0,
      });
    }
  }

  const status = allPass ? "pass" : results.some(r => r.status === "pass") ? "partial" : "fail";

  await dbRun(
    "UPDATE eval_suites SET last_run_at = ?, last_run_status = ?, last_run_results = ?, updated_at = ? WHERE id = ?",
    Date.now(), status, JSON.stringify(results), Date.now(), suiteId,
  );

  return { status, results };
}

export function createEvalsRouter() {
  const router = Router();

  // List suites
  router.get("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    res.json(await dbAll("SELECT * FROM eval_suites WHERE user_id = ? ORDER BY updated_at DESC", userId));
  });

  // Get suite
  router.get("/:id", async (req: Request, res: Response) => {
    const suite = await dbGet("SELECT * FROM eval_suites WHERE id = ?", req.params.id);
    if (!suite) return res.status(404).json({ error: "Not found" });
    res.json(suite);
  });

  // Create suite
  router.post("/", async (req: Request, res: Response) => {
    const userId = req.user?.id || 1;
    const { name, description, pipelineId, testCases = [] } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });

    const id = uuidv4();
    const now = Date.now();
    await dbRun(
      "INSERT INTO eval_suites (id, user_id, name, description, pipeline_id, test_cases, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id, userId, name, description || null, pipelineId || null, JSON.stringify(testCases), now, now,
    );

    res.json({ id });
  });

  // Update suite
  router.put("/:id", async (req: Request, res: Response) => {
    const { name, description, testCases } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (name) { updates.push("name = ?"); params.push(name); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (testCases) { updates.push("test_cases = ?"); params.push(JSON.stringify(testCases)); }

    updates.push("updated_at = ?"); params.push(Date.now());
    params.push(req.params.id);

    await dbRun(`UPDATE eval_suites SET ${updates.join(", ")} WHERE id = ?`, ...params);
    res.json({ ok: true });
  });

  // Run suite
  router.post("/:id/run", async (req: Request, res: Response) => {
    try {
      const result = await runEvalSuite(req.params.id as string);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete suite
  router.delete("/:id", async (req: Request, res: Response) => {
    await dbRun("DELETE FROM eval_suites WHERE id = ?", req.params.id);
    res.json({ ok: true });
  });

  return router;
}
