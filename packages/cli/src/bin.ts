#!/usr/bin/env node
import { runCommand, type SomaCommand } from "./index.js";

const [commandValue, file, ...flags] = process.argv.slice(2);
const commands = new Set<SomaCommand>(["validate", "inspect", "coverage", "verify-assets"]);
if (!commandValue || !commands.has(commandValue as SomaCommand) || !file) {
  process.stderr.write("Usage: soma <validate|inspect|coverage|verify-assets> <pack.json> [--json]\n");
  process.exitCode = 2;
} else {
  const result = await runCommand(commandValue as SomaCommand, file);
  const json = flags.includes("--json");
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else if (result.ok) process.stdout.write(`${commandValue}: ok\n${JSON.stringify(result.data, null, 2)}\n`);
  else process.stderr.write(`${commandValue}: failed\n${JSON.stringify(result.errors, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
