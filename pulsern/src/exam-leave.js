/* Home during a readiness exam. The form is taken once, so leaving has to
   submit the answers already moved past, wait until the server scores them,
   and wait until each scored item has updated ability, streak, and XP.
   Navigating before that drops the progress. A failed submit keeps the
   same answers for retry and must not be turned into a later, unrelated
   trip home. */
import { useCallback, useRef } from "react";

export function stepExamLeave(state, event) {
  const destination = state?.destination ?? null;
  if (event.type === "clear" || event.type === "abandon") {
    return { destination: null, callExit: false, navigate: null };
  }
  if (event.type === "scored") {
    return {
      destination: null,
      callExit: false,
      navigate: destination,
    };
  }
  if (event.type === "confirm") {
    if (event.exam) {
      return {
        destination: event.destination ?? "home",
        callExit: !!event.exitBound,
        navigate: null,
      };
    }
    return { destination: null, callExit: false, navigate: event.destination ?? "home" };
  }
  return { destination, callExit: false, navigate: null };
}

export function useExamHomeExit(applyLeave) {
  const applyRef = useRef(applyLeave);
  applyRef.current = applyLeave;
  const destinationRef = useRef(null);
  const exitRef = useRef(null);
  const bindExit = useCallback((fn) => { exitRef.current = typeof fn === "function" ? fn : null; }, []);
  const confirm = useCallback((exam, destination) => {
    const next = stepExamLeave(
      { destination: destinationRef.current },
      { type: "confirm", exam: !!exam, destination, exitBound: typeof exitRef.current === "function" },
    );
    destinationRef.current = next.destination;
    if (next.callExit) exitRef.current();
    if (next.navigate) applyRef.current(next.navigate);
  }, []);
  const onScored = useCallback(() => {
    const next = stepExamLeave({ destination: destinationRef.current }, { type: "scored" });
    destinationRef.current = next.destination;
    if (next.navigate) applyRef.current(next.navigate);
  }, []);
  const onLeaveSubmit = useCallback(() => {
    destinationRef.current = stepExamLeave({ destination: destinationRef.current }, { type: "abandon" }).destination;
  }, []);
  const clear = useCallback(() => {
    destinationRef.current = stepExamLeave({ destination: destinationRef.current }, { type: "clear" }).destination;
  }, []);
  return { bindExit, confirm, onScored, onLeaveSubmit, clear };
}
