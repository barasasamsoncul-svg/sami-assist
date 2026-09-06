const fs = require('fs');

const file = 'app/login/LoginClient.tsx';

let text = fs.readFileSync(file, 'utf8');

// ============================================================
// 1. Fix LoginResponse type
// ============================================================

text = text.replace(
  /type LoginResponse = \{[\s\S]*?\};/,
  `type LoginResponse = {
  success: boolean;
  code?: string;
  error?: string;
  message?: string;
  next?: string;

  // Used when login requires two-factor verification
  email?: string;
  challengeToken?: string;

  // Used by lockout/rate-limit overlays
  retryAfterSeconds?: number | null;
  lockedUntil?: string | null;
};`
);

// ============================================================
// 2. Fix OverlayState type
// ============================================================

text = text.replace(
  /type OverlayState = \{[\s\S]*?\};/,
  `type OverlayState = {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  primaryAction?: ReturnType<typeof getAuthOverlayMessage>['primaryAction'];
  secondaryAction?: ReturnType<typeof getAuthOverlayMessage>['secondaryAction'];
};`
);

// ============================================================
// 3. Fix possible undefined challengeToken in sessionStorage
// ============================================================

text = text.replace(
  /window\.sessionStorage\.setItem\(\s*'sami_2fa_challenge',\s*data\.challengeToken\s*\);/g,
  `window.sessionStorage.setItem(
    'sami_2fa_challenge',
    data.challengeToken || ''
  );`
);

// ============================================================
// 4. Make sure 2FA redirect only runs when challengeToken exists
// ============================================================

text = text.replace(
  /if \(data\.code === 'TWO_FACTOR_REQUIRED'\) \{/g,
  `if (data.code === 'TWO_FACTOR_REQUIRED' && data.challengeToken) {`
);

fs.writeFileSync(file, text, 'utf8');

console.log('Fixed LoginClient types for 2FA + overlays.');
