import { describe, expect, it } from "vitest";
import {
  ClearDocumentCommand,
  CommandHistory,
  ApplyPresetToDimensionStyleCommand,
  CreateEntityCommand,
  CreateDimensionStyleFromPresetCommand,
  DeleteEntitiesCommand,
  DIMENSION_STYLE_PRESETS,
  ExtendLineCommand,
  FilletLineLineCommand,
  MoveEntitiesCommand,
  TrimLineCommand,
  createEmptyDocument,
  createDimensionStyleFromPreset,
  getDimensionStylePresetById,
  type ArcEntity,
  type LineEntity
} from "./index";

describe("cad-core", () => {
  it("creates an empty CAD document with stable defaults", () => {
    const document = createEmptyDocument("doc_001");

    expect(document).toEqual({
      schemaVersion: "1.0.0",
      id: "doc_001",
      units: "mm",
      layers: [
        { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 }
      ],
      activeLayerId: "layer_0",
      dimensionStyles: [
        {
          id: "dimstyle_standard",
          name: "Standard",
          textHeight: 12,
          arrowSize: 6,
          extensionOffset: 2,
          extensionOvershoot: 3,
          precision: 2,
          unitSuffix: " mm",
          arrowType: "tick",
          isDefault: true
        }
      ],
      activeDimensionStyleId: "dimstyle_standard",
      entities: []
    });
  });

  it("executes undo and redo for CreateEntityCommand", () => {
    const line = createLine("line_001");
    const history = new CommandHistory(createEmptyDocument("doc_001"));

    expect(history.execute(new CreateEntityCommand(line)).entities).toEqual([line]);
    expect(history.undo().entities).toEqual([]);
    expect(history.redo().entities).toEqual([line]);
  });

  it("executes undo and redo for DeleteEntitiesCommand", () => {
    const line = createLine("line_001");
    const history = new CommandHistory({
      ...createEmptyDocument("doc_001"),
      entities: [line]
    });

    expect(history.execute(new DeleteEntitiesCommand(["line_001"])).entities).toEqual([]);
    expect(history.undo().entities).toEqual([line]);
    expect(history.redo().entities).toEqual([]);
  });

  it("executes undo and redo for MoveEntitiesCommand", () => {
    const line = createLine("line_001");
    const history = new CommandHistory({
      ...createEmptyDocument("doc_001"),
      entities: [line]
    });

    expect(history.execute(new MoveEntitiesCommand(["line_001"], { x: 5, y: 10 })).entities[0]).toMatchObject({
      start: { x: 5, y: 10 },
      end: { x: 15, y: 10 }
    });
    expect(history.undo().entities[0]).toEqual(line);
    expect(history.redo().entities[0]).toMatchObject({
      start: { x: 5, y: 10 },
      end: { x: 15, y: 10 }
    });
  });

  it("executes undo and redo for ClearDocumentCommand", () => {
    const line = createLine("line_001");
    const history = new CommandHistory({
      ...createEmptyDocument("doc_001"),
      entities: [line]
    });

    expect(history.execute(new ClearDocumentCommand()).entities).toEqual([]);
    expect(history.undo().entities).toEqual([line]);
    expect(history.redo().entities).toEqual([]);
  });

  it("executes undo and redo for TrimLineCommand with one remaining segment", () => {
    const line = createLine("line_001");
    const trimmedLine: LineEntity = {
      ...line,
      start: { x: 5, y: 0 },
      end: { x: 10, y: 0 }
    };
    const history = new CommandHistory({
      ...createEmptyDocument("doc_trim"),
      entities: [line]
    });

    expect(history.execute(new TrimLineCommand(line, [trimmedLine])).entities).toEqual([trimmedLine]);
    expect(history.undo().entities).toEqual([line]);
    expect(history.redo().entities).toEqual([trimmedLine]);
  });

  it("executes undo and redo for TrimLineCommand with split remaining segments", () => {
    const line = createLine("line_001");
    const firstSegment: LineEntity = {
      ...line,
      end: { x: 3, y: 0 }
    };
    const secondSegment: LineEntity = {
      ...line,
      id: "line_001_trim_1",
      start: { x: 7, y: 0 }
    };
    const history = new CommandHistory({
      ...createEmptyDocument("doc_trim_split"),
      entities: [line]
    });

    expect(history.execute(new TrimLineCommand(line, [firstSegment, secondSegment])).entities).toEqual([firstSegment, secondSegment]);
    expect(history.undo().entities).toEqual([line]);
    expect(history.redo().entities).toEqual([firstSegment, secondSegment]);
  });

  it("executes undo and redo for ExtendLineCommand", () => {
    const line = createLine("line_001");
    const extendedLine: LineEntity = {
      ...line,
      end: { x: 20, y: 0 }
    };
    const history = new CommandHistory({
      ...createEmptyDocument("doc_extend"),
      entities: [line]
    });

    expect(history.execute(new ExtendLineCommand(line, extendedLine, "end", "boundary_001")).entities).toEqual([extendedLine]);
    expect(history.undo().entities).toEqual([line]);
    expect(history.redo().entities).toEqual([extendedLine]);
  });

  it("executes undo and redo for FilletLineLineCommand", () => {
    const line1 = createLine("line_001");
    const line2: LineEntity = {
      id: "line_002",
      layerId: "default",
      type: "line",
      start: { x: 10, y: 0 },
      end: { x: 10, y: 10 }
    };
    const updatedLine1: LineEntity = {
      ...line1,
      end: { x: 8, y: 0 }
    };
    const updatedLine2: LineEntity = {
      ...line2,
      start: { x: 10, y: 2 }
    };
    const arc: ArcEntity = {
      id: "arc_001",
      layerId: "default",
      type: "arc",
      center: { x: 8, y: 2 },
      radius: 2,
      startAngle: -Math.PI / 2,
      endAngle: 0,
      clockwise: true
    };
    const history = new CommandHistory({
      ...createEmptyDocument("doc_fillet"),
      entities: [line1, line2]
    });

    expect(history.execute(new FilletLineLineCommand(line1, line2, updatedLine1, updatedLine2, arc)).entities).toEqual([
      updatedLine1,
      updatedLine2,
      arc
    ]);
    expect(history.undo().entities).toEqual([line1, line2]);
    expect(history.redo().entities).toEqual([updatedLine1, updatedLine2, arc]);
  });

  it("exposes immutable dimension style presets", () => {
    expect(DIMENSION_STYLE_PRESETS.map((preset) => preset.id)).toEqual([
      "standard",
      "architectural",
      "mechanical",
      "civil",
      "electrical",
      "iso",
      "abnt"
    ]);
    expect(getDimensionStylePresetById("abnt")).toMatchObject({
      name: "ABNT",
      arrowType: "tick"
    });
  });

  it("creates dimension styles from presets with unique document ids and names", () => {
    const existing = [
      {
        id: "dimstyle_abnt",
        name: "ABNT"
      }
    ];

    expect(createDimensionStyleFromPreset("abnt", { existingStyles: existing })).toMatchObject({
      id: "dimstyle_abnt_2",
      name: "ABNT 2",
      presetId: "abnt",
      unitSuffix: " mm"
    });
  });

  it("executes undo and redo for CreateDimensionStyleFromPresetCommand", () => {
    const history = new CommandHistory(createEmptyDocument("doc_presets"));
    const created = history.execute(new CreateDimensionStyleFromPresetCommand("mechanical", { setActive: true }));

    expect(created.dimensionStyles.at(-1)).toMatchObject({
      id: "dimstyle_mechanical",
      name: "Mecanico",
      presetId: "mechanical",
      arrowType: "arrow",
      precision: 3
    });
    expect(created.activeDimensionStyleId).toBe("dimstyle_mechanical");
    expect(history.undo().dimensionStyles).toHaveLength(1);
    expect(history.redo().dimensionStyles.at(-1)).toMatchObject({ id: "dimstyle_mechanical" });
  });

  it("executes undo and redo for ApplyPresetToDimensionStyleCommand", () => {
    const document = {
      ...createEmptyDocument("doc_apply_preset"),
      dimensionStyles: [
        {
          ...createEmptyDocument("doc_apply_preset").dimensionStyles[0],
          id: "dimstyle_custom",
          name: "Custom",
          arrowType: "tick" as const,
          precision: 0
        }
      ],
      activeDimensionStyleId: "dimstyle_custom"
    };
    const history = new CommandHistory(document);

    const updated = history.execute(new ApplyPresetToDimensionStyleCommand("dimstyle_custom", "iso"));

    expect(updated.dimensionStyles[0]).toMatchObject({
      id: "dimstyle_custom",
      name: "Custom",
      presetId: "iso",
      arrowType: "arrow",
      precision: 2,
      arrowSize: 4
    });
    expect(history.undo().dimensionStyles[0]).toMatchObject({
      id: "dimstyle_custom",
      name: "Custom",
      arrowType: "tick",
      precision: 0
    });
    expect(history.redo().dimensionStyles[0]).toMatchObject({
      presetId: "iso",
      arrowType: "arrow"
    });
  });
});

function createLine(id: string): LineEntity {
  return {
    id,
    layerId: "default",
    type: "line",
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 }
  };
}
