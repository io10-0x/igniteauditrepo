// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

contract ValidatorRewarderStorage {
    /// @notice The QI token
    IERC20Upgradeable public qi;

    /// @notice The Ignite contract address
    address public ignite;

    /// @notice Target APR (bps)
    uint public targetApr;
}
