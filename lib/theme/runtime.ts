import {
  resolveUserTheme,
  type UserTheme,
} from '@/lib/account/user-formatting';

export const SAMI_THEME_STORAGE_KEY =
  'sami_theme';

export const SAMI_THEME_CHANGE_EVENT =
  'sami:theme-change';

export function isSaMiUserTheme(
  value: unknown,
): value is UserTheme {
  return (
    value === 'system' ||
    value === 'light' ||
    value === 'dark'
  );
}

export function getSaMiSystemPrefersDark() {
  if (
    typeof window ===
    'undefined'
  ) {
    return false;
  }

  return (
    window.matchMedia?.(
      '(prefers-color-scheme: dark)',
    ).matches ??
    false
  );
}

export function readCachedSaMiTheme():
  UserTheme {
  if (
    typeof window ===
    'undefined'
  ) {
    return 'system';
  }

  try {
    const stored =
      window.localStorage.getItem(
        SAMI_THEME_STORAGE_KEY,
      );

    return isSaMiUserTheme(
      stored,
    )
      ? stored
      : 'system';
  } catch {
    return 'system';
  }
}

export function applySaMiTheme(
  theme: UserTheme,
  options: {
    persist?: boolean;
    broadcast?: boolean;
  } = {},
) {
  const resolved =
    resolveUserTheme(
      theme,
      getSaMiSystemPrefersDark(),
    );

  const dark =
    resolved ===
    'dark';

  if (
    typeof document !==
    'undefined'
  ) {
    const root =
      document.documentElement;

    root.classList.toggle(
      'dark',
      dark,
    );

    root.dataset.themePreference =
      theme;

    root.style.colorScheme =
      resolved;
  }

  if (
    options.persist !==
      false &&
    typeof window !==
      'undefined'
  ) {
    try {
      window.localStorage.setItem(
        SAMI_THEME_STORAGE_KEY,
        theme,
      );
    } catch {
      // Local cache is an optimization, not an authorization boundary.
    }
  }

  if (
    options.broadcast ===
      true &&
    typeof window !==
      'undefined'
  ) {
    window.dispatchEvent(
      new CustomEvent(
        SAMI_THEME_CHANGE_EVENT,
        {
          detail: {
            theme,
            resolved,
          },
        },
      ),
    );
  }

  return resolved;
}

export function setSaMiTheme(
  theme: UserTheme,
) {
  return applySaMiTheme(
    theme,
    {
      persist:
        true,
      broadcast:
        true,
    },
  );
}
