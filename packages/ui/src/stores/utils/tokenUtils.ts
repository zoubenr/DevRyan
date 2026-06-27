import type { Message, Part } from "@opencode-ai/sdk/v2";
import type {
    ContextUsageSource,
    ContextUsageSourceAccuracy,
    ContextUsageSourceBreakdown,
} from "@/stores/types/sessionTypes";

type TokenBreakdown = {
    total?: unknown;
    input?: unknown;
    output?: unknown;
    reasoning?: unknown;
    cache?: {
        read?: unknown;
        write?: unknown;
    };
    sources?: unknown;
};

export type ExtractedTokenBreakdown = {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
    sources?: ContextUsageSourceBreakdown[];
    sourceTotalTokens?: number;
    sourceAccuracy: ContextUsageSourceAccuracy;
};

type ContextTokenMessage = Message | { info?: Message; parts?: Part[] };

const EMPTY_EXTRACTED_BREAKDOWN: ExtractedTokenBreakdown = {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
    sourceAccuracy: "unavailable",
};

const CONTEXT_USAGE_SOURCE_VALUES = new Set<ContextUsageSource>([
    "system",
    "rules",
    "skills",
    "mcp",
    "subagents",
    "tools",
    "conversation",
    "attachments",
    "other",
]);

const SOURCE_ALIASES: Record<string, ContextUsageSource> = {
    chat: "conversation",
    tool: "tools",
    toolCalls: "tools",
    tool_calls: "tools",
    subagent: "subagents",
    subAgents: "subagents",
    sub_agents: "subagents",
};

const toNonNegativeInteger = (value: unknown): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
    return Math.round(value);
};

const normalizeSource = (value: unknown): { source: ContextUsageSource; label?: string } | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const aliased = SOURCE_ALIASES[trimmed];
    if (aliased) return { source: aliased };
    if (CONTEXT_USAGE_SOURCE_VALUES.has(trimmed as ContextUsageSource)) {
        return { source: trimmed as ContextUsageSource };
    }

    // Preserve unknown upstream source names without expanding the public union.
    return { source: "other", label: trimmed };
};

const scaleSourcesToTotal = (
    sources: ContextUsageSourceBreakdown[],
    totalTokens: number,
): ContextUsageSourceBreakdown[] => {
    if (totalTokens <= 0) return sources;
    const sourceTotal = sources.reduce((sum, source) => sum + source.tokens, 0);
    if (sourceTotal <= totalTokens) return sources;

    const ratio = totalTokens / sourceTotal;
    const scaled = sources.map((source) => ({
        source,
        tokens: Math.floor(source.tokens * ratio),
        remainder: source.tokens * ratio - Math.floor(source.tokens * ratio),
    }));
    let remaining = totalTokens - scaled.reduce((sum, source) => sum + source.tokens, 0);

    [...scaled]
        .sort((a, b) => b.remainder - a.remainder)
        .forEach((entry) => {
            if (remaining <= 0) return;
            entry.tokens += 1;
            remaining -= 1;
        });

    return scaled
        .map(({ source, tokens }) => ({ ...source, tokens }))
        .filter((source) => source.tokens > 0);
};

export const normalizeContextUsageSources = (
    value: unknown,
    totalTokens: number,
): Pick<ExtractedTokenBreakdown, "sources" | "sourceTotalTokens" | "sourceAccuracy"> => {
    if (!Array.isArray(value)) {
        return { sourceAccuracy: "unavailable" };
    }

    const merged = new Map<string, ContextUsageSourceBreakdown>();
    for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const record = item as { source?: unknown; type?: unknown; tokens?: unknown; label?: unknown };
        const normalized = normalizeSource(record.source ?? record.type);
        if (!normalized) continue;
        const tokens = toNonNegativeInteger(record.tokens);
        if (tokens <= 0) continue;
        const label = typeof record.label === "string" && record.label.trim().length > 0
            ? record.label.trim()
            : normalized.label;
        const key = `${normalized.source}:${label ?? ""}`;
        const existing = merged.get(key);
        merged.set(key, {
            source: normalized.source,
            tokens: (existing?.tokens ?? 0) + tokens,
            ...(label ? { label } : {}),
        });
    }

    if (merged.size === 0) {
        return { sourceAccuracy: "unavailable" };
    }

    const sources = scaleSourcesToTotal([...merged.values()], toNonNegativeInteger(totalTokens));
    const sourceTotalTokens = sources.reduce((sum, source) => sum + source.tokens, 0);

    return {
        sources,
        sourceTotalTokens,
        sourceAccuracy: "reported",
    };
};

