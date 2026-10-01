import type { ThreadCategory } from "@/services/db/threadCategories";

export interface CategorizationInput {
  labelIds: string[];
  fromAddress: string | null;
  listUnsubscribe: string | null;
  /** Thread subject — powers the content-signal layers (Meetings/Interviews/Invoices). */
  subject?: string | null;
  /** Latest message snippet — used when the subject alone carries no signal. */
  snippet?: string | null;
}

const SOCIAL_DOMAINS = new Set([
  "facebookmail.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "instagram.com",
  "pinterest.com",
  "tiktok.com",
  "reddit.com",
  "snapchat.com",
  "tumblr.com",
  "nextdoor.com",
  "meetup.com",
  "discord.com",
  "mastodon.social",
]);

const NEWSLETTER_DOMAINS = new Set([
  "substack.com",
  "mailchimp.com",
  "convertkit.com",
  "beehiiv.com",
  "buttondown.email",
  "revue.email",
  "ghost.io",
  "tinyletter.com",
  "sendinblue.com",
  "mailerlite.com",
  "campaignmonitor.com",
  "constantcontact.com",
  "getresponse.com",
  "aweber.com",
]);

const PROMO_PREFIXES = new Set([
  "marketing",
  "promo",
  "promotions",
  "deals",
  "offers",
  "sales",
  "shop",
  "store",
  "newsletter",
  "info",
  "hello",
]);

const UPDATE_PREFIXES = new Set([
  "noreply",
  "no-reply",
  "notifications",
  "notification",
  "notify",
  "alerts",
  "alert",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "support",
  "billing",
  "account",
  "security",
  "verify",
  "confirm",
]);

/**
 * Pure scheduling/book-a-meeting platforms — every mail from them is about
 * arranging a meeting, so the domain alone is enough.
 */
const SCHEDULING_DOMAINS = new Set([
  "calendly.com",
  "cal.com",
  "calendow.com",
  "savvycal.com",
  "doodle.com",
  "when2meet.com",
  "x.ai",
  "clara.io",
  "cron.com",
  "reclaim.ai",
  "motion.us",
]);

/**
 * Meeting platforms that also send non-meeting mail (marketing, receipts).
 * A mail from one of these is a Meeting only when the content says so.
 */
const MEETING_DOMAINS = new Set([
  "zoom.us",
  "teams.microsoft.com",
  "goto.com",
  "gotomeeting.com",
  "webex.com",
  "whereby.com",
  "bluejeans.com",
]);

/** Applicant tracking / recruiting platforms — interview lifecycle mail. */
const INTERVIEW_DOMAINS = new Set([
  "greenhouse.io",
  "lever.co",
  "workable.com",
  "smartrecruiters.com",
  "workday.com",
  "icims.com",
  "bamboohr.com",
  "jazzhr.com",
  "applytojob.com",
  "jobvite.com",
  "teamtailor.com",
  "pinpointhq.com",
]);

/** Payment / invoicing platforms — receipts, invoices, billing statements. */
const INVOICE_DOMAINS = new Set([
  "stripe.com",
  "paypal.com",
  "freshbooks.com",
  "quickbooks.com",
  "quickbooks.intuit.com",
  "xero.com",
  "bill.com",
  "waveapps.com",
  "invoicely.com",
  "invoicehome.com",
  "sumup.com",
  "squareup.com",
  "zoho.com",
  "holded.com",
  "sage.com",
]);

/**
 * Subject/snippet signals. Substring, case-insensitive, multi-language.
 * Deliberately excludes bare "meeting"/"invitation" — those appear in far
 * too much non-meeting mail ("10 interview tips", LinkedIn invites).
 */
const MEETING_KEYWORDS = [
  "calendar invite",
  "calendar invitation",
  "meeting invitation",
  "meeting request",
  "meeting confirmed",
  "meeting is confirmed",
  "meeting has been confirmed",
  "meeting rescheduled",
  "meeting is rescheduled",
  "rescheduled your meeting",
  "conference call",
  "video conference",
  "zoom meeting",
  "teams meeting",
  "google meet",
  "book a meeting",
  "schedule a meeting",
  "scheduling",
  "reschedule",
  "invitation:",
  "invite:",
  "pozvání na schůzku",
  "pozvánka na schůzku",
  "pozvánka na jednání",
  "stretnutie",
  "pozývame vás na stretnutie",
  "cuộc họp",
  "lời mời họp",
  "đặt lịch họp",
];

const INTERVIEW_KEYWORDS = [
  "interview",
  "job interview",
  "interview invitation",
  "interview scheduled",
  "recruiter",
  "recruiting",
  "hiring",
  "job application",
  "application status",
  "job offer",
  "job opportunity",
  "candidate",
  "talent acquisition",
  "onboarding",
  "pohovor",
  "pracovní pohovor",
  "pracovný pohovor",
  "výběrové řízení",
  "phỏng vấn",
  "tuyển dụng",
  "ứng tuyển",
  "cơ hội việc làm",
];

