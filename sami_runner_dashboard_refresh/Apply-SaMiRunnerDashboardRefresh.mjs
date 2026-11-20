import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const changed = [];
const staged = new Map();

function readRepoFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Required file not found: ${relativePath}`);
  }
  const content = fs.readFileSync(absolutePath, 'utf8');
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  return { absolutePath, content, newline };
}

function countOccurrences(source, needle) {
  let count = 0;
  let index = 0;
  while ((index = source.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

function replaceExactly(source, needle, replacement, label) {
  const count = countOccurrences(source, needle);
  if (count !== 1) {
    throw new Error(`${label}: expected one exact match, found ${count}. No source files have been written.`);
  }
  return source.replace(needle, replacement);
}

function replaceRegexAtLeastOne(source, regex, replacement, label) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const globalRegex = new RegExp(regex.source, flags);
  const matches = [...source.matchAll(globalRegex)];
  if (matches.length < 1) {
    throw new Error(`${label}: expected one or more matches, found none. No source files have been written.`);
  }
  return source.replace(globalRegex, replacement);
}

function newlineOf(source) {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

const chromePath = 'apps/runner/src/components/RunnerDashboardChrome.tsx';
const indexPath = 'apps/runner/app/(app)/index.tsx';
const androidMapPath = 'apps/runner/modules/sami-mapbox/android/src/main/java/com/sami/runner/mapbox/SaMiMapboxModule.kt';
const iosMapPath = 'apps/runner/modules/sami-mapbox/ios/SaMiMapboxModule.swift';

const files = new Map([
  [chromePath, readRepoFile(chromePath)],
  [indexPath, readRepoFile(indexPath)],
  [androidMapPath, readRepoFile(androidMapPath)],
  [iosMapPath, readRepoFile(iosMapPath)],
]);
// Match source anchors in a canonical LF representation. Windows checkouts
// may use CRLF, which must not make otherwise-identical anchors fail.
for (const [name, entry] of files) {
  staged.set(name, entry.content.replace(/\r\n/g, '\n'));
}

// ---------------------------------------------------------------------------
// SaMi dashboard chrome: keep the approved structure, remove nested cards,
// use the global Runner theme, and anchor the sheet at the physical bottom.
// ---------------------------------------------------------------------------
let chrome = staged.get(chromePath);
const nl = newlineOf(chrome);

chrome = replaceExactly(
  chrome,
  'import { useMemo, useState } from "react";',
  'import { useEffect, useMemo, useState } from "react";',
  'Add dashboard overlay effect hook',
);
chrome = replaceExactly(
  chrome,
  'import { Ionicons } from "@expo/vector-icons";',
  'import { Ionicons } from "@expo/vector-icons";\nimport { useRunnerTheme } from "@/theme";',
  'Use shared Runner theme',
);
chrome = replaceExactly(
  chrome,
  'function MetricValue({\n  visible,\n  value,\n}: {\n  visible: boolean;\n  value: string | null;\n}) {\n  return (\n    <Text style={styles.metricValue} numberOfLines={1}>',
  'function MetricValue({\n  visible,\n  value,\n}: {\n  visible: boolean;\n  value: string | null;\n}) {\n  const { colors } = useRunnerTheme();\n\n  return (\n    <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>',
  'Use theme for metric values',
);
chrome = replaceExactly(
  chrome,
  '  const { height: windowHeight } = useWindowDimensions();\n  const [earningsExpanded, setEarningsExpanded] = useState(false);',
  '  const { height: windowHeight } = useWindowDimensions();\n  const { colors: themeColors, showOverlay } = useRunnerTheme();\n  const [earningsExpanded, setEarningsExpanded] = useState(false);',
  'Bind dashboard to global theme and overlay',
);
chrome = replaceExactly(
  chrome,
  '  const expandedHeight = Math.min(\n    Math.max(Math.round(windowHeight * 0.49), 360),\n    410,\n  );\n  const sheetBottom = Math.max(bottomInset, 10) + 7;\n  const sheetHeight = expanded ? expandedHeight : 110;',
  '  const safeBottom = Math.max(bottomInset, 0);\n  const expandedHeight = Math.min(\n    Math.max(Math.round(windowHeight * 0.46), 340),\n    390,\n  );\n  const sheetBottom = 0;\n  const sheetHeight = (expanded ? expandedHeight : 104) + safeBottom;',
  'Anchor sheet flush to bottom with measured safe area',
);

// Shared header status changes to "On errand" when the API automatically
// takes a Runner offline after accepting a task.
chrome = replaceExactly(
  chrome,
  '  const statusText = statusLabel === "PENDING"\n    ? "Pending"',
  '  const statusText = activeErrand\n    ? "On errand"\n    : statusLabel === "PENDING"\n    ? "Pending"',
  'Show active errand status in shared header',
);
chrome = replaceExactly(
  chrome,
  '{isOnline && authorized ? (\n          <View',
  '{(isOnline || activeErrand) && authorized ? (\n          <View',
  'Keep location in shared header during active errand',
);

// Use the application's shared modal overlay for errors, not a second
// dashboard-specific error banner.
chrome = replaceExactly(
  chrome,
  '  const visibleLocation = locationLabel?.trim() || "Finding location";\n\n  return (',
  '  const visibleLocation = locationLabel?.trim() || "Finding location";\n\n  useEffect(() => {\n    const message = error || mapError;\n    if (!message) return;\n\n    showOverlay({\n      type: "error",\n      title: error ? "Runner dashboard issue" : "Map issue",\n      message,\n      dismissOnBackdrop: true,\n    });\n  }, [error, mapError, showOverlay]);\n\n  return (',
  'Use global SaMi overlay for errors',
);

// The top row is an unobstructed map overlay, not three separate containers.
chrome = replaceExactly(
  chrome,
  '      {/* Three independent header cards: availability, earnings, location. */}',
  '      {/* SaMi header controls sit directly over the map without card shells. */}',
  'SaMi header description',
);
chrome = replaceExactly(
  chrome,
  '            paddingHorizontal: 12,',
  '            paddingHorizontal: 17,',
  'Header horizontal inset',
);
chrome = replaceExactly(
  chrome,
  '          style={[styles.headerCard, styles.statusCard]}',
  '          style={[styles.headerCard, styles.statusCard]}',
  'Keep availability control as inline text',
);
chrome = replaceExactly(chrome, 'ActivityIndicator size="small" color={COLORS.blue}', 'ActivityIndicator size="small" color={themeColors.blue}', 'Theme availability spinner');
chrome = replaceExactly(chrome, '{ backgroundColor: isOnline ? COLORS.blue : COLORS.quiet }', '{ backgroundColor: isOnline || activeErrand ? themeColors.blue : themeColors.muted }', 'Theme availability indicator');
chrome = replaceExactly(chrome, '<Text style={styles.headerCardText} numberOfLines={1}>\n            {statusText}', '<Text style={[styles.headerCardText, { color: themeColors.text }]} numberOfLines={1}>\n            {statusText}', 'Theme availability label');
chrome = replaceExactly(chrome, '<Text style={styles.headerCardText} numberOfLines={1}>\n                {earningsVisible ? "KSh —" : "KSh ••••"}', '<Text style={[styles.headerCardText, { color: themeColors.text }]} numberOfLines={1}>\n                {earningsVisible ? "KSh —" : "KSh ••••"}', 'Theme compact earnings amount');
chrome = replaceExactly(chrome, '<Ionicons name="bar-chart" size={17} color={COLORS.white} />', '<Ionicons name="bar-chart" size={17} color={themeColors.text} />', 'Theme earnings icon');
chrome = replaceExactly(chrome, '<Text style={styles.headerEyebrow}>EARNINGS</Text>', '<Text style={[styles.headerEyebrow, { color: themeColors.textMuted }]}>EARNINGS</Text>', 'Theme earnings label');
chrome = replaceExactly(
  chrome,
  'name={earningsVisible ? "eye-outline" : "eye-off-outline"}\n              size={18}\n              color={COLORS.white}',
  'name={earningsVisible ? "eye-outline" : "eye-off-outline"}\n              size={18}\n              color={themeColors.text}',
  'Theme compact earnings eye',
);
chrome = replaceExactly(chrome, '<Ionicons name="location" size={17} color={COLORS.white} />', '<Ionicons name="location" size={17} color={themeColors.text} />', 'Theme location icon');
chrome = replaceExactly(chrome, '<Text style={styles.headerCardText} numberOfLines={1}>\n              {visibleLocation}', '<Text style={[styles.headerCardText, { color: themeColors.text }]} numberOfLines={1}>\n              {visibleLocation}', 'Theme location text');

// Earnings details stay below the top header (or below turn guidance) and
// remain independent from privacy masking. A tap outside dismisses only this
// expanded details layer; it never changes the hidden/revealed preference.
chrome = replaceExactly(
  chrome,
  '      {earningsExpanded ? (\n        <View\n          style={[\n            styles.earningsPanel,\n            { top: topInset + (hasActiveRoute ? 230 : 67) },\n          ]}\n        >',
  '      {earningsExpanded ? (\n        <Pressable\n          accessibilityRole="button"\n          accessibilityLabel="Close earnings details"\n          onPress={() => setEarningsExpanded(false)}\n          style={styles.overlayDismiss}\n        />\n      ) : null}\n\n      {earningsExpanded ? (\n        <View\n          style={[\n            styles.earningsPanel,\n            {\n              top: topInset + (hasActiveRoute ? 230 : 61),\n              backgroundColor: themeColors.surface,\n              borderColor: themeColors.border,\n            },\n          ]}\n        >',
  'Place earnings overlay below header and add outside dismissal',
);
chrome = replaceExactly(chrome, '<Text style={styles.earningsPanelTitle}>Earnings overview</Text>', '<Text style={[styles.earningsPanelTitle, { color: themeColors.text }]}>Earnings overview</Text>', 'Theme earnings overlay title');
chrome = replaceExactly(chrome, '                color={COLORS.white}\n              />\n            </Pressable>\n          </View>\n\n          <View style={styles.metricTopRow}>', '                color={themeColors.text}\n              />\n            </Pressable>\n          </View>\n\n          <View style={styles.metricTopRow}>', 'Keep earnings eye visible when expanded');
chrome = replaceRegexAtLeastOne(chrome, /color="#9CBDF0"/g, 'color={themeColors.blue}', 'Theme earnings metrics icons');
chrome = replaceRegexAtLeastOne(chrome, /<Text style=\{styles\.metricLabel\}>/g, '<Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>' , 'Theme metric labels');
chrome = replaceRegexAtLeastOne(chrome, /<View style=\{styles\.metricDivider\} \/>/g, '<View style={[styles.metricDivider, { backgroundColor: themeColors.border }]} />', 'Theme metric separators');
chrome = replaceExactly(chrome, '<Text style={styles.metricsFootnote}>', '<Text style={[styles.metricsFootnote, { color: themeColors.muted }]}>', 'Theme earnings footnote');

// The transparent dismissal layer is above the header and sheet so a tap
// anywhere outside the earnings panel closes it. The panel itself is above it.
chrome = replaceExactly(
  chrome,
  `      {(error || mapError) ? (
        <View style={[styles.errorBanner, { top: topInset + 67 }]}>
          <Ionicons name="alert-circle-outline" size={17} color={COLORS.error} />
          <Text style={styles.errorBannerText} numberOfLines={2}>
            {error || mapError}
          </Text>
        </View>
      ) : null}

