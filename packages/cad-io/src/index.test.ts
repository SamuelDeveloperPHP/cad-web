import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "@cad-web/cad-core";
import { parseCadDocument, serializeCadDocument } from "./index";

describe("cad-io", () => {
  it("serializes and parses a CAD document", () => {
    const document = createEmptyDocument("doc_001");

    expect(parseCadDocument(serializeCadDocument(document))).toEqual(document);
  });
});
