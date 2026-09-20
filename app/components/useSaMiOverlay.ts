'use client';

import {
  useCallback,
  useState,
} from 'react';

import type {
  SaMiOverlayAction,
  SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

export type SaMiOverlayState = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
  primaryAction?: SaMiOverlayAction;
  secondaryAction?: SaMiOverlayAction;
};

export const CLOSED_SAMI_OVERLAY: SaMiOverlayState = {
  open: false,
  type: 'info',
  title: '',
  message: '',
};

type ConfirmInput = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
};

export function useSaMiOverlay() {
  const [
    overlay,
    setOverlay,
  ] =
    useState<SaMiOverlayState>(
      CLOSED_SAMI_OVERLAY,
    );

  const closeOverlay =
    useCallback(
      () => {
        setOverlay(
          CLOSED_SAMI_OVERLAY,
        );
      },
      [],
    );

  const showOverlay =
    useCallback(
      (
        type: SaMiOverlayType,
        title: string,
        message: string,
        primaryAction?: SaMiOverlayAction,
        secondaryAction?: SaMiOverlayAction,
      ) => {
        setOverlay({
          open: true,
          type,
          title,
          message,
          primaryAction:
            primaryAction || {
              label: 'OK',
              onClick: closeOverlay,
            },
          secondaryAction,
        });
      },
      [
        closeOverlay,
      ],
    );

  const showSuccess =
    useCallback(
      (
        title: string,
        message: string,
      ) =>
        showOverlay(
          'success',
          title,
          message,
        ),
      [
        showOverlay,
      ],
    );

  const showError =
    useCallback(
      (
        title: string,
        message: string,
      ) =>
        showOverlay(
          'error',
          title,
          message,
        ),
      [
        showOverlay,
      ],
    );

  const showWarning =
    useCallback(
      (
        title: string,
        message: string,
      ) =>
        showOverlay(
          'warning',
          title,
          message,
        ),
      [
        showOverlay,
      ],
    );

  const showInfo =
    useCallback(
      (
        title: string,
        message: string,
      ) =>
        showOverlay(
          'info',
          title,
          message,
        ),
      [
        showOverlay,
      ],
    );

  const confirmAction =
    useCallback(
      ({
        title,
        message,
        confirmLabel = 'Continue',
        cancelLabel = 'Cancel',
        onConfirm,
      }: ConfirmInput) => {
        setOverlay({
          open: true,
          type: 'warning',
          title,
          message,
          primaryAction: {
            label:
              confirmLabel,
            onClick: () => {
              closeOverlay();
              onConfirm();
            },
          },
          secondaryAction: {
            label:
              cancelLabel,
            onClick:
              closeOverlay,
          },
        });
      },
      [
        closeOverlay,
      ],
    );

  return {
    overlay,
    setOverlay,
    closeOverlay,
    showOverlay,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    confirmAction,
  };
}
