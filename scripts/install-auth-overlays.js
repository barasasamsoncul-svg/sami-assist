const fs = require('fs');

const files = [
  'app/login/LoginClient.tsx',
  'app/verify-email/VerifyEmailClient.tsx',
  'app/forgot-password/ForgotPasswordClient.tsx',
  'app/reset-password/ResetPasswordClient.tsx',
  'app/settings/SettingsClient.tsx',
];

function exists(file) {
  return fs.existsSync(file);
}

function has(text, value) {
  return text.includes(value);
}

function addImports(text) {
  if (!has(text, "SaMiOverlay")) {
    text = text.replace(
      /('use client';\s*)/,
      `$1\nimport SaMiOverlay from '@/app/components/SaMiOverlay';\n`
    );
  }

  if (!has(text, "getAuthOverlayMessage")) {
    text = text.replace(
      /('use client';\s*(?:\nimport SaMiOverlay.*?;\s*)?)/,
      `$1\nimport { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';\n`
    );
  }

  return text;
}

function addRenderBlock(text) {
  if (has(text, '<SaMiOverlay')) {
    return text;
  }

  const block = `
      {overlay && (
        <SaMiOverlay
          open={true}
          type={overlay.type}
          title={overlay.title}
          message={overlay.message}
          primaryAction={overlay.primaryAction}
          secondaryAction={overlay.secondaryAction}
          onClose={() => setOverlay(null)}
        />
      )}
`;

  return text.replace(
    /return\s*\(\s*(<main[\s\S]*?>)/,
    (match, mainTag) => {
      return match.replace(mainTag, `${mainTag}${block}`);
    }
  );
}

function patchFile(file) {
  if (!exists(file)) {
    console.log(`Skipped missing: ${file}`);
    return;
  }

  let text = fs.readFileSync(file, 'utf8');
  const before = text;

  text = addImports(text);
  text = addRenderBlock(text);

  if (text !== before) {
    fs.writeFileSync(file, text, 'utf8');
    console.log(`Patched: ${file}`);
  } else {
    console.log(`No change: ${file}`);
  }
}

for (const file of files) {
  patchFile(file);
}

console.log('');
console.log('Overlay base install complete.');
console.log('Next: replace response error handlers to call getAuthOverlayMessage(data.code, ...).');
