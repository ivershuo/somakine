#!/usr/bin/env node
import { runCommand, type SomaCommand } from "./index.js";

const [commandValue, file, ...args] = process.argv.slice(2);
const commands = new Set<SomaCommand>(["validate", "inspect", "coverage", "verify-assets", "validate-extension", "compose"]);
if (!commandValue || !commands.has(commandValue as SomaCommand) || !file) {
  process.stderr.write("Usage: soma <validate|inspect|coverage|verify-assets|validate-extension|compose> <file> [options]\n");
  process.exitCode = 2;
} else {
  const command = commandValue as SomaCommand;
  const json = args.includes("--json");
  const baseFile = optionValue(args, "--base");
  const outputFile = optionValue(args, "--output");
  const policy = optionValue(args, "--policy");
  const extensionFiles = command === "compose"
    ? args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--base" && args[index - 1] !== "--output" && args[index - 1] !== "--policy" && arg !== "--json")
    : [];
  const commandOptions = {
    ...(baseFile ? { baseFile } : {}),
    ...(outputFile ? { outputFile } : {}),
    ...(extensionFiles.length > 0 ? { extensionFiles } : {}),
    ...(policy ? { conflictPolicy: policy as "fill-unavailable" | "prefer-extension" | "error-on-conflict" } : {}),
  };
  const result = await runCommand(command, file, commandOptions);
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else if (result.ok) process.stdout.write(`${commandValue}: ok\n${JSON.stringify(result.data, null, 2)}\n`);
  else process.stderr.write(`${commandValue}: failed\n${JSON.stringify(result.errors, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
