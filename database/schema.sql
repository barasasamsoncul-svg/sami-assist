-- SaMi Errands PostgreSQL schema.
-- Customer-facing service fees and seller/goods costs are separate by design.
-- Safe for initial install and repeatable additive upgrades.

CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 full_name text NOT NULL CHECK(length(trim(full_name)) BETWEEN 2 AND 120),
 email text NOT NULL, phone text, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('customer','provider','admin')),
 is_active boolean NOT NULL DEFAULT true, email_verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users(lower(email));

CREATE TABLE IF NOT EXISTS provider_profiles (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 provider_type text NOT NULL DEFAULT 'individual' CHECK(provider_type IN ('individual','business','team')),
 business_name text, service_categories text[] NOT NULL DEFAULT '{}',
 service_area text, bio text,
 approval_status text NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending','approved','rejected','suspended')),
 available boolean NOT NULL DEFAULT true, rejection_reason text, verified_at timestamptz,
 completed_jobs integer NOT NULL DEFAULT 0 CHECK(completed_jobs>=0),
 rating_average numeric(3,2) NOT NULL DEFAULT 0 CHECK(rating_average BETWEEN 0 AND 5),
 rating_count integer NOT NULL DEFAULT 0 CHECK(rating_count>=0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_profiles_review_idx ON provider_profiles(approval_status,available,created_at DESC);

CREATE TABLE IF NOT EXISTS service_pricing (
 category text PRIMARY KEY CHECK(category IN ('shopping','clothing_retail','pickup_delivery','documents_admin','personal_errand','queue_appointments','business_support','local_assistance','other')),
 service_name text NOT NULL,
 base_fee numeric(12,2) NOT NULL CHECK(base_fee>=0),
 commission_rate numeric(5,2) NOT NULL DEFAULT 15 CHECK(commission_rate BETWEEN 0 AND 100),
 low_priority_multiplier numeric(5,2) NOT NULL DEFAULT 1 CHECK(low_priority_multiplier>0 AND low_priority_multiplier<=5),
 standard_priority_multiplier numeric(5,2) NOT NULL DEFAULT 1 CHECK(standard_priority_multiplier>0 AND standard_priority_multiplier<=5),
 high_priority_multiplier numeric(5,2) NOT NULL DEFAULT 1.25 CHECK(high_priority_multiplier>0 AND high_priority_multiplier<=5),
 urgent_priority_multiplier numeric(5,2) NOT NULL DEFAULT 1.5 CHECK(urgent_priority_multiplier>0 AND urgent_priority_multiplier<=5),
 enabled boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO service_pricing(category,service_name,base_fee,commission_rate,low_priority_multiplier,standard_priority_multiplier,high_priority_multiplier,urgent_priority_multiplier,enabled) VALUES
 ('shopping','Shopping & essentials',200,15,1,1,1.25,1.5,true),
 ('clothing_retail','Clothing & retail errands',200,15,1,1,1.25,1.5,true),
 ('pickup_delivery','Pickups & drop-offs',150,15,1,1,1.25,1.5,true),
 ('documents_admin','Documents & administrative errands',180,15,1,1,1.25,1.5,true),
 ('personal_errand','Personal errands',200,15,1,1,1.25,1.5,true),
 ('queue_appointments','Queues, bookings & appointments',220,15,1,1,1.25,1.5,true),
 ('business_support','Business support',300,15,1,1,1.25,1.5,true),
 ('local_assistance','Local assistance',250,15,1,1,1.25,1.5,true),
 ('other','Other legitimate errands',250,15,1,1,1.25,1.5,true)
ON CONFLICT(category) DO NOTHING;

CREATE TABLE IF NOT EXISTS errands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 public_code text NOT NULL UNIQUE,
 customer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 provider_id uuid REFERENCES users(id) ON DELETE SET NULL,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 160),
 category text NOT NULL CHECK(category IN ('shopping','clothing_retail','pickup_delivery','documents_admin','personal_errand','queue_appointments','business_support','local_assistance','other')),
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 5 AND 5000),
 pickup_location text, destination_location text, service_area text NOT NULL, due_at timestamptz,
 budget_amount numeric(12,2) CHECK(budget_amount IS NULL OR budget_amount>=0),
 item_budget_amount numeric(12,2) CHECK(item_budget_amount IS NULL OR item_budget_amount>=0),
 seller_actual_amount numeric(12,2) CHECK(seller_actual_amount IS NULL OR seller_actual_amount>=0),
 service_fee_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(service_fee_amount>=0),
 commission_rate numeric(5,2) NOT NULL DEFAULT 15 CHECK(commission_rate BETWEEN 0 AND 100),
 commission_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(commission_amount>=0),
 provider_earning_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(provider_earning_amount>=0),
 currency char(3) NOT NULL DEFAULT 'KES',
 priority text NOT NULL DEFAULT 'standard' CHECK(priority IN ('low','standard','high','urgent')),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','assigned','accepted','in_progress','completion_submitted','completed','disputed','cancelled','declined')),
 service_payment_method text NOT NULL DEFAULT 'cash' CHECK(service_payment_method IN ('cash','in_app')),
 payment_status text NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','pending','paid','refunded')),
 payment_method text, payment_reference text, app_payment_reference text,
 app_payment_checkout_status text NOT NULL DEFAULT 'not_started' CHECK(app_payment_checkout_status IN ('not_started','initiated','succeeded','failed')),
 seller_payment_status text NOT NULL DEFAULT 'not_applicable' CHECK(seller_payment_status IN ('not_applicable','due','paid')),
 seller_payment_method text, seller_payment_reference text,
 completion_notes text, cancellation_reason text,
 estimated_duration_minutes integer CHECK(estimated_duration_minutes IS NULL OR estimated_duration_minutes>0),
 accepted_at timestamptz, started_at timestamptz, completed_at timestamptz,
 customer_confirmed_at timestamptz, disputed_at timestamptz, paid_at timestamptz,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(provider_id IS NULL OR provider_id<>customer_id)
);
CREATE INDEX IF NOT EXISTS errands_customer_created_idx ON errands(customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS errands_provider_status_idx ON errands(provider_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS errands_dispatch_idx ON errands(status,service_area,created_at ASC);
CREATE INDEX IF NOT EXISTS errands_dashboard_created_idx ON errands(created_at DESC,status);

CREATE TABLE IF NOT EXISTS errand_events (
 id bigserial PRIMARY KEY, errand_id uuid NOT NULL REFERENCES errands(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL, event_type text NOT NULL,
 from_status text,to_status text,note text,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS errand_events_timeline_idx ON errand_events(errand_id,created_at ASC);

CREATE TABLE IF NOT EXISTS errand_messages (
 id bigserial PRIMARY KEY, errand_id uuid NOT NULL REFERENCES errands(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 message text NOT NULL CHECK(length(trim(message)) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS errand_messages_thread_idx ON errand_messages(errand_id,created_at ASC);

CREATE TABLE IF NOT EXISTS payment_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 errand_id uuid NOT NULL REFERENCES errands(id) ON DELETE RESTRICT,
 recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 record_type text NOT NULL CHECK(record_type IN ('service_payment','provider_payout','provider_commission','seller_payment','refund','adjustment')),
 amount numeric(12,2) NOT NULL CHECK(amount>=0), currency char(3) NOT NULL DEFAULT 'KES',
 method text NOT NULL, reference text,
 status text NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded','pending','reconciled','reversed')),
 notes text,idempotency_key text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_records_idempotency_unique ON payment_records(errand_id,idempotency_key);
CREATE INDEX IF NOT EXISTS payment_records_errand_idx ON payment_records(errand_id,created_at DESC);
CREATE INDEX IF NOT EXISTS payment_records_reconcile_idx ON payment_records(status,created_at DESC);

CREATE TABLE IF NOT EXISTS user_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_sessions_user_expiry_idx ON user_sessions(user_id,expires_at);

CREATE TABLE IF NOT EXISTS notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL DEFAULT 'update',title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 1000),href text,
 entity_type text,entity_id uuid,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON notifications(user_id,read_at,created_at DESC);

CREATE TABLE IF NOT EXISTS errand_ratings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),errand_id uuid NOT NULL REFERENCES errands(id) ON DELETE RESTRICT,
 reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 reviewee_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 score integer NOT NULL CHECK(score BETWEEN 1 AND 5),comment text CHECK(comment IS NULL OR length(comment)<=1200),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(errand_id,reviewer_id),CHECK(reviewer_id<>reviewee_id)
);
CREATE INDEX IF NOT EXISTS errand_ratings_reviewee_idx ON errand_ratings(reviewee_id,created_at DESC);

CREATE TABLE IF NOT EXISTS auth_attempts (
 id bigserial PRIMARY KEY,identifier_hash text NOT NULL,
 attempt_type text NOT NULL CHECK(attempt_type IN ('login','register','bootstrap')),
 succeeded boolean NOT NULL DEFAULT false,attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_rate_limit_idx ON auth_attempts(identifier_hash,attempt_type,attempted_at DESC);

CREATE TABLE IF NOT EXISTS pricing_audit_events (
 id bigserial PRIMARY KEY,actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 category text NOT NULL,previous_values jsonb NOT NULL,new_values jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pricing_audit_category_idx ON pricing_audit_events(category,created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES
 ('2026-10-25-sami-errands-initial'),
 ('2026-10-25-sami-errands-operations-upgrade'),
 ('2026-10-25-sami-errands-no-quotes-service-fees'),
 ('2026-10-25-sami-errands-broad-categories'),
 ('2026-10-25-sami-errands-service-payment-model'),
 ('2026-10-25-sami-errands-pricing-audit')
ON CONFLICT DO NOTHING;
