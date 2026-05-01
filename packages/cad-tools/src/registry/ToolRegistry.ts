import type { CadTool } from "../contracts/CadTool";

export class ToolRegistry {
  private readonly tools = new Map<string, CadTool>();
  private readonly aliases = new Map<string, string>();

  register(tool: CadTool): void {
    // O registry bloqueia duplicidade para evitar comandos ambiguos na ativacao de ferramentas.
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool '${tool.id}' is already registered.`);
    }

    this.tools.set(tool.id, tool);

    for (const alias of tool.aliases) {
      const normalizedAlias = normalizeToolAlias(alias);
      const existingToolId = this.aliases.get(normalizedAlias);

      if (existingToolId !== undefined) {
        throw new Error(`Tool alias '${alias}' is already registered for '${existingToolId}'.`);
      }

      this.aliases.set(normalizedAlias, tool.id);
    }
  }

  get(toolId: string): CadTool | null {
    return this.tools.get(toolId) ?? null;
  }

  resolve(input: string): CadTool | null {
    const normalizedInput = normalizeToolAlias(input);
    const toolId = this.aliases.get(normalizedInput) ?? normalizedInput;

    return this.tools.get(toolId) ?? null;
  }

  list(): ReadonlyArray<CadTool> {
    return Array.from(this.tools.values());
  }
}

function normalizeToolAlias(input: string): string {
  return input.trim().toLowerCase();
}
