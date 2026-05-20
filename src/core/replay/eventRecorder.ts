import { ReplayEvent } from "./types";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "replay");

export class EventRecorder {
  private events: ReplayEvent[] = [];
  private filePath = "";
  private recording = false;

  start(sessionId: string): void {
    this.events = [];
    this.recording = true;
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    this.filePath = path.join(DATA_DIR, `${sessionId}.jsonl`);
  }

  record(type: string, data: any): void {
    if (!this.recording) return;
    const event: ReplayEvent = { timestamp: Date.now(), type, data };
    this.events.push(event);
    try { fs.appendFileSync(this.filePath, JSON.stringify(event) + "\n"); } catch {}
  }

  stop(): ReplayEvent[] {
    this.recording = false;
    return this.events;
  }

  getEvents(): ReplayEvent[] { return this.events; }

  reset(): void { this.events = []; this.recording = false; }
}

export const eventRecorder = new EventRecorder();
