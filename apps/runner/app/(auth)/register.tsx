import { useEffect, useRef, useState } from "react";

import {

  AccessibilityInfo,

  ActivityIndicator,

  Animated,

  Keyboard,

  KeyboardAvoidingView,

  Platform,

  Pressable,

  ScrollView,

  StatusBar,

  StyleSheet,

  Text,

  TextInput,

  useWindowDimensions,

  View,

} from "react-native";

import { router } from "expo-router";

import { Ionicons } from "@expo/vector-icons";

import { SafeAreaView } from "react-native-safe-area-context";

import { requestRunnerRegistrationOtp } from "@/api";

import { useRunnerTheme } from "@/theme";

function isValidKenyanMobile(value: string): boolean {

  const trimmed = value.trim();

  if (!/^[+\d\s().-]+$/.test(trimmed)) {

    return false;

  }

  const digits = trimmed.replace(/\D/g, "");

  return (

    /^0[17]\d{8}$/.test(digits) ||

    /^254[17]\d{8}$/.test(digits) ||

    /^[17]\d{8}$/.test(digits)

  );

}

export default function RunnerRegistrationScreen() {

  const { colors, mode } = useRunnerTheme();

  const { height, width } = useWindowDimensions();

  const palette = colors as typeof colors & {

    brandNavy?: string;

    blueAction?: string;

    onBlue?: string;

    borderStrong?: string;

  };

  const isDark = mode === "dark";

  const compact = height < 740;

  const wide = width >= 600;

  const brandColor =

    palette.brandNavy ??

    (isDark ? colors.text : colors.navy);

  const actionColor =

    palette.blueAction ??

    (isDark ? "#1D5DAD" : colors.blue);

  const actionTextColor = palette.onBlue ?? "#FFFFFF";

  const [fullName, setFullName] = useState("");

  const [email, setEmail] = useState("");

  const [phone, setPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const nameInputRef = useRef<TextInput>(null);

  const emailInputRef = useRef<TextInput>(null);

  const phoneInputRef = useRef<TextInput>(null);

  const mountedRef = useRef(true);

  const submittingRef = useRef(false);

  const entrance = useRef(new Animated.Value(0)).current;

  const normalizedName = fullName.trim().replace(/\s+/g, " ");

  const normalizedEmail = email.trim().toLowerCase();

  const normalizedPhone = phone.trim();

  const validName =

    normalizedName.length >= 2 &&

    normalizedName.length <= 120;

  const validEmail =

    normalizedEmail.length <= 254 &&

    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  const validPhone = isValidKenyanMobile(normalizedPhone);

  useEffect(() => {

    mountedRef.current = true;

    return () => {

      mountedRef.current = false;

      submittingRef.current = false;

    };

  }, []);

  // A restrained entrance transition. It does not depend on

  // input focus or keyboard visibility, avoiding layout flicker.

  useEffect(() => {

    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()

      .then((reduceMotion) => {

        if (!active) return;

        if (reduceMotion) {

          entrance.setValue(1);

          return;

        }

        Animated.timing(entrance, {

          toValue: 1,

          duration: 280,

          useNativeDriver: true,

        }).start();

      })

      .catch(() => {

        if (active) entrance.setValue(1);

      });

    return () => {

      active = false;

      entrance.stopAnimation();

    };

  }, [entrance]);

  async function submitRegistration() {

    // A ref prevents duplicate requests before React has rendered

    // the submitting state.

    if (submittingRef.current) return;

    setError("");

    if (!validName) {

      setError("Enter your full name using at least two characters.");

      nameInputRef.current?.focus();

      return;

    }

    if (!validEmail) {

      setError("Enter a valid email address.");

      emailInputRef.current?.focus();

      return;

    }

    if (!validPhone) {

      setError(

        "Enter a valid Kenyan mobile number, such as 0712 345 678.",

      );

      phoneInputRef.current?.focus();

      return;

    }

    submittingRef.current = true;

    setSubmitting(true);

    Keyboard.dismiss();

    try {

      // Existing API helper:

      // - validates and normalizes the Kenyan phone number

      // - normalizes the email and full name

      // - sends purpose: "register"

      // - uses the Runner API client and its existing headers

      const result = await requestRunnerRegistrationOtp({

        fullName: normalizedName,

        email: normalizedEmail,

        phone: normalizedPhone,

      });

      // Do not navigate unless the server confirms that it

      // created a usable registration verification challenge.

      if (

        !result?.ok ||

        result.purpose !== "register" ||

        !result.challengeId?.trim() ||

        !result.destination?.trim()

      ) {

        throw new Error(

          "The registration verification request was not confirmed. Please try again.",

        );

      }

      if (!mountedRef.current) return;

      // Keep the existing OTP screen contract intact.

      router.push({

        pathname: "/(auth)/verify",

        params: {

          challengeId: result.challengeId,

          destination: result.destination,

          purpose: "register",

          fullName: normalizedName,

          email: normalizedEmail,

          phone: normalizedPhone,

        },

      });

    } catch (cause) {

      if (!mountedRef.current) return;

      setError(

        cause instanceof Error

          ? cause.message

          : "Registration could not be started. Please try again.",

      );

    } finally {

      submittingRef.current = false;

      if (mountedRef.current) {

        setSubmitting(false);

      }

    }

  }

  const entranceTranslateY = entrance.interpolate({

    inputRange: [0, 1],

    outputRange: [9, 0],

  });

  return (

    <SafeAreaView

      edges={["top", "bottom"]}

      style={[

        styles.safeArea,

        { backgroundColor: colors.paper },

      ]}

    >

      <StatusBar

        barStyle={isDark ? "light-content" : "dark-content"}

        backgroundColor={colors.paper}

      />

      <KeyboardAvoidingView

        style={styles.keyboardContainer}

        enabled={Platform.OS === "ios"}

        behavior={Platform.OS === "ios" ? "padding" : undefined}

        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}

      >

        <ScrollView

          contentContainerStyle={[

            styles.scrollContent,

            {

              paddingHorizontal: wide ? 40 : 24,

              paddingTop: compact ? 8 : 14,

              paddingBottom: compact ? 22 : 32,

              gap: compact ? 19 : 25,

            },

          ]}

          keyboardShouldPersistTaps="handled"

          keyboardDismissMode="on-drag"

          showsVerticalScrollIndicator={false}

        >

          <Animated.View

            style={[

              styles.content,

              {

                opacity: entrance,

                transform: [{ translateY: entranceTranslateY }],

              },

            ]}

          >

            {/* Header */}

            <View style={styles.header}>

              <Pressable

                accessibilityRole="button"

                accessibilityLabel="Go back"

                disabled={submitting}

                hitSlop={8}

                onPress={() => router.back()}

                style={({ pressed }) => [

                  styles.backButton,

                  {

                    backgroundColor: colors.surface,

                    borderColor: colors.border,

                    opacity: pressed ? 0.65 : 1,

                  },

                ]}

              >

                <Ionicons

                  name="chevron-back"

                  size={22}

                  color={colors.text}

                />

              </Pressable>

              <View style={styles.brand}>

                <Text

                  style={[

                    styles.brandName,

                    { color: brandColor },

                  ]}

                >

                  SaMi{" "}

                  <Text style={{ color: actionColor }}>

                    Runner

                  </Text>

                </Text>

                <Text

                  style={[

                    styles.brandTagline,

                    { color: colors.textMuted },

                  ]}

                >

                  CONSIDER IT DONE

                </Text>

              </View>

              <View style={styles.headerSpacer} />

            </View>

            {/* Introduction */}

            <View style={styles.intro}>

              <View

                style={[

                  styles.iconWrap,

                  { backgroundColor: colors.blueSoft },

                ]}

              >

                <Ionicons

                  name="person-add-outline"

                  size={27}

                  color={actionColor}

                />

              </View>

              <Text

                style={[

                  styles.eyebrow,

                  { color: actionColor },

                ]}

              >

                BECOME A SAMI RUNNER

              </Text>

              <Text

                accessibilityRole="header"

                style={[

                  styles.title,

                  {

                    color: colors.text,

                    fontSize: compact ? 27 : 31,

                    lineHeight: compact ? 34 : 39,

                  },

                ]}

              >

                Create your account.

              </Text>

              <Text

                style={[

                  styles.subtitle,

                  { color: colors.textMuted },

                ]}

              >

                Start with your contact details. We will

                verify your email before you continue

                with Runner setup.

              </Text>

            </View>

            {/* Registration form */}

            <View

              style={[

                styles.form,

                { gap: compact ? 17 : 21 },

              ]}

            >

              {/* Full name */}

              <View style={styles.fieldGroup}>

                <Text

                  style={[

                    styles.label,

                    { color: colors.text },

                  ]}

                >

                  Full name

                  <Text style={{ color: colors.red }}> *</Text>

                </Text>

                <View

                  style={[

                    styles.inputContainer,

                    {

                      backgroundColor: colors.surface,

                      borderColor: colors.border,

                    },

                  ]}

                >

                  <Ionicons

                    name="person-outline"

                    size={19}

                    color={colors.textMuted}

                  />

                  <TextInput

                    ref={nameInputRef}

                    value={fullName}

                    onChangeText={(value) => {

                      setFullName(value);

                      if (error) setError("");

                    }}

                    placeholder="Enter your full name"

                    placeholderTextColor={colors.textMuted}

                    autoCapitalize="words"

                    autoCorrect={false}

                    autoComplete="name"

                    textContentType="name"

                    returnKeyType="next"

                    blurOnSubmit={false}

                    maxLength={120}

                    editable={!submitting}

                    selectionColor={actionColor}

                    cursorColor={actionColor}

                    onSubmitEditing={() =>

                      emailInputRef.current?.focus()

                    }

                    style={[

                      styles.input,

                      { color: colors.text },

                    ]}

                    accessibilityLabel="Full name"

                    accessibilityHint="Enter your first and last name"

                  />

                </View>

              </View>

              {/* Email */}

              <View style={styles.fieldGroup}>

                <Text

                  style={[

                    styles.label,

                    { color: colors.text },

                  ]}

                >

                  Email address

                  <Text style={{ color: colors.red }}> *</Text>

                </Text>

                <View

                  style={[

                    styles.inputContainer,

                    {

                      backgroundColor: colors.surface,

                      borderColor: colors.border,

                    },

                  ]}

                >

                  <Ionicons

                    name="mail-outline"

                    size={19}

                    color={colors.textMuted}

                  />

                  <TextInput

                    ref={emailInputRef}

                    value={email}

                    onChangeText={(value) => {

                      setEmail(value);

                      if (error) setError("");

                    }}

                    placeholder="you@example.com"

                    placeholderTextColor={colors.textMuted}

                    keyboardType="email-address"

                    autoCapitalize="none"

                    autoCorrect={false}

                    autoComplete="email"

                    textContentType="emailAddress"

                    returnKeyType="next"

                    blurOnSubmit={false}

                    maxLength={254}

                    editable={!submitting}

                    selectionColor={actionColor}

                    cursorColor={actionColor}

                    onSubmitEditing={() =>

                      phoneInputRef.current?.focus()

                    }

                    style={[

                      styles.input,

                      { color: colors.text },

                    ]}

                    accessibilityLabel="Email address"

                    accessibilityHint="Enter the email address where your verification code can be sent"

                  />

                </View>

                <Text

                  style={[

                    styles.fieldHint,

                    { color: colors.textMuted },

                  ]}

                >

                  Your verification code will be sent to this email.

                </Text>

              </View>

              {/* Phone */}

              <View style={styles.fieldGroup}>

                <Text

                  style={[

                    styles.label,

                    { color: colors.text },

                  ]}

                >

                  Phone number

                  <Text style={{ color: colors.red }}> *</Text>

                </Text>

                <View

                  style={[

                    styles.inputContainer,

                    {

                      backgroundColor: colors.surface,

                      borderColor: colors.border,

                    },

                  ]}

                >

                  <Ionicons

                    name="call-outline"

                    size={19}

                    color={colors.textMuted}

                  />

                  <TextInput

                    ref={phoneInputRef}

                    value={phone}

                    onChangeText={(value) => {

                      setPhone(value);

                      if (error) setError("");

                    }}

                    placeholder="+254 712 345 678"

                    placeholderTextColor={colors.textMuted}

                    keyboardType="phone-pad"

                    autoComplete="tel"

                    textContentType="telephoneNumber"

                    returnKeyType="done"

                    maxLength={24}

                    editable={!submitting}

                    selectionColor={actionColor}

                    cursorColor={actionColor}

                    onSubmitEditing={() =>

                      void submitRegistration()

                    }

                    style={[

                      styles.input,

                      { color: colors.text },

                    ]}

                    accessibilityLabel="Phone number"

                    accessibilityHint="Enter a Kenyan mobile number"

                  />

                </View>

                <Text

                  style={[

                    styles.fieldHint,

                    { color: colors.textMuted },

                  ]}

                >

                  Use a Kenyan mobile number. You can enter

                  it as 0712 345 678 or +254 712 345 678.

                </Text>

              </View>

            </View>

            {/* API and validation errors */}

            {error ? (

              <View

                accessibilityRole="alert"

                accessibilityLiveRegion="polite"

                style={[

                  styles.errorContainer,

                  { backgroundColor: colors.dangerSoft },

                ]}

              >

                <Ionicons

                  name="alert-circle-outline"

                  size={19}

                  color={colors.red}

                />

                <Text

                  style={[

                    styles.errorText,

                    { color: colors.red },

                  ]}

                >

                  {error}

                </Text>

              </View>

            ) : null}

            {/* Actions */}

            <View style={styles.footer}>

              <Pressable

                accessibilityRole="button"

                accessibilityLabel="Continue to email verification"

                accessibilityHint="Sends a verification code to your email address"

                accessibilityState={{ busy: submitting }}

                disabled={submitting}

                onPress={() => void submitRegistration()}

                hitSlop={3}

                style={({ pressed }) => [

                  styles.submitButton,

                  { backgroundColor: actionColor },

                  submitting && styles.disabled,

                  pressed && !submitting && styles.pressed,

                ]}

              >

                {submitting ? (

                  <ActivityIndicator color={actionTextColor} />

                ) : (

                  <>

                    <Text

                      style={[

                        styles.submitButtonText,

                        { color: actionTextColor },

                      ]}

                    >

                      Continue to verification

                    </Text>

                    <Ionicons

                      name="arrow-forward"

                      size={19}

                      color={actionTextColor}

                    />

                  </>

                )}

              </Pressable>

              <View style={styles.signInRow}>

                <Text

                  style={[

                    styles.signInPrompt,

                    { color: colors.textMuted },

                  ]}

                >

                  Already have a Runner account?

                </Text>

                <Pressable

                  accessibilityRole="button"

                  accessibilityLabel="Sign in"

                  disabled={submitting}

                  hitSlop={8}

                  onPress={() =>

                    router.replace("/(auth)/login")

                  }

                >

                  <Text

                    style={[

                      styles.signInLink,

                      { color: actionColor },

                    ]}

                  >

                    Sign in

                  </Text>

                </Pressable>

              </View>

              <Text

                style={[

                  styles.footerNote,

                  { color: colors.textMuted },

                ]}

              >

                After email verification, choose your Runner service:

                Pick Up & Deliver or Shop & Deliver. Then complete

                your transport details and required documents.

              </Text>

            </View>

          </Animated.View>

        </ScrollView>

      </KeyboardAvoidingView>

    </SafeAreaView>

  );

}

