import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  MAX_PANEL_OPTIONS,
  addPanelOption,
  createPanel,
  deletePanel,
  getPanel,
  listPanels,
  publishPanel,
  removePanelOption,
} from "../../services/rolePanels.js";
import { defineGuildCommand } from "../helpers.js";

const panelOption = (o: import("discord.js").SlashCommandIntegerOption) =>
  o.setName("panel").setDescription("Panel").setRequired(true).setAutocomplete(true);

export const rolesPanelCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("roles-panel")
    .setDescription("Self-assignable role panels (buttons or dropdown).")
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Create a new panel")
        .addStringOption((o) => o.setName("title").setDescription("Title").setRequired(true).setMaxLength(256))
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("Buttons (toggle) or dropdown")
            .addChoices({ name: "buttons", value: "buttons" }, { name: "dropdown", value: "select" }),
        )
        .addStringOption((o) => o.setName("description").setDescription("Text shown above the roles").setMaxLength(2000))
        .addIntegerOption((o) => o.setName("max_choices").setDescription("Dropdown: max roles a user can pick (0 = any)").setMinValue(0).setMaxValue(25)),
    )
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a role to a panel")
        .addIntegerOption(panelOption)
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
        .addStringOption((o) => o.setName("label").setDescription("Label (default: role name)").setMaxLength(80))
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji"))
        .addStringOption((o) => o.setName("description").setDescription("Dropdown description").setMaxLength(100)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a role from a panel")
        .addIntegerOption(panelOption)
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("publish")
        .setDescription("Post (or refresh) a panel")
        .addIntegerOption(panelOption)
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Channel (default: current)").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((s) => s.setName("list").setDescription("List panels"))
    .addSubcommand((s) => s.setName("delete").setDescription("Delete a panel").addIntegerOption(panelOption))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async autocomplete(interaction) {
    if (!interaction.inCachedGuild()) return;
    const query = String(interaction.options.getFocused()).toLowerCase();
    await interaction.respond(
      listPanels(interaction.guildId)
        .filter((p) => p.title.toLowerCase().includes(query) || String(p.id) === query)
        .slice(0, 25)
        .map((p) => ({ name: `#${p.id} ${p.title}`.slice(0, 100), value: p.id })),
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const reply = (content: string) =>
      interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

    if (sub === "create") {
      const panel = createPanel(guildId, {
        title: interaction.options.getString("title", true),
        description: interaction.options.getString("description") ?? "",
        mode: (interaction.options.getString("mode") as "buttons" | "select" | null) ?? "buttons",
        maxChoices: interaction.options.getInteger("max_choices") ?? 0,
      });
      await reply(`✅ Created panel **#${panel.id}**. Add roles with \`/roles-panel add\`, then \`/roles-panel publish\`.`);
      return;
    }

    if (sub === "list") {
      const panels = listPanels(guildId);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Role panels")
        .setDescription(
          panels.length
            ? panels
                .map(
                  (p) =>
                    `**#${p.id} ${p.title}** (${p.mode}) • ${p.options.map((o) => `<@&${o.roleId}>`).join(" ") || "_no roles_"}` +
                    (p.channelId ? ` • in <#${p.channelId}>` : " • _not published_"),
                )
                .join("\n")
            : "_No panels yet._",
        );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const panelId = interaction.options.getInteger("panel", true);
    const panel = getPanel(guildId, panelId);
    if (!panel) {
      await reply("❌ Panel not found.");
      return;
    }

    if (sub === "add") {
      const role = interaction.options.getRole("role", true);
      const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
      if (role.managed || role.id === guildId || role.comparePositionTo(me.roles.highest) >= 0) {
        await reply("❌ I can't assign that role (managed, @everyone, or above my highest role).");
        return;
      }
      if (
        role.permissions.any([
          PermissionFlagsBits.Administrator,
          PermissionFlagsBits.ManageGuild,
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.BanMembers,
        ])
      ) {
        await reply("❌ Roles with moderator permissions can't be self-assignable.");
        return;
      }
      if (panel.options.some((o) => o.roleId === role.id)) {
        await reply("That role is already on this panel.");
        return;
      }
      if (panel.options.length >= MAX_PANEL_OPTIONS) {
        await reply(`❌ A panel can have at most ${MAX_PANEL_OPTIONS} roles.`);
        return;
      }
      addPanelOption(panel.id, {
        roleId: role.id,
        label: interaction.options.getString("label") ?? role.name,
        emoji: interaction.options.getString("emoji"),
        description: interaction.options.getString("description"),
      });
      await reply(`➕ Added ${role} to panel #${panel.id}. Run \`/roles-panel publish\` to update the message.`);
      return;
    }

    if (sub === "remove") {
      const role = interaction.options.getRole("role", true);
      await reply(removePanelOption(panel.id, role.id) ? `➖ Removed ${role}.` : "That role isn't on this panel.");
      return;
    }

    if (sub === "publish") {
      const channel = interaction.options.getChannel("channel") ?? interaction.channel;
      try {
        await publishPanel(interaction.guild, panel.id, channel?.id);
        await reply(`✅ Panel published in ${channel}.`);
      } catch (error) {
        await reply(`❌ ${error instanceof Error ? error.message : "Couldn't publish the panel."}`);
      }
      return;
    }

    deletePanel(guildId, panel.id);
    if (panel.channelId && panel.messageId) {
      const channel = interaction.guild.channels.cache.get(panel.channelId);
      if (channel?.isTextBased()) await channel.messages.delete(panel.messageId).catch(() => undefined);
    }
    await reply(`🗑️ Deleted panel #${panel.id}.`);
  },
});
