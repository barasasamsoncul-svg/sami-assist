'use client';

import {
  Archive,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Gauge,
  Loader2,
  Menu,
  Pencil,
  Paperclip,
  FileText,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  X,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import SamiAiMarkdown from '@/app/components/ai/SamiAiMarkdown';
import SamiAiSidebar from '@/app/components/ai/SamiAiSidebar';
import SamiAiUsagePanel from '@/app/components/ai/SamiAiUsagePanel';

import type {
  SamiAiWorkspaceStatus,
} from '@/app/components/ai/SamiAiStatus';

type Conversation = {
  id: string;
  title: string;
  status: string;
  pinned: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
};

type AiAttachment = {
  id: string;
  name: string;
  mimeType: string;
  extension: string | null;
  sizeBytes: number;
  readableAsText?: boolean;
};

type Message = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  status: string;
  correlationId: string | null;
  feedback:
    | 'up'
    | 'down'
    | null;
  attachments: AiAttachment[];
  createdAt: string | null;
};

type PendingAction = {
  id: string;
  name: string;
  toolKey: string | null;
  riskLevel: string;
  expiresAt: string | null;
};

type AiStreamEvent = {
  type?:
    | 'delta'
    | 'reset'
    | 'done'
    | 'error';
  delta?: string;
  error?: string;
  result?: {
    conversation?: {
      id?: unknown;
    };
    userMessage?: Message;
    assistantMessage?: Message;
    pendingActions?: PendingAction[];
  };
};

