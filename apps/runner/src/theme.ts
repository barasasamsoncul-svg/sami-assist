
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

import {
  SaMiOverlay,
  type SaMiOverlayAction,
  type SaMiOverlayType,
} from "./components/SaMiOverlay";

/* =========================================================
   THEME TYPES
========================================================= */

export type RunnerThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "sami_runner_theme_mode_v1";

/* =========================================================
   LIGHT PALETTE
   High-contrast daylight readability.
========================================================= */

const light = {
  // Brand
  brand: "#00061D",
  navy: "#00061D",
  brandNavy: "#00061D",
  onBrand: "#FFFFFF",

  // Primary action and accent
  blue: "#1558B0",
  blueAction: "#124F9D",
  blueSoft: "#E7F0FF",
  onBlue: "#FFFFFF",

  // Backgrounds and surfaces
  paper: "#F4F7FB",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceSunken: "#EAF0F7",
  surfaceOverlay: "#FFFFFF",
  surfaceSelected: "#E8F0FC",
  surfaceInverse: "#00061D",

  // Borders and separators
  border: "#C1CCDA",
  borderStrong: "#718198",
  divider: "#D5DEE8",

  // Typography
  text: "#101828",
  textMuted: "#34445A",
  muted: "#46566C",
  textSubtle: "#52647B",
  textDisabled: "#6B7788",

  // Icons
  icon: "#24364D",
  iconMuted: "#52647B",

  // Positive states
  success: "#087443",
  successSoft: "#E5F5EC",
  successStrong: "#065B35",
  onSuccess: "#FFFFFF",

  // Warning states
  warning: "#805000",
  warningSoft: "#FFF3D7",
  warningStrong: "#684000",
  amber: "#D99A25",
  onWarning: "#101828",

  // Error and danger states
  red: "#A61F18",
  danger: "#A61F18",
  dangerSoft: "#FDECEC",
  dangerStrong: "#841A15",
  onDanger: "#FFFFFF",

  // Information
  info: "#1558B0",
  infoSoft: "#E7F0FF",

  // Interaction
  focus: "#1558B0",
  focusRing: "#1558B0",
  pressed: "rgba(0,6,29,0.08)",
  disabled: "#E5EAF1",
  disabledText: "#68778A",

  // Overlays
  overlay: "rgba(0,6,29,0.66)",
  overlaySoft: "rgba(0,6,29,0.28)",
  overlayStrong: "rgba(0,6,29,0.84)",

  // Elevation and shadows
  shadow: "rgba(16,24,40,0.14)",
  shadowStrong: "rgba(16,24,40,0.24)",
} as const;


/* =========================================================
   DARK PALETTE
   Midnight brand foundation: #00061D.
   Strong contrast for outdoor visibility.
========================================================= */

const dark = {
  // Brand
  brand: "#00061D",
  navy: "#00061D",
  brandNavy: "#00061D",
  onBrand: "#FFFFFF",

  // Primary action and accent
  blue: "#B8D7FF",
  blueAction: "#2268B6",
  blueSoft: "#19375D",
  onBlue: "#FFFFFF",

  // Backgrounds and surfaces
  paper: "#00061D",
  surface: "#07132B",
  surfaceRaised: "#0D1B36",
  surfaceSunken: "#00030F",
  surfaceOverlay: "#10213F",
  surfaceSelected: "#18365F",
  surfaceInverse: "#F4F7FB",

  // Borders and separators
  border: "#596D88",
  borderStrong: "#8799B2",
  divider: "#3A4D68",

  // Typography
  text: "#F7FAFF",
  textMuted: "#DCE5F1",
  muted: "#C0CCDC",
  textSubtle: "#AEBBD0",
  textDisabled: "#8B99AC",

  // Icons
  icon: "#F1F5FC",
  iconMuted: "#BCC9DA",

  // Positive states
  success: "#6DE0A8",
  successSoft: "#123A2C",
  successStrong: "#9BF1C5",
  onSuccess: "#001D12",

  // Warning states
  warning: "#FFD37A",
  warningSoft: "#403016",
  warningStrong: "#FFE0A0",
  amber: "#FFD16B",
  onWarning: "#231700",

  // Error and danger states
  red: "#FF9D9D",
  danger: "#FF9D9D",
  dangerSoft: "#47252D",
  dangerStrong: "#FFC0C0",
  onDanger: "#2A0808",

  // Information
  info: "#B8D7FF",
  infoSoft: "#19375D",

  // Interaction
  focus: "#B8D7FF",
  focusRing: "#B8D7FF",
  pressed: "rgba(255,255,255,0.12)",
  disabled: "#26354C",
  disabledText: "#A0AEC1",

  // Overlays
  overlay: "rgba(0,0,0,0.68)",
  overlaySoft: "rgba(0,6,29,0.50)",
  overlayStrong: "rgba(0,0,0,0.84)",

  // Elevation and shadows
  shadow: "rgba(0,0,0,0.38)",
  shadowStrong: "rgba(0,0,0,0.58)",
} as const;