const styles = StyleSheet.create({

  safeArea: {

    flex: 1,

  },

  keyboardContainer: {

    flex: 1,

  },

  scrollContent: {

    flexGrow: 1,

    paddingBottom: 32,

  },

  content: {

    flexGrow: 1,

    gap: 25,

    width: "100%",

    maxWidth: 560,

    alignSelf: "center",

  },

  header: {

    minHeight: 46,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

  },

  backButton: {

    width: 44,

    height: 44,

    borderRadius: 14,

    borderWidth: 1,

    alignItems: "center",

    justifyContent: "center",

  },

  brand: {

    alignItems: "center",

    gap: 3,

  },

  brandName: {

    fontSize: 20,

    fontWeight: "900",

    fontStyle: "italic",

    letterSpacing: -0.6,

  },

  brandTagline: {

    fontSize: 7,

    fontWeight: "900",

    letterSpacing: 2,

  },

  headerSpacer: {

    width: 44,

  },

  intro: {

    gap: 11,

  },

  iconWrap: {

    width: 54,

    height: 54,

    borderRadius: 17,

    alignItems: "center",

    justifyContent: "center",

    marginBottom: 3,

  },

  eyebrow: {

    fontSize: 10,

    fontWeight: "900",

    letterSpacing: 1.5,

  },

  title: {

    fontWeight: "900",

    letterSpacing: -0.8,

  },

  subtitle: {

    fontSize: 13.5,

    lineHeight: 21,

    maxWidth: 360,

  },

  form: {

    gap: 21,

  },

  fieldGroup: {

    gap: 8,

  },

  label: {

    fontSize: 12.5,

    fontWeight: "800",

  },

  inputContainer: {

    minHeight: 58,

    borderRadius: 15,

    borderWidth: 1,

    flexDirection: "row",

    alignItems: "center",

    paddingHorizontal: 15,

    gap: 12,

  },

  input: {

    flex: 1,

    minHeight: 56,

    paddingVertical: 11,

    fontSize: 14,

  },

  fieldHint: {

    fontSize: 11,

    lineHeight: 17,

  },

  errorContainer: {

    borderRadius: 13,

    padding: 13,

    flexDirection: "row",

    alignItems: "flex-start",

    gap: 9,

  },

  errorText: {

    flex: 1,

    fontSize: 12,

    lineHeight: 18,

  },

  footer: {

    gap: 17,

    paddingTop: 2,

  },

  submitButton: {

    minHeight: 58,

    borderRadius: 16,

    alignItems: "center",

    justifyContent: "center",

    flexDirection: "row",

    gap: 10,

    paddingHorizontal: 16,

  },

  submitButtonText: {

    fontSize: 14,

    fontWeight: "900",

  },

  signInRow: {

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    flexWrap: "wrap",

    gap: 5,

  },

  signInPrompt: {

    fontSize: 12,

  },

  signInLink: {

    fontSize: 12,

    fontWeight: "900",

  },

  footerNote: {

    fontSize: 11,

    lineHeight: 17,

    textAlign: "center",

    paddingHorizontal: 8,

  },

  disabled: {

    opacity: 0.55,

  },

  pressed: {

    opacity: 0.86,

    transform: [{ scale: 0.99 }],

  },

});