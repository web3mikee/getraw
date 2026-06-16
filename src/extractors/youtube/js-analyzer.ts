import { parseScript } from "meriyah";

type ESTreeNode = Record<string, unknown> & { type: string; range?: [number, number] };

const WALK_STOP = Symbol("WALK_STOP");

const JS_BUILTINS = new Set([
  "AbortController", "AbortSignal", "Array", "ArrayBuffer", "AsyncContext", "Atomics",
  "AudioContext", "BigInt", "BigInt64Array", "BigUint64Array", "Blob", "Boolean",
  "BroadcastChannel", "Buffer", "CanvasRenderingContext2D", "clearImmediate", "clearInterval",
  "clearTimeout", "confirm", "console", "Crypto", "CustomEvent", "DataView", "Date",
  "decodeURI", "decodeURIComponent", "document", "Element", "encodeURI", "encodeURIComponent",
  "Error", "escape", "eval", "Event", "EventTarget", "fetch", "File", "FileReader",
  "Float32Array", "Float64Array", "FormData", "function", "global", "globalThis",
  "hasOwnProperty", "Headers", "History", "HTMLElement", "HTMLCollection", "IDBKeyRange",
  "Infinity", "Int16Array", "Int32Array", "Int8Array", "Intl", "IntersectionObserver",
  "isFinite", "isNaN", "isPrototypeOf", "JSON", "location", "log", "Map", "Math",
  "MediaRecorder", "MediaSource", "MediaStream", "MemberExpression", "MutationObserver",
  "NaN", "navigator", "Node", "NodeList", "Number", "Object", "OfflineAudioContext",
  "parse", "parseFloat", "parseInt", "Performance", "process", "Promise", "prompt",
  "prototype", "Proxy", "ReadableStream", "Reflect", "RegExp", "requestAnimationFrame",
  "requestIdleCallback", "Request", "Response", "ResizeObserver", "Screen", "setImmediate",
  "setInterval", "setTimeout", "SharedArrayBuffer", "SharedWorker", "SourceBuffer", "split",
  "String", "stringify", "structuredClone", "SubtleCrypto", "Symbol", "TextDecoder",
  "TextEncoder", "this", "toString", "TransformStream", "Uint16Array", "Uint32Array",
  "Uint8Array", "Uint8ClampedArray", "undefined", "unescape", "URL", "URLSearchParams",
  "valueOf", "WeakMap", "WeakSet", "WebAssembly", "WebGLRenderingContext", "window",
  "Worker", "WritableStream", "XMLHttpRequest", "alert", "arguments", "atob", "btoa",
  "cancelAnimationFrame", "cancelIdleCallback", "queueMicrotask", "self",
]);

const INDENT = "  ";

interface ExtractionConfig {
  friendlyName: string;
  match: (node: ESTreeNode) => ESTreeNode | false;
  collectDependencies?: boolean;
  stopWhenReady?: boolean;
}

interface VariableMetadata {
  name: string;
  node: ESTreeNode;
  dependents: Set<string>;
  dependencies: Set<string>;
  predeclared: boolean;
  prototypeAliases: Map<string, Set<VariableMetadata>>;
}

interface ExtractionState {
  config: Required<Pick<ExtractionConfig, "friendlyName" | "match" | "collectDependencies" | "stopWhenReady">>;
  dependencies: Set<string>;
  dependents: Set<string>;
  ready: boolean;
  node?: ESTreeNode;
  metadata?: VariableMetadata;
  matchContext?: ESTreeNode;
}

function walkAst(
  root: ESTreeNode,
  visitor: { enter?: (node: ESTreeNode, parent: ESTreeNode | null) => unknown; leave?: (node: ESTreeNode, parent: ESTreeNode | null) => unknown } | ((node: ESTreeNode, parent: ESTreeNode | null) => unknown),
): void {
  if (!root || typeof root !== "object") return;
  const stack: Array<{ node: ESTreeNode; parent: ESTreeNode | null; exit: boolean }> = [{ node: root, parent: null, exit: false }];
  const ancestors: ESTreeNode[] = [];
  const enter = typeof visitor === "function" ? visitor : visitor.enter ?? null;
  const leave = typeof visitor === "function" ? null : visitor.leave ?? null;
  let shouldStop = false;

  while (!shouldStop && stack.length > 0) {
    const frame = stack.pop()!;
    const { node, parent, exit } = frame;
    if (exit) {
      ancestors.pop();
      if (leave && leave(node, parent) === WALK_STOP) shouldStop = true;
      continue;
    }
    if (!node || typeof node.type !== "string") continue;
    const result = enter ? enter(node, parent) : undefined;
    if (result === WALK_STOP) { shouldStop = true; continue; }
    if (result === true) continue;
    stack.push({ node, parent, exit: true });
    ancestors.push(node);
    for (const key in node) {
      if (key === "loc" || key === "range" || key === "start" || key === "end") continue;
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
      const value = node[key];
      if (!value) continue;
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) {
          const item = value[i] as ESTreeNode;
          if (item && typeof item.type === "string") {
            stack.push({ node: item, parent: node, exit: false });
          }
        }
      } else if (typeof value === "object" && typeof (value as ESTreeNode).type === "string") {
        stack.push({ node: value as ESTreeNode, parent: node, exit: false });
      }
    }
  }
}

