import fs from "node:fs/promises";
import path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../../agents/workspace.js";
import { resolveWorkspaceTemplateDir } from "../../agents/workspace-templates.js";

/**
 * Bernard-specific gateway handlers for relationship management.
 */

async function resetBernardOnboarding(): Promise<{ success: boolean; message: string }> {
  const workspaceDir = DEFAULT_AGENT_WORKSPACE_DIR;
  const templateDir = await resolveWorkspaceTemplateDir();

  try {
    // Restore BOOTSTRAP.md from template
    const bootstrapTemplate = await fs.readFile(
      path.join(templateDir, "BOOTSTRAP.md"),
      "utf-8"
    );
    await fs.writeFile(
      path.join(workspaceDir, "BOOTSTRAP.md"),
      bootstrapTemplate,
      "utf-8"
    );

    // Optionally clear RELATIONAL.md to start fresh (restore from template)
    const relationalTemplate = await fs.readFile(
      path.join(templateDir, "RELATIONAL.md"),
      "utf-8"
    );
    await fs.writeFile(
      path.join(workspaceDir, "RELATIONAL.md"),
      relationalTemplate,
      "utf-8"
    );

    // Optionally clear USER.md to start fresh (restore from template)
    const userTemplate = await fs.readFile(
      path.join(templateDir, "USER.md"),
      "utf-8"
    );
    await fs.writeFile(
      path.join(workspaceDir, "USER.md"),
      userTemplate,
      "utf-8"
    );

    return {
      success: true,
      message: "Bernard onboarding reset. BOOTSTRAP.md, RELATIONAL.md, and USER.md restored to templates.",
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to reset Bernard onboarding: ${String(err)}`,
    };
  }
}

export const bernardHandlers: GatewayRequestHandlers = {
  "bernard.reset": async ({ respond }) => {
    const result = await resetBernardOnboarding();
    respond(result.success, result);
  },
};
