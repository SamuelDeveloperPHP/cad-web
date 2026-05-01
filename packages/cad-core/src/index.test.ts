import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "./index";

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
});
