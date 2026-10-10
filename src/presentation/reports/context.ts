import type { IR } from "../../contract/model.js";
import type { ContextSelection } from "../../features/context/index.js";
import { renderCatalog, type CatalogModel } from "../catalog.js";
import { finish } from "../markdown.js";
export function renderContext(ir: IR, selection: ContextSelection): string {
  const { kind, id, selected } = selection;
  const filtered: CatalogModel = { apiVersion: ir.apiVersion, metadata: ir.metadata, warnings: ir.warnings,
    entities: ir.entities.filter((v) => selected.entity.has(v.id)),
    relationships: ir.relationships.filter((v) => selected.relationship.has(v.id)),
    stateMachines: ir.stateMachines.filter((v) => selected.machine.has(v.id)),
    commands: ir.commands.filter((v) => selected.command.has(v.id)),
    rules: ir.rules.filter((v) => selected.rule.has(v.id)),
    constraints: ir.constraints.filter((v) => selected.constraint.has(v.id)),
  };
  return finish(["# Local Contract context", "", `Root: ${kind} ${id}`, "", "Selection: inbound references to the root, then complete outbound reference closure. Full definitions are retained; this is a reading aid, not a standalone Contract or public IR. Neighboring elements' inbound references are not expanded. Warnings below describe the full validated Contract.", "", "Rule prose declares requirements; it is not executable. Business correctness, implementation compliance and DB enforcement are not guaranteed.", "", renderCatalog(filtered)]);
}
