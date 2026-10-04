'use client';

import {
  Check,
  Copy,
} from 'lucide-react';

import {
  isValidElement,
  useState,
  type ReactNode,
} from 'react';

import ReactMarkdown, {
  type Components,
} from 'react-markdown';

function nodeText(
  node:
    ReactNode,
): string {
  if (
    typeof node ===
      'string' ||
    typeof node ===
      'number'
  ) {
    return String(
      node,
    );
  }

  if (
    Array.isArray(
      node,
    )
  ) {
    return node
      .map(
        nodeText,
      )
      .join('');
  }

  if (
    isValidElement<{
      children?:
        ReactNode;
    }>(
      node,
    )
  ) {
    return nodeText(
      node.props
        .children,
    );
  }

  return '';
}

function languageLabel(
  node:
    ReactNode,
) {
  if (
    !isValidElement<{
      className?:
        string;
    }>(
      node,
    )
  ) {
    return 'Code';
  }

  const className =
    node.props
      .className ||
    '';

  const match =
    className.match(
      /language-([\w+-]+)/,
    );

  if (
    !match?.[1]
  ) {
    return 'Code';
  }

  return match[1]
    .replace(
      /[-_]/g,
      ' ',
    )
    .toUpperCase();
}

async function copyText(
  value:
    string,
) {
  if (
    navigator.clipboard
      ?.writeText
  ) {
    await navigator
      .clipboard
      .writeText(
        value,
      );
    return;
  }

  const textarea =
    document.createElement(
      'textarea',
    );

  textarea.value =
    value;
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

function SamiCodeBlock({
  children,
}: {
  children?:
    ReactNode;
}) {
  const [
    copied,
    setCopied,
  ] =
    useState(false);

  const code =
    nodeText(
      children,
    ).replace(
      /\n$/,
      '',
    );

  const language =
    languageLabel(
      children,
    );

  async function copy() {
    try {
      await copyText(
        code,
      );

      setCopied(
        true,
      );

      window.setTimeout(
        () =>
          setCopied(
            false,
          ),
        1600,
      );
    } catch {
      setCopied(
        false,
      );
    }
  }

  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-slate-100 shadow-sm dark:border-white/10">
      <div className="flex h-10 items-center justify-between gap-3 border-b border-white/10 bg-white/[0.055] px-3.5">
        <span className="truncate text-[10px] font-semibold tracking-wide text-slate-400">
          {language}
        </span>

        <button
          type="button"
          onClick={() =>
            void copy()
          }
          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
          aria-label={
            copied
              ? 'Code copied'
              : 'Copy code'
          }
          title={
            copied
              ? 'Copied'
              : 'Copy code'
          }
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span>
            {copied
              ? 'Copied'
              : 'Copy'}
          </span>
        </button>
      </div>

      <pre className="sami-scrollbar overflow-x-auto p-4 text-[12px] leading-6 sm:text-[13px]">
        {children}
      </pre>
    </div>
  );
}

const components:
  Components = {
    h1({
      children,
    }) {
      return (
        <h1 className="mb-3 mt-6 text-xl font-bold tracking-[-0.02em] first:mt-0 sm:text-2xl">
          {children}
        </h1>
      );
    },

    h2({
      children,
    }) {
      return (
        <h2 className="mb-2.5 mt-6 text-lg font-bold tracking-[-0.015em] first:mt-0 sm:text-xl">
          {children}
        </h2>
      );
    },

    h3({
      children,
    }) {
      return (
        <h3 className="mb-2 mt-5 text-base font-bold tracking-tight first:mt-0">
          {children}
        </h3>
      );
    },

    h4({
      children,
    }) {
      return (
        <h4 className="mb-2 mt-4 text-sm font-bold first:mt-0">
          {children}
        </h4>
      );
    },

    p({
      children,
    }) {
      return (
        <p className="my-3 whitespace-normal leading-7 first:mt-0 last:mb-0">
          {children}
        </p>
      );
    },

    ol({
      children,
    }) {
      return (
        <ol className="my-3 ml-6 list-decimal space-y-2 pl-1 marker:font-semibold marker:text-slate-500 dark:marker:text-slate-400">
          {children}
        </ol>
      );
    },

    ul({
      children,
    }) {
      return (
        <ul className="my-3 ml-6 list-disc space-y-2 pl-1 marker:text-slate-500 dark:marker:text-slate-400">
          {children}
        </ul>
      );
    },

    li({
      children,
    }) {
      return (
        <li className="pl-1 leading-7">
          {children}
        </li>
      );
    },

    strong({
      children,
    }) {
      return (
        <strong className="font-bold text-slate-950 dark:text-white">
          {children}
        </strong>
      );
    },

    em({
      children,
    }) {
      return (
        <em className="italic">
          {children}
        </em>
      );
    },

    blockquote({
      children,
    }) {
      return (
        <blockquote className="my-4 rounded-r-xl border-l-4 border-slate-300 bg-slate-50 px-4 py-2 text-slate-600 dark:border-white/20 dark:bg-white/[0.04] dark:text-slate-300">
          {children}
        </blockquote>
      );
    },

    a({
      children,
      href,
    }) {
      return (
        <a
          href={
            href
          }
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-4 hover:text-blue-700 dark:text-blue-300 dark:decoration-blue-500/50 dark:hover:text-blue-200"
        >
          {children}
        </a>
      );
    },

    hr() {
      return (
        <hr className="my-6 border-0 border-t border-slate-200 dark:border-white/10" />
      );
    },

    pre({
      children,
    }) {
      return (
        <SamiCodeBlock>
          {children}
        </SamiCodeBlock>
      );
    },

    code({
      children,
      className,
    }) {
      const block =
        Boolean(
          className,
        ) ||
        nodeText(
          children,
        ).includes(
          '\n',
        );

      if (block) {
        return (
          <code
            className={[
              'font-mono text-inherit',
              className ||
                '',
            ].join(
              ' ',
            )}
          >
            {children}
          </code>
        );
      }

      return (
        <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800 dark:border-white/10 dark:bg-white/[0.08] dark:text-slate-100">
          {children}
        </code>
      );
    },

    table({
      children,
    }) {
      return (
        <div className="sami-scrollbar my-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
          <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
            {children}
          </table>
        </div>
      );
    },

    thead({
      children,
    }) {
      return (
        <thead className="bg-slate-50 dark:bg-white/[0.05]">
          {children}
        </thead>
      );
    },

    th({
      children,
    }) {
      return (
        <th className="border-b border-slate-200 px-3 py-2.5 font-bold text-slate-800 dark:border-white/10 dark:text-slate-100">
          {children}
        </th>
      );
    },

    td({
      children,
    }) {
      return (
        <td className="border-b border-slate-100 px-3 py-2.5 align-top text-slate-700 last:border-b-0 dark:border-white/[0.06] dark:text-slate-200">
          {children}
        </td>
      );
    },
  };

export default function SamiAiMarkdown({
  children,
}: {
  children:
    string;
}) {
  return (
    <div
      data-sami-ai-markdown="true"
      className="min-w-0 break-words text-[14px] leading-7 sm:text-[15px]"
    >
      <ReactMarkdown
        components={
          components
        }
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
