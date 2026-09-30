import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("@/services/v271/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/v271/settings")>();
  return { ...actual, getV271Config: vi.fn(), isV271Ready: vi.fn() };
});

vi.mock("@/services/v271/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/v271/adapters")>();
  return {
    ...actual,
    collectMailEntities: vi.fn(),
    collectCalendarEntities: vi.fn(),
    collectMeetingEntities: vi.fn(),
  };
});

import { getDb } from "@/services/db/connection";
import { getV271Config } from "@/services/v271/settings";
import {
  collectMailEntities,
  collectCalendarEntities,
  collectMeetingEntities,
} from "@/services/v271/adapters";
import { stableStringify, sha256Hex, syncGraph } from "./graphSync";
import { RecordingGraphTransport } from "./transport";
import { createMockDb } from "@/test/mocks/db.mock";

const mockDb = createMockDb();

/** Rows the fake "graph_entities" table holds between syncs. */
let graphRows: { entity_type: string; source_id: string; payload_hash: string }[] = [];
/** Rows the fake "calendar_events" table holds. */
let aliveEvents: { id: string; account_id: string }[] = [];

function routeSelect(sql: string): unknown[] {
  if (sql.includes("FROM calendar_events")) return aliveEvents;
  if (sql.includes("FROM meeting_records")) return [];
  if (sql.includes("FROM graph_entities")) return graphRows;
  return [];
}

const baseCalendarData = {
  entities: [
    {
      type: "calendar.event" as const,
      sourceId: "acc-1:event:evt-1",
      data: {
        event_id: "evt-1",
        title: "Design review",
        start: 1_750_000_000,
        end: 1_750_003_600,
        timezone: "UTC",
        organizer: "alice@example.com",
        meeting_link: "https://meet.example.com/abc",
        location: "Room 1",
        status: "confirmed",
        recurrence: null,
      },
    },
    {
      type: "calendar.participant" as const,
      sourceId: "acc-1:event:evt-1:participant:alice@example.com",
      data: { event: "acc-1:event:evt-1", email: "alice@example.com", role: "organizer" },
    },
    {
      type: "calendar.participant" as const,
      sourceId: "acc-1:event:evt-1:participant:bob@example.com",
      data: { event: "acc-1:event:evt-1", email: "bob@example.com", role: "attendee", response_status: "accepted" },
    },
  ],
  edges: [
    {
      type: "ORGANIZED" as const,
      fromType: "calendar.participant" as const,
      fromSourceId: "acc-1:event:evt-1:participant:alice@example.com",
      toType: "calendar.event" as const,
      toSourceId: "acc-1:event:evt-1",
    },
    {
      type: "ATTENDED" as const,
      fromType: "calendar.participant" as const,
      fromSourceId: "acc-1:event:evt-1:participant:bob@example.com",
      toType: "calendar.event" as const,
      toSourceId: "acc-1:event:evt-1",
      data: { responseStatus: "accepted" },
    },
    {
      type: "RELATED_TO" as const,
      fromType: "calendar.event" as const,
      fromSourceId: "acc-1:event:evt-1",
      toType: "mail.thread" as const,
      toSourceId: "acc-1:thread:thread-1",
    },
  ],
  provenance: [],
};

const empty = { entities: [], edges: [], provenance: [] };

