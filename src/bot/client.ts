import { Client, GatewayIntentBits, Options, Partials } from "discord.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged: welcome/leave, autoroles
    GatewayIntentBits.GuildModeration, // ban add/remove events
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged: message logs, purge filters
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
  allowedMentions: { parse: ["users"], repliedUser: false },
  // Keep memory bounded in large servers.
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 200,
    ReactionManager: 0,
    PresenceManager: 0,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: { interval: 3600, lifetime: 6 * 3600 },
  },
});
