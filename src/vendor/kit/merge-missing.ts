// vendored from code-kit@0.34.0, src/ts/pure/merge-missing.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Sets the keys of `values` that `frontmatter` does not have yet, and leaves every key that is there. Returns the keys it wrote,
 *  in the order of `values`. Mutates `frontmatter` — the shape `processFrontMatter` hands over.
 *
 *  Origin: health-vitals `src/obsidian/daily-note.ts` (`mergeMissing`, unexported there, reported as a kit candidate): a daily
 *  note's `health_*` fields are filled once a day, and a value the user typed or corrected must not be reset. So **present means
 *  has the key**, whatever the value: `0`, `""`, `null`, `false` all stay (YAML `key:` reads as `null`).
 *
 *  Three differences from the original, each a hole there: (1) present is `Object.hasOwn`, not `key in frontmatter` — a key named
 *  `toString` or `constructor` counted as present because every object inherits it, and was never written; (2) a value of
 *  `undefined` is nothing to write (the original would have added a key with no value); (3) the key is defined, not assigned,
 *  so a `__proto__` key becomes an own key and never reaches the prototype. Values may be of any type.
 *
 *  Not atomic on a foreign object: if `frontmatter` refuses a write (frozen, a proxy that throws), the keys before it are written and
 *  the call throws, as the original did. `processFrontMatter` hands over a plain object, where that cannot happen.
 *
 *  Pure, no I/O; linear in the number of keys. */
export function mergeMissing(frontmatter: Record<string, unknown>, values: Record<string, unknown>): string[] {
  const written: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || Object.hasOwn(frontmatter, key)) continue;
    Object.defineProperty(frontmatter, key, { value, writable: true, enumerable: true, configurable: true });
    written.push(key);
  }
  return written;
}