`,
  '',
  'Remove duplicate local error banner',
);
chrome = replaceExactly(
  chrome,
  '      <View\n        style={[\n          styles.bottomSheet,\n          {\n            bottom: sheetBottom,\n            height: sheetHeight,\n          },\n        ]}',
  '      {!activeErrand ? (\n      <View\n        style={[\n          styles.bottomSheet,\n          {\n            bottom: sheetBottom,\n            height: sheetHeight,\n            paddingBottom: safeBottom + 8,\n            backgroundColor: themeColors.surface,\n            borderTopColor: themeColors.border,\n          },\n        ]}',
  'Bottom sheet theme and edge anchoring',
);
chrome = replaceExactly(chrome, '<View style={styles.sheetHandle} />', '<View style={[styles.sheetHandle, { backgroundColor: themeColors.borderStrong }]} />', 'Theme sheet handle');
chrome = replaceExactly(chrome, '            color={COLORS.muted}\n            style={styles.sheetChevron}', '            color={themeColors.textMuted}\n            style={styles.sheetChevron}', 'Theme sheet chevron');
chrome = replaceExactly(chrome, '<Ionicons name="gift-outline" size={27} color={COLORS.white} />', '<Ionicons name="gift-outline" size={25} color={themeColors.blue} />', 'Theme offers icon');
chrome = replaceExactly(chrome, '<Text style={styles.offerTitle}>Offers & Rewards</Text>', '<Text style={[styles.offerTitle, { color: themeColors.text }]}>Offers & Rewards</Text>', 'Theme offers title');
chrome = replaceExactly(chrome, '<Text style={styles.offerSubtitle} numberOfLines={1}>', '<Text style={[styles.offerSubtitle, { color: themeColors.textMuted }]} numberOfLines={1}>', 'Theme offers subtitle');
chrome = replaceExactly(chrome, '<Ionicons name="chevron-forward" size={22} color={COLORS.white} />', '<Ionicons name="chevron-forward" size={21} color={themeColors.textMuted} />', 'Theme offers chevron');
chrome = replaceExactly(chrome, 'iconColor={COLORS.gold}', 'iconColor={themeColors.amber}', 'Theme rating icon');
chrome = replaceExactly(chrome, '                <ActivityIndicator size="small" color={COLORS.navy} />', '                <ActivityIndicator size="small" color={themeColors.brandNavy} />', 'Theme GO busy spinner');
chrome = replaceExactly(chrome, '<Text style={styles.goButtonText}>GO</Text>', '<Text style={[styles.goButtonText, { color: themeColors.brandNavy }]}>GO</Text>', 'Theme GO label');

// Give outside-dismiss press target a higher layer than the regular header and
// bottom sheet, while keeping the earnings panel above the dismiss target.
chrome = replaceExactly(
  chrome,
  '  earningsPanel: {\n    position: "absolute",\n    left: 14,\n    right: 14,\n    zIndex: 29,',
  '  overlayDismiss: {\n    ...StyleSheet.absoluteFillObject,\n    zIndex: 40,\n    elevation: 22,\n    backgroundColor: "transparent",\n  },\n  earningsPanel: {\n    position: "absolute",\n    left: 12,\n    right: 12,\n    zIndex: 41,',
  'Order outside-dismiss layer and earnings panel',
);

// Replace bulky card styles with transparent content. Keep SaMi's single
// bottom sheet as the only surface container; the four actions are unboxed.
chrome = replaceExactly(
  chrome,
  '  headerCard: {\n    minHeight: 48,\n    borderRadius: 15,\n    borderWidth: 1,\n    borderColor: COLORS.border,\n    backgroundColor: "rgba(0, 5, 35, 0.96)",\n    flexDirection: "row",\n    alignItems: "center",\n    justifyContent: "center",\n    gap: 7,\n    paddingHorizontal: 9,\n    shadowColor: "#000000",\n    shadowOffset: { width: 0, height: 4 },\n    shadowOpacity: 0.23,\n    shadowRadius: 8,\n    elevation: 9,\n  },',
  '  headerCard: {\n    minHeight: 44,\n    borderRadius: 0,\n    borderWidth: 0,\n    borderColor: "transparent",\n    backgroundColor: "transparent",\n    flexDirection: "row",\n    alignItems: "center",\n    justifyContent: "center",\n    gap: 6,\n    paddingHorizontal: 2,\n  },',
  'Remove header card containers',
);
chrome = replaceExactly(
  chrome,
  '  earningsPanel: {\n    position: "absolute",\n    left: 12,\n    right: 12,\n    zIndex: 41,\n    borderRadius: 20,\n    borderWidth: 1,\n    borderColor: "#547EBB",\n    backgroundColor: "rgba(0, 5, 35, 0.98)",\n    paddingHorizontal: 14,\n    paddingTop: 12,\n    paddingBottom: 10,\n    gap: 10,\n    elevation: 12,\n    shadowColor: "#000000",\n    shadowOffset: { width: 0, height: 5 },\n    shadowOpacity: 0.28,\n    shadowRadius: 12,\n  },',
  '  earningsPanel: {\n    position: "absolute",\n    left: 12,\n    right: 12,\n    zIndex: 41,\n    borderRadius: 16,\n    borderWidth: StyleSheet.hairlineWidth,\n    paddingHorizontal: 14,\n    paddingTop: 12,\n    paddingBottom: 10,\n    gap: 10,\n    elevation: 23,\n  },',
  'Simplify earnings overlay shell',
);
chrome = replaceExactly(
  chrome,
  '  bottomSheet: {\n    position: "absolute",\n    left: 0,\n    right: 0,\n    zIndex: 35,\n    borderTopLeftRadius: 27,\n    borderTopRightRadius: 27,\n    borderWidth: 1,\n    borderBottomWidth: 0,\n    borderColor: "#31537F",\n    backgroundColor: "rgba(0, 5, 35, 0.985)",\n    paddingHorizontal: 15,\n    paddingBottom: 10,\n    gap: 10,\n    elevation: 20,\n    shadowColor: "#000000",\n    shadowOffset: { width: 0, height: -5 },\n    shadowOpacity: 0.3,\n    shadowRadius: 16,\n  },',
  '  bottomSheet: {\n    position: "absolute",\n    left: 0,\n    right: 0,\n    zIndex: 35,\n    borderTopLeftRadius: 22,\n    borderTopRightRadius: 22,\n    borderTopWidth: StyleSheet.hairlineWidth,\n    paddingHorizontal: 17,\n    paddingBottom: 8,\n    gap: 9,\n    elevation: 12,\n  },',
  'Simplify single SaMi bottom sheet',
);
chrome = replaceExactly(
  chrome,
  '  offerCard: {\n    minHeight: 64,\n    borderWidth: 1,\n    borderColor: "#315CA0",\n    borderRadius: 18,\n    backgroundColor: "#0A1D40",\n    paddingHorizontal: 12,\n    paddingVertical: 8,\n    flexDirection: "row",\n    alignItems: "center",\n    gap: 10,\n  },\n  offerIconWrap: {\n    width: 43,\n    height: 43,\n    borderRadius: 14,\n    backgroundColor: "#112C56",\n    alignItems: "center",\n    justifyContent: "center",\n  },',
  '  offerCard: {\n    minHeight: 60,\n    borderWidth: 0,\n    borderRadius: 0,\n    backgroundColor: "transparent",\n    paddingHorizontal: 2,\n    paddingVertical: 5,\n    flexDirection: "row",\n    alignItems: "center",\n    gap: 11,\n  },\n  offerIconWrap: {\n    width: 38,\n    height: 38,\n    borderRadius: 19,\n    backgroundColor: "transparent",\n    alignItems: "center",\n    justifyContent: "center",\n  },',
  'Remove Offers nested card',
);
chrome = replaceExactly(
  chrome,
  '  quickCard: {\n    width: "48.5%",\n    minHeight: 65,\n    borderWidth: 1,\n    borderColor: COLORS.border,\n    borderRadius: 16,\n    backgroundColor: COLORS.panelRaised,\n    alignItems: "center",\n    justifyContent: "center",\n    paddingVertical: 7,\n    gap: 2,\n  },',
  '  quickCard: {\n    width: "48.5%",\n    minHeight: 58,\n    borderWidth: 0,\n    borderRadius: 0,\n    backgroundColor: "transparent",\n    alignItems: "center",\n    justifyContent: "center",\n    paddingVertical: 4,\n    gap: 4,\n  },',
  'Remove quick action card shells',
);
chrome = replaceExactly(
  chrome,
  '  headerRow: {\n    position: "absolute",\n    left: 0,\n    right: 0,\n    zIndex: 30,\n    flexDirection: "row",\n    alignItems: "stretch",\n    gap: 7,\n  },',
  '  headerRow: {\n    position: "absolute",\n    left: 0,\n    right: 0,\n    zIndex: 30,\n    flexDirection: "row",\n    alignItems: "center",\n    gap: 10,\n  },',
  'Header control spacing',
);


chrome = replaceExactly(
  chrome,
  '      </View>\n    </View>\n  );\n}\n\nfunction QuickCard({',
  '      </View>\n      ) : null}\n    </View>\n  );\n}\n\nfunction QuickCard({',
  'Close idle-only actions sheet for active errand mode',
);

// Use the shared active theme for the remaining text in quick actions. Keep
// icon defaults theme-derived too, instead of a second fixed local palette.
chrome = replaceExactly(
  chrome,
  '  return (\n    <Pressable\n      accessibilityRole="button"\n      accessibilityLabel={value ? `${label}: ${value}` : label}',
  '  const { colors } = useRunnerTheme();\n\n  return (\n    <Pressable\n      accessibilityRole="button"\n      accessibilityLabel={value ? `${label}: ${value}` : label}',
  'Use global theme in quick action component',
);
chrome = replaceExactly(chrome, '<Ionicons name={icon} size={22} color={iconColor} />', '<Ionicons name={icon} size={22} color={iconColor ?? colors.blue} />', 'Theme quick action icon');
chrome = replaceExactly(chrome, '{value ? <Text style={styles.quickCardValue}>{value}</Text> : null}', '{value ? <Text style={[styles.quickCardValue, { color: colors.text }]}>{value}</Text> : null}', 'Theme quick action value');
chrome = replaceExactly(chrome, '<Text style={styles.quickCardLabel}>{label}</Text>', '<Text style={[styles.quickCardLabel, { color: colors.textMuted }]}>{label}</Text>', 'Theme quick action label');

// Final style overrides: no extra card backplates, use theme text colours, and
// keep the eye reachable in compact and expanded earnings states.
chrome = replaceExactly(chrome, '  headerCardText: {\n    color: COLORS.text,', '  headerCardText: {\n    color: "#FFFFFF",', 'Fallback header text style');
chrome = replaceExactly(chrome, '  earningsPanelTitle: {\n    color: COLORS.text,', '  earningsPanelTitle: {\n    color: "#FFFFFF",', 'Fallback earnings heading style');
chrome = replaceExactly(chrome, '  metricValue: {\n    color: COLORS.text,', '  metricValue: {\n    color: "#FFFFFF",', 'Fallback metric value style');
chrome = replaceExactly(chrome, '  metricLabel: {\n    color: COLORS.muted,', '  metricLabel: {\n    color: "#D0D8E4",', 'Fallback metric label style');
chrome = replaceExactly(chrome, '  offerTitle: {\n    color: COLORS.text,', '  offerTitle: {\n    color: "#FFFFFF",', 'Fallback offer title style');
chrome = replaceExactly(chrome, '  offerSubtitle: {\n    color: COLORS.muted,', '  offerSubtitle: {\n    color: "#D0D8E4",', 'Fallback offer subtitle style');
chrome = replaceExactly(chrome, '  quickCardValue: {\n    color: COLORS.text,', '  quickCardValue: {\n    color: "#FFFFFF",', 'Fallback quick action value style');
chrome = replaceExactly(chrome, '  quickCardLabel: {\n    color: COLORS.muted,', '  quickCardLabel: {\n    color: "#D0D8E4",', 'Fallback quick action label style');

// Keep the current content truthful: earnings metrics remain unavailable until
// the metrics API supplies them, and the same privacy state masks both views.
for (const label of ['Today', 'This week', 'Balance', 'Trips', 'Last trip']) {
  if (!chrome.includes(label)) throw new Error(`Missing agreed earnings field: ${label}`);
}
if (!chrome.includes('onPress={() => setEarningsVisible((current) => !current)}')) {
  throw new Error('Earnings visibility control was not preserved.');
}
if (!chrome.includes('onPress={() => setEarningsExpanded((current) => !current)}')) {
  throw new Error('Earnings expand/collapse control was not preserved.');
}
staged.set(chromePath, chrome);

// ---------------------------------------------------------------------------
// Dashboard performance: do not mount the large legacy ScrollView tree when
// the idle SaMi dashboard chrome is the active screen. Active task/onboarding
// details remain mounted and functional.
// ---------------------------------------------------------------------------
let index = staged.get(indexPath);
index = replaceExactly(
  index,
  '      <View\n        style={[\n          styles.bottomWorkspace,',
  '      {(!authorized || Boolean(activeJob)) ? (\n      <View\n        style={[\n          styles.bottomWorkspace,',
  'Conditionally mount legacy workspace only when needed',
);
index = replaceExactly(
  index,
  '            display: authorized && !activeJob ? "none" : "flex",\n',
  '',
  'Remove expensive display-none subtree',
);
index = replaceExactly(
  index,
  '        </ScrollView>\n      </View>\n      {authorized && !activeJob ? (',
  '        </ScrollView>\n      </View>\n      ) : null}\n      {authorized && !activeJob ? (',
  'Close conditional legacy workspace',
);
if (index.includes('display: authorized && !activeJob ? "none" : "flex"')) {
  throw new Error('The hidden legacy workspace would still be mounted.');
}

index = replaceExactly(
  index,
  '{authorized && !activeJob ? (\n        <SaMiRunnerDashboardChrome',
  '{authorized ? (\n        <SaMiRunnerDashboardChrome',
  'Render shared SaMi header for approved active runners',
);
staged.set(indexPath, index);

// ---------------------------------------------------------------------------
// Native Mapbox: keep the Standard basemap's POI/road labels, use daylight 2D,
// remove 3D objects and reduce excessive label density. Navigation stays 2D.
// ---------------------------------------------------------------------------
let android = staged.get(androidMapPath);
android = replaceExactly(android, '"lightPreset" to Value.valueOf("night")', '"lightPreset" to Value.valueOf("day")', 'Android Mapbox day preset');
for (const key of ['show3dObjects', 'show3dBuildings', 'show3dLandmarks', 'show3dTrees']) {
  android = replaceExactly(android, `"${key}" to Value.valueOf(true)`, `"${key}" to Value.valueOf(false)`, `Disable Android ${key}`);
}
android = replaceExactly(android, '"densityPointOfInterestLabels" to Value.valueOf(4.0)', '"densityPointOfInterestLabels" to Value.valueOf(2.0)', 'Reduce Android POI label density');
android = replaceRegexAtLeastOne(
  android,
  /^\s*"color(?:Land|Water|Greenspace|Roads|Trunks|Motorways|PlaceLabels|RoadLabels|PointOfInterestLabels)" to Value\.valueOf\("#[0-9A-Fa-f]{6}"\),?\r?\n/gm,
  '',
  'Remove Android hard-coded map colour overrides',
);
android = replaceExactly(android, '.pitch(52.0)', '.pitch(0.0)', 'Android turn-by-turn camera pitch');
android = replaceExactly(android, '.zoom(17.5)\n                            .pitch(0.0)', '.zoom(17.0)\n                            .pitch(0.0)', 'Android 2D navigation zoom');
staged.set(androidMapPath, android);

let ios = staged.get(iosMapPath);
ios = replaceExactly(ios, 'config: "lightPreset", value: "night"', 'config: "lightPreset", value: "day"', 'iOS Mapbox day preset');
for (const key of ['show3dObjects', 'show3dBuildings', 'show3dLandmarks', 'show3dTrees']) {
  ios = replaceExactly(ios, `config: "${key}", value: true`, `config: "${key}", value: false`, `Disable iOS ${key}`);
}
ios = replaceExactly(ios, 'config: "densityPointOfInterestLabels", value: 4.0', 'config: "densityPointOfInterestLabels", value: 2.0', 'Reduce iOS POI label density');
ios = replaceRegexAtLeastOne(
  ios,
  /^\s*mapboxMap\.setStyleImportConfigProperty\(\s*for: "basemap", config: "color(?:Land|Water|Greenspace|Roads|Trunks|Motorways|PlaceLabels|RoadLabels|PointOfInterestLabels)", value: "#[0-9A-Fa-f]{6}"\s*\)\s*\r?\n/gm,
  '',
  'Remove iOS hard-coded map colour overrides',
);
ios = replaceExactly(ios, 'pitch: navigationCamera ? 55 : 0', 'pitch: 0', 'iOS navigation camera pitch');
staged.set(iosMapPath, ios);

// Pre-write validation across all four files. Every transform is held in memory
// until all checks pass, preventing a partial source update.
const finalChrome = staged.get(chromePath);
const finalAndroid = staged.get(androidMapPath);
const finalIos = staged.get(iosMapPath);
const finalIndex = staged.get(indexPath);
if (!finalChrome.includes('zIndex: 40')) throw new Error('Outside-dismiss layer missing.');
if (!finalChrome.includes('zIndex: 41')) throw new Error('Earnings detail layer must sit above outside-dismiss layer.');
if (!finalChrome.includes('bottom: sheetBottom')) throw new Error('Bottom anchoring missing.');
if (!finalChrome.includes('paddingBottom: safeBottom + 8')) throw new Error('Android/iOS sheet inset handling missing.');
if (!finalChrome.includes('{(isOnline || activeErrand) && authorized ? (')) throw new Error('Active errand location header is missing.');
if (!finalChrome.includes('!activeErrand ? (')) throw new Error('Idle-only Offers/actions sheet guard is missing.');
if (!finalIndex.includes('{authorized ? (')) throw new Error('Approved active runners do not receive the shared header.');
if (!finalChrome.includes('const { colors: themeColors, showOverlay } = useRunnerTheme();')) throw new Error('Shared theme/global overlay not wired.');
if (!finalChrome.includes('setEarningsVisible((current) => !current)')) throw new Error('Privacy toggle missing.');
if (!finalChrome.includes('setEarningsExpanded((current) => !current)')) throw new Error('Earnings expansion toggle missing.');
for (const key of ['show3dObjects', 'show3dBuildings', 'show3dLandmarks', 'show3dTrees']) {
  if (new RegExp(`"${key}" to Value\\.valueOf\\(true\\)`).test(finalAndroid)) throw new Error(`Android ${key} remains enabled.`);
  if (new RegExp(`config: "${key}", value: true`).test(finalIos)) throw new Error(`iOS ${key} remains enabled.`);
}
if (finalAndroid.includes('lightPreset" to Value.valueOf("night")') || finalIos.includes('config: "lightPreset", value: "night"')) throw new Error('Night map preset remains enabled.');
if (!finalIndex.includes('{(!authorized || Boolean(activeJob)) ? (')) throw new Error('Legacy workspace lazy-mount guard missing.');

// Back up originals and write all files only after validation is complete.
for (const [relativePath, entry] of files) {
  const stagedContent = staged.get(relativePath);
  const nextContent = entry.newline === '\r\n'
    ? stagedContent.replace(/\n/g, '\r\n')
    : stagedContent;
  const backupPath = `${entry.absolutePath}.before-dashboard-refresh-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}.bak`;
  fs.copyFileSync(entry.absolutePath, backupPath);
  const temporaryPath = `${entry.absolutePath}.dashboard-refresh.tmp`;
  fs.writeFileSync(temporaryPath, nextContent, 'utf8');
  fs.renameSync(temporaryPath, entry.absolutePath);
  changed.push({ file: relativePath, backup: path.relative(root, backupPath) });
}

console.log('SaMi Runner dashboard refresh applied.');
console.log('Updated files:');
for (const item of changed) console.log(`  ${item.file}`);
console.log('Local backups:');
for (const item of changed) console.log(`  ${item.backup}`);
console.log('The existing app.json, eas.json, package IDs, app versions, EAS IDs/channels, tokens, credentials, keystore and signing identities were not changed.');
