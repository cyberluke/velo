import type { Locale } from "../locales";

type Dict = Record<string, string>;

/**
 * Classic Office 97 sound scheme — the settings section under Notifications
 * and its preview buttons. Defaults are on, so every locale needs the keys.
 */
export const soundKeys: Record<Locale, Dict> = {
  en: {
    "settings.sounds": "Sounds (Office 97)",
    "settings.soundsEnabled": "Office 97 sound effects",
    "settings.soundsDesc":
      "Play classic Microsoft Office 97 sounds for new mail, reminders, AI events and sent mail. The incoming-mail chime rides along with the OS notification.",
    "settings.soundPreview": "Preview",
    "settings.soundNewMail": "New mail",
    "settings.soundReminder": "Reminder",
    "settings.soundComplete": "AI done",
    "settings.soundAlert": "Alert",
    "settings.soundSend": "Send mail",
  },
  cs: {
    "settings.sounds": "Zvuky (Office 97)",
    "settings.soundsEnabled": "Zvukové efekty Office 97",
    "settings.soundsDesc":
      "Přehrávat klasické zvuky Microsoft Office 97 pro novou poštu, připomínky, AI události a odeslanou poštu. Zvuk nové pošty se ozve společně se systémovým oznámením.",
    "settings.soundPreview": "Náhled",
    "settings.soundNewMail": "Nová pošta",
    "settings.soundReminder": "Připomínka",
    "settings.soundComplete": "AI hotovo",
    "settings.soundAlert": "Upozornění",
    "settings.soundSend": "Odeslat",
  },
  sk: {
    "settings.sounds": "Zvuky (Office 97)",
    "settings.soundsEnabled": "Zvukové efekty Office 97",
    "settings.soundsDesc":
      "Prehrávať klasické zvuky Microsoft Office 97 pre novú poštu, pripomienky, AI udalosti a odoslanú poštu. Zvuk novej pošty zaznie spolu so systémovým oznámením.",
    "settings.soundPreview": "Náhľad",
    "settings.soundNewMail": "Nová pošta",
    "settings.soundReminder": "Pripomienka",
    "settings.soundComplete": "AI hotové",
    "settings.soundAlert": "Upozornenie",
    "settings.soundSend": "Odoslať",
  },
  vi: {
    "settings.sounds": "Âm thanh (Office 97)",
    "settings.soundsEnabled": "Hiệu ứng âm thanh Office 97",
    "settings.soundsDesc":
      "Phát các âm thanh Microsoft Office 97 kinh điển cho thư mới, lời nhắc, sự kiện AI và thư đã gửi. Tiếng thư đến đi cùng với thông báo hệ thống.",
    "settings.soundPreview": "Xem trước",
    "settings.soundNewMail": "Thư mới",
    "settings.soundReminder": "Nhắc nhở",
    "settings.soundComplete": "AI xong",
    "settings.soundAlert": "Cảnh báo",
    "settings.soundSend": "Gửi thư",
  },
};