import type { Command, CommandCategory } from "../types/command.js";
import { configCommand } from "./community/config.js";
import { leaderboardCommand, levelsCommand, rankCommand } from "./community/levels.js";
import { rolesPanelCommand } from "./community/rolesPanel.js";
import { ticketCommand } from "./community/ticket.js";
import { autoroleCommand, welcomeCommand } from "./community/welcome.js";
import { avatarCommand } from "./info/avatar.js";
import { pingCommand } from "./info/ping.js";
import { serverInfoCommand } from "./info/serverinfo.js";
import { userInfoCommand } from "./info/userinfo.js";
import { banCommand } from "./moderation/ban.js";
import { caseCommand } from "./moderation/case.js";
import { lockCommand, slowmodeCommand, unlockCommand } from "./moderation/channel.js";
import { historyCommand, warningsCommand } from "./moderation/history.js";
import { kickCommand } from "./moderation/kick.js";
import { nickCommand, roleCommand } from "./moderation/member.js";
import { purgeCommand } from "./moderation/purge.js";
import { timeoutCommand, untimeoutCommand } from "./moderation/timeout.js";
import { unbanCommand } from "./moderation/unban.js";
import { noteCommand, warnCommand } from "./moderation/warn.js";
import { pollCommand } from "./utility/poll.js";

export const commandsByCategory: Record<CommandCategory, Command[]> = {
  info: [pingCommand, userInfoCommand, serverInfoCommand, avatarCommand],
  utility: [pollCommand],
  moderation: [
    banCommand,
    unbanCommand,
    kickCommand,
    timeoutCommand,
    untimeoutCommand,
    warnCommand,
    noteCommand,
    warningsCommand,
    historyCommand,
    caseCommand,
    purgeCommand,
    slowmodeCommand,
    lockCommand,
    unlockCommand,
    roleCommand,
    nickCommand,
  ],
  community: [
    configCommand,
    welcomeCommand,
    autoroleCommand,
    rolesPanelCommand,
    ticketCommand,
    rankCommand,
    leaderboardCommand,
    levelsCommand,
  ],
};

export const commands: Command[] = Object.values(commandsByCategory).flat();
