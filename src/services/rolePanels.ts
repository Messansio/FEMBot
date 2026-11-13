import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type Guild,
  type MessageCreateOptions,
} from "discord.js";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { RolePanel, RolePanelOption } from "../db/schema.js";

export const MAX_PANEL_OPTIONS = 25;

export type PanelWithOptions = RolePanel & { options: RolePanelOption[] };

export function listPanels(guildId: string): PanelWithOptions[] {
  const panels = db.select().from(schema.rolePanels).where(eq(schema.rolePanels.guildId, guildId)).all();
  return panels.map((panel) => ({ ...panel, options: getOptions(panel.id) }));
}

function getOptions(panelId: number): RolePanelOption[] {
  return db.select().from(schema.rolePanelOptions).where(eq(schema.rolePanelOptions.panelId, panelId)).all();
}

export function getPanel(guildId: string, panelId: number): PanelWithOptions | null {
  const panel = db
    .select()
    .from(schema.rolePanels)
    .where(and(eq(schema.rolePanels.id, panelId), eq(schema.rolePanels.guildId, guildId)))
    .get();
  return panel ? { ...panel, options: getOptions(panel.id) } : null;
}

export interface PanelInput {
  title: string;
  description: string;
  mode: "buttons" | "select";
  maxChoices: number;
  options: Array<{ roleId: string; label: string; emoji?: string | null; description?: string | null }>;
}

export function createPanel(guildId: string, input: Omit<PanelInput, "options">): RolePanel {
  return db.insert(schema.rolePanels).values({ guildId, ...input }).returning().get();
}

/** Replaces a panel's fields and options in one transaction. */
export function savePanel(guildId: string, panelId: number, input: PanelInput): PanelWithOptions | null {
  return db.transaction((tx) => {
    const { options, ...fields } = input;
    const updated = tx
      .update(schema.rolePanels)
      .set(fields)
      .where(and(eq(schema.rolePanels.id, panelId), eq(schema.rolePanels.guildId, guildId)))
      .returning()
      .get();
    if (!updated) return null;
    tx.delete(schema.rolePanelOptions).where(eq(schema.rolePanelOptions.panelId, panelId)).run();
    if (options.length > 0) {
      tx.insert(schema.rolePanelOptions)
        .values(
          options.map((option) => ({
            panelId,
            roleId: option.roleId,
            label: option.label,
            emoji: option.emoji ?? null,
            description: option.description ?? null,
          })),
        )
        .run();
    }
    return { ...updated, options: getOptions(panelId) };
  });
}

export function addPanelOption(
  panelId: number,
  option: { roleId: string; label: string; emoji: string | null; description: string | null },
): void {
  db.insert(schema.rolePanelOptions).values({ panelId, ...option }).run();
}

export function removePanelOption(panelId: number, roleId: string): boolean {
  const result = db
    .delete(schema.rolePanelOptions)
    .where(and(eq(schema.rolePanelOptions.panelId, panelId), eq(schema.rolePanelOptions.roleId, roleId)))
    .run();
  return result.changes > 0;
}

export function deletePanel(guildId: string, panelId: number): RolePanel | undefined {
  return db
    .delete(schema.rolePanels)
    .where(and(eq(schema.rolePanels.id, panelId), eq(schema.rolePanels.guildId, guildId)))
    .returning()
    .get();
}

export function buildPanelMessage(panel: PanelWithOptions): MessageCreateOptions {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(panel.title)
    .setDescription(
      panel.description ||
        panel.options.map((o) => `${o.emoji ? `${o.emoji} ` : ""}<@&${o.roleId}>${o.description ? ` | ${o.description}` : ""}`).join("\n"),
    );

  if (panel.mode === "select") {
    const max = panel.maxChoices > 0 ? Math.min(panel.maxChoices, panel.options.length) : panel.options.length;
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`rp:${panel.id}`)
      .setPlaceholder("Choose your roles")
      .setMinValues(0)
      .setMaxValues(Math.max(1, max))
      .addOptions(
        panel.options.map((o) => ({
          label: o.label.slice(0, 100),
          value: o.roleId,
          ...(o.description ? { description: o.description.slice(0, 100) } : {}),
          ...(o.emoji ? { emoji: o.emoji } : {}),
        })),
      );
    return {
      embeds: [embed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    };
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  panel.options.forEach((option, index) => {
    if (index % 5 === 0) rows.push(new ActionRowBuilder<ButtonBuilder>());
    const button = new ButtonBuilder()
      .setCustomId(`rp:${panel.id}:${option.roleId}`)
      .setLabel(option.label.slice(0, 80))
      .setStyle(ButtonStyle.Secondary);
    if (option.emoji) button.setEmoji(option.emoji);
    rows[rows.length - 1]!.addComponents(button);
  });
  return { embeds: [embed], components: rows, allowedMentions: { parse: [] } };
}

/** Posts the panel (or edits it in place if it was already posted in the same channel). */
export async function publishPanel(guild: Guild, panelId: number, channelId?: string): Promise<string> {
  const panel = getPanel(guild.id, panelId);
  if (!panel) throw new Error("Panel not found");
  if (panel.options.length === 0) throw new Error("Add at least one role before publishing");

  const targetChannelId = channelId ?? panel.channelId;
  if (!targetChannelId) throw new Error("No channel selected");
  const channel = guild.channels.cache.get(targetChannelId);
  if (!channel?.isTextBased()) throw new Error("Channel not found or not a text channel");

  const payload = buildPanelMessage(panel);
  if (panel.messageId && panel.channelId === targetChannelId) {
    const existing = await channel.messages.fetch(panel.messageId).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: payload.embeds ?? [], components: payload.components ?? [] });
      return existing.id;
    }
  }

  const message = await channel.send(payload);
  db.update(schema.rolePanels)
    .set({ channelId: targetChannelId, messageId: message.id })
    .where(eq(schema.rolePanels.id, panelId))
    .run();
  return message.id;
}
