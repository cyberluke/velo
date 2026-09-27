import { describe, it, expect } from "vitest";
import { detectMeetingIntent, isMeetingQuestion, type MeetingIntent } from "./askMeetings";

describe("detectMeetingIntent", () => {
  const cases: [string, MeetingIntent | null][] = [
    // The four example queries from the V271 spec.
    ["What meetings do I have today?", "today"],
    ["What did we decide in yesterday's meeting with X?", "history"],
    ["Which email thread led to this meeting?", "thread"],
    ["Draft a follow-up from the meeting action items.", "followup"],
    // Calendar words without meeting words fall through to the inbox search.
    ["Do I have a dentist appointment on Friday?", "upcoming"],
    ["Anything on my calendar this week?", "upcoming"],
    ["What's on my agenda tomorrow?", "upcoming"],
    ["Summarize the discussion from last week's sync.", "history"],
    ["Compose a follow-up from the launch meeting's action items.", "followup"],
    // Non-calendar questions never match.
    ["Who sent me the invoice?", null],
    ["Where is my package?", null],
    ["Find emails from Alice about the budget.", null],
  ];

  it.each(cases)("detects %j as %s", (question, expected) => {
    expect(detectMeetingIntent(question)).toBe(expected);
  });
});

describe("isMeetingQuestion", () => {
  it("is true for meeting/calendar wording", () => {
    expect(isMeetingQuestion("What meetings do I have today?")).toBe(true);
    expect(isMeetingQuestion("Did the team confirm the workshop?")).toBe(true);
  });

  it("is false for ordinary inbox questions", () => {
    expect(isMeetingQuestion("Where is my tracking number?")).toBe(false);
  });
});