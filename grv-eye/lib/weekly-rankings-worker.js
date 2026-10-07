import { parentPort, workerData } from "node:worker_threads";
import { createWeeklyRankings } from "./weekly-rankings.js";

let rankings;
try {
  rankings = createWeeklyRankings(workerData);
  const data = rankings.getRankings(true);
  parentPort.postMessage({ ok: true, data });
} catch (error) {
  parentPort.postMessage({ ok: false, error: String(error?.message || error) });
} finally {
  rankings?.close();
}
