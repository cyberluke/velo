import { categorizeByRules, type CategorizationInput } from "./ruleEngine";

function input(overrides: Partial<CategorizationInput> = {}): CategorizationInput {
  return {
    labelIds: [],
    fromAddress: null,
    listUnsubscribe: null,
    subject: null,
    snippet: null,
    ...overrides,
  };
}

describe("categorizeByRules", () => {
  describe("Layer 1: Gmail CATEGORY_* labels", () => {
    it("maps CATEGORY_PROMOTIONS to Promotions", () => {
      expect(categorizeByRules(input({ labelIds: ["INBOX", "CATEGORY_PROMOTIONS"] }))).toBe("Promotions");
    });

    it("maps CATEGORY_SOCIAL to Social", () => {
      expect(categorizeByRules(input({ labelIds: ["INBOX", "CATEGORY_SOCIAL"] }))).toBe("Social");
    });

    it("maps CATEGORY_UPDATES to Updates", () => {
      expect(categorizeByRules(input({ labelIds: ["INBOX", "CATEGORY_UPDATES"] }))).toBe("Updates");
    });

    it("maps CATEGORY_FORUMS to Primary", () => {
      expect(categorizeByRules(input({ labelIds: ["INBOX", "CATEGORY_FORUMS"] }))).toBe("Primary");
    });

    it("maps CATEGORY_PERSONAL to Primary", () => {
      expect(categorizeByRules(input({ labelIds: ["INBOX", "CATEGORY_PERSONAL"] }))).toBe("Primary");
    });

    it("Gmail labels take priority over domain heuristics", () => {
      expect(categorizeByRules(input({
        labelIds: ["CATEGORY_UPDATES"],
        fromAddress: "marketing@substack.com",
      }))).toBe("Updates");
    });
  });

  describe("Layer 2: Domain heuristics", () => {
    it("classifies social network domains as Social", () => {
      expect(categorizeByRules(input({ fromAddress: "notifications@facebookmail.com" }))).toBe("Social");
      expect(categorizeByRules(input({ fromAddress: "info@linkedin.com" }))).toBe("Social");
      expect(categorizeByRules(input({ fromAddress: "notify@twitter.com" }))).toBe("Social");
    });

    it("classifies newsletter platform domains as Newsletters", () => {
      expect(categorizeByRules(input({ fromAddress: "author@substack.com" }))).toBe("Newsletters");
      expect(categorizeByRules(input({ fromAddress: "campaign@mailchimp.com" }))).toBe("Newsletters");
      expect(categorizeByRules(input({ fromAddress: "sender@beehiiv.com" }))).toBe("Newsletters");
    });

    it("classifies promotional prefixes as Promotions", () => {
      expect(categorizeByRules(input({ fromAddress: "marketing@example.com" }))).toBe("Promotions");
      expect(categorizeByRules(input({ fromAddress: "promo@shop.com" }))).toBe("Promotions");
      expect(categorizeByRules(input({ fromAddress: "deals@store.com" }))).toBe("Promotions");
    });

    it("classifies update prefixes as Updates", () => {
      expect(categorizeByRules(input({ fromAddress: "noreply@github.com" }))).toBe("Updates");
      expect(categorizeByRules(input({ fromAddress: "notifications@bank.com" }))).toBe("Updates");
      expect(categorizeByRules(input({ fromAddress: "no-reply@service.com" }))).toBe("Updates");
      expect(categorizeByRules(input({ fromAddress: "security@company.com" }))).toBe("Updates");
    });

    it("social domain takes priority over update prefix", () => {
      // "notifications@facebookmail.com" - domain wins over prefix
      expect(categorizeByRules(input({ fromAddress: "notifications@facebookmail.com" }))).toBe("Social");
    });
  });

  describe("Layer 3: List-Unsubscribe header", () => {
    it("classifies list-unsubscribe mail as Promotions by default", () => {
      expect(categorizeByRules(input({
        fromAddress: "someone@randomcompany.com",
        listUnsubscribe: "<mailto:unsub@example.com>",
      }))).toBe("Promotions");
    });

    it("classifies list-unsubscribe from newsletter domains as Newsletters", () => {
      expect(categorizeByRules(input({
        fromAddress: "author@substack.com",
        listUnsubscribe: "<https://substack.com/unsub>",
      }))).toBe("Newsletters");
    });

    it("list-unsubscribe with no from address defaults to Promotions", () => {
      expect(categorizeByRules(input({
        listUnsubscribe: "<mailto:unsub@example.com>",
      }))).toBe("Promotions");
    });
  });

  describe("Layer 4: Default", () => {
    it("returns Primary for regular person-to-person email", () => {
      expect(categorizeByRules(input({ fromAddress: "alice@gmail.com" }))).toBe("Primary");
    });

    it("returns Primary when no signals present", () => {
      expect(categorizeByRules(input())).toBe("Primary");
    });

    it("returns Primary for unknown domains with normal local part", () => {
      expect(categorizeByRules(input({ fromAddress: "john.doe@company.com" }))).toBe("Primary");
    });
  });

  describe("Meetings category", () => {
    it("classifies scheduling platform domains as Meetings", () => {
      expect(categorizeByRules(input({ fromAddress: "invites@calendly.com" }))).toBe("Meetings");
      expect(categorizeByRules(input({ fromAddress: "no-reply@cal.com" }))).toBe("Meetings");
      expect(categorizeByRules(input({ fromAddress: "hello@doodle.com" }))).toBe("Meetings");
    });

    it("classifies Google calendar notifications as Meetings", () => {
      expect(categorizeByRules(input({
        fromAddress: "calendar-notification@google.com",
        subject: "Invitation: Project sync",
      }))).toBe("Meetings");
    });

    it("classifies meeting-platform mail with a meeting subject as Meetings", () => {
      expect(categorizeByRules(input({
        fromAddress: "noreply@zoom.us",
        subject: "Your meeting is confirmed",
      }))).toBe("Meetings");
    });

    it("classifies subject-based meeting invitations as Meetings", () => {
      expect(categorizeByRules(input({
        fromAddress: "sara@company.com",
        subject: "Calendar invitation: Design review",
      }))).toBe("Meetings");
      expect(categorizeByRules(input({
        fromAddress: "petr@firma.cz",
        subject: "Pozvánka na schůzku",
      }))).toBe("Meetings");
    });

    it("classifies snippet-based meeting scheduling as Meetings when subject is bare", () => {
      expect(categorizeByRules(input({
        fromAddress: "assistant@company.com",
        subject: "Let's connect",
        snippet: "I'd like to schedule a meeting with you next week",
      }))).toBe("Meetings");
    });

    it("does not classify marketing from meeting platforms as Meetings", () => {
      expect(categorizeByRules(input({
        fromAddress: "noreply@zoom.us",
        subject: "New features in Zoom",
      }))).toBe("Updates");
    });
  });

  describe("Interviews category", () => {
    it("classifies recruiting platform domains as Interviews", () => {
      expect(categorizeByRules(input({ fromAddress: "no-reply@greenhouse.io" }))).toBe("Interviews");
      expect(categorizeByRules(input({ fromAddress: "talent@lever.co" }))).toBe("Interviews");
      expect(categorizeByRules(input({ fromAddress: "recruiting@workday.com" }))).toBe("Interviews");
    });

    it("classifies subject-based interview mail as Interviews", () => {
      expect(categorizeByRules(input({
        fromAddress: "hr@company.com",
        subject: "Interview invitation — Software Engineer",
      }))).toBe("Interviews");
      expect(categorizeByRules(input({
        fromAddress: "recruiter@agency.com",
        subject: "Job application status update",
      }))).toBe("Interviews");
      expect(categorizeByRules(input({
        fromAddress: "personal@firma.cz",
        subject: "Pozvánka na pracovní pohovor",
      }))).toBe("Interviews");
    });

    it("prefers Interviews over Meetings for an interview invitation", () => {
      expect(categorizeByRules(input({
        fromAddress: "hr@company.com",
        subject: "Interview invitation: schedule your meeting",
      }))).toBe("Interviews");
    });

    it("does not classify newsletter advice about interviews as Interviews", () => {
      expect(categorizeByRules(input({
        fromAddress: "newsletter@substack.com",
        subject: "10 interview tips for managers",
      }))).toBe("Newsletters");
    });
  });

  describe("Invoices category", () => {
    it("classifies invoicing platform domains as Invoices", () => {
      expect(categorizeByRules(input({
        fromAddress: "noreply@stripe.com",
        subject: "Receipt for your payment",
      }))).toBe("Invoices");
      expect(categorizeByRules(input({
        fromAddress: "service@paypal.com",
        subject: "You sent a payment",
      }))).toBe("Invoices");
      expect(categorizeByRules(input({ fromAddress: "billing@freshbooks.com" }))).toBe("Invoices");
    });

    it("classifies subject-based invoice mail as Invoices", () => {
      expect(categorizeByRules(input({
        fromAddress: "billing@acme-corp.com",
        subject: "Invoice #4821 attached",
      }))).toBe("Invoices");
      expect(categorizeByRules(input({
        fromAddress: "noreply@eshop.cz",
        subject: "Faktura č. 2026-0147",
      }))).toBe("Invoices");
      expect(categorizeByRules(input({
        fromAddress: "no-reply@shop.vn",
        subject: "Hóa đơn thanh toán",
      }))).toBe("Invoices");
    });

    it("classifies a receipt from an update-prefix address as Invoices", () => {
      // "noreply" would normally mean Updates — the content signal wins
      expect(categorizeByRules(input({
        fromAddress: "noreply@cloud-saas.com",
        subject: "Your receipt for the annual plan",
      }))).toBe("Invoices");
    });

    it("classifies snippet-based invoice mail as Invoices", () => {
      expect(categorizeByRules(input({
        fromAddress: "accounting@company.com",
        subject: "Acme Corp",
        snippet: "Please find attached the invoice for March services",
      }))).toBe("Invoices");
    });

    it("does not classify a newsletter mentioning invoices as Invoices", () => {
      expect(categorizeByRules(input({
        fromAddress: "editor@beehiiv.com",
        subject: "This week in fintech",
        snippet: "A deep dive into invoice automation startups",
      }))).toBe("Newsletters");
    });
  });

  describe("Priority ordering", () => {
    it("Gmail label > domain heuristic > list-unsubscribe > default", () => {
      // All signals present but Gmail label wins
      const result = categorizeByRules(input({
        labelIds: ["CATEGORY_SOCIAL"],
        fromAddress: "marketing@substack.com",
        listUnsubscribe: "<mailto:unsub@example.com>",
      }));
      expect(result).toBe("Social");
    });

    it("domain heuristic > list-unsubscribe", () => {
      // Social domain + unsubscribe header → domain wins
      const result = categorizeByRules(input({
        fromAddress: "user@linkedin.com",
        listUnsubscribe: "<mailto:unsub@linkedin.com>",
      }));
      expect(result).toBe("Social");
    });

    it("new-category domain beats update prefix", () => {
      const result = categorizeByRules(input({
        fromAddress: "noreply@stripe.com",
        subject: "Receipt for your payment",
      }));
      expect(result).toBe("Invoices");
    });

    it("existing social/newsletter domain beats new-category keyword", () => {
      const result = categorizeByRules(input({
        fromAddress: "campaign@mailchimp.com",
        subject: "Interview tips from the experts",
      }));
      expect(result).toBe("Newsletters");
    });
  });
});
