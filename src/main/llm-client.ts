import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import type { SummarySettings } from "../shared/types.js";

export interface LLMResponse {
  content: string;
  model: string;
}

const MAX_SCREENSHOTS_FOR_SUMMARY = 10;

export class LLMClient {
  async summarize(
    transcript: string,
    systemPrompt: string,
    settings: SummarySettings,
    screenshotPaths?: string[],
  ): Promise<LLMResponse> {
    if (settings.provider === "ollama") {
      return this.summarizeWithOllama(transcript, systemPrompt, settings);
    }
    return this.summarizeWithClaude(
      transcript,
      systemPrompt,
      settings,
      screenshotPaths,
    );
  }

  private async summarizeWithClaude(
    transcript: string,
    systemPrompt: string,
    settings: SummarySettings,
    screenshotPaths?: string[],
  ): Promise<LLMResponse> {
    if (!settings.apiKey) {
      throw new Error(
        "Claude API key not configured. Set it in Settings > Summarization.",
      );
    }

    const client = new Anthropic({ apiKey: settings.apiKey });

    // Build user message content — include screenshots if available
    const userContent: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];

    const validPaths = (screenshotPaths ?? [])
      .filter((p) => fs.existsSync(p))
      .slice(0, MAX_SCREENSHOTS_FOR_SUMMARY);

    if (validPaths.length > 0) {
      userContent.push({
        type: "text",
        text: `The following ${validPaths.length} screenshot(s) were captured during the meeting:`,
      });
      for (const p of validPaths) {
        const data = fs.readFileSync(p).toString("base64");
        userContent.push({
          type: "image",
          source: { type: "base64", media_type: "image/png", data },
        });
      }
    }

    userContent.push({
      type: "text",
      text: `Here is the meeting transcript:\n\n${transcript}`,
    });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    return { content: textBlock.text, model: message.model };
  }

  private async summarizeWithOllama(
    transcript: string,
    systemPrompt: string,
    settings: SummarySettings,
  ): Promise<LLMResponse> {
    const baseUrl = settings.ollamaUrl || "http://localhost:11434";
    const model = settings.ollamaModel || "llama3.2";

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: `${systemPrompt}\n\nHere is the meeting transcript:\n\n${transcript}`,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Ollama request failed: ${res.status} ${res.statusText}`,
      );
    }

    const data = (await res.json()) as { response: string; model: string };
    return { content: data.response, model: data.model };
  }
}
