import { COMMAND_ALIASES, type CommandId, normalizeCommandInput } from "./CommandAliases";

export type CommandHandler = Readonly<{
  id: CommandId;
  aliases: ReadonlyArray<string>;
  description: string;
}>;

export class CommandRegistry {
  private readonly handlers = new Map<CommandId, CommandHandler>();
  private readonly aliases = new Map<string, CommandId>();

  static withDefaultAliases(): CommandRegistry {
    const registry = new CommandRegistry();

    // O registro carrega aliases padrao para manter a linha de comando desacoplada das ferramentas concretas.
    for (const [commandId, aliases] of Object.entries(COMMAND_ALIASES) as Array<
      [CommandId, ReadonlyArray<string>]
    >) {
      registry.register({
        id: commandId,
        aliases,
        description: commandId
      });
    }

    return registry;
  }

  register(handler: CommandHandler): void {
    if (this.handlers.has(handler.id)) {
      throw new Error(`Command '${handler.id}' is already registered.`);
    }

    this.handlers.set(handler.id, handler);

    for (const alias of handler.aliases) {
      const normalizedAlias = normalizeCommandInput(alias);
      const existingCommand = this.aliases.get(normalizedAlias);

      if (existingCommand !== undefined) {
        throw new Error(`Command alias '${alias}' is already registered for '${existingCommand}'.`);
      }

      this.aliases.set(normalizedAlias, handler.id);
    }
  }

  resolve(input: string): CommandHandler | null {
    const commandId = this.aliases.get(normalizeCommandInput(input));

    if (commandId === undefined) {
      return null;
    }

    return this.handlers.get(commandId) ?? null;
  }

  list(): ReadonlyArray<CommandHandler> {
    return Array.from(this.handlers.values());
  }
}
