import type { Client } from "discord.js";
import { guildCreateEvent, guildDeleteEvent, interactionEvent, readyEvent } from "./core.js";
import {
  banAddEvent,
  banRemoveEvent,
  memberAddEvent,
  memberRemoveEvent,
  memberUpdateEvent,
  messageCreateEvent,
  messageDeleteEvent,
  messageUpdateEvent,
} from "./community.js";
import type { BotEvent } from "./types.js";

// Each event is typed by its own definition; the array erases that for registration only.
const events = [
  readyEvent,
  interactionEvent,
  guildCreateEvent,
  guildDeleteEvent,
  memberAddEvent,
  memberUpdateEvent,
  memberRemoveEvent,
  messageCreateEvent,
  messageDeleteEvent,
  messageUpdateEvent,
  banAddEvent,
  banRemoveEvent,
] as unknown as BotEvent[];

export function registerEvents(client: Client): void {
  for (const event of events) {
    const listener = (...args: unknown[]): void => {
      Promise.resolve((event.execute as (...a: unknown[]) => unknown)(...args)).catch((error: unknown) => {
        console.error(`Error in ${event.name} handler:`, error);
      });
    };
    if (event.once) client.once(event.name, listener);
    else client.on(event.name, listener);
  }
}
