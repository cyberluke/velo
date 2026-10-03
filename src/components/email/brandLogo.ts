import type { ComponentType, CSSProperties } from "react";

/**
 * Sender domains → Lobe Icons brand logomark.
 *
 * When an email arrives from a company whose domain we recognize, the thread
 * list shows that company's logo instead of a generic domain favicon. Each
 * entry maps common registrable domains (nvidia.com, …) to a brand logomark
 * built from @lobehub/icons.
 *
 * The icons are imported from the package's deep component files —
 * `@lobehub/icons/es/<Brand>/components/Color` (or `/Mono`) plus its `style`
 * module — which depend only on `react`, never on the package's ESM barrel.
 * The barrel (es/index.js) re-exports every icon including demo/preview and
 * `.Avatar`/`.Combine` pieces that transitively pull `@lobehub/ui` →
 * `@emoji-mart`, whose data entry is a bare .json import Vitest cannot load.
 * Deep-importing only the mark keeps both the production bundle and the test
 * graph lean, so our tests never touch emoji-mart.
 *
 * Matching is by registrable domain, so subdomains (mail.nvidia.com,
 * updates.github.com) resolve to the same brand. Unknown domains fall
 * through to the existing favicon/initial chain in SenderAvatar.
 *
 * Keep this curated: one line per company users actually get mail from. Each
 * import tree-shakes to just the brand's mark SVG.
 */

interface MarkProps {
  className?: string;
  style?: CSSProperties;
}

export interface BrandLogomark {
  /** The icon to render (colour logomark when the brand ships one, else the mark). */
  StatelessIcon: ComponentType<MarkProps>;
  /** Brand primary colour — applied only to the mono fallback so it reads
   *  as the brand even without a multi-colour logomark. */
  monoColor: string;
}

function brand(mark: ComponentType<MarkProps>, colorPrimary: string): BrandLogomark {
  return { StatelessIcon: mark, monoColor: colorPrimary };
}

// ── Brands that ship a colour logomark (`components/Color` exists) ────────
import AwsColor from "@lobehub/icons/es/Aws/components/Color";
import { COLOR_PRIMARY as AwsPrimary } from "@lobehub/icons/es/Aws/style";
import BraveColor from "@lobehub/icons/es/Brave/components/Color";
import { COLOR_PRIMARY as BravePrimary } from "@lobehub/icons/es/Brave/style";
import CloudflareColor from "@lobehub/icons/es/Cloudflare/components/Color";
import { COLOR_PRIMARY as CloudflarePrimary } from "@lobehub/icons/es/Cloudflare/style";
import CohereColor from "@lobehub/icons/es/Cohere/components/Color";
import { COLOR_PRIMARY as CoherePrimary } from "@lobehub/icons/es/Cohere/style";
import DeepSeekColor from "@lobehub/icons/es/DeepSeek/components/Color";
import { COLOR_PRIMARY as DeepSeekPrimary } from "@lobehub/icons/es/DeepSeek/style";
import FigmaColor from "@lobehub/icons/es/Figma/components/Color";
import { COLOR_PRIMARY as FigmaPrimary } from "@lobehub/icons/es/Figma/style";
import GoogleColor from "@lobehub/icons/es/Google/components/Color";
import { COLOR_PRIMARY as GooglePrimary } from "@lobehub/icons/es/Google/style";
import HuggingFaceColor from "@lobehub/icons/es/HuggingFace/components/Color";
import { COLOR_PRIMARY as HuggingFacePrimary } from "@lobehub/icons/es/HuggingFace/style";
import MetaColor from "@lobehub/icons/es/Meta/components/Color";
import { COLOR_PRIMARY as MetaPrimary } from "@lobehub/icons/es/Meta/style";
import MicrosoftColor from "@lobehub/icons/es/Microsoft/components/Color";
import { COLOR_PRIMARY as MicrosoftPrimary } from "@lobehub/icons/es/Microsoft/style";
import MistralColor from "@lobehub/icons/es/Mistral/components/Color";
import { COLOR_PRIMARY as MistralPrimary } from "@lobehub/icons/es/Mistral/style";
import NvidiaColor from "@lobehub/icons/es/Nvidia/components/Color";
import { COLOR_PRIMARY as NvidiaPrimary } from "@lobehub/icons/es/Nvidia/style";
import PerplexityColor from "@lobehub/icons/es/Perplexity/components/Color";
import { COLOR_PRIMARY as PerplexityPrimary } from "@lobehub/icons/es/Perplexity/style";
import StabilityColor from "@lobehub/icons/es/Stability/components/Color";
import { COLOR_PRIMARY as StabilityPrimary } from "@lobehub/icons/es/Stability/style";