async function readJson(
  response: Response,
) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function timeLabel(
  value: string | null,
) {
  if (!value) {
    return '';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '';
  }

  return date.toLocaleString(
    undefined,
    {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  );
}

function formatBytes(
  value: number,
) {
  const bytes =
    Math.max(
      0,
      Number(value) ||
      0,
    );

  if (
    bytes <
      1024
  ) {
    return `${bytes} B`;
  }

  const units = [
    'KB',
    'MB',
    'GB',
  ];

  let current =
    bytes /
    1024;

  let index =
    0;

  while (
    current >=
      1024 &&
    index <
      units.length -
        1
  ) {
    current /=
      1024;
    index +=
      1;
  }

  return `${current.toFixed(
    current >=
      10
      ? 1
      : 2,
  )} ${units[index]}`;
}

export default function WorkspaceAiClient({
  entitled,
  moduleContext = null,
}: {
  entitled: boolean;
  moduleContext?:
    | 'invoicing'
    | null;
}) {
  const [
    status,
    setStatus,
  ] =
    useState<SamiAiWorkspaceStatus | null>(
      null,
    );

  const [
    conversations,
    setConversations,
  ] =
    useState<Conversation[]>(
      [],
    );

  const [
    selectedConversationId,
    setSelectedConversationId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    messages,
    setMessages,
  ] =
    useState<Message[]>(
      [],
    );

  const [
    pendingActions,
    setPendingActions,
  ] =
    useState<PendingAction[]>(
      [],
    );

  const [
    draft,
    setDraft,
  ] =
    useState('');

  const [
    pendingAttachments,
    setPendingAttachments,
  ] =
    useState<AiAttachment[]>(
      [],
    );

  const [
    uploadingAttachments,
    setUploadingAttachments,
  ] =
    useState(
      false,
    );

  const [
    editingMessageId,
    setEditingMessageId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    copiedMessageId,
    setCopiedMessageId,
  ] =
    useState<string | null>(
      null,
    );

  const abortControllerRef =
    useRef<AbortController | null>(
      null,
    );

  const composerRef =
    useRef<HTMLTextAreaElement | null>(
      null,
    );

  const fileInputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const messagesEndRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    sending,
    setSending,
  ] =
    useState(false);

  const [
    receiving,
    setReceiving,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    confirmingActionId,
    setConfirmingActionId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    sidebarMobileOpen,
    setSidebarMobileOpen,
  ] =
    useState(false);

  const [
    sidebarCollapsed,
    setSidebarCollapsed,
  ] =
    useState(false);

  const [
    usagePanelOpen,
    setUsagePanelOpen,
  ] =
    useState(false);

  const emptyState =
    useMemo(
      () =>
        moduleContext ===
          'invoicing'
          ? {
              title:
                'Ask SaMi about Invoicing',
              description:
                'Ask about receivables, overdue invoices, customer balances, recurring billing, collections or fiscal readiness. SaMi only uses Invoicing data and actions allowed by your current permissions.',
              suggestions: [
                'Which invoices need collection attention?',
                'Summarize overdue receivables.',
                'Explain an invoice or customer balance.',
                'Check eTIMS and international e-invoicing readiness.',
              ],
            }
          : {
              title:
                'How can I help?',
              description:
                'Use SaMi AI like a normal general assistant for questions, writing, reasoning, planning and coding. When you ask about your business, SaMi can securely use only the company data and actions your permissions allow.',
              suggestions: [
                'Help me think through a business decision.',
                'Draft a professional customer message.',
                'Explain something I am trying to understand.',
                'Analyze my business data when I ask for it.',
              ],
            },
      [
        moduleContext,
      ],
    );


  const selectedConversation =
    useMemo(
      () =>
        conversations.find(
          item =>
            item.id ===
            selectedConversationId,
        ) || null,
      [
        conversations,
        selectedConversationId,
      ],
    );

  const lastMessageContentLength =
    messages.length >
    0
      ? messages[
          messages.length -
            1
        ].content.length
      : 0;

  useEffect(
    () => {
      const composer =
        composerRef.current;

      if (!composer) {
        return;
      }

      composer.style.height =
        '0px';

      composer.style.height =
        Math.min(
          composer.scrollHeight,
          192,
        ) + 'px';
    },
    [
      draft,
    ],
  );

  useEffect(
    () => {
      messagesEndRef
        .current
        ?.scrollIntoView({
          block: 'end',
          behavior:
            receiving
              ? 'auto'
              : sending
                ? 'smooth'
                : 'auto',
        });
    },
    [
      messages.length,
      lastMessageContentLength,
      pendingActions.length,
      receiving,
      sending,
    ],
  );

  const lastAssistantMessageId =
    useMemo(
      () =>
        [...messages]
          .reverse()
          .find(
            message =>
              message.role ===
              'assistant',
          )?.id ||
        null,
      [
        messages,
      ],
    );

  const loadStatus =
    useCallback(
      async () => {
        const response =
          await fetch(
            '/api/workspace/ai/status',
            {
              credentials:
                'same-origin',
              cache:
                'no-store',
            },
          );

        const data =
          await readJson(
            response,
          );

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              'SaMi AI status could not be loaded.',
          );
        }

        setStatus(
          data.status,
        );
      },
      [],
    );

  const loadConversations =
    useCallback(
      async () => {
        const response =
          await fetch(
            '/api/workspace/ai/conversations',
            {
              credentials:
                'same-origin',
              cache:
                'no-store',
            },
          );

        const data =
          await readJson(
            response,
          );

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              'SaMi AI conversations could not be loaded.',
          );
        }

        setConversations(
          Array.isArray(
            data.conversations,
          )
            ? data.conversations
            : [],
        );
      },
      [],
    );

  const loadConversation =
    useCallback(
      async (
        conversationId:
          string,
      ) => {
        const response =
          await fetch(
            '/api/workspace/ai/conversations/' +
              encodeURIComponent(
                conversationId,
              ),
            {
              credentials:
                'same-origin',
              cache:
                'no-store',
            },
          );

        const data =
          await readJson(
            response,
          );

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              'SaMi AI conversation could not be loaded.',
          );
        }

        setMessages(
          Array.isArray(
            data.messages,
          )
            ? data.messages
            : [],
        );

        setPendingActions(
          Array.isArray(
            data.pendingActions,
          )
            ? data.pendingActions
            : [],
        );
      },
      [],
    );

  useEffect(
    () => {
      if (!entitled) {
        setLoading(false);
        return;
      }

      let cancelled =
        false;

      void (async () => {
        setLoading(true);
        setError(null);

        try {
          await Promise.all([
            loadStatus(),
            loadConversations(),
          ]);
        } catch (
          candidate
        ) {
          if (!cancelled) {
            setError(
              candidate instanceof Error
                ? candidate.message
                : 'SaMi AI could not be loaded.',
            );
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      })();

      return () => {
        cancelled =
          true;
      };
    },
    [
      entitled,
      loadConversations,
      loadStatus,
    ],
  );

  useEffect(
    () => {
      if (
        !selectedConversationId
      ) {
        setMessages([]);
        setPendingActions([]);
        return;
      }

      void loadConversation(
        selectedConversationId,
      ).catch(
        candidate => {
          setError(
            candidate instanceof Error
              ? candidate.message
              : 'Conversation could not be loaded.',
          );
        },
      );
    },
    [
      loadConversation,
      selectedConversationId,
    ],
  );

  function newConversation() {
    setSelectedConversationId(
      null,
    );
    setMessages([]);
    setPendingActions([]);
    setDraft('');
    setPendingAttachments(
      [],
    );
    setEditingMessageId(
      null,
    );
    setError(null);
    setSidebarMobileOpen(false);
  }

  async function selectConversation(
    conversationId:
      string,
  ) {
    setSelectedConversationId(
      conversationId,
    );
    setEditingMessageId(
      null,
    );
    setDraft('');
    setPendingAttachments(
      [],
    );
    setSidebarMobileOpen(false);
  }

  async function runChatRequest(
    input: {
      mode:
        | 'send'
        | 'edit'
        | 'regenerate';
      message?:
        string;
      targetMessageId?:
        string;
      attachmentIds?:
        string[];
      restoreDraft?:
        string;
    },
  ) {
    if (
      sending ||
      !status?.configured
    ) {
      return;
    }

    const controller =
      new AbortController();

    abortControllerRef.current =
      controller;

    const streamMessageId =
      'streaming-' +
      Date.now();

    let streamVisible =
      false;

    const removeStreamMessage =
      () => {
        if (
          !streamVisible
        ) {
          return;
        }

        setMessages(
          current =>
            current.filter(
              message =>
                message.id !==
                streamMessageId,
            ),
        );

        streamVisible =
          false;

        setReceiving(
          false,
        );
      };

    const appendStreamDelta =
      (
        delta: string,
      ) => {
        if (
          !delta
        ) {
          return;
        }

        if (
          !streamVisible
        ) {
          streamVisible =
            true;

          setReceiving(
            true,
          );

          setMessages(
            current => [
              ...current,
              {
                id:
                  streamMessageId,
                conversationId:
                  selectedConversationId ||
                  'pending',
                role:
                  'assistant',
                content:
                  delta,
                status:
                  'streaming',
                correlationId:
                  null,
                feedback:
                  null,
                attachments:
                  [],
                createdAt:
                  new Date()
                    .toISOString(),
              },
            ],
          );

          return;
        }

        setMessages(
          current =>
            current.map(
              message =>
                message.id ===
                  streamMessageId
                  ? {
                      ...message,
                      content:
                        message
                          .content +
                        delta,
                    }
                  : message,
            ),
        );
      };

    setSending(true);
    setReceiving(false);
    setError(null);

    try {
      const response =
        await fetch(
          '/api/workspace/ai/chat',
          {
            method: 'POST',
            credentials:
              'same-origin',
            cache:
              'no-store',
            signal:
              controller.signal,
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/x-ndjson',
            },
            body:
              JSON.stringify({
                conversationId:
                  selectedConversationId,
                message:
                  input.message,
                mode:
                  input.mode,
                targetMessageId:
                  input.targetMessageId,
                attachmentIds:
                  input.attachmentIds,
                moduleContext,
              }),
          },
        );

      if (
        !response.ok
      ) {
        const data =
          await readJson(
            response,
          );

        throw new Error(
          data.error ||
            'SaMi AI could not complete that request.',
        );
      }

      if (
        !response.body
      ) {
        throw new Error(
          'SaMi AI could not start a live response.',
        );
      }

      const reader =
        response.body
          .getReader();

      const decoder =
        new TextDecoder();

      let buffer =
        '';

      const streamState: {
        completedResult:
          AiStreamEvent[
            'result'
          ];
      } = {
        completedResult:
          undefined,
      };

      const processLine =
        (
          line: string,
        ) => {
          if (
            !line.trim()
          ) {
            return;
          }

          const event =
            JSON.parse(
              line,
            ) as
              AiStreamEvent;

          if (
            event.type ===
              'delta' &&
            typeof event
              .delta ===
              'string'
          ) {
            appendStreamDelta(
              event.delta,
            );

            return;
          }

          if (
            event.type ===
            'reset'
          ) {
            removeStreamMessage();
            return;
          }

          if (
            event.type ===
            'error'
          ) {
            throw new Error(
              event.error ||
                'SaMi AI could not complete that request.',
            );
          }

          if (
            event.type ===
            'done'
          ) {
            streamState
              .completedResult =
              event.result;
          }
        };

      while (
        true
      ) {
        const {
          done,
          value,
        } =
          await reader
            .read();

        if (
          done
        ) {
          break;
        }

        buffer +=
          decoder.decode(
            value,
            {
              stream:
                true,
            },
          );

        let newline =
          buffer.indexOf(
            '\n',
          );

        while (
          newline >=
          0
        ) {
          const line =
            buffer.slice(
              0,
              newline,
            );

          buffer =
            buffer.slice(
              newline +
                1,
            );

          processLine(
            line,
          );

          newline =
            buffer.indexOf(
              '\n',
            );
        }
      }

      buffer +=
        decoder.decode();

      if (
        buffer.trim()
      ) {
        processLine(
          buffer,
        );
      }

      const completedResult =
        streamState
          .completedResult;

      if (
        !completedResult
      ) {
        throw new Error(
          'SaMi AI response ended before it could be saved.',
        );
      }

      const conversationId =
        String(
          completedResult
            .conversation
            ?.id ||
          selectedConversationId ||
          '',
        );

      if (
        conversationId
      ) {
        setSelectedConversationId(
          conversationId,
        );
      }

      const persistedUser =
        completedResult
          .userMessage;

      const persistedAssistant =
        completedResult
          .assistantMessage;

      setMessages(
        current => {
          let replacedPendingUser =
            false;

          let replacedStream =
            false;

          const next =
            current.map(
              message => {
                if (
                  persistedUser &&
                  !replacedPendingUser &&
                  message.role ===
                    'user' &&
                  message.status ===
                    'sending'
                ) {
                  replacedPendingUser =
                    true;

                  return persistedUser;
                }

                if (
                  persistedAssistant &&
                  message.id ===
                    streamMessageId
                ) {
                  replacedStream =
                    true;

                  return persistedAssistant;
                }

                return message;
              },
            );

          if (
            persistedAssistant &&
            !replacedStream
          ) {
            next.push(
              persistedAssistant,
            );
          }

          return next;
        },
      );

      streamVisible =
        false;

      setReceiving(
        false,
      );

      setPendingActions(
        Array.isArray(
          completedResult
            .pendingActions,
        )
          ? completedResult
              .pendingActions
          : [],
      );

      setEditingMessageId(
        null,
      );

      void (async () => {
        try {
          await Promise.all([
            loadConversations(),
            loadStatus(),
          ]);

          if (
            conversationId &&
            input.mode !==
              'send'
          ) {
            await loadConversation(
              conversationId,
            );
          }
        } catch (
          refreshError
        ) {
          setError(
            refreshError instanceof
              Error
              ? 'Your message was saved, but this chat could not refresh: ' +
                refreshError.message
              : 'Your message was saved, but this chat could not refresh. Reopen the conversation to load the saved response.',
          );
        }
      })();

      return true;
    } catch (
      candidate
    ) {
      removeStreamMessage();

      const aborted =
        controller.signal
          .aborted ||
        (
          candidate instanceof
            DOMException &&
          candidate.name ===
            'AbortError'
        );

      if (aborted) {
        setError(null);

        if (
          input.restoreDraft
        ) {
          setDraft(
            input.restoreDraft,
          );
        }

        return false;
      }

      if (
        input.restoreDraft
      ) {
        setDraft(
          input.restoreDraft,
        );
      }

      setError(
        candidate instanceof Error
          ? candidate.message
          : 'SaMi AI could not complete that request.',
      );

      return false;
    } finally {
      setReceiving(false);

      if (
        abortControllerRef
          .current ===
        controller
      ) {
        abortControllerRef.current =
          null;
      }

      setSending(false);
    }
  }

  async function uploadSelectedAttachments(
    files:
      FileList | null,
  ) {
    if (
      !files ||
      files.length ===
        0 ||
      uploadingAttachments ||
      !status?.attachments
        ?.canUpload
    ) {
      return;
    }

    const maxFiles =
      status.attachments
        .maxFilesPerMessage ||
      5;

    const available =
      Math.max(
        0,
        maxFiles -
        pendingAttachments
          .length,
      );

    const selected =
      Array.from(
        files,
      ).slice(
        0,
        available,
      );

    if (
      selected.length ===
        0
    ) {
      setError(
        `You can attach up to ${maxFiles} files to one message.`,
      );
      return;
    }

    setUploadingAttachments(
      true,
    );
    setError(
      null,
    );

    try {
      for (
        const file
        of selected
      ) {
        const intentResponse =
          await fetch(
            '/api/workspace/files/upload-intent',
            {
              method:
                'POST',
              credentials:
                'same-origin',
              cache:
                'no-store',
              headers: {
                'Content-Type':
                  'application/json',
                Accept:
                  'application/json',
              },
              body:
                JSON.stringify({
                  fileName:
                    file.name,
                  mimeType:
                    file.type ||
                    'application/octet-stream',
                  sizeBytes:
                    file.size,
                  purpose:
                    'ai_attachment',
                }),
            },
          );

        const intent =
          await readJson(
            intentResponse,
          );

        if (
          !intentResponse.ok ||
          !intent.success ||
          !intent.file?.id ||
          !intent.upload?.url
        ) {
          throw new Error(
            intent.error ||
            'SaMi could not prepare this attachment.',
          );
        }

        const uploadResponse =
          await fetch(
            intent.upload.url,
            {
              method:
                intent.upload
                  .method ||
                'PUT',
              headers:
                intent.upload
                  .headers ||
                {
                  'Content-Type':
                    file.type ||
                    'application/octet-stream',
                },
              body:
                file,
            },
          );

        if (
          !uploadResponse.ok
        ) {
          throw new Error(
            `Upload failed for ${file.name}.`,
          );
        }

        const completeResponse =
          await fetch(
            '/api/workspace/files/' +
              encodeURIComponent(
                String(
                  intent.file.id,
                ),
              ) +
              '/complete',
            {
              method:
                'POST',
              credentials:
                'same-origin',
              cache:
                'no-store',
              headers: {
                Accept:
                  'application/json',
              },
            },
          );

        const completed =
          await readJson(
            completeResponse,
          );

        if (
          !completeResponse.ok ||
          !completed.success ||
          !completed.file?.id
        ) {
          throw new Error(
            completed.error ||
            `SaMi could not finalize ${file.name}.`,
          );
        }

        setPendingAttachments(
          current => [
            ...current,
            {
              id:
                String(
                  completed.file
                    .id,
                ),
              name:
                String(
                  completed.file
                    .name ||
                  file.name,
                ),
              mimeType:
                String(
                  completed.file
                    .mimeType ||
                  file.type ||
                  'application/octet-stream',
                ),
              extension:
                typeof completed.file
                  .extension ===
                'string'
                  ? completed.file
                      .extension
                  : null,
              sizeBytes:
                Number(
                  completed.file
                    .sizeBytes ||
                  file.size,
                ),
            },
          ],
        );
      }
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof
          Error
          ? candidate.message
          : 'The attachment could not be uploaded.',
      );
    } finally {
      setUploadingAttachments(
        false,
      );

      if (
        fileInputRef.current
      ) {
        fileInputRef.current
          .value =
          '';
      }
    }
  }

  function removePendingAttachment(
    fileId:
      string,
  ) {
    if (
      sending
    ) {
      return;
    }

    setPendingAttachments(
      current =>
        current.filter(
          file =>
            file.id !==
            fileId,
        ),
    );
  }

  async function sendMessage() {
    const message =
      draft.trim();

    if (
      (
        !message &&
        pendingAttachments
          .length ===
          0
      ) ||
      sending ||
      uploadingAttachments ||
      !status?.configured
    ) {
      return;
    }

    const targetMessageId =
      editingMessageId;

    const sentAttachments =
      pendingAttachments;

    const attachmentIds =
      sentAttachments.map(
        attachment =>
          attachment.id,
      );

    const optimisticMessageId =
      targetMessageId
        ? null
        : 'optimistic-' +
          Date.now();

    if (
      optimisticMessageId
    ) {
      setMessages(
        current => [
          ...current,
          {
            id:
              optimisticMessageId,
            conversationId:
              selectedConversationId ||
              'pending',
            role:
              'user',
            content:
              message,
            status:
              'sending',
            correlationId:
              null,
            feedback:
              null,
            attachments:
              sentAttachments,
            createdAt:
              new Date()
                .toISOString(),
          },
        ],
      );

      setDraft('');
      setPendingAttachments(
        [],
      );
    }

    const sent =
      await runChatRequest({
        mode:
          targetMessageId
            ? 'edit'
            : 'send',
        message,
        targetMessageId:
          targetMessageId ||
          undefined,
        attachmentIds,
        restoreDraft:
          message,
      });

    if (
      !sent &&
      optimisticMessageId
    ) {
      setMessages(
        current =>
          current.filter(
            item =>
              item.id !==
              optimisticMessageId,
          ),
      );

      setPendingAttachments(
        sentAttachments,
      );
    }

    if (
      sent &&
      targetMessageId
    ) {
      setDraft('');
      setPendingAttachments(
        [],
      );
    }
  }

  async function regenerateMessage(
    messageId:
      string,
  ) {
    if (
      !selectedConversationId ||
      sending
    ) {
      return;
    }

    await runChatRequest({
      mode:
        'regenerate',
      targetMessageId:
        messageId,
    });
  }

  function editMessage(
    message:
      Message,
  ) {
    if (
      sending ||
      message.role !==
        'user'
    ) {
      return;
    }

    setEditingMessageId(
      message.id,
    );
    setDraft(
      message.content,
    );
    setPendingAttachments(
      [],
    );
    setError(null);

    requestAnimationFrame(
      () => {
        const composer =
          composerRef.current;

        if (!composer) {
          return;
        }

        composer.focus();

        const end =
          composer.value
            .length;

        composer.setSelectionRange(
          end,
          end,
        );
      },
    );
  }

  function cancelEdit() {
    setEditingMessageId(
      null,
    );
    setDraft('');
    setPendingAttachments(
      [],
    );
    setError(null);
  }

  async function copyMessage(
    message:
      Message,
  ) {
    try {
      if (
        navigator.clipboard
          ?.writeText
      ) {
        await navigator
          .clipboard
          .writeText(
            message.content,
          );
      } else {
        const textarea =
          document.createElement(
            'textarea',
          );

        textarea.value =
          message.content;
        textarea.setAttribute(
          'readonly',
          '',
        );
        textarea.style.position =
          'fixed';
        textarea.style.opacity =
          '0';

        document.body.appendChild(
          textarea,
        );

        textarea.select();

        const copied =
          document.execCommand(
            'copy',
          );

        textarea.remove();

        if (!copied) {
          throw new Error(
            'Copy failed.',
          );
        }
      }

      setCopiedMessageId(
        message.id,
      );

      window.setTimeout(
        () => {
          setCopiedMessageId(
            current =>
              current ===
                message.id
                ? null
                : current,
          );
        },
        1600,
      );
    } catch {
      setError(
        'That message could not be copied.',
      );
    }
  }

  async function setMessageFeedback(
    message:
      Message,
    feedback:
      | 'up'
      | 'down',
  ) {
    if (
      message.role !==
        'assistant'
    ) {
      return;
    }

    const previous =
      message.feedback;

    const next =
      previous ===
        feedback
        ? null
        : feedback;

    setMessages(
      current =>
        current.map(
          item =>
            item.id ===
              message.id
              ? {
                  ...item,
                  feedback:
                    next,
                }
              : item,
        ),
    );

    try {
      const response =
        await fetch(
          '/api/workspace/ai/messages/' +
            encodeURIComponent(
              message.id,
            ) +
            '/feedback',
          {
            method: 'POST',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },
            body:
              JSON.stringify({
                feedback:
                  next,
              }),
          },
        );

      const data =
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'Response feedback could not be saved.',
        );
      }
    } catch (
      candidate
    ) {
      setMessages(
        current =>
          current.map(
            item =>
              item.id ===
                message.id
                ? {
                    ...item,
                    feedback:
                      previous,
                  }
                : item,
          ),
      );

      setError(
        candidate instanceof Error
          ? candidate.message
          : 'Response feedback could not be saved.',
      );
    }
  }

  function stopGenerating() {
    abortControllerRef
      .current
      ?.abort();
  }

  async function updateConversation(
    conversationId:
      string,
    input: {
      title?:
        string;
      pinned?:
        boolean;
    },
  ) {
    const response =
      await fetch(
        '/api/workspace/ai/conversations/' +
          encodeURIComponent(
            conversationId,
          ),
        {
          method:
            'PATCH',
          credentials:
            'same-origin',
          cache:
            'no-store',
          headers: {
            'Content-Type':
              'application/json',
            Accept:
              'application/json',
          },
          body:
            JSON.stringify(
              input,
            ),
        },
      );

    const data =
      await readJson(
        response,
      );

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
          'Conversation could not be updated.',
      );
    }

    await loadConversations();

    if (
      selectedConversationId ===
      conversationId
    ) {
      await loadConversation(
        conversationId,
      );
    }
  }

  async function renameConversation(
    conversationId:
      string,
    title:
      string,
  ) {
    try {
      await updateConversation(
        conversationId,
        {
          title,
        },
      );
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'Conversation could not be renamed.',
      );

      throw candidate;
    }
  }

  async function toggleConversationPin(
    conversationId:
      string,
    pinned:
      boolean,
  ) {
    try {
      await updateConversation(
        conversationId,
        {
          pinned,
        },
      );
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'Conversation pin could not be updated.',
      );

      throw candidate;
    }
  }

  function exportConversation() {
    if (
      !selectedConversation ||
      messages.length ===
        0
    ) {
      return;
    }

    const safeTitle =
      selectedConversation
        .title
        .replace(
          /[^a-z0-9-_]+/gi,
          '-',
        )
        .replace(
          /^-+|-+$/g,
          '',
        )
        .slice(
          0,
          60,
        ) ||
      'sami-conversation';

    const body = [
      '# ' +
        selectedConversation
          .title,
      '',
      ...messages.flatMap(
        message => [
          message.role ===
            'assistant'
            ? '## SaMi'
            : '## You',
          '',
          message.content,
          '',
        ],
      ),
    ].join(
      '\n',
    );

    const blob =
      new Blob(
        [
          body,
        ],
        {
          type:
            'text/markdown;charset=utf-8',
        },
      );

    const url =
      URL.createObjectURL(
        blob,
      );

    const anchor =
      document.createElement(
        'a',
      );

    anchor.href =
      url;
    anchor.download =
      safeTitle +
      '.md';

    document.body.appendChild(
      anchor,
    );

    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(
      url,
    );
  }

  async function archiveConversation(
    conversationId =
      selectedConversationId,
  ) {
    if (
      !conversationId
    ) {
      return;
    }

    try {
      const response =
        await fetch(
          '/api/workspace/ai/conversations/' +
            encodeURIComponent(
              conversationId,
            ),
          {
            method:
              'DELETE',
            credentials:
              'same-origin',
            cache:
              'no-store',
          },
        );

      const data =
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'Conversation could not be archived.',
        );
      }

      if (
        selectedConversationId ===
        conversationId
      ) {
        newConversation();
      }

      await loadConversations();
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'Conversation could not be archived.',
      );
    }
  }

  async function confirmAction(
    actionId:
      string,
  ) {
    setConfirmingActionId(
      actionId,
    );
    setError(null);

    try {
      const response =
        await fetch(
          '/api/workspace/ai/actions/' +
            encodeURIComponent(
              actionId,
            ) +
            '/confirm',
          {
            method: 'POST',
            credentials:
              'same-origin',
            cache: 'no-store',
          },
        );

      const data =
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'The AI action could not be confirmed.',
        );
      }

      if (
        selectedConversationId
      ) {
        await loadConversation(
          selectedConversationId,
        );
      }

      await loadStatus();
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof Error
          ? candidate.message
          : 'The AI action could not be confirmed.',
      );
    } finally {
      setConfirmingActionId(
        null,
      );
    }
  }

  function handleKeyDown(
    event:
      KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key ===
        'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div data-sami-ai-chat="true" className="flex h-[100dvh] min-h-[100dvh] overflow-hidden bg-[#F7F7F8] text-slate-950 dark:bg-[#0D0D0D] dark:text-white">
      <SamiAiSidebar
        conversations={
          conversations
        }
        selectedConversationId={
          selectedConversationId
        }
        collapsed={
          sidebarCollapsed
        }
        mobileOpen={
          sidebarMobileOpen
        }
        onCloseMobile={() =>
          setSidebarMobileOpen(
            false,
          )
        }
        onToggleCollapsed={() =>
          setSidebarCollapsed(
            current =>
              !current,
          )
        }
        onNew={
          newConversation
        }
        onSelect={
          conversationId =>
            void selectConversation(
              conversationId,
            )
        }
        onRename={
          renameConversation
        }
        onTogglePin={
          toggleConversationPin
        }
        onDelete={
          conversationId =>
            archiveConversation(
              conversationId,
            )
        }
        onUsage={() =>
          setUsagePanelOpen(
            true,
          )
        }
      />

      <main className="flex min-w-0 flex-1 flex-col bg-white dark:bg-[#212121]">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center bg-white/92 px-3 backdrop-blur-xl sm:px-4 dark:bg-[#212121]/92">
          <button
            type="button"
            aria-label="Open AI sidebar"
            onClick={() =>
              setSidebarMobileOpen(
                true,
              )
            }
            className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-white/10"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">
              {selectedConversation
                ?.title ||
                'SaMi AI'}
            </p>
          </div>

          {status?.usage && (
            <button
              type="button"
              onClick={() =>
                setUsagePanelOpen(
                  true,
                )
              }
              title="SaMi AI usage and limits"
              className="ml-2 hidden h-8 items-center gap-1.5 rounded-full border border-slate-200 px-2.5 text-[10px] font-semibold text-slate-500 transition hover:bg-slate-50 sm:inline-flex dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <Gauge className="h-3.5 w-3.5" />
              {status.usage
                .monthlyQueries
                .remaining !==
              null
                ? `${status.usage.monthlyQueries.remaining} left`
                : `${status.usage.monthlyQueries.used} this month`}
            </button>
          )}

          {selectedConversationId && (
            <div className="ml-2 flex items-center gap-1">
              <button
                type="button"
                aria-label="Export conversation"
                title="Export conversation"
                onClick={
                  exportConversation
                }
                disabled={
                  messages.length ===
                  0
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                <Download className="h-4 w-4" />
              </button>

              <button
                type="button"
                aria-label="Archive conversation"
                title="Archive conversation"
                onClick={() =>
                  void archiveConversation()
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                <Archive className="h-4 w-4" />
              </button>
            </div>
          )}
        </header>

      {!entitled ? (
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <StateCard
            icon={
              ShieldCheck
            }
            title="SaMi AI is temporarily unavailable"
            description="SaMi AI is part of the workspace, but usage is currently unavailable. Check the workspace subscription or billing status to restore access."
          />
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : !status?.configured ? (
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
          <StateCard
            icon={
              TriangleAlert
            }
            title="SaMi AI is temporarily unavailable"
            description="SaMi AI cannot start right now. Please try again shortly or contact SaMi support if the problem continues."
          />
        </div>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="sami-scrollbar min-h-0 flex-1 overflow-y-auto scroll-smooth">
            <div
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-3 pb-8 pt-5 sm:px-6 sm:pt-8"
            >
              {messages.length ===
                0 ? (
                <div className="flex min-h-[55dvh] flex-col items-center justify-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950">
                    <Sparkles className="h-5 w-5" />
                  </div>

                  <h1 className="mt-5 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                    {
                      emptyState
                        .title
                    }
                  </h1>

                  <p className="mt-2 max-w-xl text-xs leading-6 text-slate-500 sm:text-sm dark:text-slate-400">
                    {
                      emptyState
                        .description
                    }
                  </p>

                  <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                    {
                      emptyState
                        .suggestions
                        .map(
                      suggestion => (
                        <button
                          key={
                            suggestion
                          }
                          type="button"
                          onClick={() =>
                            setDraft(
                              suggestion,
                            )
                          }
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.07]"
                        >
                          {suggestion}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {messages.map(
                    message => (
                      <MessageBubble
                        key={
                          message.id
                        }
                        message={
                          message
                        }
                        copied={
                          copiedMessageId ===
                          message.id
                        }
                        canRegenerate={
                          message.role ===
                            'assistant' &&
                          message.id ===
                            lastAssistantMessageId
                        }
                        disabled={
                          sending
                        }
                        onCopy={() =>
                          void copyMessage(
                            message,
                          )
                        }
                        onEdit={() =>
                          editMessage(
                            message,
                          )
                        }
                        onRegenerate={() =>
                          void regenerateMessage(
                            message.id,
                          )
                        }
                        onFeedback={
                          feedback =>
                            void setMessageFeedback(
                              message,
                              feedback,
                            )
                        }
                      />
                    ),
                  )}

                  {sending && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        <span className="truncate">
                          {receiving
                            ? 'SaMi is responding…'
                            : 'SaMi is working…'}
                        </span>
                      </span>

                      <button
                        type="button"
                        onClick={
                          stopGenerating
                        }
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[9px] font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                      >
                        <Square className="h-3 w-3 fill-current" />
                        Stop
                      </button>
                    </div>
                  )}
                </div>
              )}

              {pendingActions.length >
                0 && (
                <div className="mt-6 space-y-3">
                  {pendingActions.map(
                    action => (
                      <div
                        key={
                          action.id
                        }
                        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/[0.07]"
                      >
                        <div className="flex items-start gap-3">
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black">
                              Confirmation required
                            </p>
                            <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                              {action.name} · risk {action.riskLevel}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={
                              confirmingActionId ===
                              action.id
                            }
                            onClick={() =>
                              void confirmAction(
                                action.id,
                              )
                            }
                            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-3 text-[10px] font-bold text-white transition hover:bg-amber-700 disabled:opacity-60"
                          >
                            {confirmingActionId ===
                            action.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            Confirm
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}

              <div
                ref={
                  messagesEndRef
                }
                aria-hidden="true"
                className="h-px"
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-center text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          <div className="bg-gradient-to-t from-white via-white/98 to-white/0 px-3 pb-3 pt-7 sm:px-6 sm:pb-5 dark:from-[#212121] dark:via-[#212121]/98 dark:to-[#212121]/0">
            <div className="mx-auto max-w-3xl">
              {editingMessageId && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Pencil className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate font-semibold">
                      Editing your message — later replies will be regenerated from here.
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={
                      cancelEdit
                    }
                    className="shrink-0 font-bold underline underline-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {pendingAttachments.length >
                0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingAttachments.map(
                    attachment => (
                      <div
                        key={
                          attachment.id
                        }
                        className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] shadow-sm dark:border-white/10 dark:bg-[#2A2A2A]"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" />

                        <span className="max-w-[220px] truncate font-semibold text-slate-700 dark:text-slate-200">
                          {attachment.name}
                        </span>

                        <span className="shrink-0 text-slate-400">
                          {formatBytes(
                            attachment.sizeBytes,
                          )}
                        </span>

                        <button
                          type="button"
                          aria-label={
                            `Remove ${attachment.name}`
                          }
                          onClick={() =>
                            removePendingAttachment(
                              attachment.id,
                            )
                          }
                          disabled={
                            sending
                          }
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ),
                  )}
                </div>
              )}

              <input
                ref={
                  fileInputRef
                }
                type="file"
                multiple
                className="hidden"
                onChange={
                  event =>
                    void uploadSelectedAttachments(
                      event.target.files,
                    )
                }
              />

              <div className="flex items-end gap-2 rounded-[28px] border border-slate-200 bg-[#F4F4F4] p-2.5 shadow-[0_8px_30px_rgba(15,23,42,0.08)] transition focus-within:border-slate-300 dark:border-white/10 dark:bg-[#303030] dark:shadow-none dark:focus-within:border-white/20">
                <button
                  type="button"
                  aria-label="Attach file"
                  title={
                    status?.attachments
                      ?.canUpload
                      ? 'Attach file'
                      : 'File attachments require Files manage access'
                  }
                  disabled={
                    sending ||
                    uploadingAttachments ||
                    !status?.attachments
                      ?.canUpload
                  }
                  onClick={() =>
                    fileInputRef.current
                      ?.click()
                  }
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  {uploadingAttachments ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </button>
                <textarea
                  ref={
                    composerRef
                  }
                  value={
                    draft
                  }
                  onChange={
                    event =>
                      setDraft(
                        event.target.value,
                      )
                  }
                  onKeyDown={
                    handleKeyDown
                  }
                  rows={1}
                  maxLength={8000}
                  placeholder="Message SaMi…"
                  aria-label="Message SaMi AI"
                  enterKeyHint="send"
                  className="max-h-48 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-slate-400"
                />

                <button
                  type="button"
                  aria-label={
                    sending
                      ? 'Stop generating'
                      : editingMessageId
                        ? 'Send edited message'
                        : 'Send message'
                  }
                  disabled={
                    !sending &&
                    (
                      (
                        !draft.trim() &&
                        pendingAttachments
                          .length ===
                          0
                      ) ||
                      uploadingAttachments
                    )
                  }
                  onClick={() =>
                    sending
                      ? stopGenerating()
                      : void sendMessage()
                  }
                  className={[
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:cursor-not-allowed disabled:opacity-40',
                    sending
                      ? 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200'
                      : 'bg-slate-950 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200',
                  ].join(
                    ' ',
                  )}
                >
                  {sending ? (
                    <Square className="h-4 w-4 fill-current" />
                  ) : editingMessageId ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>

              <p className="mt-2 text-center text-[9px] leading-4 text-slate-400">
                <span className="hidden sm:inline">
                  Enter to send · Shift+Enter for a new line ·{' '}
                </span>
                SaMi can make mistakes. Business actions still follow your current company, app access and permissions.
              </p>
            </div>
          </div>
        </section>
      )}

      {usagePanelOpen && (
        <SamiAiUsagePanel
          status={
            status
          }
          onClose={() =>
            setUsagePanelOpen(
              false,
            )
          }
        />
      )}
      </main>
    </div>
  );
}

function MessageBubble({
  message,
  copied,
  canRegenerate,
  disabled,
  onCopy,
  onEdit,
  onRegenerate,
  onFeedback,
}: {
  message:
    Message;
  copied:
    boolean;
  canRegenerate:
    boolean;
  disabled:
    boolean;
  onCopy:
    () => void;
  onEdit:
    () => void;
  onRegenerate:
    () => void;
  onFeedback:
    (
      feedback:
        | 'up'
        | 'down',
    ) => void;
}) {
  const assistant =
    message.role ===
    'assistant';

  return (
    <div
      className={
        assistant
          ? 'flex justify-start'
          : 'flex justify-end'
      }
    >
      <div
        className={[
          'group min-w-0 max-w-[94%] sm:max-w-[82%]',
          assistant
            ? 'w-full'
            : '',
        ].join(
          ' ',
        )}
      >
        <div
          className={[
            'rounded-2xl px-4 py-3 text-sm leading-6',
            assistant
              ? 'bg-transparent px-1 text-slate-800 dark:text-slate-100'
              : 'ml-auto max-w-full bg-slate-100 text-slate-900 dark:bg-[#2A2A2A] dark:text-slate-100',
          ].join(
            ' ',
          )}
        >
          {!assistant &&
            message.attachments
              ?.length >
              0 && (
              <div className="mb-2 flex flex-wrap justify-end gap-2">
                {message.attachments.map(
                  attachment => (
                    <div
                      key={
                        attachment.id
                      }
                      className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-2.5 py-2 text-[9px] dark:border-white/10 dark:bg-white/[0.04]"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                      <span className="max-w-[190px] truncate font-semibold">
                        {attachment.name}
                      </span>
                      <span className="shrink-0 opacity-50">
                        {formatBytes(
                          attachment.sizeBytes,
                        )}
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}

          {assistant ? (
            <SamiAiMarkdown>
              {message.content}
            </SamiAiMarkdown>
          ) : (
            <p className="whitespace-pre-wrap break-words">
              {message.content}
            </p>
          )}

          <p className="mt-2 text-[8px] opacity-55">
            {timeLabel(
              message.createdAt,
            )}
          </p>
        </div>

        <div
          className={[
            'mt-1.5 flex items-center gap-1',
            assistant
              ? 'justify-start'
              : 'justify-end',
          ].join(
            ' ',
          )}
        >
          <MessageAction
            label={
              copied
                ? 'Copied'
                : 'Copy'
            }
            disabled={
              false
            }
            onClick={
              onCopy
            }
            icon={
              copied
                ? Check
                : Copy
            }
            iconOnly
          />

          {!assistant && (
            <MessageAction
              label="Edit"
              disabled={
                disabled
              }
              onClick={
                onEdit
              }
              icon={
                Pencil
              }
            />
          )}

          {assistant && (
            <>
              <MessageAction
                label="Helpful"
                active={
                  message.feedback ===
                  'up'
                }
                disabled={
                  disabled
                }
                onClick={() =>
                  onFeedback(
                    'up',
                  )
                }
                icon={
                  ThumbsUp
                }
              />

              <MessageAction
                label="Not helpful"
                active={
                  message.feedback ===
                  'down'
                }
                disabled={
                  disabled
                }
                onClick={() =>
                  onFeedback(
                    'down',
                  )
                }
                icon={
                  ThumbsDown
                }
              />
            </>
          )}

          {assistant &&
            canRegenerate && (
            <MessageAction
              label="Regenerate"
              disabled={
                disabled
              }
              onClick={
                onRegenerate
              }
              icon={
                RefreshCw
              }
              iconOnly
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MessageAction({
  label,
  disabled,
  onClick,
  icon: Icon,
  active = false,
  iconOnly = false,
}: {
  label:
    string;
  disabled:
    boolean;
  onClick:
    () => void;
  icon:
    typeof Copy;
  active?:
    boolean;
  iconOnly?:
    boolean;
}) {
  return (
    <button
      type="button"
      title={
        label
      }
      aria-label={
        label
      }
      disabled={
        disabled
      }
      onClick={
        onClick
      }
      className={[
        iconOnly
          ? 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-[9px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40'
          : 'inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[9px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200',
      ].join(
        ' ',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {!iconOnly && (
        <span className="hidden sm:inline">
          {label}
        </span>
      )}
    </button>
  );
}

function StateCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
}) {
  return (
    <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm dark:border-white/10 dark:bg-[#0F131B]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
        <Icon className="h-5 w-5" />
      </div>

      <h2 className="mt-4 text-base font-black tracking-tight">
        {title}
      </h2>

      <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}
