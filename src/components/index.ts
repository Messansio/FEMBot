import type { ComponentHandler } from "../types/command.js";
import { rolePanelHandler } from "./rolePanel.js";
import { ticketHandler } from "./ticket.js";

export const components: ComponentHandler[] = [rolePanelHandler, ticketHandler];
