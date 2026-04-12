export interface AssistantCommandSpec {
  name: string;
  description: string;
  usage: string;
  acceptsArgument?: boolean;
}

export const ASSISTANT_COMMANDS: AssistantCommandSpec[] = [
  {
    name: "/clear",
    description: "Clear the current Assistant chat history.",
    usage: "/clear",
  },
  {
    name: "/compact",
    description: "Compact the current chat into a durable summary.",
    usage: "/compact [focus]",
    acceptsArgument: true,
  },
  {
    name: "/help",
    description: "Show the built-in Assistant commands and usage.",
    usage: "/help",
  },
];

export interface ParsedAssistantCommandInput {
  filtered: AssistantCommandSpec[];
  isCommandInput: boolean;
  leadingWhitespace: string;
  token: string;
}

export function parseAssistantCommandInput(
  input: string,
): ParsedAssistantCommandInput {
  const trimmedStart = input.trimStart();
  const leadingWhitespace = input.slice(0, input.length - trimmedStart.length);

  if (!trimmedStart.startsWith("/")) {
    return {
      filtered: [],
      isCommandInput: false,
      leadingWhitespace,
      token: "",
    };
  }

  const tokenMatch = trimmedStart.match(/^\/\S*/);
  const token = tokenMatch?.[0] ?? "/";
  const filtered =
    token === "/"
      ? ASSISTANT_COMMANDS
      : ASSISTANT_COMMANDS.filter((command) => command.name.startsWith(token));

  return {
    filtered,
    isCommandInput: true,
    leadingWhitespace,
    token,
  };
}

export function insertAssistantCommand(
  input: string,
  command: AssistantCommandSpec,
): string {
  const trimmedStart = input.trimStart();
  const leadingWhitespace = input.slice(0, input.length - trimmedStart.length);
  const tokenMatch = trimmedStart.match(/^\/\S*/);
  const tokenLength = tokenMatch?.[0].length ?? 0;
  const suffix = trimmedStart.slice(tokenLength);

  if (!command.acceptsArgument) {
    return `${leadingWhitespace}${command.name}`;
  }

  if (!suffix) {
    return `${leadingWhitespace}${command.name} `;
  }

  return `${leadingWhitespace}${command.name}${suffix.startsWith(" ") ? suffix : ` ${suffix}`}`;
}
