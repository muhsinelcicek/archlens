#!/usr/bin/env node
import { Command } from "commander";
import { analyzeCommand } from "./commands/analyze.js";
import { serveCommand } from "./commands/serve.js";
import { exportCommand } from "./commands/export.js";
import { setupCommand } from "./commands/setup.js";

const program = new Command();

program
  .name("archlens")
  .description("ArchLens — Code Architecture Intelligence Platform")
  .version("0.1.0");

program.addCommand(analyzeCommand);
program.addCommand(serveCommand);
program.addCommand(exportCommand);
program.addCommand(setupCommand);

program.parse();