function extractNodeSource(node: ESTreeNode, source: string): string | null {
  const range = node.range;
  return range ? source.slice(range[0], range[1]) : null;
}

function memberToString(expr: ESTreeNode, source: string): string | null {
  if (expr.type !== "MemberExpression") return null;
  const segments: string[] = [];
  let cur: ESTreeNode | null = expr;
  while (cur && cur.type === "MemberExpression") {
    const prop = cur.property as ESTreeNode;
    if (!prop) return null;
    if (cur.computed) {
      const propSource = extractNodeSource(prop, source);
      if (!propSource) return null;
      segments.unshift(`[${propSource.trim()}]`);
    } else {
      if (prop.type !== "Identifier") return null;
      segments.unshift(`.${prop.name as string}`);
    }
    cur = cur.object as ESTreeNode;
  }
  let base: string | null = null;
  if (cur?.type === "Identifier") base = cur.name as string;
  else if (cur?.type === "ThisExpression") base = "this";
  return base ? base + segments.join("") : null;
}

function memberBaseName(expr: ESTreeNode, source: string): string | null {
  let target = (expr as Record<string, ESTreeNode>).object;
  while (target && target.type === "MemberExpression") {
    const parentName = memberToString(target, source);
    if (parentName) return parentName;
    target = target.object as ESTreeNode;
  }
  if (target?.type === "Identifier") return target.name as string;
  if (target?.type === "ThisExpression") return "this";
  return null;
}

function nsigMatcher(node: ESTreeNode): ESTreeNode | false {
  if (node.type !== "VariableDeclarator") return false;
  const init = node.init as ESTreeNode | null;
  if (!init || init.type !== "FunctionExpression") return false;
  const params = init.params as ESTreeNode[];
  if (params.length < 3) return false;
  const [url, sigName, sigValue] = params;
  if (url.type !== "Identifier" || sigName.type !== "AssignmentPattern" || sigValue.type !== "AssignmentPattern") return false;
  const body = init.body as ESTreeNode;
  const blockBody = (body?.body ?? []) as ESTreeNode[];
  let hasUrlCtor = false;
  let hasSetAlr = false;
  for (const statement of blockBody) {
    if (statement.type !== "ExpressionStatement") continue;
    const expr = statement.expression as ESTreeNode;
    if (expr.type === "AssignmentExpression" && expr.operator === "=" &&
      (expr.left as ESTreeNode).type === "Identifier" && (expr.left as ESTreeNode).name === (url.name as string)) {
      const right = expr.right as ESTreeNode;
      if (right.type === "NewExpression" && (right.callee as ESTreeNode).type === "MemberExpression") hasUrlCtor = true;
    }
    if (expr.type === "CallExpression" && (expr.callee as ESTreeNode).type === "MemberExpression") {
      const args = expr.arguments as ESTreeNode[];
      if (args.length === 2 && args[0].type === "Literal" && args[0].value === "alr" &&
        args[1].type === "Literal" && args[1].value === "yes") hasSetAlr = true;
    }
  }
  if (!hasUrlCtor || !hasSetAlr) return false;
  return node;
}

function timestampMatcher(node: ESTreeNode): ESTreeNode | false {
  if (node.type !== "VariableDeclarator" || (node.init as ESTreeNode | null)?.type !== "FunctionExpression") return false;
  const funcBody = (node.init as ESTreeNode).body as ESTreeNode;
  if (!funcBody) return false;
  let foundObject: ESTreeNode | null = null;
  walkAst(funcBody, (innerNode: ESTreeNode) => {
    if (innerNode.type === "ObjectExpression") {
      for (const prop of (innerNode.properties as ESTreeNode[])) {
        if (prop.type === "Property" && (prop.key as ESTreeNode).type === "Identifier" &&
          (prop.key as ESTreeNode).name === "signatureTimestamp") {
          foundObject = prop;
          return WALK_STOP;
        }
      }
    }
  });
  return foundObject || false;
}

class JsAnalyzer {
  source: string;
  programAst: ESTreeNode;
  hasExtractions: boolean;
  extractionStates: ExtractionState[];
  dependentsTracker = new Map<string, Set<string>>();
  pendingPrototypeAliasBinding: [string, VariableMetadata] | null = null;
  iifeParamName: string | null = null;
  declaredVariables = new Map<string, VariableMetadata>();

  constructor(code: string, options: { extractions?: ExtractionConfig[] } = {}) {
    this.source = code;
    const configs = options.extractions ?? [];
    this.extractionStates = configs.map((config) => ({
      config: { collectDependencies: true, stopWhenReady: true, ...config },
      dependencies: new Set<string>(),
      dependents: new Set<string>(),
      ready: false,
    }));
    this.hasExtractions = this.extractionStates.length > 0;
    this.programAst = parseScript(code, { ranges: true, loc: false, module: false }) as unknown as ESTreeNode;
    this.analyzeAst();
  }

