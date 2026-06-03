import { emitters } from "backtest-kit";
import { BehaviorSubject, singleshot } from "functools-kit";

const getEntrySubject = singleshot(() => {
  const entrySubject: BehaviorSubject<string> = emitters["entrySubject"];
  if (entrySubject) {
    return entrySubject;
  }
  return new BehaviorSubject<string>();
});

export { getEntrySubject };
