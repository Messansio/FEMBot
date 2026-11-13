import type { ApplicationCommandOptionChoiceData, AutocompleteInteraction } from "discord.js";
import { getGitHubToken, githubGet } from "./github.js";
import type { GitHubRepo } from "./github.js";
import { projectsOwnedBy } from "./projects.js";

const CACHE_MS = 60_000;
const repoCache = new Map<string, { at: number; repos: GitHubRepo[] }>();

/** The user's repos (cached a minute: autocomplete must answer within 3 seconds). */
async function userRepos(discordUserId: string, ownedOnly: boolean): Promise<GitHubRepo[]> {
  const key = `${discordUserId}:${ownedOnly}`;
  const cached = repoCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.repos;

  const token = await getGitHubToken(discordUserId);
  if (!token) return [];
  const affiliation = ownedOnly ? "owner" : "owner,collaborator,organization_member";
  const repos = await githubGet<GitHubRepo[]>(token, `/user/repos?affiliation=${affiliation}&sort=updated&per_page=100`);
  repoCache.set(key, { at: Date.now(), repos });
  return repos;
}

function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

export async function respondWithRepos(interaction: AutocompleteInteraction, ownedOnly: boolean): Promise<void> {
  const query = interaction.options.getFocused();
  const repos = await userRepos(interaction.user.id, ownedOnly).catch(() => []);
  const choices: ApplicationCommandOptionChoiceData<string>[] = repos
    .filter((repo) => matches(repo.full_name, query))
    .slice(0, 25)
    .map((repo) => ({ name: `${repo.private ? "🔒 " : ""}${repo.full_name}`.slice(0, 100), value: repo.full_name }));
  if (!choices.length && !repos.length) {
    choices.push({ name: "Run /github login first, or paste a GitHub link", value: query || "-" });
  }
  await interaction.respond(choices);
}

export async function respondWithProjects(interaction: AutocompleteInteraction): Promise<void> {
  const query = interaction.options.getFocused();
  const choices = projectsOwnedBy(interaction.user.id)
    .map((project) => {
      const guild = interaction.client.guilds.cache.get(project.guild_id)?.name ?? "unknown server";
      return { name: `${project.repo_full_name} · ${guild}`.slice(0, 100), value: String(project.id) };
    })
    .filter((choice) => matches(choice.name, query))
    .slice(0, 25);
  await interaction.respond(choices);
}