/* =========================================================
   SHARED COLOUR TYPE
========================================================= */

export type RunnerThemeColors = {
  [K in keyof typeof light]: string;
};

/* =========================================================
   OVERLAY TYPES
   Shared SaMiOverlay is controlled through the Runner theme.
========================================================= */

export type RunnerOverlayOptions = {
  type: SaMiOverlayType;
  title: string;
  message: string;
  children?: ReactNode;
  primaryAction?: SaMiOverlayAction;
  secondaryAction?: SaMiOverlayAction;
  onClose?: () => void;
  onDismiss?: () => void;
  dismissOnBackdrop?: boolean;
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
   ELEVATION TOKENS
========================================================= */

export const runnerElevation = {
  none: 0,
  low: 2,
  medium: 4,
  high: 8,
  modal: 16,
} as const;


/* =========================================================
   TOUCH TARGET TOKENS
   Designed for reliable outdoor mobile interaction.
========================================================= */

export const runnerTouchTargets = {
  minimum: 48,
  comfortable: 52,
  primary: 56,
} as const;


/* =========================================================
   ANIMATION TOKENS
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
   Slightly stronger minimum sizes for outdoor readability.
========================================================= */

export const runnerTypography = {
  display: 32,
  heading: 26,
  title: 22,
  subtitle: 18,
  body: 16,
  bodySmall: 15,
  caption: 13,
  eyebrow: 12,

  fontWeight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    heavy: "800",
  },

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

  showOverlay: (options: RunnerOverlayOptions) => void;
  hideOverlay: () => void;
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
   Owns the Runner appearance preference and the shared
   SaMiOverlay instance.
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

  const [overlay, setOverlay] =
    useState<RunnerOverlayOptions | null>(null);

  /* =======================================================
     APPEARANCE CONTROLS
  ======================================================= */

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

  /* =======================================================
     OVERLAY CONTROLS
  ======================================================= */

  const showOverlay = useCallback(
    (options: RunnerOverlayOptions) => {
      setOverlay(options);
    },
    [],
  );

  const hideOverlay = useCallback(() => {
    setOverlay(null);
  }, []);

  const handleOverlayDismiss = useCallback(() => {
    const activeOverlay = overlay;

    setOverlay(null);

    if (activeOverlay?.onDismiss) {
      activeOverlay.onDismiss();
    } else {
      activeOverlay?.onClose?.();
    }
  }, [overlay]);

  /* =======================================================
     ACTIVE THEME PALETTE
  ======================================================= */

  const colors: RunnerThemeColors =
    mode === "dark" ? dark : light;

  /* =======================================================
     CONTEXT VALUE
  ======================================================= */

  const value = useMemo<RunnerThemeContextValue>(
    () => ({
      mode,
      colors,
      isDark: mode === "dark",
      setMode,
      toggleMode,
      showOverlay,
      hideOverlay,
    }),
    [
      mode,
      colors,
      setMode,
      toggleMode,
      showOverlay,
      hideOverlay,
    ],
  );

  /* =======================================================
     APPLICATION THEME TREE
     One shared overlay instance for the entire Runner app.
  ======================================================= */

  return createElement(
    RunnerThemeContext.Provider,
    { value },
    children,
    createElement(SaMiOverlay, {
      open: overlay !== null,
      type: overlay?.type ?? "info",
      title: overlay?.title ?? "",
      message: overlay?.message ?? "",
      theme: colors,
      children: overlay?.children,
      primaryAction: overlay?.primaryAction,
      secondaryAction: overlay?.secondaryAction,
      onClose: handleOverlayDismiss,
      onDismiss: handleOverlayDismiss,
      dismissOnBackdrop: overlay?.dismissOnBackdrop,
    }),
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