  private analyzeAst(): void {
    let iifeBody: ESTreeNode | undefined;
    for (const statement of (this.programAst.body as ESTreeNode[])) {
      if (statement.type === "ExpressionStatement" && (statement.expression as ESTreeNode).type === "CallExpression") {
        const callExpr = statement.expression as ESTreeNode;
        if ((callExpr.callee as ESTreeNode).type === "FunctionExpression") {
          const funcExpr = callExpr.callee as ESTreeNode;
          const firstParam = ((funcExpr.params as ESTreeNode[]).length > 0 ? (funcExpr.params as ESTreeNode[])[0] : null);
          if (!this.iifeParamName && firstParam?.type === "Identifier") {
            this.iifeParamName = firstParam.name as string;
          }
          if ((funcExpr.body as ESTreeNode)?.type === "BlockStatement") {
            iifeBody = funcExpr.body as ESTreeNode;
            break;
          }
        }
      }
    }
    if (!iifeBody) return;

    for (const currentNode of (iifeBody.body as ESTreeNode[])) {
      switch (currentNode.type) {
        case "ExpressionStatement": {
          const assignment = currentNode.expression as ESTreeNode;
          if (assignment.type !== "AssignmentExpression") continue;
          const left = assignment.left as ESTreeNode;
          const right = assignment.right as ESTreeNode;

          if (right.type === "MemberExpression" && !right.computed &&
            (right.property as ESTreeNode).type === "Identifier" && (right.property as ESTreeNode).name === "prototype") {
            const protoSource = memberToString(right, this.source);
            const aliasTarget = left.type === "Identifier" ? left.name as string : memberToString(left, this.source);
            if (protoSource) {
              const ownerMeta = this.declaredVariables.get(protoSource.replace(".prototype", ""));
              if (aliasTarget && ownerMeta) {
                const aliasExpr = `${aliasTarget}.`;
                this.pendingPrototypeAliasBinding = [aliasExpr, ownerMeta];
                ownerMeta.prototypeAliases.set(aliasExpr, new Set());
              }
            }
          }

          if (left.type === "Identifier") {
            const existing = this.declaredVariables.get(left.name as string);
            if (!existing) continue;
            (existing.node as Record<string, unknown>).init = right;
            if (this.needsDeps(right)) existing.dependencies = this.findDependencies(right, left.name as string);
            if (this.onMatch(existing.node, existing)) return;
          } else if (left.type === "MemberExpression") {
            const memberName = memberToString(left, this.source);
            const activeAlias = this.pendingPrototypeAliasBinding?.[0];

            if (activeAlias && (memberName?.includes(activeAlias) || memberName === activeAlias.slice(0, -1))) {
              const ownerMeta = this.declaredVariables.get(this.pendingPrototypeAliasBinding?.[1].name || "");
              if (ownerMeta) {
                const existing = ownerMeta.prototypeAliases.get(activeAlias);
                const meta: VariableMetadata = {
                  name: memberName!, node: currentNode, dependents: this.dependentsTracker.get(memberName!) || new Set(),
                  predeclared: false, prototypeAliases: new Map(), dependencies: this.findDependencies(right, memberName!),
                };
                if (existing) existing.add(meta);
                else ownerMeta.prototypeAliases.set(activeAlias, new Set([meta]));
              }
            } else {
              this.pendingPrototypeAliasBinding = null;
            }

            if (!memberName || this.declaredVariables.has(memberName)) continue;
            const metadata: VariableMetadata = {
              name: memberName, node: currentNode, dependents: this.dependentsTracker.get(memberName) || new Set(),
              predeclared: false, prototypeAliases: new Map(), dependencies: this.findDependencies(right, memberName),
            };
            const baseName = memberBaseName(left, this.source);
            if (baseName && baseName !== memberName && !baseName.startsWith("this.")) {
              metadata.dependencies.add(baseName.replace(".prototype", ""));
            }
            if (this.dependentsTracker.has(memberName)) this.dependentsTracker.delete(memberName);
            this.declaredVariables.set(memberName, metadata);
            if (this.onMatch(currentNode, metadata)) return;
          }
          break;
        }
        case "VariableDeclaration": {
          this.pendingPrototypeAliasBinding = null;
          for (const decl of (currentNode.declarations as ESTreeNode[])) {
            if ((decl.id as ESTreeNode).type !== "Identifier") continue;
            const name = (decl.id as ESTreeNode).name as string;
            const metadata: VariableMetadata = {
              name, node: decl, dependents: this.dependentsTracker.get(name) || new Set(),
              prototypeAliases: new Map(), dependencies: new Set(), predeclared: false,
            };
            const init = decl.init as ESTreeNode | null;
            if (!init && currentNode.kind === "var") metadata.predeclared = true;
            else if (init && this.needsDeps(init)) metadata.dependencies = this.findDependencies(init, name);
            if (this.dependentsTracker.has(name)) this.dependentsTracker.delete(name);
            this.declaredVariables.set(name, metadata);
            if (this.onMatch(decl, metadata)) return;
          }
          break;
        }
      }
    }
  }

