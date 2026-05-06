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
  TrimTool,
  ExtendTool,
  FilletTool,
  ChamferTool,
  EraseTool,
  DimLinearTool,
  DimAlignedTool,
  DimRadiusTool,
  DimDiameterTool,
  DimAngularTool
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
  registry.register(new TrimTool());
  registry.register(new ExtendTool());
  registry.register(new FilletTool());
  registry.register(new ChamferTool());
  registry.register(new EraseTool());
  registry.register(new DimLinearTool());
  registry.register(new DimAlignedTool());
  registry.register(new DimRadiusTool());
  registry.register(new DimDiameterTool());
  registry.register(new DimAngularTool());

  return registry;
}
