import ts from 'typescript';
import type { AssetData } from '@protomake/assets';
import type { ScriptField, ScriptFields } from './component';
export interface CompiledScript {
  id: string;
  path: string;
  code: string;
  fields: ScriptFields;
  dependencies: string[];
}
function literal(node: ts.Expression): unknown {
  if (
    ts.isAsExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    return literal(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  )
    return -Number(node.operand.text);
  if (ts.isObjectLiteralExpression(node)) {
    const values: Record<string, unknown> = {};
    for (const property of node.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      )
        throw new Error('Script fields require literal named properties');
      if (
        ['__proto__', 'constructor', 'prototype'].includes(property.name.text)
      )
        throw new Error('Reserved property name');
      values[property.name.text] = literal(property.initializer);
    }
    return values;
  }
  throw new Error('Script fields must use static literal metadata');
}
export function scriptFields(source: string, path = 'Script.ts'): ScriptFields {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  let metadata: unknown = {};
  for (const statement of file.statements)
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    )
      for (const declaration of statement.declarationList.declarations)
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'fields' &&
          declaration.initializer
        )
          metadata = literal(declaration.initializer);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    throw new Error(`${path}: fields must be an object`);
  const result: ScriptFields = {};
  for (const [name, value] of Object.entries(metadata)) {
    if (
      [
        'awake',
        'start',
        'update',
        'fixedUpdate',
        'lateUpdate',
        'onEnable',
        'onDisable',
        'onDestroy',
        'onCollisionEnter',
        'onCollisionExit',
        'onTriggerEnter',
        'onTriggerExit',
        'constructor',
        '__proto__',
        'prototype',
      ].includes(name)
    )
      throw new Error(`${path}: reserved field ${name}`);
    if (
      !value ||
      typeof value !== 'object' ||
      !('type' in value) ||
      !('default' in value) ||
      !['number', 'boolean', 'string', 'color', 'entity', 'asset'].includes(
        String(value.type),
      )
    )
      throw new Error(`${path}: invalid field ${name}`);
    const field = value as ScriptField;
    validateField(name, field, field.default);
    result[name] = field;
  }
  return result;
}
export function validateField(
  name: string,
  field: ScriptField,
  value: unknown,
): void {
  const expected =
    field.type === 'number'
      ? 'number'
      : field.type === 'boolean'
        ? 'boolean'
        : 'string';
  if (
    typeof value !== expected ||
    (typeof value === 'number' && !Number.isFinite(value)) ||
    (field.type === 'color' && !/^#[0-9a-fA-F]{6}$/.test(String(value)))
  )
    throw new Error(`Script property ${name}: expected ${field.type}`);
}
export function compileScript(
  source: string,
  path = 'Script.ts',
): Omit<CompiledScript, 'id'> {
  const result = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      strict: true,
      isolatedModules: true,
      sourceMap: false,
    },
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(
    (d) => d.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length)
    throw new Error(
      errors
        .map((d) => {
          const position =
            d.file && d.start !== undefined
              ? d.file.getLineAndCharacterOfPosition(d.start)
              : undefined;
          return `${path}${position ? `:${position.line + 1}:${position.character + 1}` : ''}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`;
        })
        .join('\n'),
    );
  const dependencies: string[] = [];
  const file = ts.createSourceFile(
    path,
    result.outputText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.JS,
  );
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith('./') && !specifier.startsWith('../'))
        throw new Error(
          `${path}: runtime imports must refer to another project file; use import type for ProtoMake API types`,
        );
      dependencies.push(specifier);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          ['require', 'eval', 'Function'].includes(node.expression.text)))
    )
      throw new Error(
        `${path}: dynamic imports, require and eval are not supported`,
      );
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Function'
    )
      throw new Error(`${path}: dynamic code evaluation is not supported`);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return {
    path,
    code: result.outputText,
    fields: scriptFields(source, path),
    dependencies,
  };
}
function resolvePath(from: string, relative: string): string {
  const parts = from.split('/');
  parts.pop();
  for (const part of relative.split('/')) {
    if (part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error('Script import escapes the project');
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/').replace(/\.js$/, '.ts');
}
export function compileProjectScripts(
  assets: readonly AssetData[],
): CompiledScript[] {
  const scripts = assets.filter((a) => a.mime === 'text/typescript'),
    compiled = scripts.map((asset) => ({
      id: asset.id,
      ...compileScript(asset.data, asset.path),
    })),
    byPath = new Map(compiled.map((s) => [s.path, s]));
  const visiting = new Set<string>(),
    done = new Set<string>();
  function walk(script: CompiledScript): void {
    if (visiting.has(script.id))
      throw new Error(`Cyclic script imports at ${script.path}`);
    if (done.has(script.id)) return;
    visiting.add(script.id);
    for (const relative of script.dependencies) {
      const path = resolvePath(script.path, relative),
        dependency = byPath.get(path) ?? byPath.get(path + '.ts');
      if (!dependency)
        throw new Error(`${script.path}: missing imported script ${relative}`);
      walk(dependency);
    }
    visiting.delete(script.id);
    done.add(script.id);
  }
  for (const script of compiled) walk(script);
  return compiled;
}
export function moduleSources(
  compiled: readonly CompiledScript[],
  createURL: (code: string) => string,
): Map<string, string> {
  const urls = new Map<string, string>(),
    byPath = new Map(compiled.map((s) => [s.path, s]));
  function link(script: CompiledScript): string {
    const existing = urls.get(script.id);
    if (existing) return existing;
    const file = ts.createSourceFile(
      script.path,
      script.code,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.JS,
    );
    const replacements: { start: number; end: number; url: string }[] = [];
    for (const statement of file.statements)
      if (
        (ts.isImportDeclaration(statement) ||
          ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const path = resolvePath(script.path, statement.moduleSpecifier.text),
          dependency = byPath.get(path) ?? byPath.get(path + '.ts');
        if (!dependency) throw new Error(`Missing script ${path}`);
        replacements.push({
          start: statement.moduleSpecifier.getStart(file),
          end: statement.moduleSpecifier.end,
          url: link(dependency),
        });
      }
    let code = script.code;
    for (const r of replacements.reverse())
      code = code.slice(0, r.start) + JSON.stringify(r.url) + code.slice(r.end);
    const url = createURL(code);
    urls.set(script.id, url);
    return url;
  }
  for (const script of compiled) link(script);
  return urls;
}
