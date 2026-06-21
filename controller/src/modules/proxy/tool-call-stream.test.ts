import { expect, test } from "bun:test";
import { createToolCallStream } from "./tool-call-stream";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const streamText = async (preserveReasoningTagsInContent: boolean): Promise<string> => {
  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "<think>reason" } }] })}\n\n`
        )
      );
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "ing</think>answer" } }] })}\n\n`
        )
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  const rewritten = createToolCallStream(
    upstream.getReader(),
    () => {},
    () => {},
    { preserveReasoningTagsInContent }
  );
  const reader = rewritten.getReader();
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }
  output += decoder.decode();
  return output;
};

const streamReasoningField = async (suppressReasoningContent: boolean): Promise<string> => {
  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: "hidden" } }] })}\n\n`
        )
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  const rewritten = createToolCallStream(
    upstream.getReader(),
    () => {},
    () => {},
    { suppressReasoningContent }
  );
  const reader = rewritten.getReader();
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }
  output += decoder.decode();
  return output;
};

test("preserves thinking tags in content when requested", async () => {
  const output = await streamText(true);

  expect(output).toContain("<think>reason");
  expect(output).toContain("ing</think>answer");
  expect(output).not.toContain("reasoning_content");
});

test("extracts thinking tags by default", async () => {
  const output = await streamText(false);

  expect(output).toContain("reasoning_content");
  expect(output).toContain("answer");
  expect(output).not.toContain("<think>reason");
});

test("suppresses upstream reasoning fields when requested", async () => {
  const output = await streamReasoningField(true);

  expect(output).not.toContain("reasoning_content");
  expect(output).not.toContain("hidden");
});

test("keeps upstream reasoning fields by default", async () => {
  const output = await streamReasoningField(false);

  expect(output).toContain("reasoning_content");
  expect(output).toContain("hidden");
});
