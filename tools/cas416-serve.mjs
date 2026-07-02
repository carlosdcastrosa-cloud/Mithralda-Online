// CAS-416 — hold a local static server open for audit runs against the working tree.
import { startServer } from "./harness.mjs";
const { url } = await startServer();
console.log(url);
setInterval(() => {}, 60000); // hold open; killed by the caller
