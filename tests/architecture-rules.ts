import ts from "typescript";
import { dirname, relative, resolve } from "node:path";
import { builtinModules } from "node:module";

export interface Dependency { specifier: string | undefined; typeOnly: boolean }
export function dependencies(file: string, text: string): Dependency[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const result: Dependency[] = [];
  const literal = (node: ts.Node | undefined) => node && ts.isStringLiteralLike(node) ? node.text : undefined;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings;
      const typeOnly = !!node.importClause?.isTypeOnly || (!node.importClause?.name && !!bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((e) => e.isTypeOnly));
      result.push({ specifier: literal(node.moduleSpecifier), typeOnly });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const typeOnly = node.isTypeOnly || (!!node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every((e) => e.isTypeOnly));
      result.push({ specifier: literal(node.moduleSpecifier), typeOnly });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      result.push({ specifier: literal(node.argument.literal), typeOnly: true });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      result.push({ specifier: literal(node.moduleReference.expression), typeOnly: node.isTypeOnly });
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      result.push({ specifier: literal(node.arguments[0]), typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

const root = resolve(".");
export function localTarget(file: string, specifier: string): string {
  return relative(root, resolve(dirname(resolve(file)), specifier)).replaceAll("\\", "/").replace(/\.js$/, ".ts");
}
function layer(file: string): string {
  if (file === "src/cli.ts" || file.startsWith("src/cli/") || file === "scripts/local-db.ts") return "cli";
  return file.startsWith("src/") ? file.split("/")[1]! : "unknown";
}
const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
const allowed: Record<string, readonly string[]> = {
  support: ["support"],
  contract: ["contract", "support"],
  features: ["features", "contract", "support"],
  presentation: ["presentation", "contract", "features", "support"],
  application: ["application", "contract", "features", "presentation", "support"],
  adapters: ["adapters", "application", "contract", "features", "support"],
  cli: ["cli", "application", "adapters", "support"],
};
export function violations(file: string, text: string): string[] {
  const from = layer(file), errors: string[] = [];
  if (!allowed[from]) return [`Unclassified module: ${file}`];
  for (const { specifier, typeOnly } of dependencies(file, text)) {
    if (!specifier) { errors.push(`${file}: dependency must use a literal path`); continue; }
    if (!specifier.startsWith(".")) {
      const builtin = specifier.startsWith("node:") || builtins.has(specifier);
      const externalAllowed = ["adapters", "cli"].includes(from)
        || (specifier === "zod" && (file.endsWith("/schema.ts") || file === "src/support/input/parse.ts"))
        || (specifier === "yaml" && ["src/support/input/parse.ts", "src/application/commands/live-database.ts"].includes(file));
      if (!externalAllowed || (builtin && !["adapters", "cli"].includes(from))) errors.push(`${file} → ${specifier}: external dependency is outside this boundary`);
      continue;
    }
    const target = localTarget(file, specifier), to = layer(target);
    if (!allowed[from]!.includes(to)) errors.push(`${file} → ${target}: ${from} cannot depend on ${to}`);
    if (from === "features" && to === "features" && file.split("/")[2] !== target.split("/")[2]) errors.push(`${file} → ${target}: features cannot depend on another feature`);
    if (from === "adapters" && ["application", "contract", "features"].includes(to)) {
      if (!typeOnly || (to === "application" && target !== "src/application/ports.ts")) errors.push(`${file} → ${target}: adapter may depend only on port/model types`);
    }
    if (from === "features" && to === "contract" && !typeOnly && target !== "src/contract/multiplicity.ts") errors.push(`${file} → ${target}: feature may use Contract model types and multiplicity only`);
    if (from === "presentation" && to === "features" && !typeOnly) errors.push(`${file} → ${target}: presentation consumes feature result types`);
  }
  return errors;
}
