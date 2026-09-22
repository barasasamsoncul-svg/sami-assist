export type DependencyNode = {
  key:
    string;
};

function normalizeKey(
  value:
    unknown,
) {
  return typeof value ===
    'string'
    ? value
        .trim()
        .toLowerCase()
    : '';
}

export async function resolveRequiredDependencyPlan<
  T extends
    DependencyNode
>({
  rootKeys,
  load,
  dependencies,
}: {
  rootKeys:
    string[];
  load:
    (
      key:
        string,
    ) =>
      Promise<T>;
  dependencies:
    (
      node:
        T,
    ) =>
      string[];
}) {
  const ordered:
    T[] = [];

  const resolved =
    new Set<string>();

  const visiting =
    new Set<string>();

  async function visit(
    rawKey:
      string,
  ) {
    const key =
      normalizeKey(
        rawKey,
      );

    if (
      !key ||
      resolved.has(
        key,
      )
    ) {
      return;
    }

    if (
      visiting.has(
        key,
      )
    ) {
      throw new Error(
        `Required module dependency cycle detected at "${key}".`,
      );
    }

    visiting.add(
      key,
    );

    const node =
      await load(
        key,
      );

    for (
      const dependency
      of dependencies(
        node,
      )
    ) {
      await visit(
        dependency,
      );
    }

    visiting.delete(
      key,
    );

    resolved.add(
      key,
    );

    ordered.push(
      node,
    );
  }

  for (
    const rootKey
    of rootKeys
  ) {
    await visit(
      rootKey,
    );
  }

  return ordered;
}