describe("stableStringify", () => {
  it("produces the same output for objects with different key order", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it("handles nested arrays and objects deterministically", () => {
    const left = { list: [{ x: 1, y: [3, 2, 1] }], z: null };
    const right = { z: null, list: [{ y: [3, 2, 1], x: 1 }] };
    expect(stableStringify(left)).toBe(stableStringify(right));
  });
});

describe("sha256Hex", () => {
  it("returns a 64-char hex digest and is deterministic", async () => {
    const a = await sha256Hex("hello");
    const b = await sha256Hex("hello");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });
});

describe("syncGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphRows = [];
    // The event exists locally unless a test deletes it.
    aliveEvents = [{ id: "evt-1", account_id: "acc-1" }];
    mockDb.select.mockImplementation((sql: string) => Promise.resolve(routeSelect(sql)));
    mockDb.execute.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("graph_entities")) {
        const [entityType, sourceId, hash] = params as [string, string, string];
        graphRows = graphRows.filter(
          (r) => !(r.entity_type === entityType && r.source_id === sourceId),
        );
        graphRows.push({ entity_type: entityType, source_id: sourceId, payload_hash: hash });
      }
      return { rowsAffected: 1 };
    });
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
    vi.mocked(getV271Config).mockResolvedValue({
      enabled: true,
      identityUrl: "https://identity.v271.example",
      graphUrl: "https://graph.v271.example",
      clientId: "naiemail",
    });
    vi.mocked(collectMailEntities).mockResolvedValue(empty);
    vi.mocked(collectCalendarEntities).mockResolvedValue(baseCalendarData);
    vi.mocked(collectMeetingEntities).mockResolvedValue(empty);
  });

  it("skips entirely when V271 sync is disabled", async () => {
    vi.mocked(getV271Config).mockResolvedValue({
      enabled: false,
      identityUrl: null,
      graphUrl: null,
      clientId: null,
    });
    const result = await syncGraph(new RecordingGraphTransport());
    expect(result.skipped).toBe(true);
    expect(collectCalendarEntities).not.toHaveBeenCalled();
  });

  it("pushes newly collected entities on the first run", async () => {
    const transport = new RecordingGraphTransport();
    const result = await syncGraph(transport);

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(3);
    expect(result.pushed).toBe(3);
    expect(transport.pushed).toHaveLength(1);
    const payload = transport.pushed[0]!;
    expect(payload.client).toBe("naiemail");
    expect(payload.entities.map((e) => e.type)).toContain("calendar.event");
    // RELATED_TO edge to the mail thread is included.
    expect(payload.edges.some((e) => e.type === "RELATED_TO")).toBe(true);
  });

  it("is idempotent: a second sync with unchanged data pushes nothing", async () => {
    const transport = new RecordingGraphTransport();
    const first = await syncGraph(transport);
    expect(first.pushed).toBe(3);
    expect(graphRows).toHaveLength(3);

    const second = await syncGraph(transport);
    expect(second.changed).toBe(0);
    expect(second.pushed).toBe(0);
    expect(transport.pushed).toHaveLength(1); // only the first payload
  });

  it("pushes again when an event changed (attendee response)", async () => {
    const transport = new RecordingGraphTransport();
    await syncGraph(transport);
    expect(transport.pushed).toHaveLength(1);

    // Attendee responds: responseStatus changes on the participant entity.
    const changedData = {
      ...baseCalendarData,
      entities: baseCalendarData.entities.map((e) =>
        e.sourceId.includes("bob@example.com")
          ? { ...e, data: { ...e.data, response_status: "declined" } }
          : e,
      ),
    };
    vi.mocked(collectCalendarEntities).mockResolvedValue(changedData);

    const second = await syncGraph(transport);
    expect(second.changed).toBe(1);
    expect(second.pushed).toBe(1);
    expect(transport.pushed).toHaveLength(2);
    expect(transport.pushed[1]!.entities[0]!.data.response_status).toBe("declined");
  });

  it("sends a tombstone for a calendar event that no longer exists locally", async () => {
    const transport = new RecordingGraphTransport();
    await syncGraph(transport);
    expect(transport.pushed).toHaveLength(1);

    // The event is deleted locally, and the collector no longer sees it.
    aliveEvents = [];
    vi.mocked(collectCalendarEntities).mockResolvedValue(empty);

    const second = await syncGraph(transport);
    expect(second.changed).toBe(1);
    expect(second.pushed).toBe(1);
    const tombstone = transport.pushed[1]!.entities[0]!;
    expect(tombstone.type).toBe("calendar.event");
    expect(tombstone.data.deleted).toBe(true);
  });

  it("leaves hashes untouched when the push fails, so the change retries", async () => {
    const failingTransport: RecordingGraphTransport = {
      pushed: [],
      async push() {
        return { ok: false, status: 500, error: "boom" };
      },
      clear() {
        this.pushed.length = 0;
      },
    };
    const result = await syncGraph(failingTransport);
    expect(result.ok).toBe(false);
    expect(result.pushed).toBe(0);
    expect(graphRows).toHaveLength(0);
  });
});