  private needsDeps(node: ESTreeNode): boolean {
    if (!node) return false;
    return ["FunctionExpression", "ArrowFunctionExpression", "ArrayExpression", "LogicalExpression",
      "CallExpression", "NewExpression", "MemberExpression", "BinaryExpression",
      "ConditionalExpression", "ObjectExpression", "SequenceExpression", "ClassExpression", "Identifier"].includes(node.type);
  }

  private onMatch(node: ESTreeNode, metadata: VariableMetadata): boolean {
    if (!this.hasExtractions) return false;
    let matched = false;
    for (const state of this.extractionStates) {
      if (!state.node) {
        if (node.type === "VariableDeclarator" && !(node as Record<string, unknown>).init) continue;
        const result = state.config.match(node);
        if (!result) continue;
        state.node = node;
        matched = true;
        state.metadata = metadata;
        state.dependents = metadata.dependents;
        state.dependencies = metadata.dependencies;
        if (typeof result !== "boolean") state.matchContext = result;
        this.refreshState(state);
      } else if (state.node !== node) {
        this.refreshState(state);
        if (this.shouldStop()) return true;
      }
    }
    if (!matched) return false;
    return this.shouldStop();
  }

  private refreshState(state: ExtractionState): void {
    if (!state.node) { state.ready = false; return; }
    if (state.config.collectDependencies === false) { state.ready = true; return; }
    if (!state.metadata) { state.ready = false; return; }
    state.ready = this.areDepsResolved(state.dependencies);
  }

  private shouldStop(): boolean {
    if (!this.hasExtractions) return false;
    let has = false;
    for (const state of this.extractionStates) {
      if (state.config.stopWhenReady === false) continue;
      has = true;
      if (!state.node || !state.ready) return false;
    }
    return has;
  }

  private areDepsResolved(deps: Set<string>, seen = new Set<string>()): boolean {
    for (const dep of deps) {
      if (!dep || JS_BUILTINS.has(dep) || dep === this.iifeParamName) continue;
      if (seen.has(dep)) continue;
      const meta = this.declaredVariables.get(dep);
      if (!meta) return false;
      seen.add(dep);
      if (!this.areDepsResolved(meta.dependencies, seen)) return false;
    }
    return true;
  }

