import type { Locale } from "../locales";

type Dict = Record<string, string>;

/**
 * Split-inbox categories Meetings/Interviews/Invoices and the local
 * calendar provider. Kept separate from the other patches so the category
 * work stays self-contained.
 */
export const categoryKeys: Record<Locale, Dict> = {
  en: {
    "nav.meetings": "Meetings",
    "nav.interviews": "Interviews",
    "nav.invoices": "Invoices",
    "email.emptyMeetings": "No meetings",
    "email.emptyMeetingsHint": "Calendar invitations and scheduling mail will appear here",
    "email.emptyInterviews": "No interviews",
    "email.emptyInterviewsHint": "Recruiter and job interview correspondence will appear here",
    "email.emptyInvoices": "No invoices",
    "email.emptyInvoicesHint": "Invoices, receipts and billing mail will appear here",
    "calendar.enableLocal": "Enable local calendar",
    "calendar.disableLocal": "Disable local calendar",
    "calendar.localCalendar": "My Calendar",
    "calendar.localProvider": "Local",
  },
  cs: {
    "nav.meetings": "Schůzky",
    "nav.interviews": "Pohovory",
    "nav.invoices": "Faktury",
    "email.emptyMeetings": "Žádné schůzky",
    "email.emptyMeetingsHint": "Pozvánky do kalendáře a e-maily o plánování se zobrazí zde",
    "email.emptyInterviews": "Žádné pohovory",
    "email.emptyInterviewsHint": "Korespondence s náboráři a pozvánky na pohovory se zobrazí zde",
    "email.emptyInvoices": "Žádné faktury",
    "email.emptyInvoicesHint": "Faktury, účtenky a platební e-maily se zobrazí zde",
    "calendar.enableLocal": "Povolit místní kalendář",
    "calendar.disableLocal": "Vypnout místní kalendář",
    "calendar.localCalendar": "Můj kalendář",
    "calendar.localProvider": "Místní",
  },
  sk: {
    "nav.meetings": "Stretnutia",
    "nav.interviews": "Pohovory",
    "nav.invoices": "Faktúry",
    "email.emptyMeetings": "Žiadne stretnutia",
    "email.emptyMeetingsHint": "Pozvánky do kalendára a e-maily o plánovaní sa zobrazia tu",
    "email.emptyInterviews": "Žiadne pohovory",
    "email.emptyInterviewsHint": "Korešpondencia s náborármi a pozvánky na pohovory sa zobrazia tu",
    "email.emptyInvoices": "Žiadne faktúry",
    "email.emptyInvoicesHint": "Faktúry, účtenky a platobné e-maily sa zobrazia tu",
    "calendar.enableLocal": "Povoliť lokálny kalendár",
    "calendar.disableLocal": "Vypnúť lokálny kalendár",
    "calendar.localCalendar": "Môj kalendár",
    "calendar.localProvider": "Lokálny",
  },
  vi: {
    "nav.meetings": "Cuộc họp",
    "nav.interviews": "Phỏng vấn",
    "nav.invoices": "Hóa đơn",
    "email.emptyMeetings": "Không có cuộc họp",
    "email.emptyMeetingsHint": "Lời mời lịch và email đặt lịch sẽ xuất hiện ở đây",
    "email.emptyInterviews": "Không có buổi phỏng vấn",
    "email.emptyInterviewsHint": "Trao đổi với nhà tuyển dụng và lời mời phỏng vấn sẽ xuất hiện ở đây",
    "email.emptyInvoices": "Không có hóa đơn",
    "email.emptyInvoicesHint": "Hóa đơn, biên lai và email thanh toán sẽ xuất hiện ở đây",
    "calendar.enableLocal": "Bật lịch cục bộ",
    "calendar.disableLocal": "Tắt lịch cục bộ",
    "calendar.localCalendar": "Lịch của tôi",
    "calendar.localProvider": "Cục bộ",
  },
};