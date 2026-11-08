// Entry point of the answer page (index.html): see answer.js.
import { start } from "./answer.js";

start({
  document,
  location: window.location,
  fetch: (url, init) => window.fetch(url, init),
});