  findDependencies(rootNode: ESTreeNode, identifierName: string): Set<string> {
    const dependencies = new Set<string>();
    if (!rootNode) return dependencies;
    const scopeStack: Array<{ names: Set<string>; type: string }> = [{ names: new Set(), type: "block" }];
    const currentScope = () => scopeStack[scopeStack.length - 1];
    const isInScope = (name: string) => {
      for (let i = scopeStack.length - 1; i >= 0; i--) { if (scopeStack[i].names.has(name)) return true; }
      return false;
    };
    const rootIdName = "id" in rootNode && (rootNode.id as ESTreeNode | null)?.type === "Identifier"
      ? (rootNode.id as ESTreeNode).name as string : undefined;

    const collectBindings = (pattern: ESTreeNode | null, target: Set<string>) => {
      if (!pattern) return;
      switch (pattern.type) {
        case "Identifier": target.add(pattern.name as string); break;
        case "ObjectPattern":
          for (const prop of (pattern.properties as ESTreeNode[])) {
            if (prop.type === "RestElement") collectBindings(prop.argument as ESTreeNode, target);
            else if (prop.type === "Property") collectBindings(prop.value as ESTreeNode, target);
          }
          break;
        case "ArrayPattern":
          for (const el of (pattern.elements as (ESTreeNode | null)[])) { if (el) collectBindings(el, target); }
          break;
        case "RestElement": collectBindings(pattern.argument as ESTreeNode, target); break;
        case "AssignmentPattern": collectBindings(pattern.left as ESTreeNode, target); break;
      }
    };

    const collectParams = (fn: ESTreeNode, target: Set<string>) => {
      if (!fn?.params) return;
      for (const p of fn.params as ESTreeNode[]) collectBindings(p, target);
    };

    walkAst(rootNode, {
      enter: (n: ESTreeNode, parent: ESTreeNode | null) => {
        switch (n.type) {
          case "FunctionDeclaration":
          case "FunctionExpression":
          case "ArrowFunctionExpression": {
            const fnName = "id" in n ? (n.id as ESTreeNode | null)?.name as string | undefined : undefined;
            if (n.type === "FunctionDeclaration" && fnName) currentScope().names.add(fnName);
            const fnScope = { names: new Set<string>(), type: "function" };
            if (n.type === "FunctionExpression" && fnName) fnScope.names.add(fnName);
            collectParams(n, fnScope.names);
            scopeStack.push(fnScope);
            break;
          }
          case "BlockStatement": scopeStack.push({ names: new Set(), type: "block" }); break;
          case "CatchClause": {
            const s = new Set<string>();
            if (n.param) collectBindings(n.param as ESTreeNode, s);
            scopeStack.push({ names: s, type: "block" });
            break;
          }
          case "VariableDeclaration": {
            const targetScope = (n.kind as string) === "var"
              ? (scopeStack.findLast((s) => s.type === "function") ?? currentScope())
              : currentScope();
            for (const d of n.declarations as ESTreeNode[]) collectBindings(d.id as ESTreeNode, targetScope.names);
            break;
          }
          case "ClassDeclaration": {
            if ((n.id as ESTreeNode | null)?.name) currentScope().names.add((n.id as ESTreeNode).name as string);
            break;
          }
          case "LabeledStatement": {
            if ((n.label as ESTreeNode | null)?.type === "Identifier") currentScope().names.add((n.label as ESTreeNode).name as string);
            break;
          }
          case "Identifier": {
            if ((n.name as string) === rootIdName) return;
            if (parent?.type === "Property" && parent.key === n && !parent.computed) return;
            if (parent?.type === "MethodDefinition" && parent.key === n && !parent.computed) return;
            if (parent?.type === "MemberExpression" && parent.property === n && !parent.computed) {
              if ((parent.object as ESTreeNode).type === "ThisExpression") return;
              const full = memberToString(parent, this.source);
              if (!full) return;
              const declVar = this.declaredVariables.get(full);
              if (declVar) { declVar.dependents.add(identifierName); dependencies.add(full); }
              else if ((parent.object as ESTreeNode).type === "Identifier") {
                const baseName = (parent.object as ESTreeNode).name as string;
                const declBase = this.declaredVariables.get(baseName);
                if ((declBase || baseName === this.iifeParamName) && !isInScope(baseName) && !JS_BUILTINS.has(baseName)) {
                  declBase?.dependents.add(identifierName);
                  dependencies.add(full);
                  const existing = this.dependentsTracker.get(full);
                  if (existing) existing.add(identifierName);
                  else this.dependentsTracker.set(full, new Set([identifierName]));
                }
              }
              return;
            }
            if (parent?.type === "MetaProperty") return;
            if (isInScope(n.name as string) || JS_BUILTINS.has(n.name as string)) return;
            dependencies.add(n.name as string);
            const declVar = this.declaredVariables.get(n.name as string);
            if (declVar) declVar.dependents.add(identifierName);
            else {
              const existing = this.dependentsTracker.get(n.name as string);
              if (existing) existing.add(identifierName);
              else this.dependentsTracker.set(n.name as string, new Set([identifierName]));
            }
            break;
          }
          case "ForStatement":
          case "ForInStatement":
          case "ForOfStatement":
            scopeStack.push({ names: new Set(), type: "block" }); break;
        }
      },
      leave: (n: ESTreeNode) => {
        switch (n.type) {
          case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression":
          case "BlockStatement": case "CatchClause":
          case "ForStatement": case "ForInStatement": case "ForOfStatement":
            if (scopeStack.length > 1) scopeStack.pop();
            break;
        }
      },
    });
    return dependencies;
  }

  getExtractedMatches(): ExtractionState[] {
    return this.extractionStates.filter((s) => !!s.node);
  }

  getSource(): string { return this.source; }
}

