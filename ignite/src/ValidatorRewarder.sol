// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "./ValidatorRewarderStorage.sol";

/// @notice Thrown if a privileged function is called without appropriate access rights
error Unauthorized();

contract ValidatorRewarder is
    AccessControlUpgradeable,
    PausableUpgradeable,
    ValidatorRewarderStorage
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant ROLE_WITHDRAW = keccak256("ROLE_WITHDRAW");
    bytes32 public constant ROLE_PAUSE = keccak256("ROLE_PAUSE");
    bytes32 public constant ROLE_UNPAUSE = keccak256("ROLE_UNPAUSE");

    /// @notice Emitted when rewards are claimed
    event ClaimRewards(uint amount);

    /// @notice Emitted when the target APR is changed
    event NewTargetApr(uint oldTargetApr, uint newTargetApr);

    /// @notice Emitted when QI is withdrawn from the rewarder contract by an admin
    event Withdraw(uint amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Set the initial contract parameters
     * @param _qi The QI token address
     * @param _ignite The Ignite contract address
     * @param _targetApr Target QI reward APR (bps)
     * @param _admin Contract owner address
     */
    function initialize(
        address _qi,
        address _ignite,
        uint _targetApr,
        address _admin
    ) initializer public {
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);

        qi = IERC20Upgradeable(_qi);
        ignite = _ignite;
        targetApr = _targetApr;
    }

    /**
     * @notice Claim QI rewards after validation expiry
     * @param validationDuration Validation duration (seconds)
     * @param stakeAmount QI stake amount (18 decimals)
     */
    function claimRewards(uint validationDuration, uint stakeAmount) external whenNotPaused returns (uint) {
        if (msg.sender != ignite) {
            revert Unauthorized();
        }

        uint rewardAmount = _calculateRewardAmount(validationDuration, stakeAmount);

        qi.safeTransfer(msg.sender, rewardAmount);

        emit ClaimRewards(rewardAmount);

        return rewardAmount;
    }

    /**
     * @notice Claim QI rewards after validation expiry
     * @param validationDuration Validation duration (seconds)
     * @param stakeAmount QI stake amount (18 decimals)
     */
    function calculateRewardAmount(uint validationDuration, uint stakeAmount) external view returns (uint) {
        return _calculateRewardAmount(validationDuration, stakeAmount);
    }

    /**
     * @notice Claim QI rewards after validation expiry
     * @param validationDuration Validation duration (seconds)
     * @param stakeAmount QI stake amount (18 decimals)
     */
    function _calculateRewardAmount(uint validationDuration, uint stakeAmount) internal view returns (uint) {
        return stakeAmount * targetApr * validationDuration / 10_000 / 60 / 60 / 24 / 365;
    }

    /*
     * @notice Withdraw QI from the contract
     * @param amount QI amount
     */
    function withdraw(uint amount) external {
        if (!hasRole(ROLE_WITHDRAW, msg.sender)) {
            revert Unauthorized();
        }

        qi.safeTransfer(msg.sender, amount);

        emit Withdraw(amount);
    }

    /**
     * @notice Set the reward APR
     * @param newTargetApr New APR (bps)
     */
    function setTargetApr(uint newTargetApr) external {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert Unauthorized();
        }

        emit NewTargetApr(targetApr, newTargetApr);

        targetApr = newTargetApr;
    }

    /*
     * @notice Pause reward claims
     */
    function pause() external {
        if (!hasRole(ROLE_PAUSE, msg.sender)) {
            revert Unauthorized();
        }

        _pause();
    }

    /*
     * @notice Resume reward claims
     */
    function unpause() external {
        if (!hasRole(ROLE_PAUSE, msg.sender)) {
            revert Unauthorized();
        }

        _unpause();
    }
}
