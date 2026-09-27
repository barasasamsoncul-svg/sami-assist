export type SpecialistTransitionPrivilege =
  | 'execute'
  | 'approve'
  | 'close';


const APPROVAL_TARGETS =
  new Set([
    'approved',
    'rejected',
    'verified',
    'selected',
    'graded',
    'waived',
  ]);


const CLOSE_TARGETS =
  new Set([
    'archived',
    'cancelled',
    'checked_in',
    'closed',
    'completed',
    'converted',
    'delivered',
    'expired',
    'issued',
    'lost',
    'paid',
    'posted',
    'processed',
    'reconciled',
    'refunded',
    'retired',
    'returned',
    'reversed',
    'signed',
    'void',
    'won',
  ]);


export function specialistTransitionPrivilege(
  nextStatus:
    unknown,
): SpecialistTransitionPrivilege {
  const status =
    String(
      nextStatus ||
      '',
    )
      .trim()
      .toLowerCase();

  if (
    APPROVAL_TARGETS.has(
      status,
    )
  ) {
    return 'approve';
  }

  if (
    CLOSE_TARGETS.has(
      status,
    )
  ) {
    return 'close';
  }

  return 'execute';
}


export function specialistTransitionPermissionKey(
  moduleKey:
    string,
  nextStatus:
    unknown,
) {
  return (
    moduleKey
      .trim()
      .toLowerCase() +
    '.record.' +
    specialistTransitionPrivilege(
      nextStatus,
    )
  );
}
