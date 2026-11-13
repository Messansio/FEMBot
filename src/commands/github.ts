import {
  ActionRowBuilder,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../types/command.js";
import { getGitHubSetup } from "../config.js";
import { getGitHubAccount, logoutGitHub } from "../github.js";
import { card, symbols } from "../theme.js";
import { createLoginLink } from "../web.js";

export const githubCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("github")
    .setDescription("Connect your GitHub account to the bot.")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .addSubcommand((sub) => sub.setName("login").setDescription("Log in with GitHub in your browser."))
    .addSubcommand((sub) => sub.setName("status").setDescription("Show which GitHub account is connected."))
    .addSubcommand((sub) => sub.setName("logout").setDescription("Disconnect GitHub and revoke the bot's access.")),

  async execute(interaction) {
    getGitHubSetup();
    const ephemeral = MessageFlags.Ephemeral;
    const account = getGitHubAccount(interaction.user.id);

    switch (interaction.options.getSubcommand()) {
      case "login": {
        const link = createLoginLink(interaction.user.id);
        await interaction.reply({
          flags: ephemeral,
          embeds: [
            card(
              `${symbols.branch} Log in with GitHub`,
              [
                account ? `You're logged in as **@${account.login}**; logging in again replaces it.\n` : "",
                "You sign in on GitHub itself: the bot never sees your password.",
                "GitHub gives the bot a **read-only** token, stored encrypted. The bot can't change your repositories.",
                "",
                "The link works for 15 minutes and only for your Discord account.",
              ].join("\n"),
              "info",
            ),
          ],
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Log in with GitHub").setURL(link),
            ),
          ],
        });
        return;
      }
      case "status": {
        await interaction.reply({
          flags: ephemeral,
          embeds: [
            account
              ? card(`${symbols.ok} Logged in as @${account.login}`, `https://github.com/${account.login}`, "ok").setThumbnail(
                  account.avatar_url,
                )
              : card(`${symbols.fail} Not logged in`, "Run `/github login` to connect your GitHub account.", "warn"),
          ],
        });
        return;
      }
      case "logout": {
        const done = await logoutGitHub(interaction.user.id);
        await interaction.reply({
          flags: ephemeral,
          embeds: [
            done
              ? card(`${symbols.ok} Logged out`, "The bot's access to your GitHub account was revoked and its tokens deleted.", "ok")
              : card(`${symbols.fail} Not logged in`, "There was no GitHub account connected.", "warn"),
          ],
        });
      }
    }
  },
};
