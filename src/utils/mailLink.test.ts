import { createMailLink, parseMailLink, isCalendarLink } from "./mailLink";

describe("public mail links", () => {
  it("round-trips encoded IMAP and account identifiers", () => {
    const target = { accountId: "a+one@example.com", threadId: "imap-a-Project / Travel-12", messageId: "imap-a-A&B / 旅行-42" };
    expect(parseMailLink(createMailLink(target))).toEqual(target);
  });
  it("allows a thread-only link", () => {
    expect(parseMailLink("naiemail://open?account=a&thread=t")).toEqual({ accountId: "a", threadId: "t" });
  });
  it.each([
    "naiemail://delete?account=a&thread=t", "https://open?account=a&thread=t",
    "naiemail://user@open?account=a&thread=t", "naiemail://open/file?account=a&thread=t",
    "naiemail://open?account=a&thread=t#x", "naiemail://open?account=a&thread=t&thread=other",
    "naiemail://open?account=a&thread=t&message=", "naiemail://open?account=a&thread=t&execute=x",
    "naiemail://open?account=a&thread=%00", "naiemail://open?thread=t",
  ])("rejects malformed or ambiguous input: %s", (url) => {
    expect(() => parseMailLink(url)).toThrow();
  });
});

describe("calendar deep link", () => {
  it.each(["naiemail://calendar", "naiemail://calendar/", "NAIEMAIL://CALENDAR"])(
    "accepts the bare calendar host: %s",
    (url) => {
      expect(isCalendarLink(url)).toBe(true);
    },
  );
  it.each([
    "naiemail://open?account=a&thread=t", "mailto:calendar@example.com", "https://calendar",
    "naiemail://calendar?x=1", "naiemail://calendar#frag", "naiemail://calendar/other",
    "naiemail://user@calendar", "naiemail://calendar:8080",
  ])("rejects anything but the bare calendar host: %s", (url) => {
    expect(isCalendarLink(url)).toBe(false);
  });
});
