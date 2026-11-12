
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import * as SecureStore from "expo-secure-store";

/* =========================================================
   THEME TYPES
========================================================= */

export type RunnerThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "sami_runner_theme_mode_v1";

/* =========================================================
   LIGHT PALETTE
   Designed for daylight visibility and high readability.
========================================================= */

const light = {
  // Brand
  navy: "#000535",
  brandNavy: "#000535",

  // Primary accent
  blue: "#1558B0",
  blueAction: "#1558B0",
  blueSoft: "#EAF1FC",
  onBlue: "#FFFFFF",

  // Backgrounds
  paper: "#F3F6FA",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",

  // Borders
  border: "#C9D3E0",
  borderStrong: "#8998AA",

  // Typography
  text: "#101828",
  textMuted: "#46566B",
  muted: "#566579",

  // Positive states
  success: "#087443",
  successSoft: "#E8F5EE",

  // Warnings
  warning: "#8A4B08",
  warningSoft: "#FFF2D6",
  amber: "#F0B64D",

  // Errors
  red: "#B42318",
  dangerSoft: "#FDECEC",

  // Interaction
  focus: "#1558B0",
  overlay: "rgba(0,5,53,0.56)",
  shadow: "rgba(16,24,40,0.12)",
} as const;

/* =========================================================
   DARK PALETTE
   Independently designed for readable dark surfaces.
========================================================= */

const dark = {
  // Brand
  navy: "#EAF0F8",
  brandNavy: "#000535",

  // Primary accent
  blue: "#9CC5FF",
  blueAction: "#1D5DAD",
  blueSoft: "#1B2D45",
  onBlue: "#FFFFFF",

  // Backgrounds
  paper: "#080F1D",
  surface: "#111D2E",
  surfaceRaised: "#17263A",

  // Borders
  border: "#34465D",
  borderStrong: "#687B93",

  // Typography
  text: "#F3F6FB",
  textMuted: "#C0CBD9",
  muted: "#A2B0C2",

  // Positive states
  success: "#55D696",
  successSoft: "#15392D",

  // Warnings
  warning: "#F4C36A",
  warningSoft: "#3C301B",
  amber: "#F7C96B",

  // Errors
  red: "#FF9292",
  dangerSoft: "#45252D",

  // Interaction
  focus: "#9CC5FF",
  overlay: "rgba(0,0,0,0.68)",
  shadow: "rgba(0,0,0,0.32)",
} as const;

export type RunnerThemeColors = {
  [K in keyof typeof light]: string;
};

/* =========================================================
   SHARED LAYOUT TOKENS
========================================================= */

export const runnerSpacing = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  section: 48,
} as const;

export const runnerRadii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 30,
  pill: 999,
} as const;

/* =========================================================
   ANIMATION TOKENS
   Shared timing for consistent screen transitions,
   press feedback and Reanimated interactions.
========================================================= */

export const runnerMotion = {
  instant: 80,
  press: 110,
  quick: 160,
  normal: 220,
  deliberate: 300,
  entrance: 380,

  spring: {
    damping: 20,
    stiffness: 220,
    mass: 0.85,
  },
} as const;

/* =========================================================
   TYPOGRAPHY TOKENS
========================================================= */

export const runnerTypography = {
  display: 32,
  heading: 26,
  title: 21,
  subtitle: 17,
  body: 15,
  bodySmall: 14,
  caption: 12,
  eyebrow: 11,

  lineHeight: {
    compact: 1.2,
    normal: 1.45,
    relaxed: 1.6,
  },
} as const;

/* =========================================================
   THEME CONTEXT
========================================================= */

type RunnerThemeContextValue = {
  mode: RunnerThemeMode;
  colors: RunnerThemeColors;
  isDark: boolean;

  setMode: (mode: RunnerThemeMode) => Promise<void>;
  toggleMode: () => Promise<void>;
};

const RunnerThemeContext =
  createContext<RunnerThemeContextValue | null>(null);

/* =========================================================
   INITIAL PREFERENCE
   Read the saved preference synchronously once during
   provider initialization to prevent an appearance flash.
========================================================= */

function readInitialThemeMode(): RunnerThemeMode {
  try {
    const savedMode = SecureStore.getItem(THEME_STORAGE_KEY);

    if (savedMode === "dark") {
      return "dark";
    }

    if (savedMode === "light") {
      return "light";
    }

    return "light";
  } catch (error) {
    console.warn(
      "[SaMi Runner Theme] Could not restore appearance preference.",
      error,
    );

    return "light";
  }
}

/* =========================================================
   GLOBAL THEME PROVIDER
========================================================= */

type RunnerThemeProviderProps = {
  children: ReactNode;
};

export function RunnerThemeProvider({
  children,
}: RunnerThemeProviderProps) {
  const [mode, setModeState] = useState<RunnerThemeMode>(
    readInitialThemeMode,
  );

  const setMode = useCallback(
    async (nextMode: RunnerThemeMode): Promise<void> => {
      setModeState(nextMode);

      try {
        await SecureStore.setItemAsync(
          THEME_STORAGE_KEY,
          nextMode,
        );
      } catch (error) {
        console.warn(
          "[SaMi Runner Theme] Could not persist appearance preference.",
          error,
        );
      }
    },
    [],
  );

  const toggleMode = useCallback(async (): Promise<void> => {
    const nextMode = mode === "light" ? "dark" : "light";
    await setMode(nextMode);
  }, [mode, setMode]);

  const colors: RunnerThemeColors =
    mode === "dark" ? dark : light;

  const value = useMemo<RunnerThemeContextValue>(
    () => ({
      mode,
      colors,
      isDark: mode === "dark",
      setMode,
      toggleMode,
    }),
    [mode, colors, setMode, toggleMode],
  );

  return createElement(
    RunnerThemeContext.Provider,
    { value },
    children,
  );
}

/* =========================================================
   SHARED THEME HOOK
   Existing screens can continue importing:
   import { useRunnerTheme } from "@/theme";
========================================================= */

export function useRunnerTheme(): RunnerThemeContextValue {
  const context = useContext(RunnerThemeContext);

  if (!context) {
    throw new Error(
      "useRunnerTheme must be used inside RunnerThemeProvider. " +
      "Wrap the Runner application in RunnerThemeProvider in app/_layout.tsx.",
    );
  }

  return context;
}
