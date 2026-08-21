/** DID ANYTHING WRITE TO SOURCE AFTER THE SIGNAL WAS DELIVERED?
 *
 * R9-03's recorded harm is "a Ctrl-C did not stop the harness … and three more
 * source files were rewritten after the signal". The drill measures that, and
 * for one round it measured a proxy for it instead — whether the crash marker
 * named a DIFFERENT path — which was blind for the first three entries because
 * they all mutate the same file (adversary finding R13-05).
 *
 * The comparison now lives here rather than inline in the drill, and the reason
 * is R14-06: I deleted all three of the drill's detection paths and it reported
 * PASS. The drill spawns a real harness, so it runs under its own runner and
 * never under `npm test` — which means nothing in the default suite could ever
 * prove its detector works. Every other checker in this tree carries a
 * red-proof; this one had none, and "the behavioural lock on R9-03 is the drill"
 * is written into three files.
 *
 * A pure function over a file map can be driven in the default suite, mutated,
 * and caught. The drill supplies the real files; this decides what counts. */

export interface PostSignalInputs {
  /** Absolute paths being watched. */
  readonly watch: Iterable<string>;
  /** Content at the instant the signal was delivered. */
  readonly atSignal: ReadonlyMap<string, string>;
  /** Pre-mutation content, per file, where known — restoring to this is the
   * point of the signal and is never a violation. */
  readonly originals: ReadonlyMap<string, string>;
  /** Reads current content, or returns null if the file cannot be read. */
  readonly read: (path: string) => string | null;
}

/** Files whose content is neither what it was at the signal nor the original
 * they are being restored to — i.e. somebody wrote after the signal. */
export function postSignalWrites(inputs: PostSignalInputs): string[] {
  const offenders: string[] = [];
  for (const file of inputs.watch) {
    const now = inputs.read(file);
    if (now === null) continue;
    if (now === inputs.atSignal.get(file)) continue;
    if (now === inputs.originals.get(file)) continue;
    offenders.push(file);
  }
  return offenders;
}
