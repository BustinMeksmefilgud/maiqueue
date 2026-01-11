import { BranchCode } from "../model/Enums";

export default function BranchSwitcher({ currentBranch, onBranchChange }) {
    const branchLabels = {
        [BranchCode.SISA]: "SM Seaside",
        [BranchCode.JAMAL]: "SM Jmall"
    };

    const handleChange = async (e) => {
        const newBranch = e.target.value;
        onBranchChange(newBranch);
    };

    return (
        <div className="form-control w-full max-w-xs">
            <label className="label">
                <span className="label-text text-teal-200 text-xs">Current Branch</span>
            </label>

            <select
                className="select select-bordered select-sm w-full ps-3 bg-black/40 text-white"
                value={currentBranch} // Defaults to "Select..." if null
                onChange={handleChange}
            >

                {/* Generate options from your Enum */}
                <option value={BranchCode.SISA}>{branchLabels[BranchCode.SISA]}</option>
                <option value={BranchCode.JAMAL}>{branchLabels[BranchCode.JAMAL]}</option>
            </select>
        </div>
    );

}