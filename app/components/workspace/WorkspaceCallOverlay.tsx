'use client';

import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  X,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  startSamiRingtone,
  unlockSamiAudio,
  type SamiSoundKey,
} from '@/lib/ui/notification-sounds';

type CallPerson = {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
};

type WorkspaceCall = {
  id: string;
  conversationId: string | null;
  caller: CallPerson;
  callee: CallPerson;
  status:
    | 'ringing'
    | 'accepted'
    | 'declined'
    | 'ended'
    | 'cancelled'
    | 'missed';
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
};

type CallSignal = {
  id: string;
  senderUserId: string;
  type: 'offer' | 'answer' | 'ice';
  payload: unknown;
  createdAt: string;
};

type StartCallDetail = {
  recipientUserId: string;
  recipientName?: string;
  conversationId?: string | null;
};

type Json = Record<string, any>;

async function readJson(
  response: Response,
): Promise<Json> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function WorkspaceCallOverlay({
  userId,
}: {
  userId: string;
}) {
  const [
    call,
    setCall,
  ] =
    useState<
      WorkspaceCall | null
    >(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const [
    muted,
    setMuted,
  ] =
    useState(
      false,
    );

  const [
    callRingtone,
    setCallRingtone,
  ] =
    useState<
      SamiSoundKey
    >(
      'classic',
    );

  const [
    soundEnabled,
    setSoundEnabled,
  ] =
    useState(
      true,
    );

  const peerRef =
    useRef<
      RTCPeerConnection | null
    >(
      null,
    );

  const localStreamRef =
    useRef<
      MediaStream | null
    >(
      null,
    );

  const remoteAudioRef =
    useRef<
      HTMLAudioElement | null
    >(
      null,
    );

  const seenSignalsRef =
    useRef(
      new Set<
        string
      >(),
    );

  const pendingIceRef =
    useRef<
      RTCIceCandidateInit[]
    >(
      [],
    );

  const ringtoneStopRef =
    useRef<
      (() => void) |
      null
    >(
      null,
    );

  const clearMedia =
    useCallback(
      () => {
        ringtoneStopRef
          .current?.();
        ringtoneStopRef
          .current =
          null;

        peerRef
          .current
          ?.close();
        peerRef
          .current =
          null;

        localStreamRef
          .current
          ?.getTracks()
          .forEach(
            track =>
              track.stop(),
          );
        localStreamRef
          .current =
          null;

        if (
          remoteAudioRef
            .current
        ) {
          remoteAudioRef
            .current
            .srcObject =
            null;
        }

        seenSignalsRef
          .current
          .clear();
        pendingIceRef
          .current =
          [];
        setMuted(
          false,
        );
      },
      [],
    );

  const postSignal =
    useCallback(
      async (
        callId:
          string,
        type:
          CallSignal['type'],
        payload:
          unknown,
      ) => {
        const response =
          await fetch(
            '/api/workspace/calls/' +
            encodeURIComponent(
              callId,
            ) +
            '/signals',
            {
              method:
                'POST',
              credentials:
                'same-origin',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify({
                  type,
                  payload,
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
            'Call signaling failed.',
          );
        }
      },
      [],
    );

  const loadIceServers =
    useCallback(
      async () => {
        const response =
          await fetch(
            '/api/workspace/calls/config',
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
            'Call network configuration could not be loaded.',
          );
        }

        return Array.isArray(
          data.iceServers,
        )
          ? data.iceServers as
              RTCIceServer[]
          : [];
      },
      [],
    );

  const preparePeer =
    useCallback(
      async (
        activeCall:
          WorkspaceCall,
        createOffer:
          boolean,
      ) => {
        if (
          peerRef.current
        ) {
          return peerRef
            .current;
        }

        if (
          !navigator
            .mediaDevices
            ?.getUserMedia
        ) {
          throw new Error(
            'This browser does not support in-app audio calling.',
          );
        }

        const [
          iceServers,
          stream,
        ] =
          await Promise.all([
            loadIceServers(),
            navigator
              .mediaDevices
              .getUserMedia({
                audio: {
                  echoCancellation:
                    true,
                  noiseSuppression:
                    true,
                  autoGainControl:
                    true,
                },
                video:
                  false,
              }),
          ]);

        const peer =
          new RTCPeerConnection({
            iceServers,
          });

        peerRef.current =
          peer;
        localStreamRef
          .current =
          stream;

        stream
          .getAudioTracks()
          .forEach(
            track =>
              peer.addTrack(
                track,
                stream,
              ),
          );

        peer.ontrack =
          event => {
            const [
              remoteStream,
            ] =
              event.streams;

            if (
              remoteAudioRef
                .current &&
              remoteStream
            ) {
              remoteAudioRef
                .current
                .srcObject =
                remoteStream;

              void remoteAudioRef
                .current
                .play()
                .catch(
                  () =>
                    undefined,
                );
            }
          };

        peer.onicecandidate =
          event => {
            if (
              event.candidate
            ) {
              void postSignal(
                activeCall.id,
                'ice',
                event.candidate
                  .toJSON(),
              ).catch(
                candidate => {
                  setError(
                    candidate instanceof
                      Error
                      ? candidate.message
                      : 'Call network candidate could not be sent.',
                  );
                },
              );
            }
          };

        peer.onconnectionstatechange =
          () => {
            if (
              peer.connectionState ===
                'failed'
            ) {
              setError(
                'The audio connection failed. End the call and try again.',
              );
            }
          };

        if (
          createOffer
        ) {
          const offer =
            await peer
              .createOffer();

          await peer
            .setLocalDescription(
              offer,
            );

          await postSignal(
            activeCall.id,
            'offer',
            offer,
          );
        }

        return peer;
      },
      [
        loadIceServers,
        postSignal,
      ],
    );

  const applySignals =
    useCallback(
      async (
        activeCall:
          WorkspaceCall,
      ) => {
        const response =
          await fetch(
            '/api/workspace/calls/' +
            encodeURIComponent(
              activeCall.id,
            ) +
            '/signals',
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
          return;
        }

        const signals =
          Array.isArray(
            data.signals,
          )
            ? data.signals as
                CallSignal[]
            : [];

        for (
          const signal
          of signals
        ) {
          if (
            signal.senderUserId ===
              userId ||
            seenSignalsRef
              .current
              .has(
                signal.id,
              )
          ) {
            continue;
          }

          seenSignalsRef
            .current
            .add(
              signal.id,
            );

          const peer =
            peerRef.current;

          if (
            signal.type ===
              'offer'
          ) {
            const readyPeer =
              peer ||
              await preparePeer(
                activeCall,
                false,
              );

            await readyPeer
              .setRemoteDescription(
                signal.payload as
                  RTCSessionDescriptionInit,
              );

            for (
              const candidate
              of pendingIceRef
                .current
            ) {
              await readyPeer
                .addIceCandidate(
                  candidate,
                )
                .catch(
                  () =>
                    undefined,
                );
            }
            pendingIceRef
              .current =
              [];

            if (
              activeCall.status ===
                'accepted' &&
              activeCall.callee.id ===
                userId
            ) {
              const answer =
                await readyPeer
                  .createAnswer();

              await readyPeer
                .setLocalDescription(
                  answer,
                );

              await postSignal(
                activeCall.id,
                'answer',
                answer,
              );
            }
          } else if (
            signal.type ===
              'answer' &&
            peer
          ) {
            await peer
              .setRemoteDescription(
                signal.payload as
                  RTCSessionDescriptionInit,
              );

            for (
              const candidate
              of pendingIceRef
                .current
            ) {
              await peer
                .addIceCandidate(
                  candidate,
                )
                .catch(
                  () =>
                    undefined,
                );
            }
            pendingIceRef
              .current =
              [];
          } else if (
            signal.type ===
              'ice'
          ) {
            const candidate =
              signal.payload as
                RTCIceCandidateInit;

            if (
              peer &&
              peer.remoteDescription
            ) {
              await peer
                .addIceCandidate(
                  candidate,
                )
                .catch(
                  () =>
                    undefined,
                );
            } else {
              pendingIceRef
                .current
                .push(
                  candidate,
                );
            }
          }
        }
      },
      [
        postSignal,
        preparePeer,
        userId,
      ],
    );

  const loadCalls =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              '/api/workspace/calls',
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
            return;
          }

          const active =
            (
              Array.isArray(
                data.calls,
              )
                ? data.calls
                : []
            ) as
              WorkspaceCall[];

          const next =
            call
              ? active.find(
                  candidate =>
                    candidate.id ===
                    call.id,
                ) ||
                null
              : active[0] ||
                null;

          if (
            call &&
            !next
          ) {
            clearMedia();
            setCall(
              null,
            );
            return;
          }

          if (
            next
          ) {
            setCall(
              next,
            );

            if (
              next.status ===
                'accepted'
            ) {
              ringtoneStopRef
                .current?.();
              ringtoneStopRef
                .current =
                null;
            }

            if (
              next.status ===
                'accepted' ||
              peerRef.current
            ) {
              void applySignals(
                next,
              ).catch(
                candidate =>
                  setError(
                    candidate instanceof
                      Error
                      ? candidate.message
                      : 'Call signaling could not be processed.',
                  ),
              );
            }
          }
        } catch {
          // Calls must never block the surrounding workspace.
        }
      },
      [
        applySignals,
        call,
        clearMedia,
      ],
    );

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () => {
            void loadCalls();
          },
          1_200,
        );

      const interval =
        window.setInterval(
          () => {
            void loadCalls();
          },
          call
            ? 1_500
            : 4_000,
        );

      return () => {
        window.clearTimeout(
          timer,
        );
        window.clearInterval(
          interval,
        );
      };
    },
    [
      call,
      loadCalls,
    ],
  );

  useEffect(
    () => {
      void fetch(
        '/api/workspace/notifications/preferences',
        {
          credentials:
            'same-origin',
          cache:
            'no-store',
        },
      )
        .then(
          response =>
            readJson(
              response,
            ),
        )
        .then(
          data => {
            if (
              data.success &&
              data.preferences
            ) {
              setSoundEnabled(
                data.preferences
                  .soundEnabled !==
                  false,
              );
              setCallRingtone(
                (
                  data.preferences
                    .callRingtone ||
                  'classic'
                ) as
                  SamiSoundKey,
              );
            }
          },
        )
        .catch(
          () =>
            undefined,
        );
    },
    [],
  );

  useEffect(
    () => {
      if (
        !call ||
        call.status !==
          'ringing' ||
        call.callee.id !==
          userId ||
        !soundEnabled
      ) {
        ringtoneStopRef
          .current?.();
        ringtoneStopRef
          .current =
          null;
        return;
      }

      ringtoneStopRef
        .current?.();
      ringtoneStopRef
        .current =
        startSamiRingtone(
          callRingtone,
        );

      return () => {
        ringtoneStopRef
          .current?.();
        ringtoneStopRef
          .current =
          null;
      };
    },
    [
      call,
      callRingtone,
      soundEnabled,
      userId,
    ],
  );

  useEffect(
    () => {
      const listener =
        (
          event:
            Event,
        ) => {
          const detail =
            (
              event as
                CustomEvent<
                  StartCallDetail
                >
            ).detail;

          if (
            !detail
              ?.recipientUserId
          ) {
            return;
          }

          void (
            async () => {
              setBusy(
                true,
              );
              setError(
                null,
              );

              try {
                await unlockSamiAudio();

                const response =
                  await fetch(
                    '/api/workspace/calls',
                    {
                      method:
                        'POST',
                      credentials:
                        'same-origin',
                      headers: {
                        'Content-Type':
                          'application/json',
                      },
                      body:
                        JSON.stringify({
                          recipientUserId:
                            detail.recipientUserId,
                          conversationId:
                            detail.conversationId ||
                            null,
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
                    'The call could not be started.',
                  );
                }

                const started =
                  data.call as
                    WorkspaceCall;

                setCall(
                  started,
                );

                await preparePeer(
                  started,
                  true,
                );
              } catch (
                candidate
              ) {
                clearMedia();
                setCall(
                  null,
                );
                setError(
                  candidate instanceof
                    Error
                    ? candidate.message
                    : 'The call could not be started.',
                );
              } finally {
                setBusy(
                  false,
                );
              }
            }
          )();
        };

      window.addEventListener(
        'sami:start-call',
        listener,
      );

      return () =>
        window.removeEventListener(
          'sami:start-call',
          listener,
        );
    },
    [
      clearMedia,
      preparePeer,
    ],
  );

  useEffect(
    () =>
      () => {
        clearMedia();
      },
    [
      clearMedia,
    ],
  );

  async function callAction(
    action:
      'accept' |
      'decline' |
      'cancel' |
      'end',
  ) {
    if (
      !call ||
      busy
    ) {
      return;
    }

    setBusy(
      true,
    );
    setError(
      null,
    );

    try {
      await unlockSamiAudio();

      if (
        action ===
          'accept'
      ) {
        await preparePeer(
          call,
          false,
        );
      }

      const response =
        await fetch(
          '/api/workspace/calls/' +
          encodeURIComponent(
            call.id,
          ),
          {
            method:
              'PATCH',
            credentials:
              'same-origin',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                action,
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
          'The call could not be updated.',
        );
      }

      const updated =
        data.call as
          WorkspaceCall;

      if (
        action ===
          'decline' ||
        action ===
          'cancel' ||
        action ===
          'end'
      ) {
        clearMedia();
        setCall(
          null,
        );
      } else {
        setCall(
          updated,
        );
        await applySignals(
          updated,
        );
      }
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof
          Error
          ? candidate.message
          : 'The call could not be updated.',
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  function toggleMute() {
    const stream =
      localStreamRef
        .current;

    if (
      !stream
    ) {
      return;
    }

    const next =
      !muted;

    stream
      .getAudioTracks()
      .forEach(
        track => {
          track.enabled =
            !next;
        },
      );

    setMuted(
      next,
    );
  }

  if (
    !call &&
    !error
  ) {
    return null;
  }

  const incoming =
    call?.callee.id ===
      userId;
  const other =
    call
      ? (
          incoming
            ? call.caller
            : call.callee
        )
      : null;

  return (
    <>
      <audio
        ref={
          remoteAudioRef
        }
        autoPlay
        playsInline
      />

      {error &&
      !call ? (
        <div className="fixed bottom-4 right-4 z-[190] max-w-sm rounded-2xl border border-rose-200 bg-white p-4 shadow-2xl dark:border-rose-500/20 dark:bg-[#11141a]">
          <div className="flex items-start gap-3">
            <PhoneOff className="mt-0.5 h-4 w-4 text-rose-500" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black">
                Call unavailable
              </p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                {error}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setError(
                  null,
                )
              }
              className="flex h-7 w-7 items-center justify-center rounded-lg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {call ? (
        <div className="fixed inset-x-3 bottom-3 z-[190] mx-auto max-w-md overflow-hidden rounded-[24px] border border-[var(--sami-border)] bg-white shadow-2xl dark:bg-[#11141a] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[390px]">
          <div className="bg-slate-950 px-5 py-5 text-white">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-blue-300">
              {call.status ===
                'ringing'
                ? (
                    incoming
                      ? 'Incoming SaMi call'
                      : 'Calling…'
                  )
                : 'SaMi audio call'}
            </p>
            <p className="mt-2 truncate text-lg font-black">
              {other?.name ||
                'Workspace member'}
            </p>
            <p className="mt-1 truncate text-[11px] text-slate-300">
              {call.status ===
                'accepted'
                ? 'Connected securely in SaMi'
                : incoming
                  ? 'Audio call from your coworker'
                  : 'Waiting for answer'}
            </p>
          </div>

          {error ? (
            <div className="border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-[11px] text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-3 p-4">
            {call.status ===
              'ringing' &&
            incoming ? (
              <>
                <button
                  type="button"
                  disabled={
                    busy
                  }
                  onClick={() =>
                    void callAction(
                      'decline',
                    )
                  }
                  className="flex h-12 min-w-28 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-xs font-black text-white disabled:opacity-60"
                >
                  <PhoneOff className="h-4 w-4" />
                  Decline
                </button>

                <button
                  type="button"
                  disabled={
                    busy
                  }
                  onClick={() =>
                    void callAction(
                      'accept',
                    )
                  }
                  className="flex h-12 min-w-28 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-60"
                >
                  <Phone className="h-4 w-4" />
                  Answer
                </button>
              </>
            ) : (
              <>
                {call.status ===
                  'accepted' ? (
                  <button
                    type="button"
                    onClick={
                      toggleMute
                    }
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 dark:border-white/10"
                    aria-label={
                      muted
                        ? 'Unmute'
                        : 'Mute'
                    }
                  >
                    {muted ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={
                    busy
                  }
                  onClick={() =>
                    void callAction(
                      call.status ===
                        'ringing'
                        ? 'cancel'
                        : 'end',
                    )
                  }
                  className="flex h-12 min-w-32 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-xs font-black text-white disabled:opacity-60"
                >
                  <PhoneOff className="h-4 w-4" />
                  {call.status ===
                    'ringing'
                    ? 'Cancel'
                    : 'End call'}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
