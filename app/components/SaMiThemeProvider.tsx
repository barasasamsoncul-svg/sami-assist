'use client';

import {
  useEffect,
} from 'react';

import {
  usePathname,
} from 'next/navigation';

import {
  applySaMiTheme,
  isSaMiUserTheme,
  readCachedSaMiTheme,
  SAMI_THEME_CHANGE_EVENT,
  SAMI_THEME_STORAGE_KEY,
} from '@/lib/theme/runtime';

type PreferencesResponse = {
  success?: boolean;
  preferences?: {
    theme?: unknown;
  };
};

async function syncThemeFromAccount(
  signal: AbortSignal,
) {
  try {
    const response =
      await fetch(
        '/api/account/preferences',
        {
          method:
            'GET',
          headers: {
            Accept:
              'application/json',
          },
          credentials:
            'same-origin',
          cache:
            'no-store',
          signal,
        },
      );

    if (
      !response.ok
    ) {
      return;
    }

    const data =
      (
        await response.json()
      ) as PreferencesResponse;

    const theme =
      data.success ===
        true &&
      isSaMiUserTheme(
        data.preferences
          ?.theme,
      )
        ? data.preferences!
            .theme
        : null;

    if (
      !theme
    ) {
      return;
    }

    applySaMiTheme(
      theme,
      {
        persist:
          true,
        broadcast:
          false,
      },
    );
  } catch (
    error
  ) {
    if (
      error instanceof
        DOMException &&
      error.name ===
        'AbortError'
    ) {
      return;
    }

    // Cached/system theme remains a safe visual fallback.
  }
}

export default function SaMiThemeProvider() {
  const pathname =
    usePathname();

  useEffect(
    () => {
      applySaMiTheme(
        readCachedSaMiTheme(),
        {
          persist:
            false,
          broadcast:
            false,
        },
      );

      const media =
        window.matchMedia(
          '(prefers-color-scheme: dark)',
        );

      const syncSystemTheme =
        () => {
          if (
            readCachedSaMiTheme() ===
            'system'
          ) {
            applySaMiTheme(
              'system',
              {
                persist:
                  false,
                broadcast:
                  false,
              },
            );
          }
        };

      const syncStorageTheme =
        (
          event:
            StorageEvent,
        ) => {
          if (
            event.key !==
              SAMI_THEME_STORAGE_KEY ||
            !isSaMiUserTheme(
              event.newValue,
            )
          ) {
            return;
          }

          applySaMiTheme(
            event.newValue,
            {
              persist:
                false,
              broadcast:
                false,
            },
          );
        };

      const syncLocalTheme =
        (
          event:
            Event,
        ) => {
          const custom =
            event as
              CustomEvent<{
                theme?:
                  unknown;
              }>;

          if (
            !isSaMiUserTheme(
              custom.detail
                ?.theme,
            )
          ) {
            return;
          }

          applySaMiTheme(
            custom.detail
              .theme,
            {
              persist:
                false,
              broadcast:
                false,
            },
          );
        };

      media.addEventListener?.(
        'change',
        syncSystemTheme,
      );

      window.addEventListener(
        'storage',
        syncStorageTheme,
      );

      window.addEventListener(
        SAMI_THEME_CHANGE_EVENT,
        syncLocalTheme,
      );

      return () => {
        media.removeEventListener?.(
          'change',
          syncSystemTheme,
        );

        window.removeEventListener(
          'storage',
          syncStorageTheme,
        );

        window.removeEventListener(
          SAMI_THEME_CHANGE_EVENT,
          syncLocalTheme,
        );
      };
    },
    [],
  );

  /*
   * Root layouts persist across client navigation.
   *
   * Reconcile on pathname changes so a successful sign-in followed by
   * client navigation receives the authenticated account preference
   * even when the provider first mounted on a public route.
   */
  useEffect(
    () => {
      const controller =
        new AbortController();

      void syncThemeFromAccount(
        controller.signal,
      );

      return () =>
        controller.abort();
    },
    [
      pathname,
    ],
  );

  return null;
}
