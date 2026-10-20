export type SalesLeadScoreBand = 'high' | 'medium' | 'low';

export type SalesLeadScoreFactor = {
  key: string;
  label: string;
  points: number;
};

export type SalesLeadScore = {
  score: number;
  band: SalesLeadScoreBand;
  factors: SalesLeadScoreFactor[];
};

type SalesLeadScoreInput = {
  company_name?: unknown;
  contact_name?: unknown;
  email?: unknown;
  phone?: unknown;
  source?: unknown;
  notes?: unknown;
  completed_engagement_count?: unknown;
  last_completed_engagement_at?: Date | string | null;
};

const HIGH_INTENT_SOURCE_PATTERN =
  /referr|website|web form|inbound|demo|pricing|quote request|contact form|organic/;
const MEDIUM_INTENT_SOURCE_PATTERN =
  /campaign|event|social|advertis|partner|email marketing|linkedin|facebook/;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const HIGH_BAND_THRESHOLD = 75;
const MEDIUM_BAND_THRESHOLD = 45;

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sourceBand(source: string): 'high' | 'medium' | 'recorded' | null {
  const normalized = source.trim().toLowerCase();
  if (!normalized) return null;
  if (HIGH_INTENT_SOURCE_PATTERN.test(normalized)) return 'high';
  if (MEDIUM_INTENT_SOURCE_PATTERN.test(normalized)) return 'medium';
  return 'recorded';
}

/**
 * Explainable 0–100 lead score using contact completeness, source intent,
 * and completed customer conversations. The model intentionally avoids
 * treating a lead's current status as evidence of its own quality.
 *
 * Pass `now` for deterministic tests; production callers omit it.
 */
export function scoreSalesLead(
  lead: SalesLeadScoreInput,
  now: Date = new Date(),
): SalesLeadScore {
  const factors: SalesLeadScoreFactor[] = [];
  const add = (key: string, label: string, points: number) => {
    if (points > 0) factors.push({ key, label, points });
  };

  if (hasText(lead.company_name)) add('company', 'Company identified', 15);
  if (hasText(lead.contact_name)) add('contact', 'Contact identified', 10);

  if (hasText(lead.email) && lead.email.includes('@')) {
    add('email', 'Email available', 15);
  }
  if (hasText(lead.phone)) add('phone', 'Phone available', 10);
  if (hasText(lead.notes)) add('notes', 'Qualification notes captured', 5);

  if (hasText(lead.source)) {
    const band = sourceBand(lead.source);
    if (band === 'high') {
      add('source_high_intent', 'High-intent source identified', 20);
    } else if (band === 'medium') {
      add('source_medium_intent', 'Marketing source identified', 10);
    } else if (band === 'recorded') {
      add('source', 'Lead source recorded', 5);
    }
  }

  const completedEngagements = Number(lead.completed_engagement_count);
  const engagementPoints = Number.isFinite(completedEngagements)
    ? Math.min(15, Math.max(0, Math.floor(completedEngagements)) * 5)
    : 0;
  add('completed_engagement', 'Completed call, email or meeting', engagementPoints);

  if (lead.last_completed_engagement_at) {
    const lastEngagement =
      lead.last_completed_engagement_at instanceof Date
        ? lead.last_completed_engagement_at
        : new Date(String(lead.last_completed_engagement_at));
    const elapsed = now.getTime() - lastEngagement.getTime();
    if (
      Number.isFinite(lastEngagement.getTime()) &&
      elapsed >= 0 &&
      elapsed <= THIRTY_DAYS_MS
    ) {
      add('recent_engagement', 'Customer interaction in the last 30 days', 10);
    }
  }

  const score = Math.min(
    100,
    factors.reduce((total, factor) => total + factor.points, 0),
  );
  return {
    score,
    band:
      score >= HIGH_BAND_THRESHOLD
        ? 'high'
        : score >= MEDIUM_BAND_THRESHOLD
          ? 'medium'
          : 'low',
    factors,
  };
}