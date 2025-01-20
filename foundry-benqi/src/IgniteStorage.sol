// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/contracts/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/utils/structs/EnumerableSetUpgradeable.sol"; //q there are no access controls in this contract so anyone can add or remove from the set

import "./IStakedAvax.sol";
import "./IPriceFeed.sol"; //c standard chainlink price oracle stuff (need to make sure they check updatedAt variable)
import "./ValidatorRewarder.sol";

//c this is a contract that is inherited from by Ignite.sol and ValidatorRewarder.sol. All the variables will be stored on the proxy contract
contract IgniteStorage {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    /// @dev List of all supported ERC-20 payment options for the fee model
    EnumerableSetUpgradeable.AddressSet paymentTokens;

    /// @dev Chainlink price feeds for each payment option
    mapping(address => IPriceFeed) public priceFeeds;

    /// @dev Max Chainlink price feed response age for each token
    mapping(address => uint) public maxPriceAges; //q why are there different maxPriceAges for different tokens?

    struct TokenDepositDetails {
        /// @dev AVAX deposit amount
        uint avaxAmount;
        /// @dev Address of the deposited ERC-20 token (optional)
        address token;
        /// @dev Amount of the deposited ERC-20 token (must be zero if no token address is given)
        uint tokenAmount;
    }

    struct Registration {
        /// @dev The user who registered the node ID in Ignite
        address registerer;
        /// @dev The node ID
        string nodeId;
        /// @dev The requested validation duration in seconds
        uint validationDuration;
        /// @dev True if the registration was set up by paying a fee
        bool feePaid;
        /// @dev AVAX and ERC-20 token deposit amounts
        TokenDepositDetails tokenDeposits;
        /// @dev The amount of AVAX rewarded to the validator
        uint rewardAmount;
        /// @dev The percentage (in bps) of QI that can be slashed for this registration
        uint qiSlashPercentage; //c scaling factor is constant at 10000 and cant be changed
        /// @dev The percentage (in bps) of AVAX that can be slashed for this registration
        uint avaxSlashPercentage; //c as per releaselockedtokens function in ignite.sol, if the msg.value passed into that function is the same as the avax amount variable in the TokenDepositDetails,
        //it means that the validator was misbehaving and will be slashed by this percentage. if the validator behaved properly, then the msg.value sent to that function should be more than the avax amount
        /// @dev Whether or not the validator has been slashed
        bool slashed;
        /// @dev Whether or not the registration has expired and the tokens can be withdrawn
        bool withdrawable; //q there is probably a bug here
    }

    /// @dev The sAVAX contract
    IStakedAvax public sAVAX;

    /// @dev The QI token contract
    IERC20Upgradeable public qi;

    /// @dev An array of all registrations
    Registration[] public registrations; //q isnt this a waste of memory, why not use a mapping to map the registrar to the registration?

    /// @dev Node ID to registrations array index
    mapping(string => uint) public registrationIndicesByNodeId;

    /// @dev Registered node IDs per account
    mapping(address => string[]) public registeredNodeIdsByAccount; //q why is this info needed?

    /// @dev Node ID to registeredNodeIdsByAccount index
    mapping(string => uint) public accountRegistrationIndicesByNodeId; //c measures what number the node id is in the array of registered node ids

    /// @dev The total amount of AVAX that BENQI has subsidised for validation
    uint public totalSubsidisedAmount;

    /// @dev The maximum amount of AVAX that BENQI subsidises for validation
    uint public maximumSubsidisationAmount;

    /// @dev The amount QI (in bps) that can be slashed
    uint public qiSlashPercentage; //q why is this different for each registeration and then also stored as a global variable?
    //c this is okay to be a public variable because in ignite.sol, they would like to be able to change the qipercentage

    /// @dev The amount of AVAX (in bps) that can be slashed
    uint public avaxSlashPercentage; //q why is this different for each registeration and then also stored as a global variable?

    /// @dev The minimum contract AVAX balance that must not be subceeded
    uint public minimumContractBalance; //c what happens if contract balance goes below this amount? this is an invariant and I need to write an invariant suite for this

    /// @dev The minimum amount of AVAX needed to register a validator
    uint public minimumAvaxDeposit;

    /// @dev The maximum amount of AVAX that can be used to register a validator
    uint public maximumAvaxDeposit;

    /// @dev Price multiplier used for fee payments in QI (in bps)
    uint public qiPriceMultiplier; //c need to look at how this is used in the code

    /// @dev BLS proof of possession for registered nodes
    mapping(string => bytes) public blsProofOfPossessionByNodeId;

    /// @dev Rewarder contract for extra QI validation rewards
    ValidatorRewarder public validatorRewarder;

    /// @dev Whether or not a validator should be eligible for extra QI rewards after expiry
    mapping(string => bool) public qiRewardEligibilityByNodeId; //q what is the criteria for this
}
