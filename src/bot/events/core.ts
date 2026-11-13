import { Events } from "discord.js";
import { startScheduler } from "../../services/scheduler.js";
import { getGuildSettings, invalidateGuildSettings } from "../../services/settings.js";
import { handleInteraction } from "../interactions.js";
import { defineEvent } from "./types.js";

export const readyEvent = defineEvent({
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.info(`Logged in as ${client.user.tag} | ${client.guilds.cache.size} server(s)`);
    startScheduler(client);
  },
});

export const interactionEvent = defineEvent({
  name: Events.InteractionCreate,
  async execute(interaction) {
    await handleInteraction(interaction);
  },
});

export const guildCreateEvent = defineEvent({
  name: Events.GuildCreate,
  execute(guild) {
    console.info(`Joined guild ${guild.name} (${guild.id})`);
    getGuildSettings(guild.id); // seed default settings
  },
});

export const guildDeleteEvent = defineEvent({
  name: Events.GuildDelete,
  execute(guild) {
    console.info(`Removed from guild ${guild.id}`);
    invalidateGuildSettings(guild.id);
  },
});
