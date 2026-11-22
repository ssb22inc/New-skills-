import { useEffect } from "react";

/* Latest report wins. A child unmounting in the same commit must not wipe
   the session the next screen just reported. */
let reportGeneration = 0;

export function useSessionReport(onSession, snapshot) {
  const exam = !!snapshot?.exam;
  const inSession = !!snapshot?.inSession || exam;
  const hasDraft = !!snapshot?.hasDraft;
  useEffect(() => {
    const token = ++reportGeneration;
    onSession?.({ exam, inSession, hasDraft });
    return () => {
      if (reportGeneration === token) onSession?.({ exam: false, inSession: false, hasDraft: false });
    };
  }, [onSession, exam, inSession, hasDraft]);
}
