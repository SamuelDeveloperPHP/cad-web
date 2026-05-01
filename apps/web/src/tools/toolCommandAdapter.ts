import type { CadDocument, CadCommand } from "@cad-web/cad-core";

export function applyToolCommand(document: CadDocument, command: CadCommand): CadDocument {
  // TODO: O app mantem este wrapper apenas ate todos os fluxos chamarem CommandHistory diretamente.
  return command.execute(document);
}
