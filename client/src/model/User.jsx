import { UserStatus, BranchCode, PlayStyle } from "./Enums.jsx";

export class User {
  constructor(data) {
    this.uid = data.uid || null;
    this.email = data.email || "";
    this.username = data.username || "Guest";
    
    // Status Logic
    this.status = Object.values(UserStatus).includes(data.status) 
      ? data.status 
      : UserStatus.OFFLINE;
    this.branchId = Object.values(BranchCode).includes(data.branchId) 
      ? data.branchId 
      : BranchCode.SISA; 

    // Queue Logic
    this.currentQueueId = data.currentQueueId || null;
    
    // Stats for AI / Matchmaking
    this.rank = Number(data.rank) || 0;
    this.playStyle = Object.values(PlayStyle).includes(data.playStyle) 
      ? data.playStyle 
      : PlayStyle.CASUAL;

    this.isAdmin = data.isAdmin || false;
    this.isGuest = data.isGuest || false;
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    if (this.isGuest) {
      this.addedBy = data.addedBy || null;
    } else {
      this.addedBy = null;
    }
  }

  toFirestore() {
    return {
      uid: this.uid ?? null,
      email: this.email ?? null,
      username: this.username ?? null,
      status: this.status ?? null,
      branchId: this.branchId ?? null,
      
      // Convert camelCase JS back to snake_case for Database
      currentQueueId: this.currentQueueId ?? null,
      rank: this.rank ?? null,
      playStyle: this.playStyle ?? null,
      
      isAdmin: this.isAdmin ?? null,
      isGuest: this.isGuest ?? null,
      createdAt: this.createdAt ?? null,
      addedBy: this.addedBy ?? null
    };
  }

  // Helper: Is this user busy?
  isBusy() {
    return this.status === UserStatus.IN_QUEUE || this.status === UserStatus.PLAYING;
  }
}