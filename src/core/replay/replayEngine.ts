import { ReplaySession, ReplayEvent, StrategyComparison, LatencySensitivity } from "./types";
import { eventRecorder } from "./eventRecorder";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "replay");

export class ReplayEngine {
  /** Start recording a session */
  startRecording(sessionId: string): void {
    eventRecorder.start(sessionId);
  }

  /** Record an event */
  recordEvent(type: string, data: any): void {
    eventRecorder.record(type, data);
  }

  /** Stop recording and return events */
  stopRecording(): ReplayEvent[] {
    return eventRecorder.stop();
  }

  /** Load a replay session from file */
  loadSession(sessionId: string): ReplaySession | null {
    const filePath = path.join(DATA_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(l => l);
    const events: ReplayEvent[] = lines.map(l => JSON.parse(l));
    return {
      id: sessionId,
      date: new Date(events[0]?.timestamp || Date.now()).toISOString(),
      totalEvents: events.length,
      durationMs: events.length > 1 ? events[events.length - 1].timestamp - events[0].timestamp : 0,
      events,
    };
  }

  /** Replay events through a handler */
  replay(session: ReplaySession, handler: (event: ReplayEvent) => void): void {
    for (const event of session.events) {
      handler(event);
    }
  }

  /** Compare two strategies on the same replay session */
  compareStrategies(
    session: ReplaySession,
    baseline: (events: ReplayEvent[]) => number,
    newStrategy: (events: ReplayEvent[]) => number,
  ): StrategyComparison {
    const baseResult = baseline(session.events);
    const newResult = newStrategy(session.events);
    return {
      baselineCapture: Math.round(baseResult * 100) / 100,
      newCapture: Math.round(newResult * 100) / 100,
      difference: Math.round((newResult - baseResult) * 100) / 100,
      sampleSize: session.totalEvents,
    };
  }

  /** Measure latency sensitivity */
  measureLatencySensitivity(
    session: ReplaySession,
    strategy: (events: ReplayEvent[], addedMs: number) => number,
  ): LatencySensitivity[] {
    const delays = [0, 5, 10, 25];
    const baseResult = strategy(session.events, 0);
    return delays.map(d => {
      const result = strategy(session.events, d);
      return {
        addedMs: d,
        captureRate: Math.round(result * 100) / 100,
        delta: Math.round((result - baseResult) * 100) / 100,
      };
    });
  }

  getAvailableSessions(): string[] {
    if (!fs.existsSync(DATA_DIR)) return [];
    return fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".jsonl")).map(f => f.replace(".jsonl", ""));
  }

  reset(): void { eventRecorder.reset(); }
}

export const replayEngine = new ReplayEngine();