const INVOICE_KEYWORDS = [
  "invoice",
  "invoices",
  "tax invoice",
  "receipt",
  "payment received",
  "payment due",
  "payment reminder",
  "your bill",
  "billing statement",
  "faktura",
  "faktury",
  "faktúra",
  "faktúry",
  "daňový doklad",
  "hóa đơn",
  "hoa don",
  "thanh toán",
];

function getDomain(email: string): string | null {
  const atIdx = email.lastIndexOf("@");
  if (atIdx === -1) return null;
  return email.slice(atIdx + 1).toLowerCase();
}

function getLocalPart(email: string): string | null {
  const atIdx = email.lastIndexOf("@");
  if (atIdx === -1) return null;
  return email.slice(0, atIdx).toLowerCase();
}

function contentMatches(subject: string | null | undefined, snippet: string | null | undefined, keywords: string[]): boolean {
  const haystack = `${subject ?? ""}\n${snippet ?? ""}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

/**
 * Categorize a thread using deterministic rules. No I/O, fully testable.
 *
 * Priority layers:
 * 1. Gmail CATEGORY_* labels
 * 2. New-category domain sets (scheduling, interview, invoicing platforms)
 * 3. Content signals (subject/snippet) for Meetings/Interviews/Invoices
 * 4. Domain heuristics (social domains, newsletter platforms, promo prefixes)
 * 5. List-Unsubscribe header presence
 * 6. Default → Primary
 */
export function categorizeByRules(input: CategorizationInput): ThreadCategory {
  // Layer 1: Gmail category labels (highest priority — Google's own ML)
  for (const label of input.labelIds) {
    switch (label) {
      case "CATEGORY_PROMOTIONS":
        return "Promotions";
      case "CATEGORY_SOCIAL":
        return "Social";
      case "CATEGORY_UPDATES":
        return "Updates";
      case "CATEGORY_FORUMS":
        // Forums map to Primary (closest match)
        return "Primary";
      case "CATEGORY_PERSONAL":
        return "Primary";
    }
  }

  const subject = input.subject ?? null;
  const snippet = input.snippet ?? null;
  const domain = input.fromAddress ? getDomain(input.fromAddress) : null;
  const localPart = input.fromAddress ? getLocalPart(input.fromAddress) : null;

  // Layer 2: High-confidence platform domains. These SaaS senders are
  // single-purpose — a mail from Calendly is about scheduling, one from
  // Greenhouse about the hiring process, one from Stripe about money.
  if (domain) {
    if (INTERVIEW_DOMAINS.has(domain)) return "Interviews";
    if (SCHEDULING_DOMAINS.has(domain)) return "Meetings";
    // Google Calendar invites come from the calendar-notification address
    if (domain === "google.com" && localPart === "calendar-notification") return "Meetings";
    if (INVOICE_DOMAINS.has(domain)) return "Invoices";
    // Meeting platforms also send marketing — require a content signal
    if (MEETING_DOMAINS.has(domain) && contentMatches(subject, snippet, MEETING_KEYWORDS)) {
      return "Meetings";
    }
  }

  // Layer 3: Content signals (subject + snippet). Skipped for known social /
  // newsletter platforms — "10 interview tips" from a newsletter is still a
  // newsletter, and a LinkedIn "invitation" is still social.
  const fromPlatform = domain ? SOCIAL_DOMAINS.has(domain) || NEWSLETTER_DOMAINS.has(domain) : false;
  const fromNewsletterLocalPart = localPart ? PROMO_PREFIXES.has(localPart) : false;
  if (!fromPlatform && !fromNewsletterLocalPart) {
    // Interviews first — an interview invitation is also a meeting
    if (contentMatches(subject, snippet, INTERVIEW_KEYWORDS)) return "Interviews";
    if (contentMatches(subject, snippet, MEETING_KEYWORDS)) return "Meetings";
    if (contentMatches(subject, snippet, INVOICE_KEYWORDS)) return "Invoices";
  }

  // Layer 4: Domain & address heuristics
  if (domain) {
    // Social networks
    if (SOCIAL_DOMAINS.has(domain)) return "Social";

    // Newsletter platforms
    if (NEWSLETTER_DOMAINS.has(domain)) return "Newsletters";
  }

  if (localPart) {
    // Promotional prefixes
    if (PROMO_PREFIXES.has(localPart)) return "Promotions";

    // Update/notification prefixes
    if (UPDATE_PREFIXES.has(localPart)) return "Updates";
  }

  // Layer 5: List-Unsubscribe header
  if (input.listUnsubscribe) {
    // If from a newsletter-ish domain, classify as newsletter
    if (domain && NEWSLETTER_DOMAINS.has(domain)) return "Newsletters";
    // Generic unsubscribable mail → Promotions
    return "Promotions";
  }

  // Layer 6: Default
  return "Primary";
}
