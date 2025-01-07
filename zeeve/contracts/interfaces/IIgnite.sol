// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IIgnite {
    function registerWithPrevalidatedQiStake(
        address user,
        string calldata nodeId,
        bytes calldata blsProofOfPossession,
        uint validationDuration,
        uint qiAmount
    ) external;

    function getRegistrationFee(uint validationDuration) external view returns (uint);
    function registrationIndicesByNodeId(string calldata nodeId) external view returns (uint);
}
