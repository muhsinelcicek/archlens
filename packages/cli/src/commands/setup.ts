import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import chalk from "chalk";

export const setupCommand = new Command("setup")
  .description("Configure MCP integration for AI coding tools (Claude Code, Cursor, etc.)")
  .option("--tool <tool>", "Target tool: claude, cursor, all", "all")
  .action(async (options) => {
    const mcpServerPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../../node_modules/@archlens/mcp/dist/index.js",
    );

    // Find the actual MCP server binary
    let serverPath = mcpServerPath;
    if (!fs.existsSync(serverPath)) {
      // Try monorepo path
      const monoPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../mcp/dist/index.js");
      if (fs.existsSync(monoPath)) {
        serverPath = monoPath;
      } else {
        // Try global
        serverPath = "archlens-mcp";
      }
    }

    const mcpConfig = {
      archlens: {
        command: "node",
        args: [serverPath],
      },
    };

    const tool = options.tool;

    // Claude Code
    if (tool === "claude" || tool === "all") {
      const claudeDir = path.join(process.cwd(), ".claude");
      fs.mkdirSync(claudeDir, { recursive: true });

      const mcpJsonPath = path.join(claudeDir, "mcp.json");
      let existing: Record<string, unknown> = {};
      if (fs.existsSync(mcpJsonPath)) {
        existing = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8"));
      }

      const updated = {
        ...existing,
        mcpServers: {
          ...(existing.mcpServers as Record<string, unknown> || {}),
          ...mcpConfig,
        },
      };

      fs.writeFileSync(mcpJsonPath, JSON.stringify(updated, null, 2));
      console.log(chalk.green(`  ✅ Claude Code: ${mcpJsonPath}`));
    }

    // Cursor
    if (tool === "cursor" || tool === "all") {
      const cursorDir = path.join(process.cwd(), ".cursor");
      fs.mkdirSync(cursorDir, { recursive: true });

      const mcpJsonPath = path.join(cursorDir, "mcp.json");
      let existing: Record<string, unknown> = {};
      if (fs.existsSync(mcpJsonPath)) {
        existing = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8"));
      }

      const updated = {
        ...existing,
        mcpServers: {
          ...(existing.mcpServers as Record<string, unknown> || {}),
          ...mcpConfig,
        },
      };

      fs.writeFileSync(mcpJsonPath, JSON.stringify(updated, null, 2));
      console.log(chalk.green(`  ✅ Cursor: ${mcpJsonPath}`));
    }

    console.log(chalk.cyan("\n  MCP tools available:"));
    console.log(chalk.dim("  • archlens_architecture — System overview"));
    console.log(chalk.dim("  • archlens_process     — Business process details"));
    console.log(chalk.dim("  • archlens_impact      — Change blast radius"));
    console.log(chalk.dim("  • archlens_onboard     — New developer guide"));
    console.log(chalk.dim("  • archlens_drift       — Architecture drift check"));
    console.log(chalk.dim("\n  Restart your AI tool to load the MCP server."));
  });
