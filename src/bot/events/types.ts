import type { ClientEvents } from "discord.js";

export interface BotEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute(...args: ClientEvents[K]): Promise<void> | void;
}

/** Helper that keeps the event name and handler arguments type-linked. */
export const defineEvent = <K extends keyof ClientEvents>(event: BotEvent<K>): BotEvent<K> => event;
