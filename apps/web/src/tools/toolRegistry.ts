import { EraseTool, LineTool, MoveTool, SelectTool, ToolRegistry } from "@cad-web/cad-tools";

export function createWebToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(new SelectTool());
  registry.register(new LineTool());
  registry.register(new MoveTool());
  registry.register(new EraseTool());

  return registry;
}
