'use client';

import {
  Activity,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unplug,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';

type ProviderField = {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder?: string;
  help: string;
  required: boolean;
  options?: {
    value: string;
    label: string;
  }[];
};

type Provider = {
  key: string;
  name: string;
  description: string;
  countries: string[];
  environments: ('sandbox' | 'live')[];
  setupMode: 'automatic' | 'guided';
  setupNote: string;
  fields: ProviderField[];
};

type Connection = {
  id: string;
  provider: string;
  name: string;
  status: string;
  healthStatus: string;
  environment: 'sandbox' | 'live';
  externalAccountId: string | null;
  externalAccountName: string | null;
  callbackConfigured: boolean;
  callbackVerified: boolean;
  callbackVerifiedAt: string | null;
  manualSetupRequired: boolean;
  autoReconcile: boolean;
  endpointStatus: string | null;
  lastReceivedAt: string | null;
  lastHealthCheckAt: string | null;
  connectedAt: string | null;
  updatedAt: string;
};

type State = {
  canManage: boolean;
  providers: Provider[];
  connections: Connection[];
};

type ManualSetup = {
  callbackUrl: string;
  verificationValue?: string;
  instructions: string;
};

type OverlayState = {
  open: boolean;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
};

const CLOSED_OVERLAY: OverlayState = {
  open: false,
  type: 'info',
  title: '',
  message: '',
};

function formatDate(value: string | null) {
  if (!value) return 'No payment received yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

function statusTone(connection: Connection | null) {
  if (
    connection?.status === 'connected' &&
    connection.healthStatus === 'healthy' &&
    (!connection.manualSetupRequired || connection.callbackConfigured)
  ) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300';
  }
  if (connection?.healthStatus === 'degraded') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300';
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'mpesa') {
    return <Smartphone className="h-5 w-5" />;
  }
  return <CreditCard className="h-5 w-5" />;
}