// ── Brands with only a mono mark (`components/Color` absent) ──────────────
import AnthropicMono from "@lobehub/icons/es/Anthropic/components/Mono";
import { COLOR_PRIMARY as AnthropicPrimary } from "@lobehub/icons/es/Anthropic/style";
import AppleMono from "@lobehub/icons/es/Apple/components/Mono";
import { COLOR_PRIMARY as ApplePrimary } from "@lobehub/icons/es/Apple/style";
import CursorMono from "@lobehub/icons/es/Cursor/components/Mono";
import { COLOR_PRIMARY as CursorPrimary } from "@lobehub/icons/es/Cursor/style";
import GithubMono from "@lobehub/icons/es/Github/components/Mono";
import { COLOR_PRIMARY as GithubPrimary } from "@lobehub/icons/es/Github/style";
import GroqMono from "@lobehub/icons/es/Groq/components/Mono";
import { COLOR_PRIMARY as GroqPrimary } from "@lobehub/icons/es/Groq/style";
import IBMMono from "@lobehub/icons/es/IBM/components/Mono";
import { COLOR_PRIMARY as IBMPrimary } from "@lobehub/icons/es/IBM/style";
import MidjourneyMono from "@lobehub/icons/es/Midjourney/components/Mono";
import { COLOR_PRIMARY as MidjourneyPrimary } from "@lobehub/icons/es/Midjourney/style";
import NotionMono from "@lobehub/icons/es/Notion/components/Mono";
import { COLOR_PRIMARY as NotionPrimary } from "@lobehub/icons/es/Notion/style";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import { COLOR_PRIMARY as OpenAIPrimary } from "@lobehub/icons/es/OpenAI/style";
import VercelMono from "@lobehub/icons/es/Vercel/components/Mono";
import { COLOR_PRIMARY as VercelPrimary } from "@lobehub/icons/es/Vercel/style";
import XAIMono from "@lobehub/icons/es/XAI/components/Mono";
import { COLOR_PRIMARY as XAIPrimary } from "@lobehub/icons/es/XAI/style";

/** Exact registrable domains → brand logomark component. */
export const BRAND_LOGOS: Record<string, BrandLogomark> = {
  // chips / GPUs
  "nvidia.com": brand(NvidiaColor, NvidiaPrimary),
  // AI labs & inference
  "openai.com": brand(OpenAIMono, OpenAIPrimary),
  "anthropic.com": brand(AnthropicMono, AnthropicPrimary),
  "google.com": brand(GoogleColor, GooglePrimary),
  "microsoft.com": brand(MicrosoftColor, MicrosoftPrimary),
  "meta.com": brand(MetaColor, MetaPrimary),
  "facebook.com": brand(MetaColor, MetaPrimary),
  "x.ai": brand(XAIMono, XAIPrimary),
  "deepseek.com": brand(DeepSeekColor, DeepSeekPrimary),
  "groq.com": brand(GroqMono, GroqPrimary),
  "mistral.ai": brand(MistralColor, MistralPrimary),
  "cohere.com": brand(CohereColor, CoherePrimary),
  "perplexity.ai": brand(PerplexityColor, PerplexityPrimary),
  "stability.ai": brand(StabilityColor, StabilityPrimary),
  "huggingface.co": brand(HuggingFaceColor, HuggingFacePrimary),
  "ibm.com": brand(IBMMono, IBMPrimary),
  // products & platforms
  "github.com": brand(GithubMono, GithubPrimary),
  "apple.com": brand(AppleMono, ApplePrimary),
  "amazon.com": brand(AwsColor, AwsPrimary),
  "amazonaws.com": brand(AwsColor, AwsPrimary),
  "aws.amazon.com": brand(AwsColor, AwsPrimary),
  "cloudflare.com": brand(CloudflareColor, CloudflarePrimary),
  "notion.so": brand(NotionMono, NotionPrimary),
  "notion.com": brand(NotionMono, NotionPrimary),
  "figma.com": brand(FigmaColor, FigmaPrimary),
  "vercel.com": brand(VercelMono, VercelPrimary),
  "cursor.com": brand(CursorMono, CursorPrimary),
  "cursor.sh": brand(CursorMono, CursorPrimary),
  "midjourney.com": brand(MidjourneyMono, MidjourneyPrimary),
  "brave.com": brand(BraveColor, BravePrimary),
};

/**
 * Last domain part that "owns" the brand. For a sender's subdomain
 * (mail.nvidia.com) the registrable domain is the last two labels. Our
 * curated brands are all 2-label registrable domains, so `foo.nvidia.com →
 * nvidia.com`. A longer public-suffix case (something.co.uk) just yields a
 * 2-label suffix that isn't in the registry and falls through safely.
 */
export function registrableDomain(domain: string): string {
  if (!domain) return "";
  const trimmed = domain.trim();
  if (!trimmed) return "";
  const labels = trimmed.split(".").filter(Boolean);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  return `${labels[labels.length - 2]!}.${labels[labels.length - 1]!}`;
}

/** Resolve a sender domain (e.g. "person@mail.nvidia.com") to its brand mark. */
export function resolveBrandMark(domain: string): BrandLogomark | undefined {
  if (!domain) return undefined;
  const normalized = domain.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!normalized) return undefined;
  return BRAND_LOGOS[normalized] ?? BRAND_LOGOS[registrableDomain(normalized)] ?? undefined;
}