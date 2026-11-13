import type { Message, MessageReaction, PartialMessageReaction, PartialUser, User } from "discord.js";
import { renderTreePage } from "./gitViews.js";
import type { TreeData, View } from "./gitViews.js";

// ⬆️ / ⬇️ under a /git tree message scroll it. The clicker's reaction is removed at
// once, so the buttons stay clean. Neighbouring pages are rendered ahead of time, so a
// click only swaps in an image that is already there.

const UP = "⬆️";
const DOWN = "⬇️";
const OVERLAP = 4; // rows kept from the previous page, so scrolling keeps context
const IDLE_MS = 30 * 60 * 1000;

interface Page {
  view: View;
  shown: number;
}

interface Session {
  message: Message;
  tree: TreeData;
  format: "image" | "text";
  offset: number;
  shown: number;
  pages: Map<number, Promise<Page>>;
  /** Can't remove other people's reactions (DMs, no Manage Messages): every add/remove is a click. */
  toggle: boolean;
  queue: Promise<void>;
  timer?: NodeJS.Timeout;
}

const sessions = new Map<string, Session>();

function getPage(session: Session, offset: number): Promise<Page> {
  let page = session.pages.get(offset);
  if (!page) {
    page = renderTreePage(session.tree, session.format, offset);
    page.catch(() => session.pages.delete(offset));
    session.pages.set(offset, page);
  }
  return page;
}

function targetOffset(session: Session, direction: 1 | -1): number | undefined {
  const total = session.tree.layout.rows.length;
  const step = Math.max(1, session.shown - OVERLAP);
  if (direction > 0) return session.offset + session.shown >= total ? undefined : session.offset + step;
  return session.offset === 0 ? undefined : Math.max(0, session.offset - step);
}

function prefetch(session: Session): void {
  for (const direction of [1, -1] as const) {
    const offset = targetOffset(session, direction);
    if (offset !== undefined) void getPage(session, offset).catch(() => undefined);
  }
}

function keepAlive(session: Session): void {
  clearTimeout(session.timer);
  session.timer = setTimeout(() => {
    sessions.delete(session.message.id);
    // Take the arrows away so nobody clicks a dead control.
    for (const emoji of [UP, DOWN]) {
      void session.message.reactions.cache.get(emoji)?.users.remove().catch(() => undefined);
    }
  }, IDLE_MS);
  session.timer.unref();
}

/** Adds the arrows and starts listening; no-op when the whole tree fits on one page. */
export async function startTreeScroll(message: Message, tree: TreeData, format: "image" | "text", first: Page): Promise<void> {
  if (first.shown >= tree.layout.rows.length) return;
  try {
    await message.react(UP);
    await message.react(DOWN);
  } catch {
    return; // the bot can't react here (e.g. user-installed in a server it isn't in)
  }
  const session: Session = {
    message,
    tree,
    format,
    offset: 0,
    shown: first.shown,
    pages: new Map([[0, Promise.resolve(first)]]),
    toggle: message.channel.isDMBased(),
    queue: Promise.resolve(),
  };
  sessions.set(message.id, session);
  keepAlive(session);
  prefetch(session);
}

export function handleTreeReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  added: boolean,
): void {
  const session = sessions.get(reaction.message.id);
  if (!session || user.id === reaction.client.user.id) return;
  const direction = reaction.emoji.name === UP ? -1 : reaction.emoji.name === DOWN ? 1 : 0;
  if (!direction) return;

  if (added && !session.toggle) {
    // Remove the click right away; if not allowed, fall back to toggle mode.
    reaction.users.remove(user.id).catch(() => {
      session.toggle = true;
    });
  }
  // Our own removal also fires a "remove" event: only count removals in toggle mode.
  if (!added && !session.toggle) return;

  session.queue = session.queue
    .then(async () => {
      const offset = targetOffset(session, direction);
      if (offset === undefined) return;
      const page = await getPage(session, offset);
      await session.message.edit(
        session.format === "image"
          ? { files: page.view.files, attachments: [] }
          : { content: page.view.messages[0] ?? "" },
      );
      session.offset = offset;
      session.shown = page.shown;
      keepAlive(session);
      prefetch(session);
    })
    .catch((error: unknown) => console.error("Tree scroll failed:", error));
}
