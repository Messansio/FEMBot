import {
  ActionRowBuilder,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { ChatInputCommandInteraction, Guild } from "discord.js";
import type { Command } from "../types/command.js";
import { respondWithProjects, respondWithRepos } from "../autocomplete.js";
import { getGitHubSetup } from "../config.js";
import { one, run } from "../db.js";
import type { ProjectRow } from "../db.js";
import { UserError } from "../errors.js";
import { appInstallUrl, getGitHubAccount, getVisibleRepo, parseRepoReference, requireGitHubToken } from "../github.js";
import {
  activeMuteUntil,
  createProjectChannels,
  deleteProjectChannels,
  firstTextChannelId,
  getProject,
  hasAccess,
  isBanned,
  parseDuration,
  projectForChannel,
  scheduleUnmute,
  setAccess,
  unmute,
} from "../projects.js";
import { card, symbols } from "../theme.js";
import { createInviteLink } from "../web.js";

const INVITE_TTL = { "1h": 3_600_000, "1d": 86_400_000, "7d": 604_800_000 } as const;

/** The project named by the `project` option, or the one this channel belongs to; owner only. */
async function resolveOwnedProject(interaction: ChatInputCommandInteraction): Promise<{ project: ProjectRow; guild: Guild }> {
  const picked = interaction.options.getString("project");
  const project = picked ? getProject(Number(picked)) : projectForChannel(interaction.channel);
  if (!project) throw new UserError("Run this inside a project channel, or pick the `project` option.");
  if (project.owner_discord_id !== interaction.user.id) throw new UserError("Only the project owner can do this.");
  const guild = await interaction.client.guilds.fetch(project.guild_id).catch(() => null);
  if (!guild) throw new UserError("The bot is no longer in that project's server.");
  return { project, guild };
}

function repoName(project: ProjectRow) {
  return project.repo_full_name.split("/")[1] ?? project.repo_full_name;
}

async function create(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) throw new UserError("Create projects inside a server the bot is in.");
  const input = interaction.options.getString("link") ?? interaction.options.getString("repo");
  if (!input) throw new UserError("Pick a repository from the list, or paste its GitHub link.");
  const ref = parseRepoReference(input);
  if (!ref) throw new UserError("That isn't a GitHub repository. Use `owner/name` or a github.com link.");

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const token = await requireGitHubToken(interaction.user.id);
  const login = getGitHubAccount(interaction.user.id)?.login ?? "";
  const repo = await getVisibleRepo(token, ref.owner, ref.repo);
  if (!repo) {
    throw new UserError(
      `@${login} can't see **${ref.owner}/${ref.repo}**. If it's private, install the GitHub App on it: ${appInstallUrl()}`,
    );
  }
  if (repo.owner.login.toLowerCase() !== login.toLowerCase()) {
    throw new UserError(`Only the owner of **${repo.full_name}** (@${repo.owner.login}) can create its project.`);
  }
  const existing = one<ProjectRow>(
    "SELECT * FROM projects WHERE guild_id = ? AND github_repo_id = ?",
    guild.id,
    repo.id,
  );
  if (existing) throw new UserError(`**${repo.full_name}** already has a project here: <#${existing.category_id}>`);

  const category = await createProjectChannels(guild, repo.name, interaction.user.id);
  run(
    `INSERT INTO projects (guild_id, category_id, owner_discord_id, github_repo_id, repo_full_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    guild.id,
    category.id,
    interaction.user.id,
    repo.id,
    repo.full_name,
    Date.now(),
  );
  const project = projectForChannel(category) as ProjectRow;
  await interaction.editReply({
    embeds: [
      card(
        `${symbols.ok} Project ${repo.name} created`,
        [
          `Channels for **${repo.full_name}** are ready: <#${firstTextChannelId(guild, project)}>`,
          "Only you can see them. Use `/project invite` to add people; they need access to the repo on GitHub.",
          "",
          "The bot only reads the repository; it never changes it.",
        ].join("\n"),
        "ok",
      ),
    ],
  });
}

