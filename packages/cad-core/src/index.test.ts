import { describe, expect, it } from "vitest";
import {
  ClearDocumentCommand,
  CommandHistory,
  CreateEntityCommand,
  DeleteEntitiesCommand,
  MoveEntitiesCommand,
  createEmptyDocument,
  type LineEntity
} from "./index";

describe("cad-core", () => {
  it("creates an empty CAD document with stable defaults", () => {
    const document = createEmptyDocument("doc_001");

    expect(document).toEqual({
      schemaVersion: "1.0.0",
      id: "doc_001",
      units: "mm",
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
