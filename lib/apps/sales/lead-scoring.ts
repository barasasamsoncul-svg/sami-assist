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

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Explainable 0–100 lead score using contact completeness, source intent,
 * and completed customer conversations. The model intentionally avoids
 * treating a lead's current status as evidence of its own quality.
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
  if (hasText(lead.email) && String(lead.email).includes('@')) {
    add('email', 'Email available', 15);
  }
  if (hasText(lead.phone)) add('phone', 'Phone available', 10);
  if (hasText(lead.notes)) add('notes', 'Qualification notes captured', 5);

  const source = hasText(lead.source) ? String(lead.source).trim() : '';
  const normalizedSource = source.toLowerCase();
  if (normalizedSource && /referr|website|web form|inbound|demo|pricing|quote request|contact form|organic/.test(normalizedSource)) {
    add('source_high_intent', 'High-intent source identified', 20);
  } else if (normalizedSource && /campaign|event|social|advertis|partner|email marketing|linkedin|facebook/.test(normalizedSource)) {
    add('source_medium_intent', 'Marketing source identified', 10);
  } else if (normalizedSource) {
    add('source', 'Lead source recorded', 5);
  }

  const completedEngagements = Number(lead.completed_engagement_count);
  const engagementPoints = Number.isFinite(completedEngagements)
    ? Math.min(15, Math.max(0, Math.floor(completedEngagements)) * 5)
    : 0;
  add('completed_engagement', 'Completed call, email or meeting', engagementPoints);

  if (lead.last_completed_engagement_at) {
    const lastEngagement = new Date(lead.last_completed_engagement_at);
    const elapsed = now.getTime() - lastEngagement.getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (Number.isFinite(lastEngagement.getTime()) && elapsed >= 0 && elapsed <= thirtyDaysMs) {
      add('recent_engagement', 'Customer interaction in the last 30 days', 10);
    }
  }

  const score = Math.min(100, factors.reduce((total, factor) => total + factor.points, 0));
  return {
    score,
    band: score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low',
    factors,
  };
}
