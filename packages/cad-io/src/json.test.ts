import { createEmptyDocument, type CadDocument } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import {
  CadIoValidationError,
  createCadJsonChunks,
  parseCadDocument,
  serializeCadDocument,
  toCadJsonDocument
} from "./index";

describe("cad-io JSON", () => {
  it("serializes a native CAD-WEB JSON envelope", () => {
    const document = createEmptyDocument("doc_001");
    const nativeDocument = toCadJsonDocument(document);

    expect(nativeDocument).toMatchObject({
      schemaVersion: "1.0.0",
      application: "CAD-WEB",
      id: "doc_001",
      unit: "mm",
      precision: 3,
      layers: [
        {
          id: "layer_0",
          name: "Layer 0",
          color: "#ffffff",
          visible: true,
          locked: false,
          order: 0
        }
      ],
      activeLayerId: "layer_0"
    });
  });

  it("serializes and parses a CAD document", () => {
    const document = createDocument();

    expect(parseCadDocument(serializeCadDocument(document))).toEqual(document);
  });

  it("parses legacy MVP document shape", () => {
    const document = createEmptyDocument("legacy_001");

    expect(parseCadDocument(JSON.stringify(document))).toEqual(document);
  });

  it("emits JSON in chunks without changing the parsed result", () => {
    const document = createDocument();
    const chunks = [...createCadJsonChunks(document)];

    expect(chunks.length).toBeGreaterThan(document.entities.length);
    expect(parseCadDocument(chunks.join(""))).toEqual(document);
  });

  it("rejects unsupported entity types with a path", () => {
    const invalidDocument = {
      ...createEmptyDocument("doc_invalid"),
      entities: [
        {
          id: "arc_001",
          layerId: "layer_0",
          type: "arc",
          center: { x: 0, y: 0 },
          radius: 10
        }
      ]
    };

    expect(() => serializeCadDocument(invalidDocument as unknown as CadDocument)).toThrow(CadIoValidationError);
    expect(() => serializeCadDocument(invalidDocument as unknown as CadDocument)).toThrow("$.entities[0].type");
  });
});

function createDocument(): CadDocument {
  return {
    ...createEmptyDocument("doc_001"),
    schemaVersion: "1.0.0",
    id: "doc_001",
    units: "mm",
    layers: [
      { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 },
      { id: "reference", name: "reference", color: "#ffffff", visible: true, locked: false, order: 1 }
    ],
    activeLayerId: "layer_0",
    entities: [
      {
        id: "line_001",
        layerId: "layer_0",
        type: "line",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 }
      },
      {
        id: "circle_001",
        layerId: "reference",
        type: "circle",
        center: { x: 5, y: 5 },
        radius: 2
      }
    ]
  };
}
