import "./config/setup.mjs";
import { run } from "worker-testbed";
import "./spec/measute.test.mjs";
run(import.meta.url, () => { console.log("__DONE__"); process.exit(0); });
