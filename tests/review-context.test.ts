import { it, expect } from "vitest";
import { readFile, mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { spawnSync } from "node:child_process";
import { compile } from "../src/contract/compile.js";
import { reviewReport as review } from "../src/application/commands/review.js";
import { contextReport as context } from "../src/application/commands/context.js";
import { contextKinds } from "../src/features/context/index.js";
import { run } from "../src/cli.js";
import type { Contract } from "../src/contract/model.js";
const source = await readFile("contracts/expenses/contract.yaml", "utf8");
const base = compile(source).ir!;
function changed(edit: (c: Contract) => void) {
  const c = structuredClone(base);
  edit(c);
  const { indexes, warnings, ...contract } = c;
  const result = compile(stringify(contract));
  expect(result.ir).toBeDefined();
  return result.ir!;
}
it("review ignores collection ordering including nested definitions", () => {
  const after = changed((c) => {
    c.entities.reverse().forEach((e) => e.fields.reverse());
    c.commands.reverse().forEach((v) => { v.preconditions.reverse(); v.effects.reverse(); });
    c.stateMachines.reverse().forEach((m) => { m.states.reverse(); m.transitions.reverse(); });
    c.rules.reverse(); c.relationships.reverse();
  });
  expect(review(base, after)).toBe(review(base, base));
});
it("Rule prose change reports exact property and only catalog impact", () => {
  const result = review(base, changed((c) => { c.rules.find((r) => r.id === "EXP-001")!.description = "Changed | <script>"; }));
  expect(result).toContain("rules&#91;EXP-001&#93;.description");
  expect(result).toContain("Changed &#124; &lt;script&gt;");
  expect(result).toContain("- catalog.md");
  expect(result).not.toContain("- state.mmd");
  expect(result).not.toContain("- class.mmd");
  expect(result).not.toContain("- model.mmd");
});
it("review preserves relationship direction and reports multiplicity without semantic inference", () => {
  const result = review(base, changed((c) => { c.relationships.find((r) => r.id === "ExpensePayment")!.targetsPerSource.max = "many"; }));
  expect(result).toContain("relationships&#91;ExpensePayment&#93;.targetsPerSource.max");
  expect(result).not.toContain("sourcesPerTarget.max");
  expect(result).toContain("- model.mmd");
  expect(result).toContain("- class.mmd");
  expect(result).not.toContain("- state.mmd");
});
it("review tracks field additions/removals, transitions, effects and warning changes", () => {
  const after = changed((c) => {
    c.entities.find((e) => e.id === "User")!.fields.push({ id: "extra", type: "boolean", required: false });
    c.commands.find((v) => v.id === "ApproveExpense")!.effects = [];
    c.stateMachines[0]!.transitions.push({ id: "Resubmit", from: "rejected", to: "submitted", command: "SubmitExpense" });
    c.stateMachines[0]!.states.push("isolated");
  });
  const forward = review(base, after), backward = review(after, base);
  expect(forward).toContain("fields&#91;extra&#93;.required");
  expect(forward).toContain("effects&#91;ApprovalNotice&#93;.description");
  expect(forward).toContain("transitions&#91;Resubmit&#93;.from");
  expect(forward).toContain("STATE_UNREACHABLE / ExpenseLifecycle");
  expect(backward).toContain("fields&#91;extra&#93;.required");
});
it("context distinguishes namespaces and includes a reference-complete reading slice", () => {
  const result = context(base, "relationship", "ExpensePayment")!;
  expect(result).toContain("Expense → Payment");
  expect(result).toContain("EXP-004");
  expect(result).toContain("EXP-003");
  expect(result).toContain("ApprovalNotice");
  expect(result).toContain("initial: draft");
  expect(context(base, "entity", "ExpensePayment")).toBeUndefined();
  for (const [kind, id] of [["entity", "Expense"], ["relationship", "ExpensePayment"], ["machine", "ExpenseLifecycle"], ["command", "ApproveExpense"], ["rule", "EXP-004"], ["constraint", "PaymentReceiptUnique"]] as const) {
    expect(context(base, kind, id)).toContain(`Root: ${kind} ${id}`);
  }
});
it("context does not traverse unrelated inbound references and retains full model warnings", () => {
  const ir = changed((c) => {
    c.entities.push({ id: "Other", name: "Other", fields: [] });
    c.commands.push({ id: "Unrelated", name: "Unrelated", target: "User", preconditions: [], postconditions: [], effects: [] });
    c.rules.push({ id: "Unused", kind: "precondition", description: "Unused prose", scope: { kind: "entity", id: "Other" } });
  });
  const result = context(ir, "entity", "Expense")!;
  expect(result).not.toContain("### Unrelated");
  expect(result).not.toContain("### Other");
  expect(result).toContain("RULE_UNUSED / Unused");
  expect(context(ir, "entity", "Other")).toContain("Unused prose");
});
it("context is deterministic and escapes Markdown prose", () => {
  const ir = changed((c) => { c.metadata.name = "[unsafe](url) <script>"; c.rules.reverse(); });
  expect(context(ir, "command", "ApproveExpense")).toContain("&#91;unsafe&#93;(url) &lt;script&gt;");
  expect(context(base, "command", "ApproveExpense")).toBe(context(changed((c) => c.entities.reverse()), "command", "ApproveExpense"));
});
it("review/context CLI require dedicated arguments, validate both inputs and never write files", async () => {
  const root = await mkdtemp(join(tmpdir(), "cca-review-"));
  try {
    const input = join(root, "after.yaml"), before = join(root, "before.yaml");
    await writeFile(input, source); await writeFile(before, source);
    expect((await run(["review", "--input", input, "--before", before])).report).toContain("No structural changes");
    expect((await run(["context", "--input", input, "--kind", "rule", "--id", "EXP-002"])).report).toContain("EXP-002");
    expect((await run(["context", "--input", input, "--kind", "rule", "--id", "Absent"])).diagnostics.at(-1)?.code).toBe("REF_NOT_FOUND");
    for (const args of [["review", "--input", input], ["context", "--input", input, "--id", "Expense"], ["validate", "--input", input, "--before", before], ["review", "--input", input, "--before", before, "--out", root]]) expect((await run(args)).exitCode).toBe(3);
    await writeFile(before, "bad: input");
    expect((await run(["review", "--input", input, "--before", before])).exitCode).toBe(1);
    await writeFile(before, source);
    const warning = changed((c) => { c.stateMachines[0]!.states.push("isolated"); });
    const { indexes, warnings, ...contract } = warning;
    await writeFile(before, stringify(contract));
    expect((await run(["review", "--input", input, "--before", before, "--warnings-as-errors"])).exitCode).toBe(1);
    await writeFile(input, stringify(contract));
    expect((await run(["context", "--input", input, "--kind", "entity", "--id", "Expense", "--warnings-as-errors"])).exitCode).toBe(1);
    expect((await readdir(root)).sort()).toEqual(["after.yaml", "before.yaml"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
it("new CLI JSON returns diagnostics and a Markdown report, never IR", () => {
  for (const args of [["review", "--before", "contracts/expenses/contract.yaml"], ["context", "--kind", "entity", "--id", "Expense"]]) {
    const child = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args, "--input", "contracts/expenses/contract.yaml", "--format", "json"], { encoding: "utf8" });
    expect(child.status).toBe(0);
    const result = JSON.parse(child.stdout);
    expect(Object.keys(result).sort()).toEqual(["diagnostics", "report"]);
    expect(result.diagnostics).toEqual([]);
    expect(typeof result.report).toBe("string");
  }
  expect(contextKinds).toHaveLength(6);
});
