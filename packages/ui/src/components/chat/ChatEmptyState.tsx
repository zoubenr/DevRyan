import React from 'react';
import devRyanLogoUrl from '@/assets/DevRyan.svg';
import devRyanWhiteLogoUrl from '@/assets/DevRyanWhite.svg';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useGlobalSyncStore } from '@/sync/global-sync-store';
import { useI18n } from '@/lib/i18n';

const readStartupLogoPrefersDark = (): boolean => {
    if (typeof document === 'undefined') {
        return false;
    }

    const root = document.documentElement;
    return root.classList.contains('dark') || root.getAttribute('data-splash-variant') === 'dark';
};

const ChatEmptyState: React.FC = () => {
    const { t } = useI18n();
    const { currentTheme } = useThemeSystem();
    const initError = useGlobalSyncStore((s) => s.error);
    const [logoPrefersDark, setLogoPrefersDark] = React.useState(readStartupLogoPrefersDark);

    const textColor = currentTheme?.colors?.surface?.mutedForeground || 'var(--muted-foreground)';
    const logoUrl = logoPrefersDark ? devRyanWhiteLogoUrl : devRyanLogoUrl;

    React.useEffect(() => {
        const variant = currentTheme?.metadata?.variant;
        if (variant !== 'dark' && variant !== 'light') return;
        setLogoPrefersDark(variant === 'dark');
    }, [currentTheme?.metadata?.variant]);

    return (
        <div className="flex flex-col items-center justify-center min-h-full w-full gap-6 select-none">
            <img src={logoUrl} alt="" width={186} height={186} className="opacity-20 pointer-events-none" draggable={false} />
            {initError ? (
                <div className="flex flex-col items-center gap-2 max-w-md text-center px-4">
                    <span className="text-body-md font-medium text-destructive">{t('chat.emptyState.opencodeUnreachable')}</span>
                    <span className="text-body-sm" style={{ color: textColor }}>
                        {initError.message}
                    </span>
                </div>
            ) : (
                <span className="text-body-md" style={{ color: textColor }}>{t('chat.emptyState.startNewChat')}</span>
            )}
        </div>
    );
};

export default React.memo(ChatEmptyState);
