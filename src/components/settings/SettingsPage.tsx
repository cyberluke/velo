import { useState, useEffect, useCallback } from "react";
import { useUIStore, type SettingsTab } from "@/stores/uiStore";
import { useIdleStatusStore, describeIdleState, explainIdleFailure } from "@/stores/idleStatusStore";
import { Tooltip } from "@/components/ui/Tooltip";
import { reportError, notify } from "@/stores/toastStore";
import { Spinner } from "@/components/ui/Spinner";
import { useAccountStore } from "@/stores/accountStore";
import { getSetting, setSetting, getSecureSetting, setSecureSetting } from "@/services/db/settings";
import {
  getNotificationBackend,
  getNativeNotificationFailure,
  applyNotificationsEnabled,
  sendTestNotification,
  type NotificationBackend,
} from "@/services/notifications/notificationManager";
import {
  playSound,
  setSoundsEnabled as setSoundsEnabledSetting,
  type SoundEvent,
} from "@/services/sounds/soundManager";
import { PROVIDER_MODELS, resolveModelId } from "@/services/ai/types";
import { listLocalModels, type LocalModel } from "@/services/ai/localOpenAi";
import { LOCALES, isLocale, setLocale, useI18n } from "@/i18n";
import { DEFAULT_MCP_PORT } from "@/services/mcp/protocol";
import { mcpEndpointLabel } from "@/services/mcp/tools";
import { setMcpEnabled } from "@/services/mcp/server";
import { FIX_NUMBER } from "@/constants/build";
import { deleteAccount, updateAccountColor } from "@/services/db/accounts";
import { ACCOUNT_COLORS, accountColor } from "@/constants/accountColors";
import { removeClient, reauthorizeAccount } from "@/services/gmail/tokenManager";
import { validateClientId, validateClientSecret } from "@/services/gmail/clientCredentials";
import { triggerSync, forceFullSync, resyncAccount } from "@/services/gmail/syncManager";
import {
  getGmailPushRelayStatus,
  probeGmailPushRelay,
  startGmailPushRelay,
  subscribeGmailPushRelayStatus,
  type GmailPushRelayStatus,
} from "@/services/gmail/gmailPushRelay";
import {
  registerComposeShortcut,
  getCurrentShortcut,
  DEFAULT_SHORTCUT,
} from "@/services/globalShortcut";
import {
  X,
  Plus,
  RefreshCw,
  Settings,
  PenLine,
  Bell,
  Filter,
  Users,
  UserCircle,
  Keyboard,
  Sparkles,
  Check,
  Mail,
  Info,
  ExternalLink,
  Github,
  GitFork,
  Scale,
  Globe,
  Download,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { SignatureEditor } from "./SignatureEditor";
import { TemplateEditor } from "./TemplateEditor";
import { FilterEditor } from "./FilterEditor";
import { AuditLogView } from "./AuditLogView";
import { PgpSettings } from "./PgpSettings";
import { LabelEditor } from "./LabelEditor";
import { ContactEditor } from "./ContactEditor";
import { SubscriptionManager } from "./SubscriptionManager";
import { SemanticSearchSettings } from "./SemanticSearchSettings";
import { SmartFolderEditor } from "./SmartFolderEditor";
import { QuickStepEditor } from "./QuickStepEditor";
import { SmartLabelEditor } from "./SmartLabelEditor";
import { SHORTCUTS, getDefaultKeyMap } from "@/constants/shortcuts";
import { useShortcutStore } from "@/stores/shortcutStore";
import { useShortcutRecorder } from "@/hooks/useShortcutRecorder";
import { COLOR_THEMES, applyThemeTokens, getTheme, resolveMode } from "@/themes";
import type { ColorThemeId } from "@/themes";
import {
  getAliasesForAccount,
  setDefaultAlias,
  mapDbAlias,
  type SendAsAlias,
} from "@/services/db/sendAsAliases";
import { ALL_NAV_ITEMS } from "@/components/layout/Sidebar";
import type { SidebarNavItem } from "@/stores/uiStore";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import appIcon from "@/assets/icon.png";
import { AddAccount } from "@/components/accounts/AddAccount";
import { refreshAfterAccountAdded } from "@/services/accounts/accountLifecycle";

const tabs: { id: SettingsTab; icon: LucideIcon }[] = [
  { id: "general", icon: Settings },
  { id: "notifications", icon: Bell },
  { id: "composing", icon: PenLine },
  { id: "mail-rules", icon: Filter },
  { id: "people", icon: Users },
  { id: "accounts", icon: UserCircle },
  { id: "shortcuts", icon: Keyboard },
  { id: "ai", icon: Sparkles },
  { id: "about", icon: Info },
];

export function SettingsPage() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const readingPanePosition = useUIStore((s) => s.readingPanePosition);
  const setReadingPanePosition = useUIStore((s) => s.setReadingPanePosition);
  const [imapIdle, setImapIdle] = useState(true);
  const idleStatuses = useIdleStatusStore((s) => s.statuses);
  const idleReasons = useIdleStatusStore((s) => s.reasons);
  const [reconnecting, setReconnecting] = useState<Record<string, boolean>>({});
  const [otpDetection, setOtpDetection] = useState(true);
  const [otpAutoCopy, setOtpAutoCopy] = useState(true);
  const [notifyAccounts, setNotifyAccounts] = useState<Set<string>>(() => new Set());
  const emailDensity = useUIStore((s) => s.emailDensity);
  const setEmailDensity = useUIStore((s) => s.setEmailDensity);
  const threadViewMode = useUIStore((s) => s.threadViewMode);
  const setThreadViewMode = useUIStore((s) => s.setThreadViewMode);
  const fontScale = useUIStore((s) => s.fontScale);
  const setFontScale = useUIStore((s) => s.setFontScale);
  const colorTheme = useUIStore((s) => s.colorTheme);
  const setColorTheme = useUIStore((s) => s.setColorTheme);

  // Live preview: hovering/focusing an accent swatch applies that theme to
  // the whole window; leaving restores the saved one. No store writes — the
  // theme layer applies tokens imperatively, so previewing is free.
  const previewAccent = (id: ColorThemeId) => {
    const root = document.documentElement;
    const state = useUIStore.getState();
    const mode = resolveMode(state.theme, window.matchMedia("(prefers-color-scheme: dark)").matches);
    applyThemeTokens(root, getTheme(id), mode);
  };
  const restoreAccent = () => {
    const root = document.documentElement;
    const state = useUIStore.getState();
    const mode = resolveMode(state.theme, window.matchMedia("(prefers-color-scheme: dark)").matches);
    applyThemeTokens(root, getTheme(state.colorTheme), mode);
  };
  const defaultReplyMode = useUIStore((s) => s.defaultReplyMode);
  const setDefaultReplyMode = useUIStore((s) => s.setDefaultReplyMode);
  const markAsReadBehavior = useUIStore((s) => s.markAsReadBehavior);
  const setMarkAsReadBehavior = useUIStore((s) => s.setMarkAsReadBehavior);
  const sendAndArchive = useUIStore((s) => s.sendAndArchive);
  const setSendAndArchive = useUIStore((s) => s.setSendAndArchive);
  const inboxViewMode = useUIStore((s) => s.inboxViewMode);
  const setInboxViewMode = useUIStore((s) => s.setInboxViewMode);
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const timeFormat = useUIStore((s) => s.timeFormat);
  const setTimeFormat = useUIStore((s) => s.setTimeFormat);
  const setReduceMotion = useUIStore((s) => s.setReduceMotion);
  const accounts = useAccountStore((s) => s.accounts);
  const removeAccountFromStore = useAccountStore((s) => s.removeAccount);
  const activeTab = useUIStore((s) => s.settingsTab);
  const setActiveTab = useUIStore((s) => s.setSettingsTab);
  const closeSettings = useUIStore((s) => s.closeSettings);
  const keyMap = useShortcutStore((s) => s.keyMap);
  const addAccountPending = useUIStore((s) => s.settingsAddAccountPending);
  const clearAddAccountRequest = useUIStore((s) => s.clearAddAccountRequest);
  const [showAddAccount, setShowAddAccount] = useState(false);

  // Something outside settings (command palette, sidebar) asked to add an account
  useEffect(() => {
    if (!addAccountPending) return;
    setShowAddAccount(true);
    clearAddAccountRequest();
  }, [addAccountPending, clearAddAccountRequest]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationBackend, setNotificationBackend] = useState<NotificationBackend>("off");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [bookingLink, setBookingLink] = useState("");
  const [undoSendDelay, setUndoSendDelay] = useState("5");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [apiSettingsSaved, setApiSettingsSaved] = useState(false);
  const clientIdError = clientId.trim() ? validateClientId(clientId) : null;
  const clientSecretError = clientSecret.trim() ? validateClientSecret(clientSecret) : null;
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPeriodDays, setSyncPeriodDays] = useState("365");
  const [blockRemoteImages, setBlockRemoteImages] = useState(true);
  const [phishingDetectionEnabled, setPhishingDetectionEnabled] = useState(true);
  const [phishingSensitivity, setPhishingSensitivity] = useState<"low" | "default" | "high">("default");
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState<"claude" | "openai" | "gemini" | "ollama" | "copilot" | "custom" | "bedrock">("claude");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [copilotApiKey, setCopilotApiKey] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customModel, setCustomModel] = useState("gpt-4o-mini");
  const [bedrockApiKey, setBedrockApiKey] = useState("");
  const [bedrockRegion, setBedrockRegion] = useState("us-east-1");
  const [bedrockModel, setBedrockModel] = useState("us.anthropic.claude-sonnet-4-6");
  const [ollamaServerUrl, setOllamaServerUrl] = useState("http://localhost:11434");
  const [ollamaApiKey, setOllamaApiKey] = useState("");
  const [ollamaModel, setOllamaModel] = useState("llama3.2");
  const [ollamaModels, setOllamaModels] = useState<LocalModel[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [mcpEnabled, setMcpEnabledState] = useState(true);
  const [mcpEndpoint, setMcpEndpoint] = useState(`http://127.0.0.1:${DEFAULT_MCP_PORT}/mcp`);
  const { locale, t } = useI18n();
  const [claudeModel, setClaudeModel] = useState("claude-haiku-4-5-20251001");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [geminiModel, setGeminiModel] = useState("gemini-3.8-flash");
  const [copilotModel, setCopilotModel] = useState("openai/gpt-4o-mini");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiAutoCategorize, setAiAutoCategorize] = useState(true);
  const [aiAutoSummarize, setAiAutoSummarize] = useState(true);
  const [aiKeySaved, setAiKeySaved] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [dictationModel, setDictationModel] = useState("whisper-1");
  const [dictationSaved, setDictationSaved] = useState(false);
  const [aiAutoDraftEnabled, setAiAutoDraftEnabled] = useState(true);
  const [aiWritingStyleEnabled, setAiWritingStyleEnabled] = useState(true);
  // New AI feature toggles
  const [aiProofreadEnabled, setAiProofreadEnabled] = useState(true);
  const [aiMeetingDetectionEnabled, setAiMeetingDetectionEnabled] = useState(true);
  const [aiInboxDigestEnabled, setAiInboxDigestEnabled] = useState(true);
  const [aiUrgencyEnabled, setAiUrgencyEnabled] = useState(false);
  const [aiAutoTasksEnabled, setAiAutoTasksEnabled] = useState(false);
  const [aiContactSummaryEnabled, setAiContactSummaryEnabled] = useState(true);
  const [aiFilterSuggestionsEnabled, setAiFilterSuggestionsEnabled] = useState(true);
  const [styleAnalyzing, setStyleAnalyzing] = useState(false);
  const [styleAnalyzeDone, setStyleAnalyzeDone] = useState(false);
  const [cacheMaxMb, setCacheMaxMb] = useState("500");
  const [cacheSizeMb, setCacheSizeMb] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [reauthStatus, setReauthStatus] = useState<Record<string, "idle" | "authorizing" | "done" | "error">>({});
  const [resyncStatus, setResyncStatus] = useState<Record<string, "idle" | "syncing" | "done" | "error">>({});
  const [autoArchiveCategories, setAutoArchiveCategories] = useState<Set<string>>(() => new Set());
  const [smartNotifications, setSmartNotifications] = useState(true);
  const [notifyCategories, setNotifyCategories] = useState<Set<string>>(() => new Set(["Primary"]));
  const [vipSenders, setVipSenders] = useState<{ email_address: string; display_name: string | null }[]>([]);
  const [newVipEmail, setNewVipEmail] = useState("");
  const [requestReadReceipts, setRequestReadReceipts] = useState(false);
  const [readReceiptResponse, setReadReceiptResponse] = useState<"ask" | "always" | "never">("ask");
  // null = system Downloads folder
  const [downloadDirSetting, setDownloadDirSetting] = useState<string | null>(null);
  const [gmailPushRelayUrl, setGmailPushRelayUrl] = useState("");
  const [gmailPushRelaySecret, setGmailPushRelaySecret] = useState("");
  const [gmailPushTopicName, setGmailPushTopicName] = useState("");
  const [gmailPushRelaySaved, setGmailPushRelaySaved] = useState(false);
  const [gmailPushRelayStatus, setGmailPushRelayStatus] = useState<GmailPushRelayStatus>(getGmailPushRelayStatus);
  const [gmailPushRelayProbing, setGmailPushRelayProbing] = useState(false);
  const [gmailPushRelayProbeError, setGmailPushRelayProbeError] = useState<string | null>(null);

  useEffect(() => subscribeGmailPushRelayStatus(setGmailPushRelayStatus), []);

  // Load settings from DB
  useEffect(() => {
    async function load() {
      const notif = await getSetting("notifications_enabled");
      setNotificationsEnabled(notif !== "false");
      setNotificationBackend(getNotificationBackend());
      setSoundEnabled((await getSetting("sounds_enabled")) !== "false");
      setBookingLink((await getSetting("meeting_booking_url")) ?? "");
      const delay = await getSetting("undo_send_delay_seconds");
      setUndoSendDelay(delay ?? "5");
      const id = await getSetting("google_client_id");
      setClientId(id ?? "");
      const secret = await getSecureSetting("google_client_secret");
      setClientSecret(secret ?? "");
      setGmailPushRelayUrl((await getSetting("gmail_push_relay_url")) ?? "");
      setGmailPushRelaySecret((await getSecureSetting("gmail_push_relay_secret")) ?? "");
      setGmailPushTopicName((await getSetting("gmail_push_topic_name")) ?? "");
      const blockImg = await getSetting("block_remote_images");
      setBlockRemoteImages(blockImg !== "false");
      const phishingEnabled = await getSetting("phishing_detection_enabled");
      setPhishingDetectionEnabled(phishingEnabled !== "false");
      const phishingSens = await getSetting("phishing_sensitivity");
      if (phishingSens === "low" || phishingSens === "high") setPhishingSensitivity(phishingSens);
      const syncDays = await getSetting("sync_period_days");
      setSyncPeriodDays(syncDays ?? "365");
      setImapIdle((await getSetting("imap_idle")) !== "false");
      setOtpDetection((await getSetting("otp_detection")) !== "false");
      setOtpAutoCopy((await getSetting("otp_auto_copy")) !== "false");
      const accountsSetting = await getSetting("notify_accounts");
      setNotifyAccounts(new Set(accountsSetting ? accountsSetting.split(",").filter(Boolean) : []));

      const receiptDefault = await getSetting("read_receipt_request_default");
      setRequestReadReceipts(receiptDefault === "true");
      const receiptResponse = await getSetting("read_receipt_response");
      if (receiptResponse === "always" || receiptResponse === "never") {
        setReadReceiptResponse(receiptResponse);
      }
      setDownloadDirSetting(await getSetting("download_dir"));

      // Load autostart state
      try {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        setAutostartEnabled(await isEnabled());
      } catch {
        // autostart plugin may not be available in dev
      }

      // Load AI settings
      const provider = await getSetting("ai_provider");
      if (provider === "openai" || provider === "gemini" || provider === "ollama" || provider === "copilot" || provider === "custom" || provider === "bedrock") setAiProvider(provider);
      const ollamaUrl = await getSetting("ollama_server_url");
      if (ollamaUrl) setOllamaServerUrl(ollamaUrl);
      const ollamaModelVal = await getSetting("ollama_model");
      if (ollamaModelVal) setOllamaModel(ollamaModelVal);
      const ollamaKey = await getSecureSetting("ollama_api_key");
      setOllamaApiKey(ollamaKey ?? "");
      const mcpOn = await getSetting("mcp_enabled");
      setMcpEnabledState(mcpOn !== "false");
      setMcpEndpoint(await mcpEndpointLabel());
      const claudeModelVal = await getSetting("claude_model");
      if (claudeModelVal) setClaudeModel(claudeModelVal);
      const openaiModelVal = await getSetting("openai_model");
      if (openaiModelVal) setOpenaiModel(openaiModelVal);
      const geminiModelVal = await getSetting("gemini_model");
      if (geminiModelVal) setGeminiModel(resolveModelId(geminiModelVal));
      const dictModel = await getSetting("dictation_model");
      if (dictModel) setDictationModel(dictModel);
      const aiKey = await getSecureSetting("claude_api_key");
      setClaudeApiKey(aiKey ?? "");
      const oaiKey = await getSecureSetting("openai_api_key");
      setOpenaiApiKey(oaiKey ?? "");
      const gemKey = await getSecureSetting("gemini_api_key");
      setGeminiApiKey(gemKey ?? "");
      const copKey = await getSecureSetting("copilot_api_key");
      setCopilotApiKey(copKey ?? "");
      const copilotModelVal = await getSetting("copilot_model");
      if (copilotModelVal) setCopilotModel(copilotModelVal);
      const aiEn = await getSetting("ai_enabled");
      setAiEnabled(aiEn !== "false");
      const aiCat = await getSetting("ai_auto_categorize");
      setAiAutoCategorize(aiCat !== "false");
      const aiSum = await getSetting("ai_auto_summarize");
      setAiAutoSummarize(aiSum !== "false");
      const aiDraft = await getSetting("ai_auto_draft_enabled");
      setAiAutoDraftEnabled(aiDraft !== "false");
      const aiStyle = await getSetting("ai_writing_style_enabled");
      setAiWritingStyleEnabled(aiStyle !== "false");

      // Load new AI feature settings
      const aiProofread = await getSetting("ai_proofread_enabled");
      setAiProofreadEnabled(aiProofread !== "false");
      const aiMeeting = await getSetting("ai_meeting_detection_enabled");
      setAiMeetingDetectionEnabled(aiMeeting !== "false");
      const aiDigest = await getSetting("ai_inbox_digest_enabled");
      setAiInboxDigestEnabled(aiDigest !== "false");
      const aiUrgency = await getSetting("ai_urgency_enabled");
      setAiUrgencyEnabled(aiUrgency === "true");
      const aiAutoTasks = await getSetting("ai_auto_tasks_enabled");
      setAiAutoTasksEnabled(aiAutoTasks === "true");
      const aiContactSum = await getSetting("ai_contact_summary_enabled");
      setAiContactSummaryEnabled(aiContactSum !== "false");
      const aiFilterSug = await getSetting("ai_filter_suggestions_enabled");
      setAiFilterSuggestionsEnabled(aiFilterSug !== "false");

      // Load auto-archive categories
      const autoArchive = await getSetting("auto_archive_categories");
      if (autoArchive) {
        setAutoArchiveCategories(new Set(autoArchive.split(",").map((s) => s.trim()).filter(Boolean)));
      }

      // Load smart notification settings
      const smartNotif = await getSetting("smart_notifications");
      setSmartNotifications(smartNotif !== "false");
      const notifCats = await getSetting("notify_categories");
      if (notifCats) {
        setNotifyCategories(new Set(notifCats.split(",").map((s) => s.trim()).filter(Boolean)));
      }
      try {
        const { getAllVipSenders } = await import("@/services/db/notificationVips");
        const activeId = accounts.find((a) => a.isActive)?.id;
        if (activeId) {
          const vips = await getAllVipSenders(activeId);
          setVipSenders(vips.map((v) => ({ email_address: v.email_address, display_name: v.display_name })));
        }
      } catch {
        // VIP table may not exist yet
      }

      // Load cache settings
      const cacheMax = await getSetting("attachment_cache_max_mb");
      setCacheMaxMb(cacheMax ?? "500");
      try {
        const { getCacheSize } = await import("@/services/attachments/cacheManager");
        const size = await getCacheSize();
        setCacheSizeMb(Math.round(size / (1024 * 1024) * 10) / 10);
      } catch {
        // cache manager may not be available
      }
    }
    load();
  }, []);

  const handleNotificationsToggle = useCallback(async () => {
    const newVal = !notificationsEnabled;
    setNotificationsEnabled(newVal);
    await setSetting("notifications_enabled", newVal ? "true" : "false");
    // Takes effect now, not at the next start; switching on may show the
    // system permission prompt
    await applyNotificationsEnabled(newVal);
    setNotificationBackend(getNotificationBackend());
  }, [notificationsEnabled]);

  const handleSoundsToggle = useCallback(async () => {
    const newVal = !soundEnabled;
    setSoundEnabled(newVal);
    // Applies to the very next notification; no restart needed
    setSoundsEnabledSetting(newVal);
    await setSetting("sounds_enabled", newVal ? "true" : "false");
  }, [soundEnabled]);

  const handleUndoDelayChange = useCallback(async (value: string) => {
    setUndoSendDelay(value);
    await setSetting("undo_send_delay_seconds", value);
  }, []);

  const handleRequestReadReceiptsToggle = useCallback(async () => {
    const newVal = !requestReadReceipts;
    setRequestReadReceipts(newVal);
    await setSetting("read_receipt_request_default", newVal ? "true" : "false");
  }, [requestReadReceipts]);

  const handleReadReceiptResponseChange = useCallback(async (value: "ask" | "always" | "never") => {
    setReadReceiptResponse(value);
    await setSetting("read_receipt_response", value);
  }, []);

  const handleSaveApiSettings = useCallback(async () => {
    const trimmedId = clientId.trim();
    const trimmedSecret = clientSecret.trim();
    // Never persist swapped credentials — Google only reports that as
    // `invalid_client` on its own page, after the browser is already open.
    if (trimmedId && validateClientId(trimmedId)) return;
    if (trimmedSecret && validateClientSecret(trimmedSecret)) return;
    if (trimmedId) {
      await setSetting("google_client_id", trimmedId);
    }
    if (trimmedSecret) {
      await setSecureSetting("google_client_secret", trimmedSecret);
    }
    setApiSettingsSaved(true);
    setTimeout(() => setApiSettingsSaved(false), 2000);
  }, [clientId, clientSecret]);

  const handleSaveGmailPushRelay = useCallback(async () => {
    const url = gmailPushRelayUrl.trim().replace(/\/+$/, "");
    if (url) await setSetting("gmail_push_relay_url", url);
    else await setSetting("gmail_push_relay_url", "");
    if (gmailPushRelaySecret.trim()) await setSecureSetting("gmail_push_relay_secret", gmailPushRelaySecret.trim());
    await setSetting("gmail_push_topic_name", gmailPushTopicName.trim());
    void startGmailPushRelay();
    setGmailPushRelaySaved(true);
    setTimeout(() => setGmailPushRelaySaved(false), 2000);
  }, [gmailPushRelaySecret, gmailPushRelayUrl, gmailPushTopicName]);

  const handleProbeGmailPushRelay = useCallback(async () => {
    setGmailPushRelayProbing(true);
    setGmailPushRelayProbeError(null);
    try {
      await probeGmailPushRelay();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGmailPushRelayProbeError(message);
    } finally {
      setGmailPushRelayProbing(false);
    }
  }, []);

  const handleManualSync = useCallback(async () => {
    const activeIds = accounts.filter((a) => a.isActive).map((a) => a.id);
    if (activeIds.length === 0) return;
    setIsSyncing(true);
    try {
      await triggerSync(activeIds);
    } finally {
      setIsSyncing(false);
    }
  }, [accounts]);

  const handleForceFullSync = useCallback(async () => {
    const activeIds = accounts.filter((a) => a.isActive).map((a) => a.id);
    if (activeIds.length === 0) return;
    setIsSyncing(true);
    try {
      await forceFullSync(activeIds);
    } finally {
      setIsSyncing(false);
    }
  }, [accounts]);

  const handleAutostartToggle = useCallback(async () => {
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (autostartEnabled) {
        await disable();
      } else {
        await enable();
      }
      setAutostartEnabled(!autostartEnabled);
    } catch (err) {
      console.error("Failed to toggle autostart:", err);
    }
  }, [autostartEnabled]);

  const handleRemoveAccount = useCallback(
    async (accountId: string) => {
      removeClient(accountId);
      await deleteAccount(accountId);
      removeAccountFromStore(accountId);
    },
    [removeAccountFromStore],
  );

  const handleReauthorizeAccount = useCallback(
    async (accountId: string, email: string) => {
      setReauthStatus((prev) => ({ ...prev, [accountId]: "authorizing" }));
      try {
        await reauthorizeAccount(accountId, email);
        setReauthStatus((prev) => ({ ...prev, [accountId]: "done" }));
        notify("success", `${email} re-authorised`, "Starting instant delivery with the new permissions.");
        // The new token carries the IMAP scope — use it now rather than
        // waiting for the next launch or a manual Reconnect
        try {
          const { reconnectAccount } = await import("@/services/imap/idleManager");
          await reconnectAccount(accountId);
        } catch (err) {
          reportError(`Could not start instant delivery for ${email}`, err);
        }
        setTimeout(() => {
          setReauthStatus((prev) => ({ ...prev, [accountId]: "idle" }));
        }, 3000);
      } catch (err) {
        // The browser can crash mid sign-in, the tab can be closed, the
        // wrong account can be picked — say which, and offer the retry
        reportError(`Re-authorisation failed for ${email}`, err, {
          label: "Try again",
          run: () => handleReauthorizeAccount(accountId, email),
        });
        setReauthStatus((prev) => ({ ...prev, [accountId]: "error" }));
        setTimeout(() => {
          setReauthStatus((prev) => ({ ...prev, [accountId]: "idle" }));
        }, 3000);
      }
    },
    [],
  );

  const handleResyncAccount = useCallback(
    async (accountId: string) => {
      setResyncStatus((prev) => ({ ...prev, [accountId]: "syncing" }));
      try {
        await resyncAccount(accountId);
        setResyncStatus((prev) => ({ ...prev, [accountId]: "done" }));
        setTimeout(() => {
          setResyncStatus((prev) => ({ ...prev, [accountId]: "idle" }));
        }, 3000);
      } catch (err) {
        reportError("Resync failed", err);
        setResyncStatus((prev) => ({ ...prev, [accountId]: "error" }));
        setTimeout(() => {
          setResyncStatus((prev) => ({ ...prev, [accountId]: "idle" }));
        }, 3000);
      }
    },
    [],
  );

  const activeTabDef = tabs.find((t) => t.id === activeTab);

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden bg-bg-primary/50">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border-primary shrink-0 bg-bg-primary/60 backdrop-blur-sm">
        <h1 className="text-base font-semibold text-text-primary">{t("settings.title")}</h1>
        <kbd className="text-[0.625rem] text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded font-mono">
          {keyMap["app.settings"] ?? "Ctrl+,"}
        </kbd>
        <button
          onClick={closeSettings}
          className="ml-auto p-1.5 -mr-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          title={`${t("settings.close")} (Esc)`}
          aria-label={t("settings.close")}
        >
          <X size={18} />
        </button>
      </div>

      {/* Body: sidebar nav + content */}
      <div className="flex flex-1 min-h-0">
        {/* Vertical tab sidebar */}
        <nav className="w-44 border-r border-border-primary py-2 overflow-y-auto shrink-0 bg-bg-primary/30">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 w-full px-4 py-2 text-[0.8125rem] transition-colors ${
                  isActive
                    ? "bg-bg-selected text-accent font-medium"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }`}
              >
                <Icon size={15} className="shrink-0" />
                {t(`settings.${tab.id}`)}
              </button>
            );
          })}
        </nav>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl px-7 py-6">
            {/* Tab title */}
            {activeTabDef && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-text-primary">
                  {t(`settings.${activeTabDef.id}`)}
                </h2>
              </div>
            )}

            <div className="space-y-8">
        {activeTab === "general" && <SemanticSearchSettings />}
        {activeTab === "general" && (
                <>
                  <Section title={t("settings.appearance")}>
                    <SettingRow label={t("settings.language")}>
                      <select
                        value={locale}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (!isLocale(next)) return;
                          setLocale(next);
                          setSetting("locale", next);
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        {LOCALES.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </SettingRow>
                    <SettingRow label={t("settings.theme")}>
                      <select
                        value={theme}
                        onChange={(e) => {
                          const val = e.target.value as "light" | "dark" | "system";
                          if (val !== theme) void playSound("theme");
                          setTheme(val);
                          setSetting("theme", val);
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="system">{t("settings.theme.system")}</option>
                        <option value="light">{t("settings.theme.light")}</option>
                        <option value="dark">{t("settings.theme.dark")}</option>
                      </select>
                    </SettingRow>
                    <SettingRow label={t("settings.readingPane")}>
                      <select
                        value={readingPanePosition}
                        onChange={(e) => {
                          setReadingPanePosition(e.target.value as "right" | "bottom" | "hidden");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="right">{t("settings.paneRight")}</option>
                        <option value="bottom">{t("settings.paneBottom")}</option>
                        <option value="hidden">{t("settings.paneOff")}</option>
                      </select>
                    </SettingRow>
                    <SettingRow label={t("settings.emailDensity")}>
                      <select
                        value={emailDensity}
                        onChange={(e) => {
                          setEmailDensity(e.target.value as "compact" | "default" | "spacious");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="compact">{t("settings.densityCompact")}</option>
                        <option value="default">{t("settings.densityDefault")}</option>
                        <option value="spacious">{t("settings.densitySpacious")}</option>
                      </select>
                    </SettingRow>
                    <SettingRow label={t("settings.threadLayout")}>
                      <select
                        value={threadViewMode}
                        onChange={(e) => {
                          setThreadViewMode(e.target.value as "classic" | "chat");
                          void playSound("view");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="classic">{t("settings.threadClassic")}</option>
                        <option value="chat">{t("settings.threadChat")}</option>
                      </select>
                    </SettingRow>
                    <SettingRow label={t("settings.fontSize")}>
                      <select
                        value={fontScale}
                        onChange={(e) => {
                          const next = e.target.value as "small" | "default" | "large" | "xlarge";
                          const order = ["small", "default", "large", "xlarge"];
                          if (order.indexOf(next) > order.indexOf(fontScale)) {
                            void playSound("zoomIn");
                          } else if (order.indexOf(next) < order.indexOf(fontScale)) {
                            void playSound("zoomOut");
                          }
                          setFontScale(next);
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="small">{t("settings.fontSmall")}</option>
                        <option value="default">{t("settings.fontDefault")}</option>
                        <option value="large">{t("settings.fontLarge")}</option>
                        <option value="xlarge">{t("settings.fontExtraLarge")}</option>
                      </select>
                    </SettingRow>
                    <SettingRow label={t("settings.accentColor")}>
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {COLOR_THEMES.map((t) => {
                            const isSelected = colorTheme === t.id;
                            return (
                              <button
                                key={t.id}
                                onClick={() => setColorTheme(t.id)}
                                onMouseEnter={() => previewAccent(t.id)}
                                onMouseLeave={restoreAccent}
                                onFocus={() => previewAccent(t.id)}
                                onBlur={restoreAccent}
                                title={t.name}
                                className={`relative w-7 h-7 rounded-full transition-all ${
                                  isSelected
                                    ? "ring-2 ring-offset-2 ring-offset-bg-primary scale-110"
                                    : "hover:scale-105"
                                }`}
                                style={{
                                  backgroundColor: t.swatch,
                                  boxShadow: isSelected
                                    ? `0 0 0 2px var(--color-bg-primary), 0 0 0 4px ${t.swatch}`
                                    : undefined,
                                }}
                              >
                                {isSelected && (
                                  <Check size={14} className="absolute inset-0 m-auto text-on-accent drop-shadow-sm" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <span className="text-[0.6875rem] text-text-tertiary max-w-80 text-right leading-snug">
                          {t("settings.themeLayoutHint")}
                        </span>
                      </div>
                    </SettingRow>
                    <SettingRow label={t("settings.inboxViewMode")}>
                      <select
                        value={inboxViewMode}
                        onChange={(e) => {
                          setInboxViewMode(e.target.value as "unified" | "split");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="unified">{t("settings.inboxUnified")}</option>
                        <option value="split">{t("settings.inboxSplit")}</option>
                      </select>
                    </SettingRow>
                    <SettingRow label={t("settings.timeFormat")}>
                      <select
                        value={timeFormat}
                        onChange={(e) =>
                          setTimeFormat(e.target.value as "system" | "12h" | "24h")
                        }
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="system">{t("settings.timeSystem")}</option>
                        <option value="12h">{t("settings.time12h")}</option>
                        <option value="24h">{t("settings.time24h")}</option>
                      </select>
                    </SettingRow>
                    <ToggleRow
                      label={t("settings.reduceMotion")}
                      description={t("settings.reduceMotionDesc")}
                      checked={reduceMotion}
                      onToggle={() => setReduceMotion(!reduceMotion)}
                    />
                  </Section>

                  <Section title={t("settings.meetings")}>
                    <SettingRow label={t("settings.bookingLink")}>
                      <input
                        type="url"
                        value={bookingLink}
                        placeholder="https://calendly.com/you"
                        onChange={(e) => {
                          setBookingLink(e.target.value);
                          void setSetting("meeting_booking_url", e.target.value);
                        }}
                        className="w-64 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none placeholder:text-text-tertiary/60"
                      />
                    </SettingRow>
                    <p className="text-xs text-text-tertiary">{t("settings.bookingLinkDesc")}</p>
                  </Section>

                  <SidebarNavEditor />

                  <Section title={t("settings.startup")}>
                    <ToggleRow
                      label={t("settings.launchAtLogin")}
                      description={t("settings.launchAtLoginDesc")}
                      checked={autostartEnabled}
                      onToggle={handleAutostartToggle}
                    />
                  </Section>

                  <Section title={t("settings.privacySecurity")}>
                    <ToggleRow
                      label={t("settings.blockRemoteImages")}
                      description={t("settings.blockRemoteImagesDesc")}
                      checked={blockRemoteImages}
                      onToggle={async () => {
                        const newVal = !blockRemoteImages;
                        setBlockRemoteImages(newVal);
                        await setSetting("block_remote_images", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label={t("settings.phishingDetection")}
                      description={t("settings.phishingDetectionDesc")}
                      checked={phishingDetectionEnabled}
                      onToggle={async () => {
                        const newVal = !phishingDetectionEnabled;
                        setPhishingDetectionEnabled(newVal);
                        await setSetting("phishing_detection_enabled", newVal ? "true" : "false");
                      }}
                    />
                    {phishingDetectionEnabled && (
                      <SettingRow label={t("settings.detectionSensitivity")}>
                        <select
                          value={phishingSensitivity}
                          onChange={async (e) => {
                            const val = e.target.value as "low" | "default" | "high";
                            setPhishingSensitivity(val);
                            await setSetting("phishing_sensitivity", val);
                          }}
                          className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                        >
                          <option value="low">{t("settings.sensitivityLow")}</option>
                          <option value="default">{t("settings.sensitivityDefault")}</option>
                          <option value="high">{t("settings.sensitivityHigh")}</option>
                        </select>
                      </SettingRow>
                    )}
                  </Section>

                  <Section title={t("settings.storage")}>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 mr-4">
                        <span className="text-sm text-text-secondary">{t("settings.downloadsFolder")}</span>
                        <p className="text-xs text-text-tertiary mt-0.5 truncate">
                          {downloadDirSetting ?? t("settings.systemDownloadsFolder")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {downloadDirSetting && (
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              setDownloadDirSetting(null);
                              await setSetting("download_dir", "");
                            }}
                            className="bg-bg-tertiary text-text-primary border border-border-primary"
                          >
                            {t("settings.reset")}
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            const { open } = await import("@tauri-apps/plugin-dialog");
                            const dir = await open({ directory: true, multiple: false, title: t("settings.chooseDownloadsFolder") });
                            if (!dir || Array.isArray(dir)) return;
                            setDownloadDirSetting(dir);
                            await setSetting("download_dir", dir);
                          }}
                          className="bg-bg-tertiary text-text-primary border border-border-primary"
                        >
                          {t("settings.choose")}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-text-secondary">{t("settings.attachmentCache")}</span>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          {cacheSizeMb !== null ? t("settings.cacheUsed").replace("{count}", `${cacheSizeMb} MB`) : t("settings.calculating")}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          setClearingCache(true);
                          try {
                            const { clearAllCache } = await import("@/services/attachments/cacheManager");
                            await clearAllCache();
                            setCacheSizeMb(0);
                          } catch (err) {
                            console.error("Failed to clear cache:", err);
                          } finally {
                            setClearingCache(false);
                          }
                        }}
                        disabled={clearingCache}
                        className="bg-bg-tertiary text-text-primary border border-border-primary"
                      >
                        {clearingCache ? t("settings.clearing") : t("settings.clearCache")}
                      </Button>
                    </div>
                    <SettingRow label={t("settings.maxCacheSize")}>
                      <select
                        value={cacheMaxMb}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setCacheMaxMb(val);
                          await setSetting("attachment_cache_max_mb", val);
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="100">100 MB</option>
                        <option value="250">250 MB</option>
                        <option value="500">500 MB</option>
                        <option value="1000">1 GB</option>
                        <option value="2000">2 GB</option>
                      </select>
                    </SettingRow>
                  </Section>
                </>
              )}

              {activeTab === "notifications" && (
                <>
                  <Section title={t("settings.notifications")}>
                    <ToggleRow
                      label={t("settings.enableNotifications")}
                      checked={notificationsEnabled}
                      onToggle={handleNotificationsToggle}
                    />
                    <ToggleRow
                      label={t("settings.smartNotifications")}
                      description={t("settings.smartNotificationsDesc")}
                      checked={smartNotifications}
                      onToggle={async () => {
                        const newVal = !smartNotifications;
                        setSmartNotifications(newVal);
                        await setSetting("smart_notifications", newVal ? "true" : "false");
                      }}
                    />
                    {notificationsEnabled && (
                      <NotificationButtonsRow backend={notificationBackend} />
                    )}
                  </Section>

                  <Section title={t("settings.sounds")}>
                    <ToggleRow
                      label={t("settings.soundsEnabled")}
                      description={t("settings.soundsDesc")}
                      checked={soundEnabled}
                      onToggle={handleSoundsToggle}
                    />
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(
                        [
                          { event: "newMail", labelKey: "settings.soundNewMail" },
                          { event: "reminder", labelKey: "settings.soundReminder" },
                          { event: "reminderCalendar", labelKey: "settings.soundReminderCalendar" },
                          { event: "reminderFollowUp", labelKey: "settings.soundReminderFollowUp" },
                          { event: "aiComplete", labelKey: "settings.soundComplete" },
                          { event: "alert", labelKey: "settings.soundAlert" },
                          { event: "sendMail", labelKey: "settings.soundSend" },
                          { event: "delete", labelKey: "settings.soundDelete" },
                          { event: "undo", labelKey: "settings.soundUndo" },
                          { event: "redo", labelKey: "settings.soundRedo" },
                          { event: "folder", labelKey: "settings.soundFolder" },
                          { event: "clear", labelKey: "settings.soundClear" },
                          { event: "cancel", labelKey: "settings.soundCancel" },
                          { event: "dialog", labelKey: "settings.soundDialog" },
                          { event: "insert", labelKey: "settings.soundInsert" },
                          { event: "view", labelKey: "settings.soundView" },
                          { event: "mode", labelKey: "settings.soundMode" },
                          { event: "theme", labelKey: "settings.soundTheme" },
                          { event: "zoomIn", labelKey: "settings.soundZoomIn" },
                          { event: "zoomOut", labelKey: "settings.soundZoomOut" },
                          { event: "drag", labelKey: "settings.soundDrag" },
                          { event: "drop", labelKey: "settings.soundDrop" },
                          { event: "autocorr", labelKey: "settings.soundAutocorr" },
                        ] as { event: SoundEvent; labelKey: string }[]
                      ).map((s) => (
                        <button
                          key={s.event}
                          onClick={() => void playSound(s.event)}
                          className="px-2.5 py-1 text-xs rounded-full border border-border-primary bg-bg-tertiary text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
                          title={t("settings.soundPreview")}
                        >
                          {t(s.labelKey)}
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Section title={t("settings.otpSection")}>
                    <p className="text-xs text-text-tertiary mb-2">
                      {t("settings.otpSectionDesc")}
                    </p>
                    <ToggleRow
                      label={t("settings.detectLoginCodes")}
                      description={t("settings.detectLoginCodesDesc")}
                      checked={otpDetection}
                      onToggle={async () => {
                        const next = !otpDetection;
                        setOtpDetection(next);
                        await setSetting("otp_detection", next ? "true" : "false");
                      }}
                    />
                    {otpDetection && (
                      <ToggleRow
                        label={t("settings.copyCodeAuto")}
                        description={t("settings.copyCodeAutoDesc")}
                        checked={otpAutoCopy}
                        onToggle={async () => {
                          const next = !otpAutoCopy;
                          setOtpAutoCopy(next);
                          await setSetting("otp_auto_copy", next ? "true" : "false");
                        }}
                      />
                    )}
                  </Section>

                  <Section title={t("settings.whichMailboxes")}>
                    <p className="text-xs text-text-tertiary mb-2">
                      {t("settings.whichMailboxesDesc")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {accounts.map((account) => (
                        <button
                          key={account.id}
                          onClick={async () => {
                            const next = new Set(notifyAccounts);
                            if (next.has(account.id)) next.delete(account.id);
                            else next.add(account.id);
                            setNotifyAccounts(next);
                            await setSetting("notify_accounts", [...next].join(","));
                          }}
                          className={`px-2.5 py-1 text-xs rounded-full transition-colors border ${
                            notifyAccounts.has(account.id)
                              ? "bg-accent/15 text-accent border-accent/30"
                              : "bg-bg-tertiary text-text-tertiary border-border-primary hover:text-text-primary"
                          }`}
                        >
                          {account.email}
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Section title={t("settings.rules")}>
                    <p className="text-xs text-text-tertiary">
                      {t("settings.rulesDesc1")} <strong>{t("settings.rulesNotify")}</strong> {t("settings.rulesDesc2")}
                    </p>
                  </Section>

                  {smartNotifications && (
                    <>
                      <Section title={t("settings.categoryFilters")}>
                        <div>
                          <span className="text-sm text-text-secondary">{t("settings.notifyCategories")}</span>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(["Primary", "Updates", "Promotions", "Social", "Newsletters"] as const).map((cat) => (
                              <button
                                key={cat}
                                onClick={async () => {
                                  const next = new Set(notifyCategories);
                                  if (next.has(cat)) next.delete(cat);
                                  else next.add(cat);
                                  setNotifyCategories(next);
                                  await setSetting("notify_categories", [...next].join(","));
                                }}
                                className={`px-2.5 py-1 text-xs rounded-full transition-colors border ${
                                  notifyCategories.has(cat)
                                    ? "bg-accent/15 text-accent border-accent/30"
                                    : "bg-bg-tertiary text-text-tertiary border-border-primary hover:text-text-primary"
                                }`}
                              >
                                {t(`nav.${cat.toLowerCase()}`)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </Section>

                      <Section title={t("settings.vipSenders")}>
                        <p className="text-xs text-text-tertiary mb-2">
                          {t("settings.vipSendersDesc")}
                        </p>
                        <div className="space-y-1.5">
                          {vipSenders.map((vip) => (
                            <div key={vip.email_address} className="flex items-center justify-between py-1.5 px-3 bg-bg-secondary rounded-md">
                              <span className="text-xs text-text-primary truncate">
                                {vip.display_name ? `${vip.display_name} (${vip.email_address})` : vip.email_address}
                              </span>
                              <button
                                onClick={async () => {
                                  const activeId = accounts.find((a) => a.isActive)?.id;
                                  if (!activeId) return;
                                  const { removeVipSender } = await import("@/services/db/notificationVips");
                                  await removeVipSender(activeId, vip.email_address);
                                  setVipSenders((prev) => prev.filter((v) => v.email_address !== vip.email_address));
                                }}
                                className="text-xs text-danger hover:text-danger/80 ml-2 shrink-0"
                              >
                                {t("settings.remove")}
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <input
                            type="email"
                            value={newVipEmail}
                            onChange={(e) => setNewVipEmail(e.target.value)}
                            placeholder={t("settings.vipEmailPlaceholder")}
                            className="flex-1 px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-md text-xs text-text-primary outline-none focus:border-accent"
                            onKeyDown={async (e) => {
                              if (e.key !== "Enter" || !newVipEmail.trim()) return;
                              const activeId = accounts.find((a) => a.isActive)?.id;
                              if (!activeId) return;
                              const { addVipSender } = await import("@/services/db/notificationVips");
                              await addVipSender(activeId, newVipEmail.trim());
                              setVipSenders((prev) => [...prev, { email_address: newVipEmail.trim().toLowerCase(), display_name: null }]);
                              setNewVipEmail("");
                            }}
                          />
                          <Button
                            variant="primary"
                            onClick={async () => {
                              if (!newVipEmail.trim()) return;
                              const activeId = accounts.find((a) => a.isActive)?.id;
                              if (!activeId) return;
                              const { addVipSender } = await import("@/services/db/notificationVips");
                              await addVipSender(activeId, newVipEmail.trim());
                              setVipSenders((prev) => [...prev, { email_address: newVipEmail.trim().toLowerCase(), display_name: null }]);
                              setNewVipEmail("");
                            }}
                            disabled={!newVipEmail.trim()}
                          >
                            {t("settings.add")}
                          </Button>
                        </div>
                      </Section>
                    </>
                  )}
                </>
              )}

              {activeTab === "composing" && (
                <>
                  <Section title={t("settings.sending")}>
                    <SettingRow label={t("settings.undoSendDelay")}>
                      <select
                        value={undoSendDelay}
                        onChange={(e) => handleUndoDelayChange(e.target.value)}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="5">{t("settings.seconds").replace("{count}", "5")}</option>
                        <option value="10">{t("settings.seconds").replace("{count}", "10")}</option>
                        <option value="30">{t("settings.seconds").replace("{count}", "30")}</option>
                      </select>
                    </SettingRow>
                    <ToggleRow
                      label={t("settings.sendAndArchive")}
                      description={t("settings.sendAndArchiveDesc")}
                      checked={sendAndArchive}
                      onToggle={() => setSendAndArchive(!sendAndArchive)}
                    />
                  </Section>

                  <Section title={t("settings.readReceipts")}>
                    <ToggleRow
                      label={t("settings.requestReadReceipts")}
                      description={t("settings.requestReadReceiptsDesc")}
                      checked={requestReadReceipts}
                      onToggle={handleRequestReadReceiptsToggle}
                    />
                    <SettingRow label={t("settings.whenReceiptRequested")}>
                      <select
                        value={readReceiptResponse}
                        onChange={(e) => {
                          handleReadReceiptResponseChange(e.target.value as "ask" | "always" | "never");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="ask">{t("settings.receiptAsk")}</option>
                        <option value="always">{t("settings.receiptAlways")}</option>
                        <option value="never">{t("settings.receiptNever")}</option>
                      </select>
                    </SettingRow>
                  </Section>

                  <Section title={t("settings.behavior")}>
                    <SettingRow label={t("settings.defaultReplyAction")}>
                      <select
                        value={defaultReplyMode}
                        onChange={(e) => {
                          setDefaultReplyMode(e.target.value as "reply" | "replyAll");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="reply">{t("settings.reply")}</option>
                        <option value="replyAll">{t("settings.replyAll")}</option>
                      </select>
                    </SettingRow>
                    <SettingRow label={t("settings.markAsRead")}>
                      <select
                        value={markAsReadBehavior}
                        onChange={(e) => {
                          setMarkAsReadBehavior(e.target.value as "instant" | "2s" | "manual");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="instant">{t("settings.markInstant")}</option>
                        <option value="2s">{t("settings.markAfter2s")}</option>
                        <option value="manual">{t("settings.markManual")}</option>
                      </select>
                    </SettingRow>
                  </Section>

                  <Section title={t("settings.signatures")}>
                    <SignatureEditor />
                  </Section>

                  <Section title={t("settings.templates")}>
                    <TemplateEditor />
                  </Section>
                </>
              )}

              {activeTab === "mail-rules" && (
                <>
                  <Section title={t("settings.labels")}>
                    <p className="text-xs text-text-tertiary mb-3">
                      {t("settings.labelsDesc")}
                    </p>
                    <LabelEditor />
                  </Section>

                  <Section title={t("settings.filters")}>
                    <p className="text-xs text-text-tertiary mb-3">
                      {t("settings.filtersDesc")}
                    </p>
                    <FilterEditor />
                  </Section>

                  <Section title={t("settings.smartLabels")}>
                    <p className="text-xs text-text-tertiary mb-3">
                      {t("settings.smartLabelsDesc")}
                    </p>
                    <SmartLabelEditor />
                  </Section>

                  <Section title={t("settings.smartFolders")}>
                    <p className="text-xs text-text-tertiary mb-3">
                      {t("settings.smartFoldersDesc1")} <code className="bg-bg-tertiary px-1 rounded">is:unread</code>, <code className="bg-bg-tertiary px-1 rounded">from:</code>, <code className="bg-bg-tertiary px-1 rounded">has:attachment</code>, <code className="bg-bg-tertiary px-1 rounded">after:</code>{t("settings.smartFoldersDesc2")}
                    </p>
                    <SmartFolderEditor />
                  </Section>

                  <Section title={t("settings.quickSteps")}>
                    <p className="text-xs text-text-tertiary mb-3">
                      {t("settings.quickStepsDesc")}
                    </p>
                    <QuickStepEditor />
                  </Section>
                </>
              )}

              {activeTab === "people" && (
                <>
                  <Section title={t("settings.contacts")}>
                    <p className="text-xs text-text-tertiary mb-3">
                      {t("settings.contactsDesc")}
                    </p>
                    <ContactEditor />
                  </Section>

                  <Section title={t("settings.subscriptions")}>
                    <p className="text-xs text-text-tertiary mb-3">
                      {t("settings.subscriptionsDesc")}
                    </p>
                    <SubscriptionManager />
                  </Section>
                </>
              )}

              {activeTab === "accounts" && (
                <>
                  <Section
                    title={t("settings.mailAccounts")}
                    action={
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Plus size={14} />}
                        onClick={() => setShowAddAccount(true)}
                      >
                        {t("accountSwitcher.addAccount")}
                      </Button>
                    }
                  >
                    {accounts.filter((a) => a.provider !== "caldav").length === 0 ? (
                      <button
                        onClick={() => setShowAddAccount(true)}
                        className="w-full flex flex-col items-center gap-2 px-4 py-8 rounded-lg border border-dashed border-border-primary text-center hover:border-accent hover:bg-bg-hover transition-colors"
                      >
                        <Mail className="w-6 h-6 text-text-tertiary" />
                        <span className="text-sm font-medium text-text-primary">
                          {t("settings.connectFirstMailbox")}
                        </span>
                        <span className="text-xs text-text-tertiary">
                          {t("settings.connectFirstMailboxDesc")}
                        </span>
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {accounts.filter((a) => a.provider !== "caldav").map((account, accountIndex) => {
                          const providerLabel = account.provider === "imap" ? "IMAP" : "Gmail";
                          const current = accountColor(account.color, accountIndex);
                          return (
                            <div
                              key={account.id}
                              className="flex items-center justify-between py-2.5 px-4 bg-bg-secondary rounded-lg"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: current.hex }}
                                  aria-hidden="true"
                                />
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-text-primary flex items-center gap-2">
                                  {account.displayName ?? account.email}
                                  <span className="text-[0.6rem] font-medium px-1.5 py-0.5 rounded-full bg-bg-tertiary text-text-tertiary">
                                    {providerLabel}
                                  </span>
                                </div>
                                <div className="text-xs text-text-tertiary">
                                  {account.email}
                                </div>
                                <AccountColorPicker
                                  accountId={account.id}
                                  selectedId={current.id}
                                />
                                {/* Whether this server is pushing to us right now — the
                                    setting only says it was asked to */}
                                {imapIdle && (() => {
                                  const state = idleStatuses[account.id] ?? "off";
                                  const reason = idleReasons[account.id];
                                  const explanation =
                                    state === "connected"
                                      ? t("settings.idleConnected")
                                      : state === "connecting"
                                        ? t("settings.idleConnecting")
                                        : state === "failed"
                                          ? explainIdleFailure(reason)
                                          : t("settings.idleOff");
                                  return (
                                    <Tooltip content={explanation} placement="bottom">
                                      <div className="mt-1 flex items-center gap-1.5 text-[0.6875rem] cursor-default w-fit">
                                        {state === "connecting" ? (
                                          <Spinner size={11} label={t("settings.connecting")} className="text-accent" />
                                        ) : (
                                          <span
                                            aria-hidden="true"
                                            className={`inline-block w-2 h-2 rounded-full ${
                                              state === "connected" ? "bg-success"
                                              : state === "failed" ? "bg-warning"
                                              : "bg-text-tertiary"
                                            }`}
                                          />
                                        )}
                                        <span className={
                                          state === "connected" ? "text-success"
                                          : state === "failed" ? "text-warning"
                                          : "text-text-tertiary"
                                        }>
                                          {describeIdleState(state)}
                                        </span>
                                      </div>
                                    </Tooltip>
                                  );
                                })()}
                              </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {imapIdle && (
                                  <button
                                    onClick={async () => {
                                      setReconnecting((prev) => ({ ...prev, [account.id]: true }));
                                      try {
                                        const { reconnectAccount } = await import("@/services/imap/idleManager");
                                        await reconnectAccount(account.id);
                                      } finally {
                                        setReconnecting((prev) => ({ ...prev, [account.id]: false }));
                                      }
                                    }}
                                    disabled={reconnecting[account.id] || idleStatuses[account.id] === "connecting"}
                                    className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
                                  >
                                    {(reconnecting[account.id] || idleStatuses[account.id] === "connecting") && (
                                      <Spinner size={11} label={t("settings.reconnecting")} />
                                    )}
                                    {t("settings.reconnect")}
                                  </button>
                                )}
                                <Tooltip
                                  content={
                                    reauthStatus[account.id] === "authorizing"
                                      ? t("settings.reauthWaiting")
                                      : t("settings.reauthPrompt")
                                  }
                                  placement="bottom"
                                >
                                <button
                                  onClick={() => handleReauthorizeAccount(account.id, account.email)}
                                  className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
                                >
                                  {reauthStatus[account.id] === "authorizing" && <><Spinner size={11} label={t("settings.waitingForGoogle")} />{t("settings.waiting")}…</>}
                                  {reauthStatus[account.id] === "done" && t("settings.doneMark")}
                                  {reauthStatus[account.id] === "error" && t("settings.failed")}
                                  {(!reauthStatus[account.id] || reauthStatus[account.id] === "idle") && t("settings.reauthorize")}
                                </button>
                                </Tooltip>
                                <button
                                  onClick={() => handleResyncAccount(account.id)}
                                  disabled={resyncStatus[account.id] === "syncing"}
                                  className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
                                >
                                  {resyncStatus[account.id] === "syncing" && <><Spinner size={11} label={t("settings.resyncing")} />{t("settings.resyncing")}…</>}
                                  {resyncStatus[account.id] === "done" && t("settings.doneMark")}
                                  {resyncStatus[account.id] === "error" && t("settings.failed")}
                                  {(!resyncStatus[account.id] || resyncStatus[account.id] === "idle") && t("settings.resync")}
                                </button>
                                <button
                                  onClick={() => handleRemoveAccount(account.id)}
                                  className="text-xs text-danger hover:text-danger/80 transition-colors"
                                >
                                  {t("settings.remove")}
                                </button>
                                <select
                                  value={account.accessRole ?? "owner"}
                                  onChange={async (e) => {
                                    const role = e.target.value as "owner" | "assistant" | "read_only";
                                    const { updateAccountAccessRole } = await import("@/services/db/accounts");
                                    const { logAudit } = await import("@/services/db/auditLog");
                                    await updateAccountAccessRole(account.id, role);
                                    await logAudit("access_role_changed", { account: account.email, role }, account.id);
                                    const { reloadAccountsIntoStore } = await import("@/services/accounts/accountLifecycle");
                                    await reloadAccountsIntoStore();
                                    notify("success", t("account.roleSaved"));
                                  }}
                                  title={t("account.role")}
                                  className="bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded-md border border-border-primary"
                                >
                                  <option value="owner">{t("account.roleOwner")}</option>
                                  <option value="assistant">{t("account.roleAssistant")}</option>
                                  <option value="read_only">{t("account.roleReadOnly")}</option>
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Section>

                  <Section title={t("pgp.title")}>
                    <PgpSettings />
                  </Section>

                  <Section title={t("export.title")}>
                    <div className="space-y-2">
                      {accounts.filter((a) => a.provider !== "caldav").map((account) => (
                        <div key={account.id} className="flex items-center justify-between py-1.5 px-3 bg-bg-secondary rounded-md">
                          <span className="text-xs text-text-primary truncate">{account.email}</span>
                          <button
                            onClick={async () => {
                              const { buildAccountMbox, countAccountMessages } = await import("@/services/export/exportService");
                              const { save } = await import("@tauri-apps/plugin-dialog");
                              const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                              try {
                                const count = await countAccountMessages(account.id);
                                if (count === 0) {
                                  notify("info", t("export.mboxFailed"));
                                  return;
                                }
                                const defaultName = `${account.email.split("@")[0]}.mbox`;
                                const filePath = await save({
                                  defaultPath: defaultName,
                                  filters: [{ name: "MBOX", extensions: ["mbox"] }],
                                });
                                if (!filePath) return;
                                notify("success", t("export.mboxRunning"));
                                const content = await buildAccountMbox(account.id);
                                await writeTextFile(filePath, content);
                                notify("success", t("export.mboxDone"));
                              } catch (err) {
                                reportError(t("export.mboxFailed"), err);
                              }
                            }}
                            className="text-xs text-accent hover:text-accent-hover transition-colors"
                          >
                            {t("export.accountMbox")}
                          </button>
                        </div>
                      ))}
                      <p className="text-xs text-text-tertiary">{t("export.threadEml")}</p>
                    </div>
                  </Section>

                  <Section title={t("audit.title")}>
                    <AuditLogView />
                  </Section>

                  <Section title={t("settings.instantDelivery")}>
                    <ToggleRow
                      label={t("settings.pushNewMail")}
                      description={t("settings.pushNewMailDesc")}
                      checked={imapIdle}
                      onToggle={async () => {
                        const next = !imapIdle;
                        setImapIdle(next);
                        await setSetting("imap_idle", next ? "true" : "false");
                        const { startIdleWatchers, stopIdleWatchers } =
                          await import("@/services/imap/idleManager");
                        if (next) await startIdleWatchers();
                        else await stopIdleWatchers();
                      }}
                    />
                  </Section>

                  {accounts.some((a) => a.provider === "caldav") && (
                    <Section title={t("settings.calendarAccounts")}>
                      <div className="space-y-2">
                        {accounts.filter((a) => a.provider === "caldav").map((account) => (
                          <div
                            key={account.id}
                            className="flex items-center justify-between py-2.5 px-4 bg-bg-secondary rounded-lg"
                          >
                            <div>
                              <div className="text-sm font-medium text-text-primary flex items-center gap-2">
                                {account.displayName ?? account.email}
                                <span className="text-[0.6rem] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                                  CalDAV
                                </span>
                              </div>
                              <div className="text-xs text-text-tertiary">
                                {account.email}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveAccount(account.id)}
                              className="text-xs text-danger hover:text-danger/80 transition-colors"
                            >
                              {t("settings.remove")}
                            </button>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  <SendAsAliasesSection />

                  <ImapCalDavSection />

                  <Section title={t("settings.googleApi")}>
                    <div className="space-y-3">
                      <TextField
                        label={t("addImap.clientId")}
                        size="md"
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder={t("settings.clientIdPlaceholder")}
                        {...(clientIdError ? { error: clientIdError } : {})}
                      />
                      <TextField
                        label={t("addImap.clientSecret")}
                        size="md"
                        type="password"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder={t("settings.clientSecretPlaceholder")}
                        {...(clientSecretError ? { error: clientSecretError } : {})}
                      />
                      <Button
                        variant="primary"
                        size="md"
                        onClick={handleSaveApiSettings}
                        disabled={!clientId.trim() || !!clientIdError || !!clientSecretError}
                      >
                        {apiSettingsSaved ? t("settings.savedMark") : t("ai.save")}
                      </Button>
                    </div>
                  </Section>

                  <Section title={t("settings.gmailPushRelay")}>
                    <div className="space-y-3">
                      <p className="text-xs text-text-tertiary">
                        {t("settings.gmailPushRelayDesc")}
                      </p>
                      <TextField
                        label={t("settings.relayUrl")}
                        size="md"
                        type="url"
                        value={gmailPushRelayUrl}
                        onChange={(e) => setGmailPushRelayUrl(e.target.value)}
                        placeholder={t("settings.relayUrlPlaceholder")}
                      />
                      <TextField
                        label={t("settings.pubSubTopic")}
                        size="md"
                        value={gmailPushTopicName}
                        onChange={(e) => setGmailPushTopicName(e.target.value)}
                        placeholder={t("settings.pubSubTopicPlaceholder")}
                      />
                      <TextField
                        label={t("settings.relaySecret")}
                        size="md"
                        type="password"
                        value={gmailPushRelaySecret}
                        onChange={(e) => setGmailPushRelaySecret(e.target.value)}
                        placeholder={t("settings.relaySecretPlaceholder")}
                      />
                      <div className="rounded-md border border-border-primary bg-bg-secondary px-3 py-2 text-xs text-text-secondary">
                        <div className="flex items-center justify-between gap-3">
                          <span>
                            {t("settings.relayStatus").replace("{status}",
                              gmailPushRelayStatus.state === "connected"
                                ? t("settings.relayConnected")
                                : gmailPushRelayStatus.state === "connecting"
                                  ? t("settings.relayConnecting")
                                  : gmailPushRelayStatus.state === "error"
                                    ? t("settings.relayError")
                                    : t("settings.relayNotChecked"))}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleProbeGmailPushRelay}
                            disabled={gmailPushRelayProbing}
                            icon={<RefreshCw size={13} className={gmailPushRelayProbing ? "animate-spin" : ""} />}
                          >
                            {gmailPushRelayProbing ? t("settings.checking") : t("settings.checkRelay")}
                          </Button>
                        </div>
                        {gmailPushRelayStatus.attempted > 0 && (
                          <p className="mt-1">
                            {t("settings.watchesRegistered").replace("{a}", String(gmailPushRelayStatus.registered.length)).replace("{b}", String(gmailPushRelayStatus.attempted))}
                          </p>
                        )}
                        {gmailPushRelayStatus.registered.length > 0 && (
                          <p className="mt-1 text-success">
                            {t("settings.registered").replace("{emails}", gmailPushRelayStatus.registered.map((registration) => registration.email).join(", "))}
                          </p>
                        )}
                        {gmailPushRelayStatus.registered.length === 0 && gmailPushRelayStatus.server && gmailPushRelayStatus.server.registrations.length > 0 && (
                          <p className="mt-1 text-success">
                            {t("settings.relayRegistered").replace("{emails}", gmailPushRelayStatus.server.registrations.map((registration) => registration.email).join(", "))}
                          </p>
                        )}
                        {gmailPushRelayStatus.failures.length > 0 && (
                          <p className="mt-1 text-danger">
                            {t("settings.relayFailed").replace("{list}", gmailPushRelayStatus.failures.map((failure) => `${failure.email} (${failure.message})`).join(", "))}
                          </p>
                        )}
                        {gmailPushRelayStatus.server && (
                          <p className="mt-1">
                            {(gmailPushRelayStatus.server.registrationCount === 1 ? t("settings.relaySeesWatch") : t("settings.relaySeesWatches")).replace("{count}", String(gmailPushRelayStatus.server.registrationCount))} and {(gmailPushRelayStatus.server.connectedClients === 1 ? t("settings.relaySeesListener") : t("settings.relaySeesListeners")).replace("{count}", String(gmailPushRelayStatus.server.connectedClients))}.
                          </p>
                        )}
                        {gmailPushRelayProbeError && <p className="mt-1 text-danger">{t("settings.probeFailed").replace("{err}", gmailPushRelayProbeError)}</p>}
                      </div>
                      <Button variant="secondary" size="md" onClick={handleSaveGmailPushRelay}>
                        {gmailPushRelaySaved ? t("settings.savedMark") : t("settings.saveRelay")}
                      </Button>
                    </div>
                  </Section>

                  <Section title={t("settings.sync")}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">
                        {t("settings.checkForNewMail")}
                      </span>
                      <Button
                        variant="primary"
                        size="md"
                        icon={<RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />}
                        onClick={handleManualSync}
                        disabled={isSyncing || accounts.length === 0}
                      >
                        {isSyncing ? t("settings.syncing") : t("settings.syncNow")}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-text-secondary">
                          {t("settings.fullResync")}
                        </span>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          {t("settings.fullResyncDesc")}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="md"
                        icon={<RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />}
                        onClick={handleForceFullSync}
                        disabled={isSyncing || accounts.length === 0}
                        className="bg-bg-tertiary text-text-primary border border-border-primary"
                      >
                        {isSyncing ? t("settings.syncing") : t("settings.fullResync")}
                      </Button>
                    </div>
                  </Section>

                  <Section title={t("settings.syncPeriod")}>
                    <SettingRow label={t("settings.syncEmailsFrom")}>
                      <select
                        value={syncPeriodDays}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setSyncPeriodDays(val);
                          await setSetting("sync_period_days", val);
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="30">{t("settings.lastDays").replace("{count}", "30")}</option>
                        <option value="90">{t("settings.lastDays").replace("{count}", "90")}</option>
                        <option value="180">{t("settings.lastDays").replace("{count}", "180")}</option>
                        <option value="365">{t("settings.lastYear").replace("{count}", "1")}</option>
                        <option value="730">{t("settings.lastYears").replace("{count}", "2")}</option>
                        <option value="1825">{t("settings.lastYears").replace("{count}", "5")}</option>
                        <option value="0">{t("settings.allTime")}</option>
                      </select>
                    </SettingRow>
                    <p className="text-xs text-text-tertiary">
                      {t("settings.syncPeriodDesc")}
                    </p>
                  </Section>

                  <SyncOfflineSection />
                </>
              )}

              {activeTab === "shortcuts" && (
                <ShortcutsTab />
              )}

              {activeTab === "ai" && (
                <>
                  <Section title={t("settings.provider")}>
                    <p className="text-xs text-text-tertiary mb-3">
                      {t("ai.provider.help")}
                    </p>
                    <SettingRow label={t("ai.provider")}>
                      <select
                        value={aiProvider}
                        onChange={async (e) => {
                          const val = e.target.value as "claude" | "openai" | "gemini" | "ollama" | "copilot" | "custom" | "bedrock";
                          setAiProvider(val);
                          setAiTestResult(null);
                          await setSetting("ai_provider", val);
                          const { clearProviderClients } = await import("@/services/ai/providerManager");
                          clearProviderClients();
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="claude">Claude (Anthropic)</option>
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Gemini (Google)</option>
                        <option value="ollama">Local AI (Ollama / LMStudio)</option>
                        <option value="copilot">GitHub Copilot</option>
                        <option value="custom">{t("ai.provider.custom")}</option>
                        <option value="bedrock">{t("ai.provider.bedrock")}</option>
                      </select>
                    </SettingRow>
                    <p className="text-xs text-text-tertiary">
                      {aiProvider === "claude" && t("settings.usesModel").replace("{model}", PROVIDER_MODELS.claude.find((m) => m.id === claudeModel)?.label ?? claudeModel)}
                      {aiProvider === "openai" && t("settings.usesModel").replace("{model}", PROVIDER_MODELS.openai.find((m) => m.id === openaiModel)?.label ?? openaiModel)}
                      {aiProvider === "gemini" && t("settings.usesModel").replace("{model}", PROVIDER_MODELS.gemini.find((m) => m.id === geminiModel)?.label ?? geminiModel)}
                      {aiProvider === "ollama" && t("ai.local.help")}
                      {aiProvider === "copilot" && t("settings.usesModelCopilot").replace("{model}", PROVIDER_MODELS.copilot.find((m) => m.id === copilotModel)?.label ?? copilotModel)}
                      {aiProvider === "custom" && t("ai.custom.help")}
                      {aiProvider === "bedrock" && `${t("settings.usesModel").replace("{model}", bedrockModel)} ${t("ai.bedrock.help")}`}
                    </p>
                  </Section>

                  {aiProvider === "custom" ? (
                    <Section title={t("ai.custom.baseUrl")}>
                      <div className="space-y-3">
                        <TextField
                          label={t("ai.custom.baseUrl")}
                          size="md"
                          value={customBaseUrl}
                          onChange={(e) => setCustomBaseUrl(e.target.value)}
                          placeholder="https://api.example.com/v1"
                        />
                        <TextField
                          label={t("ai.custom.apiKey")}
                          size="md"
                          type="password"
                          value={customApiKey}
                          onChange={(e) => setCustomApiKey(e.target.value)}
                          placeholder="sk-..."
                        />
                        <TextField
                          label={t("ai.custom.model")}
                          size="md"
                          value={customModel}
                          onChange={(e) => setCustomModel(e.target.value)}
                          placeholder="gpt-4o-mini"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            size="md"
                            onClick={async () => {
                              await setSetting("custom_base_url", customBaseUrl.trim());
                              await setSetting("custom_model", customModel.trim());
                              if (customApiKey.trim()) {
                                await setSecureSetting("custom_api_key", customApiKey.trim());
                              }
                              const { clearProviderClients } = await import("@/services/ai/providerManager");
                              clearProviderClients();
                              setAiKeySaved(true);
                              setTimeout(() => setAiKeySaved(false), 2000);
                            }}
                            disabled={!customBaseUrl.trim() || !customApiKey.trim() || !customModel.trim()}
                          >
                            {aiKeySaved ? t("ai.saved") : t("ai.save")}
                          </Button>
                          <Button
                            variant="secondary"
                            size="md"
                            onClick={async () => {
                              setAiTesting(true);
                              setAiTestResult(null);
                              try {
                                // auto-save so test uses current form values
                                await setSetting("custom_base_url", customBaseUrl.trim());
                                await setSetting("custom_model", customModel.trim());
                                if (customApiKey.trim()) {
                                  await setSecureSetting("custom_api_key", customApiKey.trim());
                                }
                                const { clearProviderClients } = await import("@/services/ai/providerManager");
                                clearProviderClients();
                                const { testConnection } = await import("@/services/ai/aiService");
                                const result = await testConnection();
                                setAiTestResult(result);
                              } catch (err) {
                                const msg = err instanceof Error ? err.message : String(err);
                                setAiTestResult({ ok: false, error: msg });
                              } finally {
                                setAiTesting(false);
                              }
                            }}
                            disabled={!customBaseUrl.trim() || !customApiKey.trim() || !customModel.trim() || aiTesting}
                            className="bg-bg-tertiary text-text-primary border border-border-primary"
                          >
                            {aiTesting ? t("ai.testing") : t("ai.test")}
                          </Button>
                          {aiTestResult?.ok && (
                            <span className="text-xs text-success">{t("ai.connected")}</span>
                          )}
                          {aiTestResult && !aiTestResult.ok && (
                            <span className="text-xs text-danger" title={aiTestResult.error}>
                              {t("ai.failed")}{aiTestResult.error ? `: ${aiTestResult.error.slice(0, 100)}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </Section>
                  ) : aiProvider === "bedrock" ? (
                    <Section title={t("ai.bedrock.apiKey")}>
                      <div className="space-y-3">
                        <TextField
                          label={t("ai.bedrock.apiKey")}
                          size="md"
                          type="password"
                          value={bedrockApiKey}
                          onChange={(e) => setBedrockApiKey(e.target.value)}
                          placeholder="••••••••"
                        />
                        <TextField
                          label={t("ai.bedrock.region")}
                          size="md"
                          value={bedrockRegion}
                          onChange={(e) => setBedrockRegion(e.target.value)}
                          placeholder="us-east-1"
                        />
                        <TextField
                          label={t("ai.bedrock.model")}
                          size="md"
                          value={bedrockModel}
                          onChange={(e) => setBedrockModel(e.target.value)}
                          placeholder="us.anthropic.claude-sonnet-4-6"
                        />
                        <p className="text-xs text-text-tertiary">
                          {t("ai.bedrock.model.help")}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            size="md"
                            onClick={async () => {
                              await setSecureSetting("bedrock_api_key", bedrockApiKey.trim());
                              await setSetting("bedrock_region", bedrockRegion.trim());
                              await setSetting("bedrock_model", bedrockModel);
                              const { clearProviderClients } = await import("@/services/ai/providerManager");
                              clearProviderClients();
                              setAiKeySaved(true);
                              setTimeout(() => setAiKeySaved(false), 2000);
                            }}
                            disabled={!bedrockApiKey.trim() || !bedrockRegion.trim()}
                          >
                            {aiKeySaved ? t("ai.saved") : t("ai.save")}
                          </Button>
                          <Button
                            variant="secondary"
                            size="md"
                            onClick={async () => {
                              setAiTesting(true);
                              setAiTestResult(null);
                              try {
                                await setSecureSetting("bedrock_api_key", bedrockApiKey.trim());
                                await setSetting("bedrock_region", bedrockRegion.trim());
                                await setSetting("bedrock_model", bedrockModel);
                                const { clearProviderClients } = await import("@/services/ai/providerManager");
                                clearProviderClients();
                                const { testConnection } = await import("@/services/ai/aiService");
                                const result = await testConnection();
                                setAiTestResult(result);
                              } catch (err) {
                                const msg = err instanceof Error ? err.message : String(err);
                                setAiTestResult({ ok: false, error: msg });
                              } finally {
                                setAiTesting(false);
                              }
                            }}
                            disabled={!bedrockApiKey.trim() || !bedrockRegion.trim() || aiTesting}
                            className="bg-bg-tertiary text-text-primary border border-border-primary"
                          >
                            {aiTesting ? t("ai.testing") : t("ai.test")}
                          </Button>
                          {aiTestResult?.ok && (
                            <span className="text-xs text-success">{t("ai.connected")}</span>
                          )}
                          {aiTestResult && !aiTestResult.ok && (
                            <span className="text-xs text-danger" title={aiTestResult.error}>
                              {t("ai.failed")}{aiTestResult.error ? `: ${aiTestResult.error.slice(0, 100)}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </Section>
                  ) : aiProvider === "ollama" ? (
                    <Section title={t("ai.local.server")}>
                      <div className="space-y-3">
                        <TextField
                          label={t("ai.local.server")}
                          size="md"
                          value={ollamaServerUrl}
                          onChange={(e) => setOllamaServerUrl(e.target.value)}
                          placeholder="http://localhost:11434"
                        />
                        <TextField
                          label={t("ai.local.apiKey")}
                          size="md"
                          type="password"
                          value={ollamaApiKey}
                          onChange={(e) => setOllamaApiKey(e.target.value)}
                          placeholder={t("ai.local.apiKey.placeholder")}
                        />
                        <SettingRow label={t("ai.local.model")}>
                          <div className="flex items-center gap-2">
                            <select
                              value={ollamaModel}
                              onChange={(e) => setOllamaModel(e.target.value)}
                              className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                            >
                              {Array.from(new Set([ollamaModel, ...ollamaModels.map((m) => m.id)].filter(Boolean))).map((id) => (
                                <option key={id} value={id}>{id}</option>
                              ))}
                            </select>
                            <Button
                              variant="secondary"
                              size="md"
                              onClick={async () => {
                                setOllamaModelsLoading(true);
                                try {
                                  const models = await listLocalModels(ollamaServerUrl, ollamaApiKey);
                                  setOllamaModels(models);
                                  if (models[0] && !models.some((m) => m.id === ollamaModel)) {
                                    setOllamaModel(models[0].id);
                                  }
                                } catch (err) {
                                  reportError(t("ai.failed"), err);
                                } finally {
                                  setOllamaModelsLoading(false);
                                }
                              }}
                              disabled={!ollamaServerUrl.trim() || ollamaModelsLoading}
                              className="bg-bg-tertiary text-text-primary border border-border-primary"
                            >
                              {ollamaModelsLoading ? t("ai.local.refreshing") : t("ai.local.refresh")}
                            </Button>
                          </div>
                        </SettingRow>
                        {ollamaModels.length === 0 && (
                          <p className="text-xs text-text-tertiary">{t("ai.local.noModels")}</p>
                        )}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            size="md"
                            onClick={async () => {
                              await setSetting("ollama_server_url", ollamaServerUrl.trim());
                              await setSetting("ollama_model", ollamaModel.trim());
                              if (ollamaApiKey.trim()) {
                                await setSecureSetting("ollama_api_key", ollamaApiKey.trim());
                              }
                              const { clearProviderClients } = await import("@/services/ai/providerManager");
                              clearProviderClients();
                              setAiKeySaved(true);
                              setTimeout(() => setAiKeySaved(false), 2000);
                            }}
                            disabled={!ollamaServerUrl.trim() || !ollamaModel.trim()}
                          >
                            {aiKeySaved ? t("ai.saved") : t("ai.save")}
                          </Button>
                          <Button
                            variant="secondary"
                            size="md"
                            onClick={async () => {
                              setAiTesting(true);
                              setAiTestResult(null);
                              try {
                                await setSetting("ollama_server_url", ollamaServerUrl.trim());
                                await setSetting("ollama_model", ollamaModel.trim());
                                if (ollamaApiKey.trim()) {
                                  await setSecureSetting("ollama_api_key", ollamaApiKey.trim());
                                }
                                const { clearProviderClients } = await import("@/services/ai/providerManager");
                                clearProviderClients();
                                const { testConnection } = await import("@/services/ai/aiService");
                                const result = await testConnection();
                                setAiTestResult(result);
                              } catch (err) {
                                const msg = err instanceof Error ? err.message : String(err);
                                setAiTestResult({ ok: false, error: msg });
                              } finally {
                                setAiTesting(false);
                              }
                            }}
                            disabled={!ollamaServerUrl.trim() || !ollamaModel.trim() || aiTesting}
                            className="bg-bg-tertiary text-text-primary border border-border-primary"
                          >
                            {aiTesting ? t("ai.testing") : t("ai.test")}
                          </Button>
                          {aiTestResult?.ok && (
                            <span className="text-xs text-success">{t("ai.connected")}</span>
                          )}
                          {aiTestResult && !aiTestResult.ok && (
                            <span className="text-xs text-danger" title={aiTestResult.error}>
                              {t("ai.failed")}{aiTestResult.error ? `: ${aiTestResult.error.slice(0, 100)}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </Section>
                  ) : (
                    <Section title={t("settings.apiKey")}>
                      <div className="space-y-3">
                        <TextField
                          label={
                            aiProvider === "claude" ? t("settings.anthropicApiKey")
                            : aiProvider === "openai" ? t("settings.openaiApiKey")
                            : aiProvider === "copilot" ? t("settings.githubPat")
                            : t("settings.googleAiApiKey")
                          }
                          size="md"
                          type="password"
                          value={
                            aiProvider === "claude" ? claudeApiKey
                            : aiProvider === "openai" ? openaiApiKey
                            : aiProvider === "copilot" ? copilotApiKey
                            : geminiApiKey
                          }
                          onChange={(e) => {
                            if (aiProvider === "claude") setClaudeApiKey(e.target.value);
                            else if (aiProvider === "openai") setOpenaiApiKey(e.target.value);
                            else if (aiProvider === "copilot") setCopilotApiKey(e.target.value);
                            else setGeminiApiKey(e.target.value);
                          }}
                          placeholder={
                            aiProvider === "claude" ? "sk-ant-..."
                            : aiProvider === "openai" ? "sk-..."
                            : aiProvider === "copilot" ? "ghp_..."
                            : "AI..."
                          }
                        />
                        <SettingRow label={t("ai.local.model")}>
                          <select
                            value={
                              aiProvider === "claude" ? claudeModel
                              : aiProvider === "openai" ? openaiModel
                              : aiProvider === "copilot" ? copilotModel
                              : geminiModel
                            }
                            onChange={async (e) => {
                              const val = e.target.value;
                              const modelSettingMap = {
                                claude: "claude_model",
                                openai: "openai_model",
                                gemini: "gemini_model",
                                copilot: "copilot_model",
                              } as const;
                              if (aiProvider === "claude") setClaudeModel(val);
                              else if (aiProvider === "openai") setOpenaiModel(val);
                              else if (aiProvider === "copilot") setCopilotModel(val);
                              else setGeminiModel(val);
                              await setSetting(modelSettingMap[aiProvider], val);
                              const { clearProviderClients } = await import("@/services/ai/providerManager");
                              clearProviderClients();
                            }}
                            className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                          >
                            {PROVIDER_MODELS[aiProvider].map((m) => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </select>
                        </SettingRow>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            size="md"
                            onClick={async () => {
                              const keySettingMap = {
                                claude: "claude_api_key",
                                openai: "openai_api_key",
                                gemini: "gemini_api_key",
                                copilot: "copilot_api_key",
                              } as const;
                              const keyValue =
                                aiProvider === "claude" ? claudeApiKey.trim()
                                : aiProvider === "openai" ? openaiApiKey.trim()
                                : aiProvider === "copilot" ? copilotApiKey.trim()
                                : geminiApiKey.trim();
                              if (keyValue) {
                                await setSecureSetting(keySettingMap[aiProvider], keyValue);
                                const { clearProviderClients } = await import("@/services/ai/providerManager");
                                clearProviderClients();
                              }
                              setAiKeySaved(true);
                              setTimeout(() => setAiKeySaved(false), 2000);
                            }}
                            disabled={
                              !(aiProvider === "claude" ? claudeApiKey.trim()
                              : aiProvider === "openai" ? openaiApiKey.trim()
                              : aiProvider === "copilot" ? copilotApiKey.trim()
                              : geminiApiKey.trim())
                            }
                          >
                            {aiKeySaved ? t("settings.savedMark") : t("settings.saveKey")}
                          </Button>
                          <Button
                            variant="secondary"
                            size="md"
                            onClick={async () => {
                              setAiTesting(true);
                              setAiTestResult(null);
                              try {
                                const { testConnection } = await import("@/services/ai/aiService");
                                const result = await testConnection();
                                setAiTestResult(result);
                              } catch (err) {
                                const msg = err instanceof Error ? err.message : String(err);
                                setAiTestResult({ ok: false, error: msg });
                              } finally {
                                setAiTesting(false);
                              }
                            }}
                            disabled={
                              !(aiProvider === "claude" ? claudeApiKey.trim()
                              : aiProvider === "openai" ? openaiApiKey.trim()
                              : aiProvider === "copilot" ? copilotApiKey.trim()
                              : geminiApiKey.trim()) || aiTesting
                            }
                            className="bg-bg-tertiary text-text-primary border border-border-primary"
                          >
                            {aiTesting ? t("ai.testing") : t("ai.test")}
                          </Button>
                          {aiTestResult?.ok && (
                            <span className="text-xs text-success">{t("ai.connected")}</span>
                          )}
                          {aiTestResult && !aiTestResult.ok && (
                            <span className="text-xs text-danger" title={aiTestResult.error}>
                              {t("ai.failed")}{aiTestResult.error ? `: ${aiTestResult.error.slice(0, 100)}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </Section>
                  )}

                  <Section title={t("voice.settingsTitle")}>
                    <p className="text-xs text-text-tertiary mb-3">{t("voice.settingsDesc")}</p>
                    <SettingRow label={t("voice.settingsModel")}>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={dictationModel}
                          onChange={(e) => setDictationModel(e.target.value)}
                          placeholder="whisper-1"
                          className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                        />
                        <Button
                          variant="primary"
                          size="md"
                          onClick={async () => {
                            await setSetting("dictation_model", dictationModel.trim() || "whisper-1");
                            setDictationSaved(true);
                            setTimeout(() => setDictationSaved(false), 2000);
                          }}
                        >
                          {dictationSaved ? t("settings.savedMark") : t("voice.settingsSave")}
                        </Button>
                      </div>
                    </SettingRow>
                  </Section>

                  <Section title={t("mcp.title")}>
                    <p className="text-xs text-text-tertiary mb-3">{t("mcp.description")}</p>
                    <ToggleRow
                      label={t("mcp.enabled")}
                      description={t("invoice.termsHint")}
                      checked={mcpEnabled}
                      onToggle={async () => {
                        const next = !mcpEnabled;
                        setMcpEnabledState(next);
                        await setSetting("mcp_enabled", next ? "true" : "false");
                        const endpoint = await setMcpEnabled(next);
                        setMcpEndpoint(endpoint);
                      }}
                    />
                    <SettingRow label={t("mcp.endpoint")}>
                      <code className="text-xs text-accent bg-bg-tertiary px-2 py-1 rounded-md">{mcpEndpoint}</code>
                    </SettingRow>
                  </Section>

                  <Section title={t("settings.features")}>
                    <ToggleRow
                      label={t("settings.enableAiFeatures")}
                      description={t("settings.enableAiFeaturesDesc")}
                      checked={aiEnabled}
                      onToggle={async () => {
                        const newVal = !aiEnabled;
                        setAiEnabled(newVal);
                        await setSetting("ai_enabled", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label={t("settings.autoCategorize")}
                      description={t("settings.autoCategorizeDesc")}
                      checked={aiAutoCategorize}
                      onToggle={async () => {
                        const newVal = !aiAutoCategorize;
                        setAiAutoCategorize(newVal);
                        await setSetting("ai_auto_categorize", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label={t("settings.autoSummarize")}
                      description={t("settings.autoSummarizeDesc")}
                      checked={aiAutoSummarize}
                      onToggle={async () => {
                        const newVal = !aiAutoSummarize;
                        setAiAutoSummarize(newVal);
                        await setSetting("ai_auto_summarize", newVal ? "true" : "false");
                      }}
                    />
                  </Section>

                  <Section title={t("settings.autoDraftReplies")}>
                    <ToggleRow
                      label={t("settings.autoDraft")}
                      description={t("settings.autoDraftDesc")}
                      checked={aiAutoDraftEnabled}
                      onToggle={async () => {
                        const newVal = !aiAutoDraftEnabled;
                        setAiAutoDraftEnabled(newVal);
                        await setSetting("ai_auto_draft_enabled", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label={t("settings.learnWritingStyle")}
                      description={t("settings.learnWritingStyleDesc")}
                      checked={aiWritingStyleEnabled}
                      onToggle={async () => {
                        const newVal = !aiWritingStyleEnabled;
                        setAiWritingStyleEnabled(newVal);
                        await setSetting("ai_writing_style_enabled", newVal ? "true" : "false");
                      }}
                    />
                    {aiWritingStyleEnabled && (
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-text-secondary">{t("settings.writingStyleProfile")}</span>
                          <p className="text-xs text-text-tertiary mt-0.5">
                            {t("settings.reanalyzeWritingStyleDesc")}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={async () => {
                            setStyleAnalyzing(true);
                            setStyleAnalyzeDone(false);
                            try {
                              const activeId = accounts.find((a) => a.isActive)?.id;
                              if (activeId) {
                                const { refreshWritingStyle } = await import("@/services/ai/writingStyleService");
                                await refreshWritingStyle(activeId);
                                setStyleAnalyzeDone(true);
                                setTimeout(() => setStyleAnalyzeDone(false), 3000);
                              }
                            } catch (err) {
                              console.error("Style analysis failed:", err);
                            } finally {
                              setStyleAnalyzing(false);
                            }
                          }}
                          disabled={styleAnalyzing}
                          className="bg-bg-tertiary text-text-primary border border-border-primary"
                        >
                          {styleAnalyzing ? t("settings.analyzing") : styleAnalyzeDone ? t("settings.doneMark") : t("settings.reanalyze")}
                        </Button>
                      </div>
                    )}
                  </Section>

                  <Section title={t("ai.features.title")}>
                    <p className="text-xs text-text-tertiary mb-3">
                      {t("ai.features.description")}
                    </p>
                    <ToggleRow
                      label={t("ai.features.proofread")}
                      description={t("ai.features.proofreadDesc")}
                      checked={aiProofreadEnabled}
                      onToggle={async () => {
                        const newVal = !aiProofreadEnabled;
                        setAiProofreadEnabled(newVal);
                        await setSetting("ai_proofread_enabled", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label={t("ai.features.meeting")}
                      description={t("ai.features.meetingDesc")}
                      checked={aiMeetingDetectionEnabled}
                      onToggle={async () => {
                        const newVal = !aiMeetingDetectionEnabled;
                        setAiMeetingDetectionEnabled(newVal);
                        await setSetting("ai_meeting_detection_enabled", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label={t("ai.features.digest")}
                      description={t("ai.features.digestDesc")}
                      checked={aiInboxDigestEnabled}
                      onToggle={async () => {
                        const newVal = !aiInboxDigestEnabled;
                        setAiInboxDigestEnabled(newVal);
                        await setSetting("ai_inbox_digest_enabled", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label={t("ai.features.urgency")}
                      description={t("ai.features.urgencyDesc")}
                      checked={aiUrgencyEnabled}
                      onToggle={async () => {
                        const newVal = !aiUrgencyEnabled;
                        setAiUrgencyEnabled(newVal);
                        await setSetting("ai_urgency_enabled", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label={t("ai.features.autoTasks")}
                      description={t("ai.features.autoTasksDesc")}
                      checked={aiAutoTasksEnabled}
                      onToggle={async () => {
                        const newVal = !aiAutoTasksEnabled;
                        setAiAutoTasksEnabled(newVal);
                        await setSetting("ai_auto_tasks_enabled", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label={t("ai.features.contactSummary")}
                      description={t("ai.features.contactSummaryDesc")}
                      checked={aiContactSummaryEnabled}
                      onToggle={async () => {
                        const newVal = !aiContactSummaryEnabled;
                        setAiContactSummaryEnabled(newVal);
                        await setSetting("ai_contact_summary_enabled", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label={t("ai.features.filterSuggestions")}
                      description={t("ai.features.filterSuggestionsDesc")}
                      checked={aiFilterSuggestionsEnabled}
                      onToggle={async () => {
                        const newVal = !aiFilterSuggestionsEnabled;
                        setAiFilterSuggestionsEnabled(newVal);
                        await setSetting("ai_filter_suggestions_enabled", newVal ? "true" : "false");
                      }}
                    />
                  </Section>

                  <Section title={t("settings.categories")}>
                    <p className="text-xs text-text-tertiary mb-1">
                      {t("settings.categoriesDesc1")}
                    </p>
                    <p className="text-xs text-text-tertiary mb-3">
                      {t("settings.categoriesDesc2")}
                    </p>
                    {(["Updates", "Promotions", "Social", "Newsletters"] as const).map((cat) => (
                      <ToggleRow
                        key={cat}
                        label={t("settings.autoArchiveCategory").replace("{category}", t(`nav.${cat.toLowerCase()}`))}
                        description={t("settings.skipInboxCategory").replace("{category}", t(`nav.${cat.toLowerCase()}`))}
                        checked={autoArchiveCategories.has(cat)}
                        onToggle={async () => {
                          const next = new Set(autoArchiveCategories);
                          if (next.has(cat)) next.delete(cat);
                          else next.add(cat);
                          setAutoArchiveCategories(next);
                          await setSetting("auto_archive_categories", [...next].join(","));
                        }}
                      />
                    ))}
                  </Section>

                  <Section title={t("settings.bundling")}>
                    <p className="text-xs text-text-tertiary mb-3">
                      Collapse categories into a single row in the inbox. Optionally set a delivery schedule to batch emails.
                    </p>
                    <BundleSettings />
                  </Section>
                </>
              )}

              {activeTab === "about" && (
                <>
                  <DeveloperTab />
                  <AboutTab />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAddAccount && (
        <AddAccount
          zIndex="z-[60]"
          onClose={() => setShowAddAccount(false)}
          onSuccess={async () => {
            setShowAddAccount(false);
            await refreshAfterAccountAdded();
          }}
        />
      )}
    </div>
  );
}

/**
 * Colour swatches for one account. The colour identifies the mailbox in the
 * unified inbox, where every thread otherwise looks alike.
 */
function AccountColorPicker({
  accountId,
  selectedId,
}: {
  accountId: string;
  selectedId: string;
}) {
  const setAccountColor = useAccountStore((s) => s.setAccountColor);

  const pick = async (colorId: string) => {
    setAccountColor(accountId, colorId);
    await updateAccountColor(accountId, colorId);
  };

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      {ACCOUNT_COLORS.map((color) => {
        const isSelected = color.id === selectedId;
        return (
          <button
            key={color.id}
            onClick={() => pick(color.id)}
            title={color.label}
            aria-label={`Use ${color.label} for this account`}
            aria-pressed={isSelected}
            className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${
              isSelected ? "ring-2 ring-offset-2 ring-offset-bg-secondary ring-text-tertiary" : ""
            }`}
            style={{ backgroundColor: color.hex }}
          />
        );
      })}
    </div>
  );
}

function SendAsAliasesSection() {
  const accounts = useAccountStore((s) => s.accounts);
  const [aliases, setAliases] = useState<SendAsAlias[]>([]);
  const { t } = useI18n();

  useEffect(() => {
    const activeAccount = accounts.find((a) => a.isActive);
    if (!activeAccount) return;
    let cancelled = false;
    getAliasesForAccount(activeAccount.id).then((dbAliases) => {
      if (cancelled) return;
      setAliases(dbAliases.map(mapDbAlias));
    });
    return () => { cancelled = true; };
  }, [accounts]);

  const activeAccount = accounts.find((a) => a.isActive);

  const handleSetDefault = async (alias: SendAsAlias) => {
    if (!activeAccount) return;
    await setDefaultAlias(activeAccount.id, alias.id);
    setAliases((prev) =>
      prev.map((a) => ({
        ...a,
        isDefault: a.id === alias.id,
      })),
    );
  };

  return (
    <Section title={t("settings.sendAsAliases")}>
      <p className="text-xs text-text-tertiary mb-3">
        {t("settings.sendAsAliasesDesc")}
      </p>
      {aliases.length === 0 ? (
        <p className="text-sm text-text-tertiary">
          {t("settings.noAliases")}
        </p>
      ) : (
        <div className="space-y-2">
          {aliases.map((alias) => (
            <div
              key={alias.id}
              className="flex items-center justify-between py-2.5 px-4 bg-bg-secondary rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Mail size={15} className="text-text-tertiary shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">
                    {alias.displayName ? `${alias.displayName} <${alias.email}>` : alias.email}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {alias.isPrimary && (
                      <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">
                        {t("settings.primaryBadge")}
                      </span>
                    )}
                    {alias.isDefault && (
                      <span className="text-[0.625rem] bg-success/15 text-success px-1.5 py-0.5 rounded-full">
                        {t("settings.defaultBadge")}
                      </span>
                    )}
                    {alias.verificationStatus !== "accepted" && (
                      <span className="text-[0.625rem] bg-warning/15 text-warning px-1.5 py-0.5 rounded-full">
                        {alias.verificationStatus}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {!alias.isDefault && (
                <button
                  onClick={() => handleSetDefault(alias)}
                  className="text-xs text-accent hover:text-accent-hover transition-colors shrink-0 ml-3"
                >
                  {t("settings.setAsDefault")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function SyncOfflineSection() {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const loadCounts = useCallback(async () => {
    const { getPendingOpsCount, getFailedOpsCount } = await import("@/services/db/pendingOperations");
    setPendingCount(await getPendingOpsCount());
    setFailedCount(await getFailedOpsCount());
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const handleRetryFailed = async () => {
    setLoading(true);
    try {
      const { retryFailedOperations } = await import("@/services/db/pendingOperations");
      await retryFailedOperations();
      await loadCounts();
    } finally {
      setLoading(false);
    }
  };

  const handleClearFailed = async () => {
    setLoading(true);
    try {
      const { clearFailedOperations } = await import("@/services/db/pendingOperations");
      await clearFailedOperations();
      await loadCounts();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section title={t("settings.syncOffline")}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">{t("settings.pendingOperations")}</span>
            <p className="text-xs text-text-tertiary mt-0.5">
              {t("settings.pendingOpsDesc")}
            </p>
          </div>
          <span className="text-sm font-mono text-text-primary">{pendingCount}</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">{t("settings.failedOperations")}</span>
            <p className="text-xs text-text-tertiary mt-0.5">
              {t("settings.failedOpsDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-text-primary">{failedCount}</span>
            {failedCount > 0 && (
              <>
                <button
                  onClick={handleRetryFailed}
                  disabled={loading}
                  className="text-xs text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
                >
                  {t("settings.retry")}
                </button>
                <button
                  onClick={handleClearFailed}
                  disabled={loading}
                  className="text-xs text-danger hover:opacity-80 transition-colors disabled:opacity-50"
                >
                  {t("settings.clearFailed")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function DeveloperTab() {
  const [appVersion, setAppVersion] = useState("");
  const [tauriVersion, setTauriVersion] = useState("");
  const [webviewVersion, setWebviewVersion] = useState("");
  const [platformLabel, setPlatformLabel] = useState("...");
  const [checkingForUpdate, setCheckingForUpdate] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateCheckDone, setUpdateCheckDone] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    async function load() {
      const { getVersion, getTauriVersion } = await import("@tauri-apps/api/app");
      setAppVersion(await getVersion());
      setTauriVersion(await getTauriVersion());

      // Extract WebView version from user agent
      const ua = navigator.userAgent;
      const edgMatch = /Edg\/(\S+)/.exec(ua);
      const chromeMatch = /Chrome\/(\S+)/.exec(ua);
      const webkitMatch = /AppleWebKit\/(\S+)/.exec(ua);
      setWebviewVersion(edgMatch?.[1] ?? chromeMatch?.[1] ?? webkitMatch?.[1] ?? "Unknown");

      // Detect platform via Tauri OS plugin (reliable native arch detection)
      const { platform, arch } = await import("@tauri-apps/plugin-os");
      const p = platform();
      const a = arch();
      const archLabel = a === "aarch64" || a === "arm" ? "ARM" : a === "x86_64" ? "x64" : a;
      if (p === "macos") {
        setPlatformLabel(a === "aarch64" ? "macOS (Apple Silicon)" : `macOS (${archLabel})`);
      } else if (p === "windows") {
        setPlatformLabel(`Windows (${archLabel})`);
      } else if (p === "linux") {
        setPlatformLabel(`Linux (${archLabel})`);
      } else {
        setPlatformLabel(`${p} (${archLabel})`);
      }

      // Check if there's already a known update
      const { getAvailableUpdate } = await import("@/services/updateManager");
      const existing = getAvailableUpdate();
      if (existing) setUpdateVersion(existing.version);
    }
    load();
  }, []);

  const handleCheckForUpdate = async () => {
    setCheckingForUpdate(true);
    setUpdateCheckDone(false);
    setUpdateVersion(null);
    try {
      const { checkForUpdateNow } = await import("@/services/updateManager");
      const result = await checkForUpdateNow();
      if (result) {
        setUpdateVersion(result.version);
      } else {
        setUpdateCheckDone(true);
      }
    } catch (err) {
      console.error("Update check failed:", err);
      setUpdateCheckDone(true);
    } finally {
      setCheckingForUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    setInstallingUpdate(true);
    try {
      const { installUpdate } = await import("@/services/updateManager");
      await installUpdate();
    } catch (err) {
      console.error("Update install failed:", err);
      setInstallingUpdate(false);
    }
  };

  return (
    <>
      <Section title={t("settings.appInfo")}>
        <InfoRow label={t("settings.appVersion")} value={appVersion ? `${appVersion} (${FIX_NUMBER})` : "..."} />
        <InfoRow label={t("settings.tauriVersion")} value={tauriVersion || "..."} />
        <InfoRow label={t("settings.webviewVersion")} value={webviewVersion || "..."} />
        <InfoRow label={t("settings.platform")} value={platformLabel} />
      </Section>

      <Section title={t("settings.updates")}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">{t("settings.softwareUpdates")}</span>
            {updateVersion && (
              <p className="text-xs text-accent mt-0.5">
                {t("settings.updateAvailable").replace("{version}", updateVersion)}
              </p>
            )}
            {updateCheckDone && !updateVersion && (
              <p className="text-xs text-success mt-0.5">{t("settings.upToDate")}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {updateVersion ? (
              <Button
                variant="primary"
                size="md"
                icon={<Download size={14} />}
                onClick={handleInstallUpdate}
                disabled={installingUpdate}
              >
                {installingUpdate ? t("settings.updating") : t("settings.updateRestart")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="md"
                icon={<RefreshCw size={14} className={checkingForUpdate ? "animate-spin" : ""} />}
                onClick={handleCheckForUpdate}
                disabled={checkingForUpdate}
                className="bg-bg-tertiary text-text-primary border border-border-primary"
              >
                {checkingForUpdate ? t("settings.checking") : t("settings.checkForUpdates")}
              </Button>
            )}
          </div>
        </div>
      </Section>

      <Section title={t("settings.developerTools")}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">{t("settings.openDevtools")}</span>
            <p className="text-xs text-text-tertiary mt-0.5">
              {t("settings.openDevtoolsDesc")}
            </p>
          </div>
          <Button
            variant="secondary"
            size="md"
            onClick={async () => {
              const { invoke } = await import("@tauri-apps/api/core");
              await invoke("open_devtools");
            }}
            className="bg-bg-tertiary text-text-primary border border-border-primary"
          >
            {t("settings.openDevtools")}
          </Button>
        </div>
      </Section>
    </>
  );
}

function AboutTab() {
  const [appVersion, setAppVersion] = useState("");
  const { t } = useI18n();

  useEffect(() => {
    import("@tauri-apps/api/app").then(({ getVersion }) =>
      getVersion().then(setAppVersion),
    );
  }, []);

  const openExternal = async (url: string) => {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  };

  return (
    <>
      <Section title={t("settings.naiMail")}>
        <div className="flex items-center gap-3 mb-2">
          <img src={appIcon} alt="NAI" className="w-12 h-12 rounded-xl" />
          <div>
            <h3 className="text-base font-semibold text-text-primary">NAI</h3>
            <p className="text-sm text-text-tertiary">
              {appVersion ? t("settings.version").replace("{version}", appVersion) : t("settings.loading")}
            </p>
          </div>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">
          {t("settings.aboutDesc")}
        </p>
      </Section>

      <Section title={t("settings.links")}>
        <div className="space-y-1">
          <button
            onClick={() => openExternal("https://velomail.app")}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-bg-secondary hover:bg-bg-hover transition-colors text-left"
          >
            <Globe size={16} className="text-text-tertiary shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-sm text-text-primary">{t("settings.website")}</span>
              <p className="text-xs text-text-tertiary">velomail.app</p>
            </div>
            <ExternalLink size={14} className="text-text-tertiary shrink-0" />
          </button>

          <button
            onClick={() => openExternal("https://github.com/avihaymenahem/velo")}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-bg-secondary hover:bg-bg-hover transition-colors text-left"
          >
            <Github size={16} className="text-text-tertiary shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-sm text-text-primary">{t("settings.githubRepository")}</span>
              <p className="text-xs text-text-tertiary">avihaymenahem/naiemail</p>
            </div>
            <ExternalLink size={14} className="text-text-tertiary shrink-0" />
          </button>

          <button
            onClick={() => openExternal("mailto:info@velomail.app")}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-bg-secondary hover:bg-bg-hover transition-colors text-left"
          >
            <Mail size={16} className="text-text-tertiary shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-sm text-text-primary">{t("settings.contact")}</span>
              <p className="text-xs text-text-tertiary">info@velomail.app</p>
            </div>
            <ExternalLink size={14} className="text-text-tertiary shrink-0" />
          </button>
        </div>
      </Section>

      <Section title={t("settings.license")}>
        <div className="px-4 py-3 bg-bg-secondary rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Scale size={15} className="text-text-tertiary" />
            <span className="text-sm font-medium text-text-primary">Apache License 2.0</span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed mb-3">
            Licensed under the Apache License, Version 2.0. You may obtain a copy of the License at{" "}
            <button
              onClick={() => openExternal("https://www.apache.org/licenses/LICENSE-2.0")}
              className="text-accent hover:text-accent-hover transition-colors"
            >
              apache.org/licenses/LICENSE-2.0
            </button>
          </p>
          <p className="text-xs text-text-tertiary leading-relaxed">
            Copyright 2025 NAI Mail. You may use, distribute, and modify this software under the terms of the Apache 2.0 license. This software is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
          </p>
        </div>
      </Section>

      <Section title={t("settings.attribution")}>
        <div className="px-4 py-3 bg-bg-secondary rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <GitFork size={15} className="text-text-tertiary" />
            <span className="text-sm font-medium text-text-primary">{t("settings.modifiedFromNai")}</span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            {t("settings.attributionDesc")}
          </p>
        </div>
      </Section>
    </>
  );
}


function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm text-text-primary font-mono">{value}</span>
    </div>
  );
}

function ShortcutsTab() {
  const keyMap = useShortcutStore((s) => s.keyMap);
  const setKey = useShortcutStore((s) => s.setKey);
  const resetKey = useShortcutStore((s) => s.resetKey);
  const resetAll = useShortcutStore((s) => s.resetAll);
  const defaults = getDefaultKeyMap();
  const { t } = useI18n();
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [composeShortcut, setComposeShortcut] = useState(DEFAULT_SHORTCUT);
  const [recordingGlobal, setRecordingGlobal] = useState(false);

  useEffect(() => {
    const current = getCurrentShortcut();
    if (current) setComposeShortcut(current);
  }, []);

  const handleGlobalRecord = useCallback((shortcut: string) => {
    setComposeShortcut(shortcut);
    setRecordingGlobal(false);
    registerComposeShortcut(shortcut).catch((err) => {
      console.error("Failed to register shortcut:", err);
    });
  }, []);

  const handleKeyRecord = useCallback((shortcut: string) => {
    if (!recordingId) return;
    setKey(recordingId, shortcut);
    setRecordingId(null);
  }, [recordingId, setKey]);

  useShortcutRecorder(recordingGlobal, handleGlobalRecord, "CmdOrCtrl");
  useShortcutRecorder(recordingId !== null, handleKeyRecord);

  const hasCustom = Object.entries(keyMap).some(([id, keys]) => defaults[id] !== keys);

  return (
    <>
      <Section title={t("settings.globalShortcut")}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">{t("settings.quickCompose")}</span>
            <p className="text-xs text-text-tertiary mt-0.5">
              Open compose window from any app
            </p>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="text-xs bg-bg-tertiary px-2 py-1 rounded border border-border-primary font-mono">
              {composeShortcut}
            </kbd>
            <button
              onClick={() => {
                setRecordingId(null);
                setRecordingGlobal(true);
              }}
              onBlur={() => setRecordingGlobal(false)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                recordingGlobal
                  ? "bg-accent text-on-accent"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border-primary"
              }`}
            >
              {recordingGlobal ? t("settings.pressKeys") : t("settings.change")}
            </button>
          </div>
        </div>
      </Section>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-tertiary">
          {t("settings.rebindHint")}
        </p>
        {hasCustom && (
          <button
            onClick={resetAll}
            className="text-xs text-accent hover:text-accent-hover transition-colors shrink-0 ml-4"
          >
            {t("settings.resetAll")}
          </button>
        )}
      </div>
      {SHORTCUTS.map((section) => (
        <Section key={section.category} title={section.category}>
          <div className="space-y-1">
            {section.items.map((item) => {
              const currentKey = keyMap[item.id] ?? item.keys;
              const isDefault = currentKey === defaults[item.id];
              const isRecording = recordingId === item.id;

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 px-1"
                >
                  <span className="text-sm text-text-secondary">
                    {t(item.desc)}
                  </span>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <button
                      onClick={() => {
                        setRecordingGlobal(false);
                        setRecordingId(isRecording ? null : item.id);
                      }}
                      onBlur={() => { if (isRecording) setRecordingId(null); }}
                      className={`text-xs px-2.5 py-1 rounded-md font-mono transition-colors ${
                        isRecording
                          ? "bg-accent text-on-accent"
                          : "bg-bg-tertiary text-text-tertiary hover:text-text-primary border border-border-primary"
                      }`}
                    >
                      {isRecording ? t("settings.pressKey") : currentKey}
                    </button>
                    {!isDefault && (
                      <button
                        onClick={() => resetKey(item.id)}
                        className="text-xs text-text-tertiary hover:text-text-primary"
                        title={t("settings.resetTo").replace("{key}", defaults[item.id] ?? currentKey)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ))}
    </>
  );
}

function ImapCalDavSection() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [account, setAccount] = useState<import("@/services/db/accounts").DbAccount | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!activeAccountId) return;
    import("@/services/db/accounts").then(({ getAccount }) => {
      getAccount(activeAccountId).then(setAccount);
    });
  }, [activeAccountId]);

  const activeUiAccount = accounts.find((a) => a.id === activeAccountId);
  const isImap = activeUiAccount?.provider === "imap";

  if (!isImap || !account) return null;

  return (
    <Section title={t("settings.calendarCalDav")}>
      <CalDavSettingsInline account={account} onSaved={() => {
        // Reload account
        import("@/services/db/accounts").then(({ getAccount }) => {
          getAccount(account.id).then(setAccount);
        });
      }} />
    </Section>
  );
}

function CalDavSettingsInline({ account, onSaved }: { account: import("@/services/db/accounts").DbAccount; onSaved: () => void }) {
  const [CalDav, setCalDav] = useState<typeof import("@/components/settings/CalDavSettings").CalDavSettings | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    import("@/components/settings/CalDavSettings").then((m) => setCalDav(() => m.CalDavSettings));
  }, []);

  if (!CalDav) return <div className="text-xs text-text-tertiary">{t("settings.loading")}</div>;

  return <CalDav account={account} onSaved={onSaved} />;
}

function SidebarNavEditor() {
  const sidebarNavConfig = useUIStore((s) => s.sidebarNavConfig);
  const setSidebarNavConfig = useUIStore((s) => s.setSidebarNavConfig);
  const { t } = useI18n();

  const items: SidebarNavItem[] = (() => {
    if (!sidebarNavConfig) return ALL_NAV_ITEMS.map((i) => ({ id: i.id, visible: true }));
    // Append any ALL_NAV_ITEMS entries missing from saved config (e.g. newly added sections)
    const savedIds = new Set(sidebarNavConfig.map((i) => i.id));
    const missing = ALL_NAV_ITEMS.filter((i) => !savedIds.has(i.id)).map((i) => ({ id: i.id, visible: true }));
    return [...sidebarNavConfig, ...missing];
  })();
  const navLookup = new Map(ALL_NAV_ITEMS.map((n) => [n.id, n]));

  const moveItem = (index: number, direction: -1 | 1) => {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    setSidebarNavConfig(next);
  };

  const toggleItem = (index: number) => {
    const next = [...items];
    const current = next[index];
    // Inbox cannot be hidden
    if (!current || current.id === "inbox") return;
    next[index] = { ...current, visible: !current.visible };
    setSidebarNavConfig(next);
  };

  const resetToDefaults = () => {
    setSidebarNavConfig(ALL_NAV_ITEMS.map((i) => ({ id: i.id, visible: true })));
  };

  const isDefault =
    !sidebarNavConfig ||
    (items.length === ALL_NAV_ITEMS.length &&
      items.every((item, i) => item.id === ALL_NAV_ITEMS[i]?.id && item.visible));

  return (
    <Section title={t("settings.sidebar")}>
      <div className="space-y-1">
        {items.map((item, index) => {
          const nav = navLookup.get(item.id);
          if (!nav) return null;
          const Icon = nav.icon;
          const isInbox = item.id === "inbox";
          return (
            <div
              key={item.id}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                item.visible ? "text-text-primary" : "text-text-tertiary"
              }`}
            >
              <button
                onClick={() => moveItem(index, -1)}
                disabled={index === 0}
                className="p-0.5 rounded text-text-tertiary hover:text-text-primary disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                title={t("settings.moveUp")}
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => moveItem(index, 1)}
                disabled={index === items.length - 1}
                className="p-0.5 rounded text-text-tertiary hover:text-text-primary disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                title={t("settings.moveDown")}
              >
                <ChevronDown size={14} />
              </button>
              <Icon size={16} className="shrink-0 ml-1" />
              <span className="flex-1 truncate">{t(`nav.${item.id}`)}</span>
              <button
                onClick={() => toggleItem(index)}
                disabled={isInbox}
                className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                  isInbox
                    ? "bg-accent/40 cursor-not-allowed"
                    : item.visible
                      ? "bg-accent cursor-pointer"
                      : "bg-bg-tertiary cursor-pointer"
                }`}
                title={isInbox ? t("settings.inboxAlwaysVisible") : item.visible ? t("settings.hide") : t("settings.show")}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    item.visible ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
      {!isDefault && (
        <button
          onClick={resetToDefaults}
          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover mt-2 transition-colors"
        >
          <RotateCcw size={12} />
          {t("settings.resetToDefaults")}
        </button>
      )}
    </Section>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  /** Optional control rendered on the right of the section heading */
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          {title}
        </h3>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-text-secondary">{label}</label>
      {children}
    </div>
  );
}

/**
 * Whether notifications carry buttons here — and why not, if not — with a
 * way to see one. The backend is decided once, at start-up, by
 * notificationManager; only a bundled macOS build gets the native one.
 */
function NotificationButtonsRow({ backend }: { backend: NotificationBackend }) {
  const [os, setOs] = useState("");
  const failure = getNativeNotificationFailure();
  useEffect(() => {
    import("@tauri-apps/plugin-os")
      .then(({ platform }) => setOs(platform()))
      .catch(() => {});
  }, []);

  let note: string;
  if (backend === "native") {
    note =
      "Reply, Archive and Copy code sit on the notification. macOS hides a banner's buttons until you hover, so NAI asks for the Alerts style; System Settings → Notifications → NAI is where to change it.";
  } else if (backend === "plugin") {
    note =
      os === "macos"
        ? failure
          // The centre was there and said no — almost always an unsigned
          // build, which it cannot identify. Saying "development build"
          // here would send the user looking in the wrong place.
          ? `The macOS notification centre turned this build down (${failure}), so notifications are plain text. An app bundle has to be code-signed before the centre will accept it.`
          : "Buttons need the installed app: a development build runs outside an app bundle, which the macOS notification centre refuses, so notifications here are plain text."
        : "Notifications are plain text on this platform. The buttons live in NAI's own toasts instead.";
  } else {
    note =
      "Notifications are off, or the system has not allowed them. On macOS, check System Settings → Notifications → NAI.";
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <p className="text-xs text-text-tertiary">{note}</p>
      <button
        onClick={async () => {
          const sent = await sendTestNotification();
          notify("info", sent === "off" ? "Notifications are off" : "Test notification sent");
        }}
        className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-bg-tertiary hover:bg-bg-hover text-text-secondary border border-border-primary"
      >
        Send a test
      </button>
    </div>
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function BundleSettings() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = accounts.find((a) => a.isActive)?.id;
  const [rules, setRules] = useState<Record<string, { bundled: boolean; delivery: boolean; days: number[]; hour: number; minute: number }>>({});

  useEffect(() => {
    if (!activeAccountId) return;
    import("@/services/db/bundleRules").then(async ({ getBundleRules }) => {
      const dbRules = await getBundleRules(activeAccountId);
      const map: typeof rules = {};
      for (const r of dbRules) {
        let schedule = { days: [6], hour: 9, minute: 0 };
        try {
          if (r.delivery_schedule) schedule = JSON.parse(r.delivery_schedule);
        } catch { /* use defaults */ }
        map[r.category] = {
          bundled: r.is_bundled === 1,
          delivery: r.delivery_enabled === 1,
          days: schedule.days,
          hour: schedule.hour,
          minute: schedule.minute,
        };
      }
      setRules(map);
    });
  }, [activeAccountId]);

  const saveRule = async (category: string, update: Partial<typeof rules[string]>) => {
    if (!activeAccountId) return;
    const current = rules[category] ?? { bundled: false, delivery: false, days: [6], hour: 9, minute: 0 };
    const merged = { ...current, ...update };
    setRules((prev) => ({ ...prev, [category]: merged }));
    const { setBundleRule } = await import("@/services/db/bundleRules");
    await setBundleRule(
      activeAccountId,
      category,
      merged.bundled,
      merged.delivery,
      merged.delivery ? { days: merged.days, hour: merged.hour, minute: merged.minute } : null,
    );
  };

  return (
    <div className="space-y-4">
      {(["Newsletters", "Promotions", "Social", "Updates"] as const).map((cat) => {
        const rule = rules[cat];
        return (
          <div key={cat} className="py-3 px-4 bg-bg-secondary rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">{cat}</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={rule?.bundled ?? false}
                    onChange={() => saveRule(cat, { bundled: !(rule?.bundled ?? false) })}
                    className="accent-accent"
                  />
                  Bundle
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={rule?.delivery ?? false}
                    onChange={() => saveRule(cat, { delivery: !(rule?.delivery ?? false) })}
                    className="accent-accent"
                  />
                  Schedule
                </label>
              </div>
            </div>
            {rule?.delivery && (
              <div className="space-y-2 pt-1">
                <div className="flex gap-1">
                  {DAY_NAMES.map((name, idx) => (
                    <button
                      key={name}
                      onClick={() => {
                        const days = rule.days.includes(idx)
                          ? rule.days.filter((d) => d !== idx)
                          : [...rule.days, idx].sort();
                        saveRule(cat, { days });
                      }}
                      className={`w-8 h-7 text-[0.625rem] rounded transition-colors ${
                        rule.days.includes(idx)
                          ? "bg-accent text-on-accent"
                          : "bg-bg-tertiary text-text-tertiary border border-border-primary"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary">at</span>
                  <input
                    type="time"
                    value={`${String(rule.hour).padStart(2, "0")}:${String(rule.minute).padStart(2, "0")}`}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(":").map(Number);
                      saveRule(cat, { hour: h ?? 9, minute: m ?? 0 });
                    }}
                    className="bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm text-text-secondary">{label}</span>
        {description && (
          <p className="text-xs text-text-tertiary mt-0.5">{description}</p>
        )}
      </div>
      <button
        onClick={onToggle}
        className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ml-4 ${
          checked ? "bg-accent" : "bg-bg-tertiary"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}