function isSafeInitializer(node: ESTreeNode | null, analyzer: JsAnalyzer, mode: "strict" | "loose" = "strict"): boolean {
  if (!node) return true;
  switch (node.type) {
    case "ClassExpression": return true;
    case "Literal": {
      const v = node.value;
      return typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null || !!node.regex;
    }
    case "TemplateLiteral":
      return (node.expressions as ESTreeNode[]).every((e) => isSafeInitializer(e, analyzer, mode));
    case "ArrayExpression":
      return (node.elements as (ESTreeNode | null)[]).every((e) => {
        if (!e) return true;
        if (e.type === "SpreadElement") return false;
        return isSafeInitializer(e, analyzer, mode);
      });
    case "ObjectExpression":
      return (node.properties as ESTreeNode[]).every((p) => {
        if (p.type !== "Property" || p.computed || p.kind !== "init") return false;
        const v = p.value as ESTreeNode;
        return v.type === "FunctionExpression" || v.type === "ArrowFunctionExpression" || v.type === "Literal";
      });
    case "CallExpression": {
      if ((node.callee as ESTreeNode).type === "Identifier" && JS_BUILTINS.has((node.callee as ESTreeNode).name as string))
        return (node.arguments as ESTreeNode[]).every((a) => a.type !== "SpreadElement" && isSafeInitializer(a, analyzer, mode));
      if ((node.callee as ESTreeNode).type === "MemberExpression") {
        if (!isSafeInitializer((node.callee as ESTreeNode).object as ESTreeNode, analyzer, mode)) return false;
        if (mode === "strict") {
          const prop = (node.callee as ESTreeNode).property as ESTreeNode;
          if ((node.callee as ESTreeNode).computed || !JS_BUILTINS.has(prop.name as string)) return false;
        }
        return (node.arguments as ESTreeNode[]).every((a) => a.type !== "SpreadElement" && isSafeInitializer(a, analyzer, mode));
      }
      return false;
    }
    case "NewExpression":
      if ((node.callee as ESTreeNode).type === "Identifier" && JS_BUILTINS.has((node.callee as ESTreeNode).name as string))
        return (node.arguments as ESTreeNode[]).every((a) => a.type !== "SpreadElement" && isSafeInitializer(a, analyzer, mode));
      if (mode === "loose") return (node.arguments as ESTreeNode[]).every((a) => a.type !== "SpreadElement" && isSafeInitializer(a, analyzer, mode));
      return false;
    case "UnaryExpression": return isSafeInitializer(node.argument as ESTreeNode, analyzer, mode);
    case "FunctionExpression": case "ArrowFunctionExpression": case "Identifier": return true;
    case "MemberExpression":
      if (mode === "loose") return isSafeInitializer(node.object as ESTreeNode, analyzer, mode);
      if (!node.computed && (node.property as ESTreeNode).type === "Identifier" && (node.property as ESTreeNode).name === "prototype") return true;
      return false;
    case "LogicalExpression": case "BinaryExpression":
      return isSafeInitializer(node.left as ESTreeNode, analyzer, mode) && isSafeInitializer(node.right as ESTreeNode, analyzer, mode);
    case "ConditionalExpression":
      if (mode === "loose") return isSafeInitializer(node.test as ESTreeNode, analyzer, mode) && isSafeInitializer(node.consequent as ESTreeNode, analyzer, mode) && isSafeInitializer(node.alternate as ESTreeNode, analyzer, mode);
      return false;
    case "AssignmentExpression":
      if ((node.left as ESTreeNode).type === "MemberExpression" && !(node.left as ESTreeNode).computed) {
        const obj = (node.left as ESTreeNode).object as ESTreeNode;
        if (obj.type === "Identifier" && analyzer.declaredVariables.get(obj.name as string)?.node.init !== undefined)
          return isSafeInitializer(node.right as ESTreeNode, analyzer, mode);
      } else if ((node.left as ESTreeNode).type === "Identifier") {
        if (analyzer.declaredVariables.has((node.left as ESTreeNode).name as string))
          return isSafeInitializer(node.right as ESTreeNode, analyzer, mode);
      }
      return false;
    default: return false;
  }
}

function getInitFallback(init: ESTreeNode | null): string {
  switch (init?.type) {
    case "ObjectExpression": case "NewExpression": case "MemberExpression": case "LogicalExpression": return "{}";
    case "ArrayExpression": return "[]";
    default: return "undefined";
  }
}

function renderNode(node: ESTreeNode, preDeclared: boolean, analyzer: JsAnalyzer, disallowSideEffects: boolean): string {
  const source = analyzer.getSource();
  const assignment = node.type === "AssignmentExpression" ? node :
    node.type === "ExpressionStatement" && (node.expression as ESTreeNode).type === "AssignmentExpression" ? node.expression as ESTreeNode : null;
  const init = assignment && assignment.operator === "=" ? assignment.right as ESTreeNode :
    node.type === "VariableDeclarator" ? node.init as ESTreeNode | null : null;
  const forceRemove = disallowSideEffects && init && !isSafeInitializer(init, analyzer);
  const fallback = getInitFallback(init);

  let initSource = fallback;
  if (!forceRemove && init) {
    if (node.type === "VariableDeclarator" && !preDeclared && init.type === "Identifier" && !analyzer.declaredVariables.has(init.name as string)) {
      initSource = fallback;
    } else {
      const left = assignment?.left as ESTreeNode | undefined;
      const isProtoAlias = init?.type === "MemberExpression" && !init.computed && (init.property as ESTreeNode).type === "Identifier" && (init.property as ESTreeNode).name === "prototype";
      if (!isProtoAlias && left?.type === "MemberExpression" && init) {
        if (disallowSideEffects && (left.object as ESTreeNode).type === "Identifier" &&
          init.type !== "FunctionExpression" && init.type !== "ArrowFunctionExpression" &&
          init.type !== "LogicalExpression" && init.type !== "ClassExpression") {
          return `${INDENT}// Skipped ${memberToString(left, source)} assignment.`;
        }
      }
      initSource = extractNodeSource(init, source)?.trim().replace(/;\s*$/, "") || "undefined";
    }
  }
  if (!forceRemove && init && init.type === "SequenceExpression" && !initSource.startsWith("(")) initSource = `(${initSource})`;

  const idName = node.type === "VariableDeclarator" && (node.id as ESTreeNode).type === "Identifier" ? (node.id as ESTreeNode).name as string :
    assignment && (assignment.left as ESTreeNode).type === "Identifier" ? (assignment.left as ESTreeNode).name as string :
      assignment?.type === "AssignmentExpression" ? memberToString(assignment.left as ESTreeNode, source)?.trim() : "unknown";

  const assignExpr = `${idName} = ${initSource};`;
  if (node.type === "VariableDeclarator" && node.init && !preDeclared) return `${INDENT}var ${assignExpr}`;
  return `${INDENT}${assignExpr}`;
}

