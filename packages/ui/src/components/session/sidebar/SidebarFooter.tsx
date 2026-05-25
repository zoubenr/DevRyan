import React from 'react';
import {
  RiCheckLine,
  RiFolderAddLine,
  RiGithubFill,
  RiMoonLine,
  RiSettings3Line,
  RiSunLine,
} from '@remixicon/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import type { GitHubAuthStatus } from '@/lib/api/types';
import { useThemeSystem } from '@/contexts/useThemeSystem';

type Props = {
  onOpenSettings: () => void;
  githubAuthStatus?: GitHubAuthStatus | null;
  isSwitchingGitHubAccount?: boolean;
  onGitHubAccountSwitch?: (accountId: string) => Promise<void> | void;
  showRuntimeButtons?: boolean;
  hideDirectoryControls: boolean;
  handleOpenDirectoryDialog: () => void;
};

const footerButtonClassName = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-interactive-hover/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

function GitHubProfileControl({
  githubAuthStatus,
  isSwitchingGitHubAccount = false,
  onGitHubAccountSwitch,
}: {
  githubAuthStatus?: GitHubAuthStatus | null;
  isSwitchingGitHubAccount?: boolean;
  onGitHubAccountSwitch?: (accountId: string) => Promise<void> | void;
}): React.ReactNode {
  const { t } = useI18n();

  if (!githubAuthStatus?.connected) {
    return null;
  }

  const githubAvatarUrl = githubAuthStatus.user?.avatarUrl ?? null;
  const githubLogin = githubAuthStatus.user?.login ?? null;
  const githubAccounts = githubAuthStatus.accounts ?? [];
  const title = githubLogin ? t('header.github.connectedWithLogin', { login: githubLogin }) : t('header.github.connected');

  const avatar = githubAvatarUrl ? (
    <img
      src={githubAvatarUrl}
      alt={githubLogin ? t('header.github.avatarWithLogin', { login: githubLogin }) : t('header.github.avatar')}
      className="h-full w-full object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <RiGithubFill className="h-3.5 w-3.5 text-foreground" />
  );

  if (githubAccounts.length > 1 && onGitHubAccountSwitch) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/80 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50"
            title={title}
            aria-label={title}
            disabled={isSwitchingGitHubAccount}
          >
            {avatar}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-64">
          <DropdownMenuLabel className="typography-ui-header font-semibold text-foreground">
            {t('header.github.accountsTitle')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {githubAccounts.map((account) => {
            const accountUser = account.user;
            const isCurrent = Boolean(account.current);
            return (
              <DropdownMenuItem
                key={account.id}
                className="gap-2"
                disabled={isCurrent || isSwitchingGitHubAccount}
                onSelect={() => {
                  if (!isCurrent) {
                    void onGitHubAccountSwitch(account.id);
                  }
                }}
              >
                {accountUser?.avatarUrl ? (
                  <img
                    src={accountUser.avatarUrl}
                    alt={accountUser.login ? t('header.github.avatarWithLogin', { login: accountUser.login }) : t('header.github.avatar')}
                    className="h-6 w-6 rounded-full border border-border/60 bg-muted object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-muted">
                    <RiGithubFill className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate typography-ui-label text-foreground">
                    {accountUser?.name?.trim() || accountUser?.login || 'GitHub'}
                  </span>
                  {accountUser?.login ? (
                    <span className="truncate typography-micro text-muted-foreground">
                      {accountUser.login}
                    </span>
                  ) : null}
                </span>
                {isCurrent ? <RiCheckLine className="h-4 w-4 text-primary" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div
      className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/80"
      title={title}
      aria-label={title}
    >
      {avatar}
    </div>
  );
}

export function SidebarFooter({
  onOpenSettings,
  githubAuthStatus,
  isSwitchingGitHubAccount = false,
  onGitHubAccountSwitch,
  showRuntimeButtons = true,
  hideDirectoryControls,
  handleOpenDirectoryDialog,
}: Props): React.ReactNode {
  const { t } = useI18n();
  const { currentTheme, setThemeMode } = useThemeSystem();
  const isDarkMode = currentTheme.metadata.variant === 'dark';
  const themeToggleLabel = isDarkMode
    ? t('sessions.sidebar.footer.actions.switchToLightMode')
    : t('sessions.sidebar.footer.actions.switchToDarkMode');

  const handleThemeToggle = React.useCallback(() => {
    setThemeMode(isDarkMode ? 'light' : 'dark');
  }, [isDarkMode, setThemeMode]);

  return (
    <div className="flex shrink-0 items-center gap-1 px-2.5 py-2">
      {showRuntimeButtons ? (
        <>
          <GitHubProfileControl
            githubAuthStatus={githubAuthStatus}
            isSwitchingGitHubAccount={isSwitchingGitHubAccount}
            onGitHubAccountSwitch={onGitHubAccountSwitch}
          />
          {!hideDirectoryControls ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleOpenDirectoryDialog}
                  className={footerButtonClassName}
                  aria-label={t('sessions.sidebar.header.actions.addProject')}
                >
                  {/* Use Remix line icons here so these profile-adjacent actions stay visibly outline-only. */}
                  <RiFolderAddLine className="h-4.5 w-4.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}><p>{t('sessions.sidebar.header.actions.addProject')}</p></TooltipContent>
            </Tooltip>
          ) : null}
          <div className="min-w-0 flex-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={handleThemeToggle} className={footerButtonClassName} aria-label={themeToggleLabel}>
                {isDarkMode ? <RiSunLine className="h-4.5 w-4.5" /> : <RiMoonLine className="h-4.5 w-4.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}><p>{themeToggleLabel}</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={onOpenSettings} className={footerButtonClassName} aria-label={t('sessions.sidebar.footer.actions.settings')}>
                <RiSettings3Line className="h-4.5 w-4.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}><p>{t('sessions.sidebar.footer.actions.settings')}</p></TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </div>
  );
}
