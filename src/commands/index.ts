import { clearCommand } from "./clear.js";
import { codeReviewCommand } from "./code-review.js";
import { avatarCommand } from "./avatar.js";
import { pingCommand } from "./ping.js";
import { pollCommand } from "./poll.js";
import { serverInfoCommand } from "./serverinfo.js";
import { userInfoCommand } from "./userinfo.js";
import type { Command } from "../types/command.js";

export const commands: Command[] = [
  pingCommand,
  clearCommand,
  userInfoCommand,
  serverInfoCommand,
  avatarCommand,
  pollCommand,
  codeReviewCommand,
];