function parseFunctionArguments(analyzer: JsAnalyzer, args: ESTreeNode[]): string[] {
  const params: string[] = [];
  for (const arg of args) {
    if (arg.type === "Identifier" && analyzer.declaredVariables.has(arg.name as string)) params.push(arg.name as string);
    else if (arg.type === "Literal" && (typeof arg.value === "string" || typeof arg.value === "number")) params.push(JSON.stringify(arg.value));
    else if (arg.type === "UnaryExpression") { const s = extractNodeSource(arg, analyzer.getSource()); if (s) params.push(s.trim()); }
    else if (arg.type === "AssignmentPattern" && (arg.left as ESTreeNode).type === "Identifier") params.push((arg.left as ESTreeNode).name as string);
    else if (arg.type === "Identifier") params.push(arg.name as string);
    else if (!params.includes("input")) params.push("input");
  }
  return params;
}

function createWrapperFunction(analyzer: JsAnalyzer, name: string, node: ESTreeNode): string | undefined {
  if (node.type === "CallExpression" && (node.callee as ESTreeNode).type === "Identifier" && analyzer.declaredVariables.has((node.callee as ESTreeNode).name as string)) {
    const target = (node.callee as ESTreeNode).name as string;
    const args = parseFunctionArguments(analyzer, node.arguments as ESTreeNode[]);
    return `${INDENT}function ${name}(${args.join(", ")}) {\n${INDENT}${INDENT}return ${target}(${args.join(", ")});\n${INDENT}}`;
  } else if (node.type === "VariableDeclarator" && (node.init as ESTreeNode | null)?.type === "FunctionExpression" && (node.id as ESTreeNode).type === "Identifier") {
    const target = (node.id as ESTreeNode).name as string;
    const args = parseFunctionArguments(analyzer, (node.init as ESTreeNode).params as ESTreeNode[]);
    return `${INDENT}function ${name}(${args.join(", ")}) {\n${INDENT}${INDENT}return ${target}(${args.join(", ")});\n${INDENT}}`;
  } else if (node.type === "NewExpression" && (node.callee as ESTreeNode).type === "MemberExpression" && ((node.callee as ESTreeNode).object as ESTreeNode).type === "Identifier") {
    const target = memberToString(node.callee as ESTreeNode, analyzer.getSource());
    if (!target) return undefined;
    const args = parseFunctionArguments(analyzer, node.arguments as ESTreeNode[]);
    return `${INDENT}function ${name}(${args.join(", ")}) {\n${INDENT}${INDENT}return new ${target}(${args.join(", ")});\n${INDENT}}`;
  }
  return undefined;
}

