(function () {
  try {
    var key = 'sami_theme';
    var theme = localStorage.getItem(key);

    if (
      theme !== 'dark' &&
      theme !== 'light' &&
      theme !== 'system'
    ) {
      theme = 'system';
    }

    var systemDark =
      window.matchMedia &&
      window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;

    var resolved =
      theme === 'dark' ||
      (
        theme === 'system' &&
        systemDark
      )
        ? 'dark'
        : 'light';

    var root =
      document.documentElement;

    root.classList.toggle(
      'dark',
      resolved === 'dark',
    );

    root.dataset.themePreference =
      theme;

    root.style.colorScheme =
      resolved;
  } catch (_) {
    var fallbackDark =
      window.matchMedia &&
      window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;

    document.documentElement
      .classList.toggle(
        'dark',
        Boolean(
          fallbackDark,
        ),
      );

    document.documentElement
      .style.colorScheme =
      fallbackDark
        ? 'dark'
        : 'light';
  }
})();