async function invite(interaction: ChatInputCommandInteraction) {
  getGitHubSetup();
  const { project, guild } = await resolveOwnedProject(interaction);
  const user = interaction.options.getUser("user");
  if (user?.bot) throw new UserError("Bots can't join projects.");
  if (user && isBanned(project.id, user.id)) throw new UserError(`${user} is banned from this project. Unban them first.`);
  const expires = (interaction.options.getString("expires") ?? "7d") as keyof typeof INVITE_TTL;
  const link = createInviteLink(project.id, interaction.user.id, user?.id ?? null, INVITE_TTL[expires]);
  const until = Math.floor((Date.now() + INVITE_TTL[expires]) / 1000);

  await interaction.reply({
    embeds: [
      card(
        `${symbols.branch} Join ${repoName(project)}`,
        [
          `${interaction.user} invited ${user ?? "you"} to the **${project.repo_full_name}** project on **${guild.name}**.`,
          "",
          "One click: sign in with Discord and GitHub, and you're in. You need access to the repository on GitHub.",
          user ? `This invite only works for ${user}.` : "Anyone with access to the repository can use this link.",
          `Expires <t:${until}:R>.`,
        ].join("\n"),
        "info",
      ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(`Join ${repoName(project)}`).setURL(link),
      ),
    ],
  });
}

async function moderate(interaction: ChatInputCommandInteraction, action: "ban" | "unban" | "mute" | "unmute") {
  const { project, guild } = await resolveOwnedProject(interaction);
  const user = interaction.options.getUser("user", true);
  if (user.id === project.owner_discord_id) throw new UserError("You can't do that to the project owner.");
  if (user.id === interaction.client.user.id) throw new UserError("You can't do that to the bot.");
  const name = repoName(project);
  let embed;

  if (action === "ban") {
    run("INSERT OR IGNORE INTO project_bans (project_id, discord_user_id) VALUES (?, ?)", project.id, user.id);
    run("DELETE FROM project_mutes WHERE project_id = ? AND discord_user_id = ?", project.id, user.id);
    run("DELETE FROM invites WHERE project_id = ? AND invited_discord_id = ?", project.id, user.id);
    await setAccess(guild, project, user.id, "banned");
    embed = card(`${symbols.fail} ${user.username} banned from ${name}`, `${user} can no longer see or join the project.`, "error");
  } else if (action === "unban") {
    if (!isBanned(project.id, user.id)) throw new UserError(`${user} isn't banned from this project.`);
    run("DELETE FROM project_bans WHERE project_id = ? AND discord_user_id = ?", project.id, user.id);
    await setAccess(guild, project, user.id, "none");
    embed = card(`${symbols.ok} ${user.username} unbanned`, `${user} can join **${name}** again with a new invite.`, "ok");
  } else if (action === "mute") {
    if (!(await hasAccess(guild, project, user.id))) throw new UserError(`${user} isn't in this project.`);
    const until = Date.now() + parseDuration(interaction.options.getString("duration", true));
    run(
      `INSERT INTO project_mutes (project_id, discord_user_id, until) VALUES (?, ?, ?)
       ON CONFLICT (project_id, discord_user_id) DO UPDATE SET until = excluded.until`,
      project.id,
      user.id,
      until,
    );
    await setAccess(guild, project, user.id, "muted");
    scheduleUnmute(interaction.client, project.id, user.id, until);
    embed = card(
      `${symbols.dot} ${user.username} muted in ${name}`,
      `${user} can read and listen, but not write or talk. Unmuted <t:${Math.floor(until / 1000)}:R>.`,
      "warn",
    );
  } else {
    if (!activeMuteUntil(project.id, user.id)) throw new UserError(`${user} isn't muted in this project.`);
    await unmute(interaction.client, project.id, user.id);
    embed = card(`${symbols.ok} ${user.username} unmuted`, `${user} can write and talk in **${name}** again.`, "ok");
  }
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function remove(interaction: ChatInputCommandInteraction) {
  const { project, guild } = await resolveOwnedProject(interaction);
  const name = repoName(project);
  const modalId = `project-delete:${interaction.id}`;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(`Delete the ${name} channels`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("name")
            .setLabel(`Type "${name}" to confirm`.slice(0, 45))
            .setPlaceholder(name)
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      ),
  );
  const submit = await interaction
    .awaitModalSubmit({ time: 5 * 60 * 1000, filter: (i) => i.customId === modalId && i.user.id === interaction.user.id })
    .catch(() => undefined);
  if (!submit) return;

  if (submit.fields.getTextInputValue("name").trim() !== name) {
    await submit.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [card(`${symbols.fail} Name didn't match`, `Nothing was deleted. Type exactly **${name}**.`, "error")],
    });
    return;
  }
  // Answer before deleting: this channel may be one of those removed.
  await submit.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [
      card(
        `${symbols.ok} ${name} channels deleted`,
        `The project's Discord channels are gone. **${project.repo_full_name}** on GitHub is untouched.`,
        "ok",
      ),
    ],
  });
  await deleteProjectChannels(guild, project);
}

