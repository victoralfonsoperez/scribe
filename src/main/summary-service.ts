import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { LLMClient } from "./llm-client.js";
import type { MeetingRepository } from "./meeting-repository.js";
import type { Summary, SummarySettings } from "../shared/types.js";

const PROMPT_TEMPLATES: Record<string, string> = {
  default: `You are a meeting summarizer. Analyze the transcript and produce a structured summary with the following sections:

## Key Topics
- List the main topics discussed

## Decisions
- List any decisions that were made

## Action Items
- List action items with owners if mentioned

## Follow-ups
- List items that need follow-up

Be concise and use bullet points. If a section has no relevant content, write "None identified."`,

  brief: `You are a meeting summarizer. Produce a brief 3-bullet TL;DR of this meeting transcript. Each bullet should capture one key takeaway. Be extremely concise.`,

  decisions: `You are a meeting analyst. Extract the key outputs from this meeting transcript.

## Decisions Made
List every decision that was reached. For each decision, note who made or approved it if identifiable.

## Action Items & Responsible Parties
List every task or commitment. For each item, include:
- What needs to be done
- Who is responsible (name or role if mentioned)
- Deadline if mentioned

## Open Questions
List anything left unresolved or requiring further discussion.

If a section has no relevant content, write "None identified." Be specific and attribute ownership wherever the transcript allows.`,

  detailed: `You are a meeting summarizer. Produce comprehensive meeting notes from this transcript. Include:

## Overview
A 2-3 sentence summary of the meeting purpose and outcome.

## Key Topics
Detailed notes on each topic discussed, with relevant context.

## Decisions
All decisions made, with rationale if discussed.

## Action Items
All action items, with owners and deadlines if mentioned.

## Follow-ups
Items requiring follow-up, open questions, and unresolved issues.

## Key Quotes
Notable quotes or statements worth preserving (with attribution if possible).

Be thorough but organized.`,
};

const SETTINGS_FILE = "summary-settings.json";

export class SummaryService {
  private settingsPath: string;

  constructor(
    private llmClient: LLMClient,
    private meetingRepo: MeetingRepository,
  ) {
    const dataDir = path.join(app.getPath("userData"), "data");
    fs.mkdirSync(dataDir, { recursive: true });
    this.settingsPath = path.join(dataDir, SETTINGS_FILE);
  }

  async generateSummary(
    meetingId: string,
    promptKey: string = "default",
  ): Promise<Summary> {
    const meeting = this.meetingRepo.getMeeting(meetingId);
    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    const segments = this.meetingRepo.getSegments(meetingId);
    if (segments.length === 0) {
      throw new Error("No transcript segments to summarize");
    }

    const transcript = segments.map((s) => s.text).join("\n");
    const systemPrompt =
      PROMPT_TEMPLATES[promptKey] ?? PROMPT_TEMPLATES["default"];
    const settings = await this.getSettings();

    const result = await this.llmClient.summarize(
      transcript,
      systemPrompt,
      settings,
    );

    const summary: Summary = {
      id: crypto.randomUUID(),
      meetingId,
      prompt: promptKey,
      content: result.content,
      model: result.model,
      createdAt: Date.now(),
    };

    this.meetingRepo.addSummary(summary);
    return summary;
  }

  getSummaries(meetingId: string): Summary[] {
    const rows = this.meetingRepo.getSummaries(meetingId);
    return rows.map((r) => ({
      id: r.id,
      meetingId: r.meeting_id,
      prompt: r.prompt,
      content: r.content,
      model: r.model,
      createdAt: r.created_at,
    }));
  }

  deleteSummary(id: string): void {
    this.meetingRepo.deleteSummary(id);
  }

  async getSettings(): Promise<SummarySettings> {
    try {
      const data = JSON.parse(
        await fs.promises.readFile(this.settingsPath, "utf-8"),
      ) as Partial<SummarySettings>;
      return {
        apiKey: data.apiKey ?? "",
        provider: data.provider ?? "claude",
        ollamaUrl: data.ollamaUrl ?? "http://localhost:11434",
        ollamaModel: data.ollamaModel ?? "llama3.2",
      };
    } catch {
      return {
        apiKey: "",
        provider: "claude",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "llama3.2",
      };
    }
  }

  async setSettings(settings: SummarySettings): Promise<void> {
    await fs.promises.writeFile(
      this.settingsPath,
      JSON.stringify(settings, null, 2),
    );
  }
}
