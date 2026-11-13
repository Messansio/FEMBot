import { MessageFlags } from "discord.js";
import { getPanel } from "../services/rolePanels.js";
import type { ComponentHandler } from "../types/command.js";

/**
 * customId formats:
 *   rp:<panelId>:<roleId>  button: toggles one role
 *   rp:<panelId>           select menu: selected roles become the member's roles from this panel
 */
export const rolePanelHandler: ComponentHandler = {
  prefix: "rp",
  async execute(interaction, args) {
    if (!interaction.inCachedGuild()) return;
    const panel = getPanel(interaction.guildId, Number(args[0]));
    if (!panel) {
      await interaction.reply({ content: "This role panel no longer exists.", flags: MessageFlags.Ephemeral });
      return;
    }

    const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
    const panelRoleIds = new Set(panel.options.map((o) => o.roleId));
    const assignable = (roleId: string): boolean => {
      const role = interaction.guild.roles.cache.get(roleId);
      return !!role && !role.managed && role.comparePositionTo(me.roles.highest) < 0;
    };
    const member = interaction.member;

    if (interaction.isButton()) {
      const roleId = args[1];
      if (!roleId || !panelRoleIds.has(roleId) || !assignable(roleId)) {
        await interaction.reply({ content: "I can't assign that role.", flags: MessageFlags.Ephemeral });
        return;
      }
      const has = member.roles.cache.has(roleId);
      if (has) await member.roles.remove(roleId, "Role panel");
      else await member.roles.add(roleId, "Role panel");
      await interaction.reply({
        content: `${has ? "➖ Removed" : "➕ Added"} <@&${roleId}>.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (interaction.isStringSelectMenu()) {
      const selected = new Set(interaction.values.filter((id) => panelRoleIds.has(id) && assignable(id)));
      const toAdd = [...selected].filter((id) => !member.roles.cache.has(id));
      const toRemove = [...panelRoleIds].filter(
        (id) => !selected.has(id) && member.roles.cache.has(id) && assignable(id),
      );
      if (toAdd.length) await member.roles.add(toAdd, "Role panel");
      if (toRemove.length) await member.roles.remove(toRemove, "Role panel");
      const parts = [
        toAdd.length ? `➕ ${toAdd.map((id) => `<@&${id}>`).join(" ")}` : "",
        toRemove.length ? `➖ ${toRemove.map((id) => `<@&${id}>`).join(" ")}` : "",
      ].filter(Boolean);
      await interaction.reply({
        content: parts.join("\n") || "No changes.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }
  },
};
