import { 
  ToolRegistry, 
  SelectTool, 
  LineTool, 
  RectangleTool, 
  CircleTool, 
  MoveTool, 
  RotateTool, 
  ScaleTool,
  OffsetTool,
  EraseTool, 
  DimLinearTool,
  DimAlignedTool
} from "@cad-web/cad-tools";

export function createWebToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(new SelectTool());
  registry.register(new LineTool());
  registry.register(new RectangleTool());
  registry.register(new CircleTool());
  registry.register(new MoveTool());
  registry.register(new RotateTool());
  registry.register(new ScaleTool());
  registry.register(new OffsetTool());
  registry.register(new EraseTool());
  registry.register(new DimLinearTool());
  registry.register(new DimAlignedTool());

  return registry;
}
