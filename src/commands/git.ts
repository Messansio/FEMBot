import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import type { Command } from "../types/command.js";
import { respondWithRepos } from "../autocomplete.js";
import { UserError } from "../errors.js";
import { parseRepoReference, requireGitHubToken } from "../github.js";
import { commitView, pullView, treeView } from "../gitViews.js";
import type { RepoRef, View } from "../gitViews.js";
import { projectForChannel } from "../projects.js";

/** The `repo` option (owner/name or link), else the project this channel belongs to. */
function resolveRepo(interaction: ChatInputCommandInteraction): RepoRef {
  const input = interaction.options.getString("repo");
  const ref = input ? parseRepoReference(input) : undefined;
  if (input && !ref) throw new UserError("That isn't a GitHub repository. Use `owner/name` or a github.com link.");
  if (ref) return ref;
  const project = projectForChannel(interaction.channel);
  const [owner, repo] = project?.repo_full_name.split("/") ?? [];
  if (!owner || !repo) throw new UserError("Use this in a project channel, or pick the `repo` option.");
  return { owner, repo };
}

/** First message edits the deferred reply; the rest follow. Files go on the last message. */
async function sendView(interaction: ChatInputCommandInteraction, view: View): Promise<void> {
  const messages = view.messages.length ? view.messages : [undefined];
  for (const [i, content] of messages.entries()) {
    const last = i === messages.length - 1;
    const payload = {
      ...(content ? { content } : {}),
      ...(last ? { files: view.files } : {}),
      ...(i === 0 ? { components: view.components } : {}),
    };
    if (i === 0) await interaction.editReply(payload);
    else await interaction.followUp(payload);
  }
}

const repoOption = (o: import("discord.js").SlashCommandStringOption) =>
  o.setName("repo").setDescription("owner/name or link (default: this project's repo)").setAutocomplete(true);

export const gitCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("git")
    .setDescription("Look at a repository: commits, branch tree, pull requests (read-only).")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .addSubcommand((sub) =>
      sub
        .setName("commit")
        .setDescription("Show a commit and its diff.")
        .addStringOption((o) => o.setName("hash").setDescription("Commit hash (at least 4 characters)").setRequired(true))
        .addStringOption(repoOption),
    )
    .addSubcommand((sub) =>
      sub
        .setName("tree")
        .setDescription("Draw the branch and commit graph.")
        .addStringOption((o) =>
          o
            .setName("format")
            .setDescription("Image (default) or text")
            .addChoices({ name: "image", value: "image" }, { name: "text", value: "text" }),
        )
        .addStringOption(repoOption),
    )
    .addSubcommand((sub) =>
      sub
        .setName("pr")
        .setDescription("Show a pull request, or list the open ones.")
        .addIntegerOption((o) => o.setName("number").setDescription("Pull request number (empty: list open ones)").setMinValue(1))
        .addStringOption(repoOption),
    ),

  async execute(interaction) {
    const ref = resolveRepo(interaction);
    await interaction.deferReply();
    const token = await requireGitHubToken(interaction.user.id);

    switch (interaction.options.getSubcommand()) {
      case "commit":
        return sendView(interaction, await commitView(token, ref, interaction.options.getString("hash", true).trim()));
      case "tree":
        return sendView(
          interaction,
          await treeView(token, ref, interaction.options.getString("format") === "text" ? "text" : "image"),
        );
      case "pr":
        return sendView(interaction, await pullView(token, ref, interaction.options.getInteger("number")));
    }
  },

  async autocomplete(interaction) {
    await respondWithRepos(interaction, false);
  },
};
