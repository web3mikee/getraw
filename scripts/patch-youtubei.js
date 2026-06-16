#!/usr/bin/env node
// Patches youtubei.js to use Bun-native JS evaluation instead of the default stub
import { writeFileSync } from "fs";
import { resolve } from "path";

const evalPath = resolve("node_modules/youtubei.js/dist/src/platform/jsruntime/default.js");
const evalCode = `export default async function evaluate(data) {
  const fn = new Function(data.output);
  return fn();
}
`;

writeFileSync(evalPath, evalCode);
console.log("Patched youtubei.js jsruntime for Bun-native evaluation");
