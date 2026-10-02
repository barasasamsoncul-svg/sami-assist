'use client';

export type SamiSoundKey =
  | 'chime'
  | 'soft'
  | 'pulse'
  | 'classic'
  | 'silent';

type SoundPattern = Array<{
  frequency: number;
  duration: number;
  delay?: number;
  gain?: number;
}>;

const PATTERNS:
  Record<
    Exclude<
      SamiSoundKey,
      'silent'
    >,
    SoundPattern
  > = {
  chime: [
    {
      frequency: 659.25,
      duration: 0.12,
      gain: 0.07,
    },
    {
      frequency: 783.99,
      duration: 0.16,
      delay: 0.12,
      gain: 0.06,
    },
  ],
  soft: [
    {
      frequency: 523.25,
      duration: 0.16,
      gain: 0.045,
    },
  ],
  pulse: [
    {
      frequency: 587.33,
      duration: 0.08,
      gain: 0.065,
    },
    {
      frequency: 587.33,
      duration: 0.08,
      delay: 0.13,
      gain: 0.065,
    },
  ],
  classic: [
    {
      frequency: 440,
      duration: 0.18,
      gain: 0.07,
    },
    {
      frequency: 554.37,
      duration: 0.18,
      delay: 0.22,
      gain: 0.07,
    },
    {
      frequency: 659.25,
      duration: 0.22,
      delay: 0.44,
      gain: 0.07,
    },
  ],
};

let audioContext:
  AudioContext |
  null =
    null;

function context() {
  if (
    typeof window ===
      'undefined'
  ) {
    return null;
  }

  const AudioContextClass =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?:
          typeof AudioContext;
      }
    ).webkitAudioContext;

  if (
    !AudioContextClass
  ) {
    return null;
  }

  if (
    !audioContext
  ) {
    audioContext =
      new AudioContextClass();
  }

  return audioContext;
}

export async function unlockSamiAudio() {
  const current =
    context();

  if (
    current?.state ===
      'suspended'
  ) {
    await current.resume();
  }
}

export async function playSamiSound(
  sound:
    SamiSoundKey,
) {
  if (
    sound ===
      'silent'
  ) {
    return;
  }

  const current =
    context();

  if (
    !current
  ) {
    return;
  }

  if (
    current.state ===
      'suspended'
  ) {
    try {
      await current.resume();
    } catch {
      return;
    }
  }

  const startedAt =
    current.currentTime;

  for (
    const tone
    of PATTERNS[
      sound
    ]
  ) {
    const oscillator =
      current.createOscillator();
    const gain =
      current.createGain();
    const start =
      startedAt +
      (
        tone.delay ||
        0
      );
    const end =
      start +
      tone.duration;

    oscillator.type =
      'sine';
    oscillator.frequency
      .setValueAtTime(
        tone.frequency,
        start,
      );

    gain.gain
      .setValueAtTime(
        0.0001,
        start,
      );
    gain.gain
      .exponentialRampToValueAtTime(
        tone.gain ||
          0.06,
        start +
          0.015,
      );
    gain.gain
      .exponentialRampToValueAtTime(
        0.0001,
        end,
      );

    oscillator
      .connect(
        gain,
      );
    gain.connect(
      current.destination,
    );

    oscillator.start(
      start,
    );
    oscillator.stop(
      end +
      0.02,
    );
  }
}

export function startSamiRingtone(
  sound:
    SamiSoundKey,
) {
  if (
    sound ===
      'silent'
  ) {
    return () => {};
  }

  let active =
    true;

  const ring =
    () => {
      if (
        !active
      ) {
        return;
      }

      void playSamiSound(
        sound,
      );
    };

  ring();

  const interval =
    window.setInterval(
      ring,
      1_700,
    );

  return () => {
    active =
      false;
    window.clearInterval(
      interval,
    );
  };
}
