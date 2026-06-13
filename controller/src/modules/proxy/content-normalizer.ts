export const normalizeToolRequest = (
  payload: Record<string, unknown>,
  options: { supportsTools?: boolean } = {}
): boolean => {
  let changed = false;
  const supportsTools = options.supportsTools !== false;

  if (payload["functions"] && !payload["tools"] && Array.isArray(payload["functions"])) {
    payload["tools"] = (payload["functions"] as Array<Record<string, unknown>>).map(
      (functionDefinition) => ({
        type: "function",
        function: functionDefinition,
      })
    );
    delete payload["functions"];
    changed = true;
  }
  if (Array.isArray(payload["tools"]) && payload["tools"].length === 0) {
    delete payload["tools"];
    changed = true;
  }
  if (!supportsTools) {
    if (payload["functions"] !== undefined) {
      delete payload["functions"];
      changed = true;
    }
    if (payload["tools"] !== undefined) {
      delete payload["tools"];
      changed = true;
    }
    if (payload["tool_choice"] !== undefined) {
      delete payload["tool_choice"];
      changed = true;
    }
    return changed;
  }
  if (payload["tool_choice"] === "auto") {
    delete payload["tool_choice"];
    changed = true;
  }
  return changed;
};

const collapseTextContentParts = (content: unknown): string | null => {
  if (!Array.isArray(content)) {
    return null;
  }

  const chunks: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      chunks.push(part);
      continue;
    }
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      return null;
    }

    const record = part as Record<string, unknown>;
    const type = typeof record["type"] === "string" ? record["type"] : "";
    if (type !== "text" && type !== "input_text") {
      return null;
    }
    const text = record["text"];
    if (typeof text === "string") {
      chunks.push(text);
      continue;
    }
    return null;
  }

  return chunks.join("");
};

export const normalizeChatMessageContentParts = (payload: Record<string, unknown>): boolean => {
  const messages = payload["messages"];
  if (!Array.isArray(messages)) {
    return false;
  }

  let changed = false;
  for (const message of messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      continue;
    }

    const record = message as Record<string, unknown>;
    const collapsed = collapseTextContentParts(record["content"]);
    if (collapsed === null) {
      continue;
    }

    record["content"] = collapsed;
    changed = true;
  }

  return changed;
};
