import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { InputDialog } from "@/components/ui/InputDialog";
import { Sparkles, Languages, Mic, Square } from "lucide-react";
import { useI18n } from "@/i18n";
import { playSound } from "@/services/sounds/soundManager";
import { createDictationController, type DictationController } from "@/services/ai/voiceDictation";

interface EditorToolbarProps {
  editor: Editor | null;
  onToggleAiAssist?: () => void;
  aiAssistOpen?: boolean;
}

export function EditorToolbar({ editor, onToggleAiAssist, aiAssistOpen }: EditorToolbarProps) {
  const { t } = useI18n();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showTranslateDialog, setShowTranslateDialog] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [dictating, setDictating] = useState(false);
  const dictationRef = useRef<DictationController | null>(null);

  if (!editor) return null;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      editor.chain().focus().setImage({ src: dataUrl }).run();
    };
    reader.readAsDataURL(file);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const toggleDictation = async () => {
    if (dictating) {
      const controller = dictationRef.current;
      if (controller) {
        try {
          const text = await controller.stop();
          if (text) {
            const current = editor.getText();
            editor
              .chain()
              .focus()
              .insertContent((current ? "\n\n" : "") + text)
              .run();
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("NO_KEY")) {
            // Key missing — surface as a quiet failure
          }
          console.error("Dictation failed:", err);
        }
      }
      dictationRef.current = null;
      setDictating(false);
      return;
    }
    try {
      const controller = createDictationController();
      dictationRef.current = controller;
      await controller.start();
      setDictating(true);
      void playSound("autocorr");
    } catch (err) {
      dictationRef.current = null;
      setDictating(false);
      console.error("Dictation start failed:", err);
    }
  };

  const btn = (
    label: string,
    isActive: boolean,
    onClick: () => void,
    title?: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={`px-1.5 py-1 text-xs rounded hover:bg-bg-hover transition-colors ${
        isActive ? "bg-bg-hover text-accent font-semibold" : "text-text-secondary"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border-secondary bg-bg-secondary flex-wrap">
      {btn("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), t("composer.bold"))}
      {btn("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), t("composer.italic"))}
      {btn("U", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), t("composer.underline"))}
      {btn("S̶", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), t("composer.strikethrough"))}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn("H1", editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
      {btn("H2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      {btn("H3", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run())}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn(t("composer.bulletList"), editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
      {btn(t("composer.orderedList"), editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
      {btn(t("composer.quote"), editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run())}
      {btn(t("composer.code"), editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run())}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn(t("composer.rule"), false, () => editor.chain().focus().setHorizontalRule().run())}
      {btn(t("composer.link"), editor.isActive("link"), () => {
        if (editor.isActive("link")) {
          editor.chain().focus().unsetLink().run();
        } else {
          setShowLinkDialog(true);
        }
      })}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelect}
      />
      {btn(t("composer.image"), false, () => imageInputRef.current?.click(), t("composer.insertImage"))}

      <div className="flex-1" />

      {onToggleAiAssist && (
        <button
          type="button"
          onClick={onToggleAiAssist}
          title={t("composer.aiAssist")}
          className={`px-1.5 py-1 text-xs rounded hover:bg-bg-hover transition-colors flex items-center gap-1 ${
            aiAssistOpen ? "bg-accent/10 text-accent font-semibold" : "text-text-secondary"
          }`}
        >
          <Sparkles size={12} />
          {t("composer.ai")}
        </button>
      )}

      <button
        type="button"
        onClick={() => setShowTranslateDialog(true)}
        disabled={translating}
        title={t("translate.composer")}
        className="px-1.5 py-1 text-xs rounded hover:bg-bg-hover transition-colors flex items-center gap-1 text-text-secondary disabled:opacity-50"
      >
        <Languages size={12} />
        {t("translate.composer")}
      </button>

      <button
        type="button"
        onClick={() => void toggleDictation()}
        title={dictating ? t("voice.stop") : t("voice.start")}
        className={`px-1.5 py-1 text-xs rounded hover:bg-bg-hover transition-colors flex items-center gap-1 ${
          dictating ? "bg-danger/15 text-danger font-semibold" : "text-text-secondary"
        }`}
      >
        {dictating ? <Square size={12} /> : <Mic size={12} />}
        {dictating ? t("voice.stop") : t("voice.title")}
      </button>

      {btn(t("composer.undo"), false, () => {
        editor.chain().focus().undo().run();
        void playSound("undo");
      })}
      {btn(t("composer.redo"), false, () => {
        editor.chain().focus().redo().run();
        void playSound("redo");
      })}
      <InputDialog
        isOpen={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        onSubmit={(values) => {
          if (values.url) {
            editor.chain().focus().setLink({ href: values.url }).run();
          }
        }}
        title={t("composer.insertLink")}
        fields={[{ key: "url", label: t("composer.url"), placeholder: "https://..." }]}
        submitLabel={t("composer.insert")}
      />
      <InputDialog
        isOpen={showTranslateDialog}
        onClose={() => setShowTranslateDialog(false)}
        onSubmit={async (values) => {
          const target = values.language || "English";
          const html = editor.getHTML();
          setTranslating(true);
          try {
            const { translateEmail } = await import("@/services/ai/aiService");
            const translated = await translateEmail(html, target);
            editor.chain().focus().setContent(translated, { emitUpdate: true }).run();
            void playSound("autocorr");
          } catch {
            // failed silently — the button state resets
          } finally {
            setTranslating(false);
            setShowTranslateDialog(false);
          }
        }}
        title={t("translate.composerTitle")}
        fields={[
          {
            key: "language",
            label: t("translate.title"),
            placeholder: "English",
            defaultValue: "English",
            required: false,
          },
        ]}
        submitLabel={translating ? t("common.loading") : t("translate.title")}
      />
    </div>
  );
}