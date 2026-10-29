// SPDX-License-Identifier: GPL-3.0-or-later
// Experimental test-only model. It is NOT a Media3 Player, Bridge, or app code.
// All events and the clock are explicitly driven by tests, not by Android.
const TYPES = new Set(["play", "pause", "next", "previous"]);

export class FakeWebPlayer {
  constructor(queue = ["a", "b", "c"], capacity = 128) {
    if (!queue.length) throw new Error("fixture queue must not be empty");
    this.queue = [...queue]; this.capacity = capacity; this.index = 0;
    this.epoch = null; this.usedEpochs = new Set(); this.revision = 0;
    this.generation = 0; this.playing = false; this.blocked = true;
    this.records = new Map(); this.pending = [];
  }
  attach(epoch) {
    if (typeof epoch !== "string" || !epoch || this.usedEpochs.has(epoch)) throw new Error("epoch must be unique");
    this.usedEpochs.add(epoch); this.epoch = epoch; this.revision = 0;
    this.generation++; this.playing = false; this.blocked = true;
    this.records.clear(); this.pending = [];
    return this.snapshot();
  }
  snapshot() {
    if (!this.epoch) throw new Error("not attached");
    return { epoch:this.epoch, revision:this.revision, generation:this.generation,
      playing:this.playing, blocked:this.blocked, track:this.queue[this.index] };
  }
  snapshotAfterChange() { this.revision++; return this.snapshot(); }
  // This simulates a separately authenticated explicit action, not a Bridge packet.
  allowExplicitStart() { this.blocked = false; return this.snapshotAfterChange(); }
  interrupt() {
    this.generation++; this.blocked = true; this.playing = false;
    for (const id of this.pending) this.records.get(id).status = "cancelled";
    this.pending = []; return this.snapshotAfterChange();
  }
  receive(command, now) {
    if (!command || command.epoch !== this.epoch) return { status:"wrong-epoch" };
    if (typeof command.id !== "string" || !command.id || !TYPES.has(command.type) ||
        !Number.isSafeInteger(command.generation) || !Number.isFinite(command.deadline) || !Number.isFinite(now)) return { status:"invalid" };
    const previous = this.records.get(command.id);
    if (previous) {
      const same = previous.command.type === command.type && previous.command.generation === command.generation && previous.command.deadline === command.deadline;
      return { status:same ? previous.status : "id-conflict" };
    }
    // Deliberately reject new IDs at capacity instead of evicting replay history.
    if (this.records.size >= this.capacity) return { status:"capacity" };
    const record = { command:{...command}, status:"pending" }; this.records.set(command.id, record);
    if (command.generation !== this.generation) { record.status = "stale"; return { status:record.status }; }
    if (now >= command.deadline) { record.status = "expired"; return { status:record.status }; }
    if (command.type !== "pause" && this.blocked) { record.status = "blocked"; return { status:record.status }; }
    if (command.type === "pause") {
      this.generation++; this.playing = false;
      for (const id of this.pending) this.records.get(id).status = "cancelled";
      this.pending = []; record.status = "done";
      return { status:"done", snapshot:this.snapshotAfterChange() };
    }
    this.pending.push(command.id); return { status:"pending" };
  }
  complete(id, now) {
    const record = this.records.get(id);
    if (!record || record.status !== "pending") return { status:record?.status || "unknown" };
    if (this.pending[0] !== id) return { status:"waiting" };
    this.pending.shift(); const c = record.command;
    if (c.epoch !== this.epoch || c.generation !== this.generation || this.blocked) record.status = "cancelled";
    else if (!Number.isFinite(now) || now >= c.deadline) record.status = "expired";
    else {
      if (c.type === "next") this.index = (this.index + 1) % this.queue.length;
      if (c.type === "previous") this.index = (this.index + this.queue.length - 1) % this.queue.length;
      this.playing = true; record.status = "done";
      return { status:"done", snapshot:this.snapshotAfterChange() };
    }
    return { status:record.status };
  }
  cancel(id) {
    const record = this.records.get(id);
    if (!record || record.status !== "pending") return false;
    record.status = "cancelled"; this.pending = this.pending.filter(p => p !== id); return true;
  }
}

export class FakeNativeProjection {
  constructor() { this.epoch = null; this.usedEpochs = new Set(); this.retired = true; this.revision = -1; this.generation = 0; this.available = false; this.playing = false; this.track = null; this.timedOut = new Set(); }
  attach(epoch) {
    if (typeof epoch !== "string" || !epoch || this.usedEpochs.has(epoch)) throw new Error("epoch must be unique");
    this.usedEpochs.add(epoch); this.epoch = epoch; this.retired = false; this.revision = -1; this.generation = 0; this.available = false; this.playing = false; this.track = null; this.timedOut.clear();
  }
  accept(snapshot, commandId = null) {
    if (this.retired || !snapshot || snapshot.epoch !== this.epoch || (commandId && this.timedOut.has(commandId)) ||
        !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || snapshot.revision <= this.revision ||
        !Number.isSafeInteger(snapshot.generation) || snapshot.generation < this.generation ||
        typeof snapshot.playing !== "boolean" || typeof snapshot.blocked !== "boolean" ||
        (snapshot.playing && snapshot.blocked) || typeof snapshot.track !== "string" || !snapshot.track) return false;
    this.revision = snapshot.revision; this.generation = snapshot.generation;
    this.available = true; this.playing = !!snapshot.playing; this.track = snapshot.track; return true;
  }
  // A failed/retired connection cannot revive itself with a delayed snapshot.
  unavailable() { this.retired = true; this.available = false; this.playing = false; this.track = null; }
  timeout(id) { this.timedOut.add(id); this.unavailable(); }
}
