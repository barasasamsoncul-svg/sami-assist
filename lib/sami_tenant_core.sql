CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ai_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_type VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    source_type VARCHAR(100),
    source_id UUID,
    importance INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_memory_importance_check CHECK (importance BETWEEN 1 AND 10)
);

CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT messages_conversation_id_fkey
        FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.ai_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID,
    user_id UUID,
    action_name VARCHAR(150) NOT NULL,
    source_app VARCHAR(100),
    source_record_id UUID,
    target_app VARCHAR(100),
    target_record_id UUID,
    status VARCHAR(50) NOT NULL DEFAULT 'completed',
    input JSONB,
    output JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_memory_source ON public.ai_memory(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_conversation_id ON public.ai_actions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_source ON public.ai_actions(source_app, source_record_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_target ON public.ai_actions(target_app, target_record_id);
