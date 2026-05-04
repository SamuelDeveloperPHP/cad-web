import type { CadCommand, CadDocument, CadDisplayUnit } from "@cad-web/cad-core";

export class ChangeDisplayUnitCommand implements CadCommand {
  public readonly id = crypto.randomUUID();
  public readonly type = "change_display_unit";
  public readonly description: string;
  private previousUnit: CadDisplayUnit | undefined;

  constructor(public readonly unit: CadDisplayUnit) {
    this.description = `Change display unit to ${unit}`;
  }

  execute(document: CadDocument): CadDocument {
    this.previousUnit = document.displayUnit;
    return {
      ...document,
      displayUnit: this.unit
    };
  }

  undo(document: CadDocument): CadDocument {
    const { displayUnit, ...rest } = document;
    return this.previousUnit ? { ...rest, displayUnit: this.previousUnit } : rest;
  }
}