export default function PaymentIntegrationsWorkspace() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Provider | null>(null);
  const [environment, setEnvironment] =
    useState<'sandbox' | 'live'>('sandbox');
  const [credentials, setCredentials] =
    useState<Record<string, string>>({});
  const [manualSetup, setManualSetup] =
    useState<ManualSetup | null>(null);
  const [manualConnectionId, setManualConnectionId] =
    useState<string | null>(null);
  const [overlay, setOverlay] =
    useState<OverlayState>(CLOSED_OVERLAY);

  const show = (
    type: OverlayState['type'],
    title: string,
    message: string,
  ) => setOverlay({
    open: true,
    type,
    title,
    message,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        '/api/apps/invoicing/payment-providers',
        {
          credentials: 'same-origin',
          cache: 'no-store',
        },
      );
      const body = await response.json() as
        Partial<State> & {
          success?: boolean;
          error?: string;
        };
      if (!response.ok || body.success !== true) {
        throw new Error(
          body.error ||
          'Payment providers could not be loaded.',
        );
      }
      setState({
        canManage: body.canManage === true,
        providers: body.providers || [],
        connections: body.connections || [],
      });
    } catch (error) {
      show(
        'error',
        'Payment providers unavailable',
        error instanceof Error
          ? error.message
          : 'Payment providers could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connections = useMemo(
    () =>
      new Map(
        (state?.connections || []).map(
          connection => [connection.provider, connection],
        ),
      ),
    [state],
  );

  function openProvider(provider: Provider) {
    if (!state?.canManage) {
      show(
        'warning',
        'Permission required',
        'Only an owner or user allowed to manage integrations and invoice payments can change payment providers.',
      );
      return;
    }
    setSelected(provider);
    setEnvironment(
      provider.environments.includes('sandbox')
        ? 'sandbox'
        : 'live',
    );
    setCredentials(
      Object.fromEntries(
        provider.fields
          .filter(
            field =>
              field.type === 'select' &&
              field.options?.[0],
          )
          .map(
            field => [
              field.key,
              field.options?.[0]?.value || '',
            ],
          ),
      ),
    );
    setManualSetup(null);
    setManualConnectionId(null);
  }

  async function connect() {
    if (!selected) return;
    for (const field of selected.fields) {
      if (field.required && !credentials[field.key]?.trim()) {
        show(
          'warning',
          field.label + ' required',
          'Enter ' + field.label + ' before connecting ' + selected.name + '.',
        );
        return;
      }
    }

    setBusy('connect:' + selected.key);
    try {
      const response = await fetch(
        '/api/apps/invoicing/payment-providers',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({
            operation: 'connect',
            provider: selected.key,
            environment,
            credentials,
          }),
        },
      );
      const body = await response.json() as {
        success?: boolean;
        error?: string;
        result?: {
          connectionId?: string;
          providerName?: string;
          manualSetup?: ManualSetup | null;
        };
      };
      if (!response.ok || body.success !== true) {
        throw new Error(
          body.error ||
          selected.name + ' could not be connected.',
        );
      }

      setCredentials({});
      await load();

      if (
        body.result?.manualSetup &&
        body.result.connectionId
      ) {
        setManualSetup(body.result.manualSetup);
        setManualConnectionId(body.result.connectionId);
      } else {
        setSelected(null);
        setManualConnectionId(null);
        show(
          'success',
          selected.name + ' connected',
          'SaMi verified the merchant account and configured the callback where the provider supports automatic registration. Webhook verification will be shown after the first signed provider event reaches SaMi. Temporary access tokens remain server-side.',
        );
      }
    } catch (error) {
      show(
        'error',
        'Connection failed',
        error instanceof Error
          ? error.message
          : selected.name + ' could not be connected.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function confirmManualSetup() {
    if (!selected || !manualConnectionId) {
      show(
        'error',
        'Setup could not be confirmed',
        'SaMi no longer has the connection reference for this setup. Reopen the provider and try again.',
      );
      return;
    }

    setBusy('confirm:' + manualConnectionId);

    try {
      const response = await fetch(
        '/api/apps/invoicing/payment-providers',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({
            operation: 'confirm_setup',
            connectionId: manualConnectionId,
          }),
        },
      );

      const body = await response.json() as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || body.success !== true) {
        throw new Error(
          body.error ||
          selected.name + ' setup could not be confirmed.',
        );
      }

      const providerName = selected.name;

      setSelected(null);
      setManualSetup(null);
      setManualConnectionId(null);

      await load();

      show(
        'success',
        providerName + ' connected',
        'The payment notification setup is saved. SaMi can now receive provider notifications. The webhook will show Verified only after the first signed provider event reaches SaMi.',
      );
    } catch (error) {
      show(
        'error',
        'Setup confirmation failed',
        error instanceof Error
          ? error.message
          : selected.name + ' setup could not be confirmed.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function connectionAction(
    connection: Connection,
    operation: 'test' | 'disconnect',
  ) {
    setBusy(operation + ':' + connection.id);
    try {
      const response = await fetch(
        '/api/apps/invoicing/payment-providers',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({
            operation,
            connectionId: connection.id,
          }),
        },
      );
      const body = await response.json() as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || body.success !== true) {
        throw new Error(
          body.error ||
          'Payment provider action failed.',
        );
      }
      await load();
      show(
        'success',
        operation === 'test'
          ? 'Connection verified'
          : 'Provider disconnected',
        operation === 'test'
          ? 'SaMi reached the provider successfully. This checks the merchant API connection; webhook verification is tracked separately after a signed provider event reaches SaMi.'
          : 'The provider credentials were removed from SaMi and automatic reconciliation was stopped.',
      );
    } catch (error) {
      show(
        'error',
        operation === 'test'
          ? 'Connection check failed'
          : 'Disconnect failed',
        error instanceof Error
          ? error.message
          : 'Payment provider action failed.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      show(
        'success',
        'Copied',
        'The value is ready to paste into your payment provider.',
      );
    } catch {
      show(
        'warning',
        'Copy unavailable',
        'Select the value and copy it manually.',
      );
    }
  }

  const connectedCount =
    state?.connections.filter(
      connection => connection.status === 'connected',
    ).length || 0;

  const verifiedWebhookCount =
    state?.connections.filter(
      connection =>
        connection.status === 'connected' &&
        connection.callbackVerified,
    ).length || 0;

  const latestPayment = [...(state?.connections || [])]
    .filter(connection => connection.lastReceivedAt)
    .sort(
      (a, b) =>
        new Date(b.lastReceivedAt || 0).getTime() -
        new Date(a.lastReceivedAt || 0).getTime(),
    )[0]?.lastReceivedAt || null;

  return (
    <div className="space-y-4">
      <section className="sami-surface rounded-[24px] p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
              <ShieldCheck className="h-4 w-4" />
              Automatic invoice payments
            </div>
            <h2 className="mt-2 text-xl font-black tracking-[-0.03em] sm:text-2xl">
              Connect the account where your customers pay
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500 dark:text-slate-400">
              Choose your payment company, enter the credentials it gives your business, and let SaMi handle the technical connection. Successful payments can then be matched to invoices and posted through the protected invoicing and accounting flow.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl border border-[var(--sami-border)] px-3 text-xs font-bold disabled:opacity-50"
          >
            <RefreshCw
              className={[
                'h-4 w-4',
                loading ? 'animate-spin' : '',
              ].join(' ')}
            />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Connected providers"
            value={loading ? 'Checking…' : String(connectedCount)}
            detail="Payment accounts connected to this company"
          />
          <SummaryCard
            label="Verified webhooks"
            value={
              connectedCount > 0
                ? verifiedWebhookCount + '/' + connectedCount
                : 'None yet'
            }
            detail="A webhook becomes verified only after SaMi receives and validates a signed provider event"
          />
          <SummaryCard
            label="Latest provider payment"
            value={latestPayment ? formatDate(latestPayment) : 'None yet'}
            detail="Most recent verified notification received by SaMi"
          />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(state?.providers || []).map(provider => {
          const connection = connections.get(provider.key) || null;
          const connected = connection?.status === 'connected';
          return (
            <article
              key={provider.key}
              className="sami-surface flex min-h-[260px] flex-col rounded-[22px] p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--sami-surface-soft)] text-blue-600 dark:text-blue-300">
                    <ProviderIcon provider={provider.key} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black">
                      {provider.name}
                    </h3>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      {provider.countries.join(' · ')}
                    </p>
                  </div>
                </div>
                <span
                  className={[
                    'rounded-full border px-2.5 py-1 text-[10px] font-black',
                    statusTone(connection),
                  ].join(' ')}
                >
                  {connected
                    ? connection.healthStatus === 'healthy'
                      ? connection.manualSetupRequired &&
                        !connection.callbackConfigured
                        ? 'Setup step'
                        : 'Connected'
                      : 'Attention'
                    : 'Not connected'}
                </span>
              </div>

              <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {provider.description}
              </p>

              {connection ? (
                <div className="mt-4 rounded-2xl bg-[var(--sami-surface-soft)] p-3 text-[11px] leading-5">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">
                      Mode
                    </span>
                    <span className="font-bold">
                      {connection.environment === 'live'
                        ? 'Live'
                        : 'Test'}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">
                      Webhook
                    </span>
                    <span className="text-right font-bold">
                      {!connection.callbackConfigured
                        ? 'Setup required'
                        : connection.callbackVerified
                          ? 'Verified'
                          : 'Configured · awaiting event'}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">
                      Last verified event
                    </span>
                    <span className="text-right font-bold">
                      {connection.callbackVerifiedAt
                        ? formatDate(connection.callbackVerifiedAt)
                        : 'None yet'}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">
                      Last API check
                    </span>
                    <span className="text-right font-bold">
                      {connection.lastHealthCheckAt
                        ? formatDate(connection.lastHealthCheckAt)
                        : 'Not checked'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl bg-[var(--sami-surface-soft)] p-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  {provider.setupNote}
                </div>
              )}

              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {!connected ? (
                  <button
                    type="button"
                    onClick={() => openProvider(provider)}
                    disabled={loading || !state?.canManage}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
                  >
                    <CreditCard className="h-4 w-4" />
                    Connect
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void connectionAction(connection, 'test')
                      }
                      disabled={busy !== null || !state?.canManage}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-50"
                    >
                      {busy === 'test:' + connection.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Activity className="h-4 w-4" />}
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void connectionAction(connection, 'disconnect')
                      }
                      disabled={busy !== null || !state?.canManage}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 text-xs font-black text-rose-600 disabled:opacity-50 dark:border-rose-500/20 dark:text-rose-300"
                    >
                      {busy === 'disconnect:' + connection.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Unplug className="h-4 w-4" />}
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="sami-surface rounded-[22px] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <h3 className="text-sm font-black">
              What happens after a provider is connected
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              SaMi keeps long-term merchant credentials encrypted on the server, obtains temporary access tokens when a provider requires them, verifies incoming payment notifications, prevents duplicate posting, matches the invoice reference, records full or partial payment, and sends the result through the existing accounting posting flow.
            </p>
          </div>
        </div>
      </section>

      {selected ? (
        <div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !busy) {
              setSelected(null);
              setManualSetup(null);
              setManualConnectionId(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={'Connect ' + selected.name}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] border border-slate-200 bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
                  Connect payment account
                </p>
                <h3 className="mt-1 text-xl font-black">
                  {selected.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!busy) {
                    setSelected(null);
                    setManualSetup(null);
                    setManualConnectionId(null);
                  }
                }}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!manualSetup ? (
              <>
                <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {selected.setupNote}
                </p>

                {selected.environments.length > 1 ? (
                  <div className="mt-5">
                    <label className="text-xs font-black">
                      Connection mode
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {selected.environments.map(mode => (
                        <button
                          type="button"
                          key={mode}
                          onClick={() => setEnvironment(mode)}
                          className={[
                            'rounded-xl border px-3 py-3 text-xs font-black',
                            environment === mode
                              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200'
                              : 'border-[var(--sami-border)]',
                          ].join(' ')}
                        >
                          {mode === 'live'
                            ? 'Live payments'
                            : 'Test / Sandbox'}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 space-y-4">
                  {selected.fields.map(field => (
                    <label
                      key={field.key}
                      className="block"
                    >
                      <span className="text-xs font-black">
                        {field.label}
                      </span>
                      {field.type === 'select' ? (
                        <select
                          value={credentials[field.key] || ''}
                          onChange={event =>
                            setCredentials(currentValues => ({
                              ...currentValues,
                              [field.key]: event.target.value,
                            }))
                          }
                          className="mt-2 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm outline-none transition focus:border-blue-500"
                        >
                          {(field.options || []).map(option => (
                            <option
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type}
                          value={credentials[field.key] || ''}
                          autoComplete="off"
                          placeholder={field.placeholder}
                          onChange={event =>
                            setCredentials(currentValues => ({
                              ...currentValues,
                              [field.key]: event.target.value,
                            }))
                          }
                          className="mt-2 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm outline-none transition focus:border-blue-500"
                        />
                      )}
                      <span className="mt-1 block text-[10px] leading-4 text-slate-400">
                        {field.help}
                      </span>
                    </label>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl bg-[var(--sami-surface-soft)] p-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  Your saved merchant secrets are encrypted and are never returned to the browser after connection.
                </div>

                <button
                  type="button"
                  onClick={() => void connect()}
                  disabled={busy !== null}
                  className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
                >
                  {busy === 'connect:' + selected.key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Connect &amp; Test
                </button>
              </>
            ) : (
              <>
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <p className="text-sm font-black text-amber-900 dark:text-amber-100">
                    One final setup step
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-800/80 dark:text-amber-200/80">
                    {manualSetup.instructions}
                  </p>
                </div>

                <CopyValue
                  label="Payment notification URL"
                  value={manualSetup.callbackUrl}
                  onCopy={copy}
                />

                {manualSetup.verificationValue ? (
                  <CopyValue
                    label="Verification value"
                    value={manualSetup.verificationValue}
                    onCopy={copy}
                  />
                ) : null}

                <button
                  type="button"
                  onClick={() => void confirmManualSetup()}
                  disabled={
                    busy !== null ||
                    !manualConnectionId
                  }
                  className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
                >
                  {busy === 'confirm:' + manualConnectionId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  I have saved it
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <SaMiOverlay
        open={overlay.open}
        type={overlay.type}
        title={overlay.title}
        message={overlay.message}
        onClose={() => setOverlay(CLOSED_OVERLAY)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl bg-[var(--sami-surface-soft)] p-3.5">
      <p className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-black">
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
        {detail}
      </p>
    </div>
  );
}

function CopyValue({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (value: string) => Promise<void>;
}) {
  return (
    <div className="mt-4">
      <p className="text-xs font-black">
        {label}
      </p>
      <div className="mt-2 flex items-start gap-2 rounded-xl border border-[var(--sami-border)] p-3">
        <code className="min-w-0 flex-1 break-all text-[10px] leading-5">
          {value}
        </code>
        <button
          type="button"
          onClick={() => void onCopy(value)}
          className="shrink-0 rounded-lg p-2 hover:bg-[var(--sami-surface-soft)]"
          aria-label={'Copy ' + label}
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
