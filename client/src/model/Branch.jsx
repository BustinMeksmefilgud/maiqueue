export class Branch {
    constructor(data) {
        this.branchCode = data.branchCode,
        this.branchName = data.branchName,
        this.cabinetCount = data.cabinetCount || 1
        this.status = data.status
    }
}