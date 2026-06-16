type PathSegment = string | number | ((val: unknown) => boolean);
type TraversePath = PathSegment[];

export function traverse_obj(
  obj: unknown,
  ...paths: TraversePath[]
): unknown {
  for (const path of paths) {
    const result = walkPath(obj, path);
    if (result !== undefined) return result;
  }
  return undefined;
}

function walkPath(obj: unknown, path: TraversePath): unknown {
  let current: unknown = obj;

  for (const segment of path) {
    if (current === null || current === undefined) return undefined;

    if (typeof segment === "function") {
      if (!segment(current)) return undefined;
      continue;
    }

    if (typeof segment === "number") {
      if (Array.isArray(current)) {
        current = current[segment];
      } else {
        return undefined;
      }
      continue;
    }

    if (typeof segment === "string") {
      if (segment === "...") {
        return deepSearch(current, path.slice(path.indexOf(segment) + 1));
      }

      if (typeof current === "object" && current !== null) {
        current = (current as Record<string, unknown>)[segment];
      } else {
        return undefined;
      }
      continue;
    }
  }

  return current;
}

function deepSearch(obj: unknown, remainingPath: TraversePath): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj !== "object") return undefined;

  const result = walkPath(obj, remainingPath);
  if (result !== undefined) return result;

  const values = Array.isArray(obj) ? obj : Object.values(obj);
  for (const value of values) {
    if (typeof value === "object" && value !== null) {
      const found = deepSearch(value, remainingPath);
      if (found !== undefined) return found;
    }
  }

  return undefined;
}