export const projectCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("project")
    .setDescription("Discord channels for a GitHub repository.")
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create private channels for a repository you own.")
        .addStringOption((o) => o.setName("repo").setDescription("Search your repositories").setAutocomplete(true))
        .addStringOption((o) => o.setName("link").setDescription("…or paste the repository's GitHub link")),
    )
    .addSubcommand((sub) =>
      sub
        .setName("invite")
        .setDescription("Get a one-click invite link (works in any chat, also DMs).")
        .addStringOption((o) => o.setName("project").setDescription("Your project").setAutocomplete(true))
        .addUserOption((o) => o.setName("user").setDescription("Only this person can use the link"))
        .addStringOption((o) =>
          o
            .setName("expires")
            .setDescription("When the link stops working (default 7 days)")
            .addChoices({ name: "1 hour", value: "1h" }, { name: "1 day", value: "1d" }, { name: "7 days", value: "7d" }),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("ban")
        .setDescription("Remove someone from the project and block them from rejoining.")
        .addUserOption((o) => o.setName("user").setDescription("Who to ban").setRequired(true))
        .addStringOption((o) => o.setName("project").setDescription("Your project").setAutocomplete(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unban")
        .setDescription("Let a banned person join again with an invite.")
        .addUserOption((o) => o.setName("user").setDescription("Who to unban").setRequired(true))
        .addStringOption((o) => o.setName("project").setDescription("Your project").setAutocomplete(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("mute")
        .setDescription("Stop someone writing and talking in the project for a while.")
        .addUserOption((o) => o.setName("user").setDescription("Who to mute").setRequired(true))
        .addStringOption((o) => o.setName("duration").setDescription("e.g. 30m, 2h, 1d, 1w").setRequired(true))
        .addStringOption((o) => o.setName("project").setDescription("Your project").setAutocomplete(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unmute")
        .setDescription("Lift a mute early.")
        .addUserOption((o) => o.setName("user").setDescription("Who to unmute").setRequired(true))
        .addStringOption((o) => o.setName("project").setDescription("Your project").setAutocomplete(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete the project's Discord channels (never the GitHub repository).")
        .addStringOption((o) => o.setName("project").setDescription("Your project").setAutocomplete(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "create") return create(interaction);
    if (sub === "invite") return invite(interaction);
    if (sub === "delete") return remove(interaction);
    return moderate(interaction, sub as "ban" | "unban" | "mute" | "unmute");
  },

  async autocomplete(interaction) {
    if (interaction.options.getFocused(true).name === "repo") return respondWithRepos(interaction, true);
    return respondWithProjects(interaction);
  },
};
