import { CircleTool, EraseTool, LineTool, MoveTool, RectangleTool, RotateTool, SelectTool, ToolRegistry } from "@cad-web/cad-tools";

export function createWebToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(new SelectTool());
  registry.register(new LineTool());
  registry.register(new RectangleTool());
  registry.register(new CircleTool());
  registry.register(new MoveTool());
  registry.register(new RotateTool());
  registry.register(new EraseTool());

  return registry;
}
