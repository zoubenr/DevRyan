import React from 'react';
import { RiDraftLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { useConfigStore, useVisibleConfigAgents } from '@/stores/useConfigStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSelectionStore } from '@/sync/selection-store';
import { getAgentDisplayName } from './mobileControlsUtils';
import { getAgentColor } from '@/lib/agentColors';

interface MobileAgentButtonProps {
    onCycleAgent: () => void;
    onOpenAgentPanel: () => void;
    className?: string;
}

const LONG_PRESS_MS = 500;
const PLAN_MODE_AGENT_STYLE: React.CSSProperties = { color: 'var(--status-warning)' };

// NOTE: Use pointer events instead of onClick to keep soft keyboard open on mobile
export const MobileAgentButton: React.FC<MobileAgentButtonProps> = ({ onCycleAgent, onOpenAgentPanel, className }) => {
    const currentAgentName = useConfigStore((state) => state.currentAgentName);
    const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
    const sessionAgentName = useSelectionStore((state) =>
        currentSessionId ? state.getSessionAgentSelection(currentSessionId) : null
    );
    const isPlanModeSelected = useSelectionStore((state) => state.getPlanModeSelection(currentSessionId));

    const agents = useVisibleConfigAgents();
    const rawAgentName = currentSessionId ? (sessionAgentName || currentAgentName) : currentAgentName;
    const uiAgentName = rawAgentName?.trim().toLowerCase() === 'plan' ? undefined : rawAgentName;
    const agentLabel = getAgentDisplayName(agents, uiAgentName);
    const agentColor = getAgentColor(uiAgentName);

    const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressRef = React.useRef(false);

    const handlePointerDown = () => {
        isLongPressRef.current = false;
        longPressTimerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            onOpenAgentPanel();
        }, LONG_PRESS_MS);
    };

    // Use onPointerUp (not onClick) to prevent focus transfer that closes mobile keyboard
    const handlePointerUp = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        if (!isLongPressRef.current) {
            onCycleAgent();
        }
    };

    const handlePointerLeave = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    React.useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);

    return (
        <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp} // Don't use onClick - it closes mobile keyboard
            onPointerLeave={handlePointerLeave}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(
                'inline-flex min-w-0 items-center select-none',
                'rounded-md border border-border/50 px-1.5',
                'text-[11px] leading-none font-medium',
                'focus:outline-none hover:bg-[var(--interactive-hover)]',
                'touch-none',
                className
            )}
            style={{
                height: '23px',
                maxHeight: '23px',
                minHeight: '23px',
                ...(isPlanModeSelected ? PLAN_MODE_AGENT_STYLE : { color: `var(${agentColor.var})` }),
            }}
            title={agentLabel}
        >
            <span className="truncate">{agentLabel}</span>
            {isPlanModeSelected ? <RiDraftLine className="ml-1 h-3 w-3 flex-shrink-0" aria-hidden="true" /> : null}
        </button>
    );
};

export default MobileAgentButton;
