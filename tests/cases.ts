import type { Contract } from "../src/contract/model.js";
export interface Case {
  name: string;
  code: string;
  path: (string | number)[];
  change: (c: Contract) => void;
}
export const cases: Case[] = [
  {
    name: "duplicate-entity",
    code: "ID_DUPLICATE",
    path: ["entities", 1, "id"],
    change: (c) => {
      c.entities[1]!.id = "User";
    },
  },
  {
    name: "duplicate-field",
    code: "ID_DUPLICATE",
    path: ["entities", 0, "fields", 1, "id"],
    change: (c) => {
      c.entities[0]!.fields[1]!.id = "id";
    },
  },
  {
    name: "undefined-entity",
    code: "REF_NOT_FOUND",
    path: ["relationships", 0, "from"],
    change: (c) => {
      c.relationships[0]!.from = "Missing";
    },
  },
  {
    name: "undefined-rule",
    code: "REF_NOT_FOUND",
    path: ["commands", 1, "preconditions", 0],
    change: (c) => {
      c.commands[1]!.preconditions[0] = "Missing";
    },
  },
  {
    name: "undefined-command",
    code: "REF_NOT_FOUND",
    path: ["stateMachines", 0, "transitions", 0, "command"],
    change: (c) => {
      c.stateMachines[0]!.transitions[0]!.command = "Missing";
    },
  },
  {
    name: "undefined-machine",
    code: "REF_NOT_FOUND",
    path: ["entities", 1, "fields", 2, "machine"],
    change: (c) => {
      const f = c.entities[1]!.fields[2]!;
      if (f.type === "state") f.machine = "Missing";
    },
  },
  {
    name: "missing-machine-field",
    code: "FIELD_NOT_FOUND",
    path: ["stateMachines", 0, "field"],
    change: (c) => {
      c.stateMachines[0]!.field = "missing";
    },
  },
  ...(["initial", "from", "to"] as const).map((side) => ({
    name: `invalid-state-${side}`,
    code: "STATE_INVALID",
    path:
      side === "initial"
        ? ["stateMachines", 0, "initial"]
        : ["stateMachines", 0, "transitions", 0, side],
    change: (c: Contract) => {
      if (side === "initial") c.stateMachines[0]!.initial = "missing";
      else c.stateMachines[0]!.transitions[0]![side] = "missing";
    },
  })),
  {
    name: "duplicate-state",
    code: "STATE_INVALID",
    path: ["stateMachines", 0, "states", 5],
    change: (c) => {
      c.stateMachines[0]!.states.push("draft");
    },
  },
  {
    name: "invalid-multiplicity",
    code: "SCHEMA_INVALID",
    path: ["relationships", 0, "targetsPerSource", "min"],
    change: (c) => {
      (c.relationships[0]!.targetsPerSource as unknown as { min: number }).min =
        2;
    },
  },
  {
    name: "invalid-type",
    code: "SCHEMA_INVALID",
    path: ["entities", 0, "fields", 0, "type"],
    change: (c) => {
      (c.entities[0]!.fields[0]! as unknown as { type: string }).type =
        "object";
    },
  },
  {
    name: "unknown-key",
    code: "SCHEMA_INVALID",
    path: ["entities", 0, "extra"],
    change: (c) => {
      Object.assign(c.entities[0]!, { extra: true });
    },
  },
  {
    name: "unsupported-version",
    code: "VERSION_UNSUPPORTED",
    path: ["apiVersion"],
    change: (c) => {
      (c as unknown as { apiVersion: string }).apiVersion = "cca.dev/v2";
    },
  },
  {
    name: "machine-binding",
    code: "MACHINE_BINDING_INVALID",
    path: ["stateMachines", 0, "field"],
    change: (c) => {
      c.stateMachines[0]!.field = "amountJpy";
    },
  },
  {
    name: "state-optional",
    code: "MACHINE_BINDING_INVALID",
    path: ["entities", 1, "fields", 2, "machine"],
    change: (c) => {
      c.entities[1]!.fields[2]!.required = false;
    },
  },
  {
    name: "ambiguous-transition",
    code: "TRANSITION_AMBIGUOUS",
    path: ["stateMachines", 0, "transitions", 4, "command"],
    change: (c) => {
      c.stateMachines[0]!.transitions.push({
        id: "Other",
        from: "draft",
        to: "paid",
        command: "SubmitExpense",
      });
    },
  },
  {
    name: "command-target",
    code: "COMMAND_TARGET_MISMATCH",
    path: ["stateMachines", 0, "transitions", 0, "command"],
    change: (c) => {
      c.commands[0]!.target = "User";
    },
  },
  {
    name: "rule-kind",
    code: "RULE_KIND_MISMATCH",
    path: ["commands", 1, "preconditions", 0],
    change: (c) => {
      c.commands[1]!.preconditions[0] = "EXP-003";
    },
  },
  {
    name: "rule-scope",
    code: "RULE_SCOPE_MISMATCH",
    path: ["commands", 1, "preconditions", 0],
    change: (c) => {
      c.rules[0]!.scope.id = "User";
    },
  },
  {
    name: "unique-optional",
    code: "CONSTRAINT_INVALID",
    path: ["constraints", 0, "fields", 0],
    change: (c) => {
      c.entities[2]!.fields[1]!.required = false;
    },
  },
  {
    name: "unique-state",
    code: "CONSTRAINT_INVALID",
    path: ["constraints", 0, "fields", 0],
    change: (c) => {
      c.constraints[0]!.entity = "Expense";
      c.constraints[0]!.fields = ["status"];
    },
  },
  {
    name: "unique-duplicate",
    code: "CONSTRAINT_INVALID",
    path: ["constraints", 0, "fields", 1],
    change: (c) => {
      c.constraints[0]!.fields.push("receiptNumber");
    },
  },
  {
    name: "unique-missing-field",
    code: "FIELD_NOT_FOUND",
    path: ["constraints", 0, "fields", 0],
    change: (c) => {
      c.constraints[0]!.fields = ["missing"];
    },
  },
];
