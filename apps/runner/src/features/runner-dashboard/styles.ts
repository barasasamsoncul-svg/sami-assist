import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F3F6FA",
  },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  brandCard: {
    minHeight: 55,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 17,
    borderWidth: 1,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },

  brandCopy: {
    gap: 2,
  },

  brandTitle: {
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.45,
  },

  brandTagline: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.45,
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 20,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  statusPillText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  headerActions: {
    flexDirection: "row",
    gap: 8,
  },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },

  maneuverCard: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 9,
    borderRadius: 17,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },

  maneuverMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  maneuverIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  maneuverCopy: {
    flex: 1,
    gap: 3,
  },

  maneuverEyebrow: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },

  maneuverInstruction: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
  },

  maneuverSecondary: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
  },

  voiceToggle: {
    width: 39,
    height: 39,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  maneuverMetrics: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },

  maneuverMetric: {
    flex: 1,
    gap: 3,
  },

  maneuverMetricLabel: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  maneuverMetricValue: {
    fontSize: 11,
    fontWeight: "900",
  },

  mutedGuidanceText: {
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "600",
  },

  mapControls: {
    position: "absolute",
    zIndex: 8,
  },

  locationIndicator: {
    position: "absolute",
    left: 16,
    zIndex: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },

  locationIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  locationIndicatorCopy: {
    gap: 1,
  },

  locationIndicatorTitle: {
    fontSize: 10,
    fontWeight: "900",
  },

  locationIndicatorSubtitle: {
    fontSize: 9,
    fontWeight: "700",
  },

  bottomWorkspace: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },

  sheetToggle: {
    minHeight: 38,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },

  sheetToggleIcon: {
    position: "absolute",
    right: 18,
  },

  sheetScrollView: {
    flex: 1,
  },

  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 5,
    alignSelf: "center",
    marginTop: 0,
    marginBottom: 0,
  },

  sheetContent: {
    paddingHorizontal: 17,
    paddingTop: 13,
    paddingBottom: 16,
    gap: 15,
  },

  workspaceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  workspaceGreeting: {
    flex: 1,
    gap: 3,
  },

  workspaceEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  workspaceTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
    letterSpacing: -0.65,
  },

  workspaceSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },

  mapReadyBadge: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionHeading: {
    gap: 4,
  },

  eyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.05,
  },

  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    letterSpacing: -0.35,
  },

  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },

  stateCard: {
    borderWidth: 1,
    borderRadius: 19,
    padding: 16,
    gap: 14,
  },

  stateIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  stateTitle: {
    fontSize: 17,
    fontWeight: "900",
  },

  stateDescription: {
    fontSize: 12,
    lineHeight: 19,
  },

  primaryButton: {
    minHeight: 51,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  primaryButtonText: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.05,
  },

  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
  },

  noticeCopy: {
    flex: 1,
    gap: 4,
  },

  noticeTitle: {
    fontSize: 14,
    fontWeight: "900",
  },

  noticeDescription: {
    fontSize: 12,
    lineHeight: 18,
  },

  jobCard: {
    borderWidth: 1,
    borderRadius: 19,
    padding: 15,
    gap: 13,
  },

  jobCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  jobTypeCopy: {
    gap: 3,
  },

  jobCode: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  jobStatus: {
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },

  jobStatusText: {
    fontSize: 9,
    fontWeight: "900",
  },

  jobTitle: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "900",
  },

  jobDescription: {
    fontSize: 12,
    lineHeight: 18,
  },

  routeCard: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 12,
    gap: 0,
  },

  routeWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },

  routeWarningText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "600",
  },

  routePoint: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },

  routePointIconColumn: {
    width: 29,
    alignItems: "center",
  },

  routePointIcon: {
    width: 29,
    height: 29,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  routeConnector: {
    width: 1,
    height: 22,
    marginVertical: 3,
  },

  routePointCopy: {
    flex: 1,
    paddingTop: 2,
    paddingBottom: 11,
    gap: 3,
  },

  routePointLabel: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.9,
  },

  routePointValue: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },

  jobMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#00000020",
    paddingTop: 12,
  },

  jobMetric: {
    flex: 1,
    gap: 4,
  },

  jobMetricRight: {
    alignItems: "flex-end",
    gap: 4,
  },

  jobMetricLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  jobPayout: {
    fontSize: 18,
    fontWeight: "900",
  },

  jobDistance: {
    fontSize: 15,
    fontWeight: "900",
  },

  completionCode: {
    fontSize: 13,
    fontWeight: "900",
  },

  offerSection: {
    gap: 12,
  },

  offerCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 11,
  },

  offerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },

  offerCodeCopy: {
    flex: 1,
    gap: 4,
  },

  offerTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },

  offerPayout: {
    fontSize: 14,
    fontWeight: "900",
  },

  offerDescription: {
    fontSize: 12,
    lineHeight: 18,
  },

  offerFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  distanceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  distanceText: {
    fontSize: 10,
    fontWeight: "700",
  },

  categoryText: {
    fontSize: 10,
    fontWeight: "800",
  },

  searchingIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  searchingStatus: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  searchingStatusText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  errorNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 13,
  },

  errorNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "700",
  },

  mapInformation: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },

  mapInformationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  mapInformationTitle: {
    fontSize: 11,
    fontWeight: "900",
  },

  mapInformationDescription: {
    fontSize: 10,
    lineHeight: 16,
  },

  mapReadyStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  mapReadyStatusText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  availabilityFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  availabilityCopy: {
    flex: 1,
    gap: 3,
  },

  availabilityTitle: {
    fontSize: 13,
    fontWeight: "900",
  },

  availabilitySubtitle: {
    fontSize: 10,
    lineHeight: 15,
  },

  availabilitySwitch: {
    width: 53,
    height: 31,
    borderRadius: 20,
    padding: 4,
    justifyContent: "center",
  },

  availabilitySwitchKnob: {
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    elevation: 2,
  },

  accountFooter: {
    gap: 8,
  },

  accountAction: {
    minHeight: 45,
    borderWidth: 1,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
  },

  accountActionText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
  },

  signOutAction: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  signOutText: {
    fontSize: 11,
    fontWeight: "900",
  },
});