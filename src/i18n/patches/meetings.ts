import type { Locale } from "../locales";

type Dict = Record<string, string>;

/**
 * The Meetings tab — the guide panel that pairs calendar events with their
 * confirmation emails (Calendly, Google Calendar, Zoom, ...) and surfaces
 * the meetings that are still missing one.
 */
export const meetingKeys: Record<Locale, Dict> = {
  en: {
    "meetings.guideTitle": "Meeting confirmations",
    "meetings.guideDesc":
      "Meetings you booked (Calendly, Google Calendar, Zoom and others) are matched with their confirmation emails automatically. Meetings that still have no confirmation email in your mailbox are listed below, so nothing slips by.",
    "meetings.schedule": "Schedule a meeting",
    "meetings.setBookingLink": "Set booking link",
    "meetings.pairingRun": "Looking for confirmations…",
    "meetings.unpairedTitle": "{count} meetings without a confirmation email",
    "meetings.unpairedEmpty": "Every meeting is paired with its confirmation email.",
    "meetings.findInEmail": "Find in email",
    "meetings.open": "Open",
    "meetings.notFound": "No matching email found",
    "meetings.unpairedSingle": "No confirmation email found yet",
    "meetings.noTitle": "(No title)",
    "meetings.pairedSource": "Confirmation: {source}",
    "meetings.source.calendly": "Calendly",
    "meetings.source.google_calendar": "Google Calendar",
    "meetings.source.zoom": "Zoom",
    "meetings.source.teams": "Teams",
    "meetings.source.scheduler": "Scheduler",
    "meetings.source.email": "Email",
    "settings.bookingLink": "Meeting booking link",
    "settings.bookingLinkDesc":
      "Your Calendly (or other booking page) URL. The \"Schedule a meeting\" button in the Meetings tab opens it.",
    "settings.meetings": "Meetings",
  },
  cs: {
    "meetings.guideTitle": "Potvrzení schůzek",
    "meetings.guideDesc":
      "Schůzky, které jste si domluvili (Calendly, Google Kalendář, Zoom a další), se automaticky párují s potvrzujícími e-maily. Schůzky, které zatím nemají v poště potvrzení, jsou uvedeny níže, takže vám nic neunikne.",
    "meetings.schedule": "Domluvit schůzku",
    "meetings.setBookingLink": "Nastavit rezervační odkaz",
    "meetings.pairingRun": "Hledám potvrzení…",
    "meetings.unpairedTitle": "{count} schůzek bez potvrzujícího e-mailu",
    "meetings.unpairedEmpty": "Všechny schůzky jsou spárované se svým potvrzujícím e-mailem.",
    "meetings.findInEmail": "Najít v e-mailu",
    "meetings.open": "Otevřít",
    "meetings.notFound": "Žádný odpovídající e-mail nenalezen",
    "meetings.unpairedSingle": "Zatím žádný potvrzující e-mail",
    "meetings.noTitle": "(Bez názvu)",
    "meetings.pairedSource": "Potvrzení: {source}",
    "meetings.source.calendly": "Calendly",
    "meetings.source.google_calendar": "Google Kalendář",
    "meetings.source.zoom": "Zoom",
    "meetings.source.teams": "Teams",
    "meetings.source.scheduler": "Plánovač",
    "meetings.source.email": "E-mail",
    "settings.bookingLink": "Odkaz na rezervaci schůzek",
    "settings.bookingLinkDesc":
      "Váš Calendly (nebo jiná rezervační stránka). Tlačítko „Domluvit schůzku“ v záložce Schůzky ho otevře.",
    "settings.meetings": "Schůzky",
  },
  sk: {
    "meetings.guideTitle": "Potvrdenia stretnutí",
    "meetings.guideDesc":
      "Stretnutia, ktoré ste si dohodli (Calendly, Google Kalendár, Zoom a ďalšie), sa automaticky párujú s potvrdzujúcimi e-mailami. Stretnutia, ktoré zatiaľ nemajú v pošte potvrdenie, sú uvedené nižšie, takže vám nič neunikne.",
    "meetings.schedule": "Dohodnúť stretnutie",
    "meetings.setBookingLink": "Nastaviť rezervačný odkaz",
    "meetings.pairingRun": "Hľadám potvrdenia…",
    "meetings.unpairedTitle": "{count} stretnutí bez potvrdzujúceho e-mailu",
    "meetings.unpairedEmpty": "Všetky stretnutia sú spárované so svojím potvrdzujúcim e-mailom.",
    "meetings.findInEmail": "Nájsť v e-maile",
    "meetings.open": "Otvoriť",
    "meetings.notFound": "Žiadny zodpovedajúci e-mail nenájdený",
    "meetings.unpairedSingle": "Zatiaľ žiadny potvrdzujúci e-mail",
    "meetings.noTitle": "(Bez názvu)",
    "meetings.pairedSource": "Potvrdenie: {source}",
    "meetings.source.calendly": "Calendly",
    "meetings.source.google_calendar": "Google Kalendár",
    "meetings.source.zoom": "Zoom",
    "meetings.source.teams": "Teams",
    "meetings.source.scheduler": "Plánovač",
    "meetings.source.email": "E-mail",
    "settings.bookingLink": "Odkaz na rezerváciu stretnutí",
    "settings.bookingLinkDesc":
      "Vaša Calendly (alebo iná rezervačná stránka). Tlačidlo „Dohodnúť stretnutie“ v záložke Stretnutia ju otvorí.",
    "settings.meetings": "Stretnutia",
  },
  vi: {
    "meetings.guideTitle": "Xác nhận cuộc họp",
    "meetings.guideDesc":
      "Các cuộc họp bạn đã đặt (Calendly, Google Lịch, Zoom và các nền tảng khác) được tự động ghép với email xác nhận. Các cuộc họp chưa có email xác nhận trong hộp thư được liệt kê bên dưới để không bị bỏ sót.",
    "meetings.schedule": "Đặt lịch họp",
    "meetings.setBookingLink": "Đặt liên kết đặt lịch",
    "meetings.pairingRun": "Đang tìm xác nhận…",
    "meetings.unpairedTitle": "{count} cuộc họp chưa có email xác nhận",
    "meetings.unpairedEmpty": "Mọi cuộc họp đều đã được ghép với email xác nhận.",
    "meetings.findInEmail": "Tìm trong email",
    "meetings.open": "Mở",
    "meetings.notFound": "Không tìm thấy email khớp",
    "meetings.unpairedSingle": "Chưa tìm thấy email xác nhận",
    "meetings.noTitle": "(Không có tiêu đề)",
    "meetings.pairedSource": "Xác nhận: {source}",
    "meetings.source.calendly": "Calendly",
    "meetings.source.google_calendar": "Google Lịch",
    "meetings.source.zoom": "Zoom",
    "meetings.source.teams": "Teams",
    "meetings.source.scheduler": "Trình đặt lịch",
    "meetings.source.email": "Email",
    "settings.bookingLink": "Liên kết đặt lịch họp",
    "settings.bookingLinkDesc":
      "URL Calendly (hoặc trang đặt lịch khác) của bạn. Nút \"Đặt lịch họp\" trong tab Cuộc họp sẽ mở nó.",
    "settings.meetings": "Cuộc họp",
  },
};