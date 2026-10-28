-- SaMi Errands: authenticated, errand-scoped voice-call signalling.
-- Apply with the database-owner role before enabling in-app calling.
CREATE TABLE IF NOT EXISTS public.errand_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  errand_id uuid NOT NULL REFERENCES public.errands(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing','active','rejected','ended','missed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (caller_id <> callee_id)
);

CREATE INDEX IF NOT EXISTS errand_calls_caller_recent_idx
  ON public.errand_calls(caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS errand_calls_callee_recent_idx
  ON public.errand_calls(callee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS errand_calls_errand_recent_idx
  ON public.errand_calls(errand_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS errand_calls_one_live_per_errand_idx
  ON public.errand_calls(errand_id)
  WHERE status IN ('ringing','active');

CREATE TABLE IF NOT EXISTS public.errand_call_signals (
  id bigserial PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES public.errand_calls(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN ('offer','answer','ice_candidate')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(payload::text) <= 12000)
);
CREATE INDEX IF NOT EXISTS errand_call_signals_thread_idx
  ON public.errand_call_signals(call_id, id ASC);
