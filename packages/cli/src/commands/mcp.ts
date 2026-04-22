import { Command } from "commander";
import { startMcpServer } from "@archlens/mcp";

export const mcpCommand = new Command("mcp")
  .description("Start the ArchLens MCP server (stdio) for AI coding tools")
  .action(async () => {
    await startMcpServer();
  });
