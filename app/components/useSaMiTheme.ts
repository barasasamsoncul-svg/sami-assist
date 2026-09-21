'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  SAMI_THEME_CHANGE_EVENT,
  setSaMiTheme,
} from '@/lib/theme/runtime';

export function useSaMiTheme() {
  const [
    darkMode,
    setDarkMode,
  ] =
    useState(
      false,
    );

  useEffect(
    () => {
      const sync =
        () => {
          setDarkMode(
            document
              .documentElement
              .classList
              .contains(
                'dark',
              ),
          );
        };

      sync();

      const observer =
        new MutationObserver(
          sync,
        );

      observer.observe(
        document.documentElement,
        {
          attributes:
            true,
          attributeFilter: [
            'class',
            'data-theme-preference',
          ],
        },
      );

      window.addEventListener(
        SAMI_THEME_CHANGE_EVENT,
        sync,
      );

      return () => {
        observer.disconnect();

        window.removeEventListener(
          SAMI_THEME_CHANGE_EVENT,
          sync,
        );
      };
    },
    [],
  );

  const toggleTheme =
    useCallback(
      () => {
        const currentDark =
          document
            .documentElement
            .classList
            .contains(
              'dark',
            );

        setSaMiTheme(
          currentDark
            ? 'light'
            : 'dark',
        );
      },
      [],
    );

  return {
    darkMode,
    toggleTheme,
  };
}
