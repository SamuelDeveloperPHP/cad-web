import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../src";

describe("CommandRegistry", () => {
  it("resolves default command aliases", () => {
    const registry = CommandRegistry.withDefaultAliases();

    expect(registry.resolve("m")?.id).toBe("move");
    expect(registry.resolve(" MOVE ")?.id).toBe("move");
    expect(registry.resolve("zoomall")?.id).toBe("zoomExtents");
  });

  it("returns null for unknown commands", () => {
    const registry = CommandRegistry.withDefaultAliases();

    expect(registry.resolve("unknown")).toBeNull();
  });

  it("rejects duplicate aliases", () => {
    const registry = new CommandRegistry();

    registry.register({
      id: "move",
      aliases: ["m"],
      description: "move"
    });

    expect(() =>
      registry.register({
        id: "mirror",
        aliases: ["m"],
        description: "mirror"
      })
    ).toThrow("already registered");
  });
});
