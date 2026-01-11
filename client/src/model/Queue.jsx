import { QueueStatus, BranchCode, QueueType } from "./Enums.jsx";

export class QueueItem {
  constructor(data) {
    this.id = data.id;

    // Who is in this session? (Array of User objects or UIDs)
    this.playerIds = data.players || [];
    this.playerNames = data.playerNames || []; 
    this.playerCount = data.playerCount || 0;


    // Status of the session
    this.status = Object.values(QueueStatus).includes(data.status)
      ? data.status
      : QueueStatus.QUEUED;
    this.branchId = Object.values(BranchCode).includes(data.branchId)
      ? data.branchId
      : BranchCode.SISA;
    this.type = Object.values(QueueType).includes(data.type)
      ? data.type
      : QueueType.SYNC;


    this.createdAt = data.createdAt?.toDate() || new Date();
    this.startedAt = data.startedAt?.toDate() || null; // Time game was started
    this.endedAt = data.endedAt?.toDate() || null; // Time game was ended
  }

  toFirestore() {
    return {
      id: this.id ?? null,
      players: this.playerIds ?? null,
      playerNames: this.playerNames ?? null,
      playerCount: this.playerCount ?? null,
      
      status: this.status ?? null,
      branchId: this.branchId ?? null,
      type: this.type ?? null,

      createdAt: this.createdAt ?? null, 
      startedAt: this.startedAt ?? null,
      endedAt: this.endedAt ?? null
    };
  }

  // Helper: How long did they wait? (For AI calculation)
  getWaitDuration() {
    if (!this.startedAt) return 0;
    return (this.startedAt - this.joinedAt) / 1000; // Returns seconds
  }
}