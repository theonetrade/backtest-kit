import { getEntrySubject } from "./emitters";

const main = () => {
  const entrySubject = getEntrySubject();
  entrySubject.subscribe((path) => console.log("Running", path));
};

main();