function buildScript(analyzer: JsAnalyzer): { output: string; exported: string[]; exportedRawValues?: Record<string, string | null> } {
  const extractions = analyzer.getExtractedMatches();
  const seen = new Set(extractions.map((e) => e.metadata?.name || ""));
  const snippets: string[] = [];
  const predeclaredVars = new Set<string>();
  const exported = new Map<string, ESTreeNode>();
  const exportedRawValues: Record<string, string | null> = {};

  const visit = (metadata: VariableMetadata | undefined, depth = 0): void => {
    if (!metadata || depth > 100) return;
    for (const dep of metadata.dependencies) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      const depMeta = analyzer.declaredVariables.get(dep);
      if (!depMeta) continue;
      const shouldPredeclare = depMeta.predeclared;
      if (shouldPredeclare && !dep.includes(".")) predeclaredVars.add(dep);
      visit(depMeta, depth + 1);
      snippets.push(renderNode(depMeta.node, shouldPredeclare, analyzer, true));
      if (depMeta.prototypeAliases.size > 0) {
        for (const [, members] of depMeta.prototypeAliases) {
          for (const member of members) { visit(member, depth); snippets.push(renderNode(member.node, shouldPredeclare, analyzer, true)); }
        }
      }
    }
  };

  for (const extraction of extractions) {
    const fname = extraction.config.friendlyName;
    const skipEmit = fname === "signatureTimestampVar";
    if (!skipEmit) snippets.push(`${INDENT}//#region --- start [${fname}] ---`);
    const shouldPredeclare = extraction.metadata?.predeclared && !skipEmit;
    if (shouldPredeclare && extraction.metadata && !extraction.metadata.name.includes(".")) {
      predeclaredVars.add(extraction.metadata.name);
    }
    if (extraction.config.collectDependencies && !skipEmit) visit(extraction.metadata);
    if (extraction.matchContext && fname) {
      exported.set(fname, extraction.matchContext);
      const ctx = extraction.matchContext;
      if (ctx.type === "Property") exportedRawValues[fname] = extractNodeSource(ctx.value as ESTreeNode, analyzer.getSource());
      else if (ctx.type === "Identifier") exportedRawValues[fname] = ctx.name as string;
      else exportedRawValues[fname] = extractNodeSource(ctx, analyzer.getSource());
    }
    if (!skipEmit) {
      if (extraction.metadata) snippets.push(renderNode(extraction.metadata.node, !!shouldPredeclare, analyzer, true));
      snippets.push(`${INDENT}//#endregion --- end [${fname}] ---\n`);
    }
  }

  const output: string[] = [];
  output.push("const __jsExtractorGlobal = typeof globalThis !== 'undefined' ? globalThis :");
  output.push(`${INDENT}typeof self !== 'undefined' ? self :`);
  output.push(`${INDENT}typeof window !== 'undefined' ? window :`);
  output.push(`${INDENT}typeof global !== 'undefined' ? global : {};\n`);
  output.push(`const exportedVars = (function(${analyzer.iifeParamName}) {`);
  output.push(`${INDENT}const window = typeof __jsExtractorGlobal.window !== 'undefined' ? __jsExtractorGlobal.window : Object.create(null);`);
  output.push(`${INDENT}const document = typeof __jsExtractorGlobal.document !== 'undefined' ? __jsExtractorGlobal.document : {};`);
  output.push(`${INDENT}const self = typeof __jsExtractorGlobal.self !== 'undefined' ? __jsExtractorGlobal.self : window;\n`);
  if (predeclaredVars.size > 0) output.push(`${INDENT}var ${Array.from(predeclaredVars).join(", ")};\n`);
  output.push(snippets.join("\n"));

  const exportedVarNames: string[] = [];
  for (const [friendlyName, node] of exported) {
    let funcNode: ESTreeNode | null = null;
    if (node.type === "Identifier") {
      const decl = analyzer.declaredVariables.get(node.name as string);
      if (decl?.node?.type === "VariableDeclarator" && (decl.node.init as ESTreeNode | null)?.type === "FunctionExpression") funcNode = decl.node;
    } else if (["CallExpression", "NewExpression", "VariableDeclarator"].includes(node.type)) funcNode = node;
    if (funcNode) {
      const wrapper = createWrapperFunction(analyzer, friendlyName, funcNode);
      if (wrapper) { output.push(`${wrapper}\n`); exportedVarNames.push(friendlyName); }
    }
  }

  const rawJson = JSON.stringify(exportedRawValues, null, INDENT.length);
  const rawJsonLines = rawJson.split("\n");
  const formattedRaw = `${rawJsonLines[0]}\n${rawJsonLines.slice(1).map((l) => INDENT + l).join("\n")}`;
  output.push(`${INDENT}const rawValues = ${formattedRaw};\n`);
  exportedVarNames.push("rawValues");

  output.push(`${INDENT}return { ${exportedVarNames.join(", ")} };`);
  output.push("})({});\n");

  return { output: output.join("\n"), exported: exportedVarNames, exportedRawValues };
}

export interface PlayerScriptResult {
  output: string;
  signatureTimestamp: number;
  hasNsigFunction: boolean;
}

export function analyzePlayerJs(playerJs: string): PlayerScriptResult {
  const nsigFunctionName = "nsigFunction";
  const timestampVarName = "signatureTimestampVar";

  const extractions: ExtractionConfig[] = [
    { friendlyName: nsigFunctionName, match: nsigMatcher },
    { friendlyName: timestampVarName, match: timestampMatcher, collectDependencies: false },
  ];

  const analyzer = new JsAnalyzer(playerJs, { extractions });
  const result = buildScript(analyzer);

  const sigTs = result.exportedRawValues?.[timestampVarName];
  const signatureTimestamp = sigTs ? parseInt(sigTs, 10) || 0 : 0;
  const hasNsigFunction = result.exported.includes(nsigFunctionName);

  return {
    output: result.output,
    signatureTimestamp,
    hasNsigFunction,
  };
}

export function getNsigProcessorFn(n?: string, sp?: string, s?: string): string {
  return `function process(n = "", sp = "", s = "") {
  const mockStreamingURL = "https://ytjs.googlevideo.com/videoplayback?expire=1234567890&"+"n="+encodeURIComponent(n);
  const urlCtorFunction = exportedVars.nsigFunction || (() => { throw new Error('No n/sig decipher function extracted') });
  const urlCtor = urlCtorFunction(mockStreamingURL, sp, s);

  const proto = Object.getPrototypeOf(urlCtor);
  const properties = Object.getOwnPropertyNames(proto);
  const methodBlacklist = ['constructor', 'clone', 'set', 'get'];

  for (const prop of properties) {
    if (methodBlacklist.includes(prop))
      continue;

    if (typeof urlCtor[prop] === 'function')
      urlCtor[prop]();
  }

  const sigResult = urlCtor.get(sp);
  const nResult = urlCtor.get('n');

  return {
    sig: sigResult ? decodeURIComponent(sigResult) : undefined,
    n: nResult ? decodeURIComponent(nResult) : undefined
  };
}

return process("${n || ""}", "${sp || ""}", "${s || ""}");`;
}