const sumTokenBreakdown = (breakdown: TokenBreakdown | null | undefined): number => {
    if (!breakdown || typeof breakdown !== 'object') {
        return 0;
    }

    const totalTokens = toNonNegativeInteger(breakdown.total);
    if (totalTokens > 0) {
        return totalTokens;
    }

    const inputTokens = toNonNegativeInteger(breakdown.input);
    const outputTokens = toNonNegativeInteger(breakdown.output);
    const reasoningTokens = toNonNegativeInteger(breakdown.reasoning);
    const cacheReadTokens = breakdown.cache && typeof breakdown.cache === 'object' ? toNonNegativeInteger(breakdown.cache.read) : 0;
    const cacheWriteTokens = breakdown.cache && typeof breakdown.cache === 'object' ? toNonNegativeInteger(breakdown.cache.write) : 0;

    return inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens;
};

/**
 * Cache hit rate = cached input tokens / total input-side tokens, as a 0-100
 * percent. Returns null when there are no input-side tokens to measure, so the
 * UI can render an em-dash instead of a misleading 0%.
 */
export const computeCacheHitRate = (
    input: number,
    cacheRead: number,
    cacheWrite: number,
): number | null => {
    const read = toNonNegativeInteger(cacheRead);
    const denom = toNonNegativeInteger(input) + read + toNonNegativeInteger(cacheWrite);
    if (denom <= 0) {
        return null;
    }
    return (read / denom) * 100;
};

const getMessageInfo = (message: ContextTokenMessage): Message => {
    return "info" in message && message.info ? message.info : message as Message;
};

const getMessageParts = (message: ContextTokenMessage): Part[] => {
    return "parts" in message && Array.isArray(message.parts) ? message.parts : [];
};

export const extractTokenBreakdownFromMessage = (message: ContextTokenMessage): ExtractedTokenBreakdown => {
    const info = getMessageInfo(message);
    const tokenCandidate = (info as { tokens?: unknown }).tokens;
    const source = tokenCandidate !== undefined
        ? tokenCandidate
        : (getMessageParts(message).find((part) => (part as { tokens?: unknown }).tokens !== undefined) as { tokens?: unknown } | undefined)?.tokens;

    if (typeof source === "number") {
        return {
            ...EMPTY_EXTRACTED_BREAKDOWN,
            total: toNonNegativeInteger(source),
        };
    }

    if (!source || typeof source !== "object") {
        return EMPTY_EXTRACTED_BREAKDOWN;
    }

    const breakdown = source as TokenBreakdown;
    const input = toNonNegativeInteger(breakdown.input);
    const output = toNonNegativeInteger(breakdown.output);
    const reasoning = toNonNegativeInteger(breakdown.reasoning);
    const cacheRead = breakdown.cache && typeof breakdown.cache === "object" ? toNonNegativeInteger(breakdown.cache.read) : 0;
    const cacheWrite = breakdown.cache && typeof breakdown.cache === "object" ? toNonNegativeInteger(breakdown.cache.write) : 0;
    const flatTotal = input + output + reasoning + cacheRead + cacheWrite;
    const reportedTotal = toNonNegativeInteger(breakdown.total);
    const sourceBreakdown = normalizeContextUsageSources(breakdown.sources, reportedTotal > 0 ? reportedTotal : flatTotal);
    const total = reportedTotal > 0 ? reportedTotal : flatTotal > 0 ? flatTotal : sourceBreakdown.sourceTotalTokens ?? 0;

    return {
        input,
        output,
        reasoning,
        cacheRead,
        cacheWrite,
        total,
        ...sourceBreakdown,
    };
};

export const extractTokensFromMessage = (message: { info: Message; parts: Part[] }): number => {
    const tokens = (message.info as { tokens?: number | TokenBreakdown }).tokens;

    if (typeof tokens === 'number') {
        return toNonNegativeInteger(tokens);
    }

    if (tokens && typeof tokens === 'object') {
        return sumTokenBreakdown(tokens);
    }

    const tokenPart = message.parts.find(
        (part) => typeof (part as { tokens?: number | TokenBreakdown }).tokens !== 'undefined'
    ) as { tokens?: number | TokenBreakdown } | undefined;

    if (!tokenPart || typeof tokenPart.tokens === 'undefined') {
        return 0;
    }

    if (typeof tokenPart.tokens === 'number') {
        return toNonNegativeInteger(tokenPart.tokens);
    }

    return sumTokenBreakdown(tokenPart.tokens);
};
