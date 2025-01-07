// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "./IgniteStorage.sol";
import "./IPriceFeed.sol";
import "./IStakedAvax.sol";
import "./ValidatorRewarder.sol";


contract Ignite is
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    IgniteStorage
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeERC20Upgradeable for IERC20MetadataUpgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    bytes32 public constant ROLE_WITHDRAW = keccak256("ROLE_WITHDRAW");
    bytes32 public constant ROLE_REGISTER_WITHOUT_COLLATERAL = keccak256("ROLE_REGISTER_WITHOUT_COLLATERAL");
    bytes32 public constant ROLE_RELEASE_LOCKED_TOKENS = keccak256("ROLE_RELEASE_LOCKED_TOKENS");
    bytes32 public constant ROLE_PAUSE = keccak256("ROLE_PAUSE");
    bytes32 public constant ROLE_UNPAUSE = keccak256("ROLE_UNPAUSE");
    bytes32 public constant ROLE_REGISTER_WITH_FLEXIBLE_PRICE_CHECK = keccak256("ROLE_REGISTER_WITH_FLEXIBLE_PRICE_CHECK");

    uint public constant VALIDATION_DURATION_TWO_WEEKS = 86400 * 7 * 2;
    uint public constant VALIDATION_DURATION_FOUR_WEEKS = 86400 * 7 * 4;
    uint public constant VALIDATION_DURATION_EIGHT_WEEKS = 86400 * 7 * 8;
    uint public constant VALIDATION_DURATION_TWELVE_WEEKS = 86400 * 7 * 12;
    uint public constant VALIDATION_DURATION_ONE_YEAR = 86400 * 365;

    address public constant AVAX = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address public constant FEE_RECIPIENT = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;
    address public constant SLASHED_TOKEN_RECIPIENT = 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB;

    /// @dev Emitted when a user request validation to be started for a node
    event NewRegistration(
        address registerer,
        string nodeId,
        bytes blsProofOfPossession,
        uint validationDuration,
        bool feePaid,
        uint avaxAmount,
        address token,
        uint tokenAmount
    );

    /// @dev Emitted when a registration is removed from the array of registrations
    event RegistrationDeleted(string nodeId);

    /// @dev Emitted when AVAX is withdrawn from the contract for validation
    event Withdraw(uint amount);

    /// @dev Emitted when a validator is slashed for misbehaving
    event ValidatorSlashed(string nodeId, uint qiAmount, uint avaxAmount);

    /// @dev Emitted when the validation period for a node expires and the tokens are redeemable
    event RegistrationExpired(string nodeId);

    /// @dev Emitted when a user redeems their tokens after validation expiry or failed validation start attempt
    event Redeem(string nodeId, uint avaxAmount, address token, uint tokenAmount);

    /// @dev Emitted when a validator is rewarded
    event ValidatorRewarded(string nodeId, uint amount);

    /// @dev Emitted when QI slash percentage is updated
    event QiSlashPercentageChanged(uint oldPercentage, uint newPercentage);

    /// @dev Emitted when AVAX slash percentage is updated
    event AvaxSlashPercentageChanged(uint oldPercentage, uint newPercentage);

    /// @dev Emitted when the maximum protocol AVAX subsidisation amount is updated
    event MaximumSubsidisationAmountChanged(
        uint oldMaximumSubsidisationAmount,
        uint newMaximumSubsidisationAmount
    );

    /// @dev Emitted when a new fee payment option is added
    event PaymentTokenAdded(address token);

    /// @dev Emitted when an existing fee payment option is removed
    event PaymentTokenRemoved(address token);

    /// @dev Emitted when a price feed address is updated
    event PriceFeedChanged(
        address token,
        address oldFeed,
        address newFeed,
        uint oldMaxPriceAge,
        uint newMaxPriceAge
    );

    /// @dev Emitted when the registration AVAX requirement is updated
    event AvaxDepositRangeUpdated(
        uint oldMinimumAvaxDeposit,
        uint newMinimumAvaxDeposit,
        uint oldMaximumAvaxDeposit,
        uint newMaximumAvaxDeposit
    );

    /// @dev Emitted when the QI price multiplier for fee payments is updated
    event QiPriceMultiplierUpdated(uint oldQiPriceMultiplier, uint newQiPriceMultiplier);


    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _sAVAX,
        address _qi,
        address _avaxPriceFeed,
        uint _maxAvaxPriceAge,
        address _qiPriceFeed,
        uint _maxQiPriceAge,
        uint _minimumAvaxDeposit,
        uint _maximumAvaxDeposit
    ) initializer public {
        require(_minimumAvaxDeposit <= _maximumAvaxDeposit);

        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        sAVAX = IStakedAvax(_sAVAX);
        qi = IERC20Upgradeable(_qi);

        _initialisePriceFeeds(_avaxPriceFeed, _maxAvaxPriceAge, _qi, _qiPriceFeed, _maxQiPriceAge);

        minimumAvaxDeposit = _minimumAvaxDeposit;
        maximumAvaxDeposit = _maximumAvaxDeposit;

        qiSlashPercentage = 5_000;
        maximumSubsidisationAmount = 50_000e18;

        qiPriceMultiplier = 10_000;

        registrations.push(
            Registration(
                address(0),
                "",
                0,
                false,
                TokenDepositDetails(
                    0,
                    address(0),
                    0
                ),
                0,
                0,
                0,
                false,
                false
            )
        );
    }

    function _initialisePriceFeeds(
        address _avaxPriceFeed,
        uint _maxAvaxPriceAge,
        address _qi,
        address _qiPriceFeed,
        uint _maxQiPriceAge
    ) internal onlyInitializing {
        IPriceFeed avaxPriceFeed = IPriceFeed(_avaxPriceFeed);
        IPriceFeed qiPriceFeed = IPriceFeed(_qiPriceFeed);

        priceFeeds[AVAX] = avaxPriceFeed;
        priceFeeds[_qi] = qiPriceFeed;

        maxPriceAges[AVAX] = _maxAvaxPriceAge;
        maxPriceAges[_qi] = _maxQiPriceAge;

        (, int256 avaxPrice, , uint avaxPriceUpdatedAt, ) = avaxPriceFeed.latestRoundData();
        require(avaxPrice > 0);
        require(block.timestamp - avaxPriceUpdatedAt <= _maxAvaxPriceAge);

        (, int256 qiPrice, , uint qiPriceUpdatedAt, ) = qiPriceFeed.latestRoundData();
        require(qiPrice > 0);
        require(block.timestamp - qiPriceUpdatedAt <= _maxQiPriceAge);
    }

    /**
     * @notice Register a new node for validation and lock up QI and AVAX
     * @param  nodeId Node ID of the validator
     * @param  blsProofOfPossession BLS proof of possession (public key + signature)
     * @param  validationDuration Duration of the validation in seconds
     */
    function registerWithStake(
        string calldata nodeId,
        bytes calldata blsProofOfPossession,
        uint validationDuration
    ) external payable nonReentrant {
        require(
            msg.value >= minimumAvaxDeposit &&
            msg.value <= maximumAvaxDeposit &&
            msg.value % 1e9 == 0,
            "Invalid value"
        );

        // Verify that the sender can receive AVAX
        (bool success, ) = msg.sender.call("");
        require(success);

        (, int256 avaxPrice, , uint avaxPriceUpdatedAt, ) = priceFeeds[AVAX].latestRoundData();
        (, int256 qiPrice, , uint qiPriceUpdatedAt, ) = priceFeeds[address(qi)].latestRoundData();

        require(qiPrice > 0 && avaxPrice > qiPrice);
        require(block.timestamp - avaxPriceUpdatedAt <= maxPriceAges[AVAX]);
        require(block.timestamp - qiPriceUpdatedAt <= maxPriceAges[address(qi)]);

        // QI deposit amount is 10 % (thus, note the divider) of the AVAX value
        // that BENQI subsidises for the validator.
        uint qiAmount = uint(avaxPrice) * (2000e18 - msg.value) / uint(qiPrice) / 10;

        require(qiAmount > 0);

        qi.safeTransferFrom(msg.sender, address(this), qiAmount);

        _registerWithChecks(
            msg.sender,
            nodeId,
            blsProofOfPossession,
            validationDuration,
            false,
            address(qi),
            qiAmount,
            false
        );
    }

    /**
     * @notice Register a node by paying a non-refundable fee in AVAX
     * @param  nodeId Node ID of the validator
     * @param  blsProofOfPossession BLS proof of possession (public key + signature)
     * @param  validationDuration Duration of the validation in seconds
     */
    function registerWithAvaxFee(
        string calldata nodeId,
        bytes calldata blsProofOfPossession,
        uint validationDuration
    ) external payable nonReentrant whenNotPaused {
        uint registrationFee = _getRegistrationFee(validationDuration);
        require(msg.value == registrationFee);

        // Verify that the sender can receive AVAX
        (bool success, ) = msg.sender.call("");
        require(success);

        // Fees cannot be withdrawn from the contract until the registration is released
        minimumContractBalance += registrationFee;

        _registerWithChecks(
            msg.sender,
            nodeId,
            blsProofOfPossession,
            validationDuration,
            true,
            address(0),
            0,
            false
        );
    }

    /**
     * @notice Register a node by paying a non-refundable fee in a supported ERC-20 token
     * @param  tokenAddress ERC-20 payment token address
     * @param  nodeId Node ID of the validator
     * @param  blsProofOfPossession BLS proof of possession (public key + signature)
     * @param  validationDuration Duration of the validation in seconds
     */
    function registerWithErc20Fee(
        address tokenAddress,
        string calldata nodeId,
        bytes calldata blsProofOfPossession,
        uint validationDuration
    ) external nonReentrant whenNotPaused {
        require(paymentTokens.contains(tokenAddress));

        IERC20MetadataUpgradeable token = IERC20MetadataUpgradeable(tokenAddress);

        (, int256 avaxPrice, , uint avaxPriceUpdatedAt, ) = priceFeeds[AVAX].latestRoundData();
        (, int256 tokenPrice, , uint tokenPriceUpdatedAt, ) = priceFeeds[tokenAddress].latestRoundData();

        require(avaxPrice > 0 && tokenPrice > 0);
        require(block.timestamp - avaxPriceUpdatedAt <= maxPriceAges[AVAX]);
        require(block.timestamp - tokenPriceUpdatedAt <= maxPriceAges[tokenAddress]);

        uint registrationFee = _getRegistrationFee(validationDuration);
        uint tokenAmount = uint(avaxPrice) * registrationFee / uint(tokenPrice) / 10 ** (18 - token.decimals());

        if (tokenAddress == address(qi)) {
            tokenAmount = tokenAmount * qiPriceMultiplier / 10_000;
        }

        require(tokenAmount > 0);

        token.safeTransferFrom(msg.sender, address(this), tokenAmount);

        _registerWithChecks(
            msg.sender,
            nodeId,
            blsProofOfPossession,
            validationDuration,
            true,
            tokenAddress,
            tokenAmount,
            false
        );
    }

    /**
     * @notice Register a new node for validation without locking up tokens
     * @param  nodeId Node ID of the validator
     * @param  blsProofOfPossession BLS proof of possession (public key + signature)
     * @param  validationDuration Duration of the validation in seconds
     */
    function registerWithoutCollateral(
        string calldata nodeId,
        bytes calldata blsProofOfPossession,
        uint validationDuration
    ) external {
        require(hasRole(ROLE_REGISTER_WITHOUT_COLLATERAL, msg.sender));
        require(
            validationDuration >= VALIDATION_DURATION_TWO_WEEKS &&
            validationDuration <= VALIDATION_DURATION_ONE_YEAR,
            "Invalid validation duration"
        );

        // Note that registering without collateral does not enforce the subsidisation cap
        // or the validation duration limits.
        _register(
            msg.sender,
            nodeId,
            blsProofOfPossession,
            validationDuration,
            false,
            address(0),
            0,
            false
        );
    }

    /**
     * @notice Register a new node with a prevalidated QI deposit amount
     * @param  beneficiary User on whose behalf the registration is made
     * @param  nodeId Node ID of the validator
     * @param  blsProofOfPossession BLS proof of possession (public key + signature)
     * @param  validationDuration Duration of the validation in seconds
     * @param  qiAmount The amount of QI that was staked
     */
    function registerWithPrevalidatedQiStake(
        address beneficiary,
        string calldata nodeId,
        bytes calldata blsProofOfPossession,
        uint validationDuration,
        uint qiAmount
    ) external {
        require(
            hasRole(ROLE_REGISTER_WITH_FLEXIBLE_PRICE_CHECK, msg.sender),
            "ROLE_REGISTER_WITH_FLEXIBLE_PRICE_CHECK"
        );

        (, int256 avaxPrice, , uint avaxPriceUpdatedAt, ) = priceFeeds[AVAX].latestRoundData();
        (, int256 qiPrice, , uint qiPriceUpdatedAt, ) = priceFeeds[address(qi)].latestRoundData();

        require(avaxPrice > 0 && qiPrice > 0);
        require(block.timestamp - avaxPriceUpdatedAt <= maxPriceAges[AVAX]);
        require(block.timestamp - qiPriceUpdatedAt <= maxPriceAges[address(qi)]);

        // 200 AVAX + 1 AVAX fee
        uint expectedQiAmount = uint(avaxPrice) * 201e18 / uint(qiPrice);

        require(qiAmount >= expectedQiAmount * 9 / 10);

        qi.safeTransferFrom(msg.sender, address(this), qiAmount);

        _registerWithChecks(
            beneficiary,
            nodeId,
            blsProofOfPossession,
            validationDuration,
            false,
            address(qi),
            qiAmount,
            true
        );
    }

    /**
     * @notice To be called after the validation period has expired and the staker
     *         wants to redeem their deposited tokens and potential rewards.
     * @param  nodeId Node ID of the validator
     */
    function redeemAfterExpiry(string calldata nodeId) external nonReentrant whenNotPaused {
        uint registrationIndex = registrationIndicesByNodeId[nodeId];
        require(registrationIndex != 0);

        Registration storage registration = registrations[registrationIndex];

        require(registration.registerer == msg.sender);
        require(registration.withdrawable);

        // If feePaid is true and the registration is withdrawable, it must have been released
        // with the failed flag set, meaning that the validator could not be started and the
        // fee should be refunded.
        if (registration.feePaid) {
            if (registration.tokenDeposits.avaxAmount > 0) {
                uint avaxDepositAmount = registration.tokenDeposits.avaxAmount;

                minimumContractBalance -= avaxDepositAmount;

                _deleteRegistration(nodeId);

                (bool success, ) = payable(msg.sender).call{ value: avaxDepositAmount }("");
                require(success);

                emit Redeem(nodeId, avaxDepositAmount, address(0), 0);
            } else {
                IERC20Upgradeable token = IERC20Upgradeable(registration.tokenDeposits.token);
                uint tokenDepositAmount = registration.tokenDeposits.tokenAmount;

                _deleteRegistration(nodeId);

                token.safeTransfer(msg.sender, tokenDepositAmount);

                emit Redeem(nodeId, 0, address(token), tokenDepositAmount);
            }

            return;
        }

        // tokenAmount is always denominated in QI tokens for stake model registrations
        uint qiDepositAmount = registration.tokenDeposits.tokenAmount;
        uint avaxDepositAmount = registration.tokenDeposits.avaxAmount;

        uint avaxRedemptionAmount;
        uint qiRedemptionAmount;

        // If a validator was slashed, the slash amount was already transferred to the
        // slashed token recipient. The remaining QI tokens are held in this contract.
        if (registration.slashed) {
            avaxRedemptionAmount = avaxDepositAmount - avaxDepositAmount * registration.avaxSlashPercentage / 10_000;
            qiRedemptionAmount = qiDepositAmount - qiDepositAmount * registration.qiSlashPercentage / 10_000;

            minimumContractBalance -= avaxRedemptionAmount;
        } else {
            avaxRedemptionAmount = avaxDepositAmount + registration.rewardAmount;
            qiRedemptionAmount = qiDepositAmount;

            if (qiRewardEligibilityByNodeId[nodeId]) {
                qiRedemptionAmount += validatorRewarder.claimRewards(
                    registration.validationDuration,
                    qiDepositAmount
                );
            }

            minimumContractBalance -= avaxRedemptionAmount;
        }

        _deleteRegistration(nodeId);

        qi.safeTransfer(msg.sender, qiRedemptionAmount);

        if (avaxRedemptionAmount > 0) {
            (bool success, ) = msg.sender.call{ value: avaxRedemptionAmount}("");
            require(success);
        }

        emit Redeem(nodeId, avaxRedemptionAmount, address(qi), qiRedemptionAmount);
    }

    /**
     * @notice Returns the number of registrations
     * @return Number of registrations
     */
    function getTotalRegistrations() external view returns (uint) {
        // Subtract 1 because the first registration is a dummy registration
        return registrations.length - 1;
    }

    /**
     * @notice Returns the number of available ERC-20 payment tokens for the fee model
     * @return Number of payment methods
     */
    function getTotalErc20PaymentMethods() external view returns (uint) {
        return paymentTokens.length();
    }

    /**
     * @notice Get a list of all supported ERC-20 payment token for the fee model
     * @return A list of supported payment token addresses
     */
    function getErc20PaymentMethods() external view returns (address[] memory) {
        return paymentTokens.values();
    }

    /**
     * @notice Returns an array of registrations made by the given account
     * @param  account Account to query
     * @param  from Index of the first registration to return (inclusive)
     * @param  to Index of the last registration to return (exclusive)
     * @return Array of registrations
     */
    function getRegistrationsByAccount(
        address account,
        uint from,
        uint to
    ) external view returns (Registration[] memory) {
        Registration[] memory accountRegistrations = new Registration[](to - from);

        for (uint i = from; i < to; ++i) {
            accountRegistrations[i - from] = registrations[registrationIndicesByNodeId[registeredNodeIdsByAccount[account][i]]];
        }

        return accountRegistrations;
    }

    /**
     * @notice Returns the number of registrations made by the given account
     * @param  account Account to query
     * @return Number of registrations
     */
    function getAccountRegistrationCount(address account) external view returns (uint) {
        return registeredNodeIdsByAccount[account].length;
    }

    /**
     * @notice Get the registration fee in AVAX for a given validation duration
     * @param  validationDuration Validation duration in seconds
     * @return Registration fee in AVAX
     */
    function getRegistrationFee(uint validationDuration) external view returns (uint) {
        return _getRegistrationFee(validationDuration);
    }

    /**
     * @notice Called to withdraw AVAX from the contract to start validation
     * @param  amount Amount of AVAX to be withdrawn
     */
    function withdraw(uint amount) external whenNotPaused {
        require(hasRole(ROLE_WITHDRAW, msg.sender));

        (bool success, ) = msg.sender.call{ value: amount }("");
        require(success);

        require(
            address(this).balance >= minimumContractBalance,
            "Withdrawal amount too big"
        );

        emit Withdraw(amount);
    }

    /**
     * @notice Called after the validation period has expired and the tokens become
     *         redeemable by the original staker.
     * @param  nodeId Node ID of the expired validator
     * @param  failed True if the validator could not be started, false otherwise
     */
    function releaseLockedTokens(
        string calldata nodeId,
        bool failed
    ) external payable whenNotPaused nonReentrant {
        require(hasRole(ROLE_RELEASE_LOCKED_TOKENS, msg.sender));

        uint registrationIndex = registrationIndicesByNodeId[nodeId];
        require(registrationIndex != 0);

        Registration storage registration = registrations[registrationIndex];

        require(!registration.withdrawable);

        emit RegistrationExpired(nodeId);

        // If the failed flag is set, this means that a validator could not be started for the
        // given node ID and the principal stake or fee should be returned to the user in whole.
        if (failed) {
            if (registration.feePaid) {
                require(msg.value == 0);

                totalSubsidisedAmount -= 2000e18;
            } else {
                require(
                    msg.value == registration.tokenDeposits.avaxAmount,
                    "Message value must match the AVAX deposit amount"
                );

                // Non-tokenised registrations do not count towards the subsidisation cap
                // nor can have a non-zero AVAX deposit and should be deleted immediately.
                if (registration.tokenDeposits.tokenAmount == 0) {
                    _deleteRegistration(nodeId);

                    return;
                } else {
                    minimumContractBalance += msg.value;
                    totalSubsidisedAmount -= 2000e18 - msg.value;
                    qiRewardEligibilityByNodeId[nodeId] = false;
                }
            }

            registration.withdrawable = true;

            return;
        }

        // If a fee was paid, the registration can be deleted immediately because
        // there is nothing for the user to claim afterwards.
        if (registration.feePaid) {
            require(msg.value == 0);

            totalSubsidisedAmount -= 2000e18;

            if (registration.tokenDeposits.avaxAmount > 0) {
                uint avaxDepositAmount = registration.tokenDeposits.avaxAmount;

                minimumContractBalance -= avaxDepositAmount;

                _deleteRegistration(nodeId);

                (bool success, ) = FEE_RECIPIENT.call{ value: avaxDepositAmount }("");
                require(success);
            } else {
                IERC20Upgradeable token = IERC20Upgradeable(registration.tokenDeposits.token);
                uint tokenDepositAmount = registration.tokenDeposits.tokenAmount;

                _deleteRegistration(nodeId);

                token.safeTransfer(FEE_RECIPIENT, tokenDepositAmount);
            }

            return;
        }

        // If a token deposit was not made, this is a registration by a privileged
        // account. These registrations cannot be rewarded nor can they be slashed.
        // Non-tokenised registrations do not count towards the subsidisation cap.
        if (registration.tokenDeposits.avaxAmount == 0 && registration.tokenDeposits.tokenAmount == 0) {
            require(msg.value == 0);

            _deleteRegistration(nodeId);

            return;
        }

        registration.withdrawable = true;

        totalSubsidisedAmount -= 2000e18 - registration.tokenDeposits.avaxAmount;

        if (qiRewardEligibilityByNodeId[nodeId]) {
            require(msg.value == 0);

            uint fee = registration.tokenDeposits.tokenAmount / 201;
            registration.tokenDeposits.tokenAmount -= fee;

            qi.safeTransfer(FEE_RECIPIENT, fee);

            emit ValidatorRewarded(nodeId, 0);
        } else if (msg.value > registration.tokenDeposits.avaxAmount) {
            uint rewards = msg.value - registration.tokenDeposits.avaxAmount;

            registration.rewardAmount = rewards;
            minimumContractBalance += msg.value;

            emit ValidatorRewarded(nodeId, rewards);
        } else {
            require(msg.value == registration.tokenDeposits.avaxAmount);

            registration.slashed = true;

            uint qiSlashAmount;
            uint avaxSlashAmount;

            if (registration.qiSlashPercentage > 0) {
                // tokenDeposits.tokenAmount is always denominated in QI for stake model registrations
                qiSlashAmount = registration.tokenDeposits.tokenAmount * registration.qiSlashPercentage / 10_000;

                qi.safeTransfer(SLASHED_TOKEN_RECIPIENT, qiSlashAmount);
            }

            if (registration.avaxSlashPercentage > 0) {
                avaxSlashAmount = registration.tokenDeposits.avaxAmount * registration.avaxSlashPercentage / 10_000;

                minimumContractBalance += msg.value - avaxSlashAmount;

                (bool success, ) = SLASHED_TOKEN_RECIPIENT.call{ value: avaxSlashAmount }("");
                require(success);
            } else {
                minimumContractBalance += msg.value;
            }

            emit ValidatorSlashed(nodeId, qiSlashAmount, avaxSlashAmount);
        }
    }

    /**
     * @notice Pause new registrations, withdrawals, releases, and redemptions.
     */
    function pause() external {
        require(hasRole(ROLE_PAUSE, msg.sender));

        _pause();
    }

    /**
     * @notice Resume new registrations, withdrawals, releses, and redemptions.
     */
    function unpause() external {
        require(hasRole(ROLE_UNPAUSE, msg.sender));

        _unpause();
    }

    /**
     * @notice Change the QI slash percentage
     * @param  newPercentage The new percentage in bps
     */
    function setQiSlashPercentage(uint newPercentage) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        require(newPercentage <= 10_000);

        uint oldPercentage = qiSlashPercentage;
        qiSlashPercentage = newPercentage;

        emit QiSlashPercentageChanged(oldPercentage, newPercentage);
    }

    /**
     * @notice Change the AVAX slash percentage
     * @param  newPercentage The new percentage in bps
     */
    function setAvaxSlashPercentage(uint newPercentage) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        require(newPercentage <= 10_000);

        uint oldPercentage = avaxSlashPercentage;
        avaxSlashPercentage = newPercentage;

        emit AvaxSlashPercentageChanged(oldPercentage, newPercentage);
    }

    /**
     * @notice Change the protocol maximum AVAX subsidisation amount
     * @param  newMaximumSubsidisationAmount New maximum subsidisation amount in AVAX (18 decimals)
     */
    function setMaximumSubsidisationAmount(uint newMaximumSubsidisationAmount) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));

        uint oldMaximumSubsidisationAmount = maximumSubsidisationAmount;
        maximumSubsidisationAmount = newMaximumSubsidisationAmount;

        emit MaximumSubsidisationAmountChanged(
            oldMaximumSubsidisationAmount,
            newMaximumSubsidisationAmount
        );
    }

    /**
     * @notice Update the QI price multiplier used for fee payments in QI
     * @param newQiPriceMultiplier New price multiplier in bps
     */
    function setQiPriceMultiplier(uint newQiPriceMultiplier) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        require(newQiPriceMultiplier <= 10_000);

        uint oldQiPriceMultiplier = qiPriceMultiplier;
        qiPriceMultiplier = newQiPriceMultiplier;

        emit QiPriceMultiplierUpdated(oldQiPriceMultiplier, newQiPriceMultiplier);
    }

    /**
     * @notice Add a new fee payment token option
     * @param  token ERC-20 token address
     * @param  priceFeedAddress Chainlink price feed address for the token
     * @param  maxPriceAge Maximum price feed response age
     */
    function addPaymentToken(
        address token,
        address priceFeedAddress,
        uint maxPriceAge
    ) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        require(token != address(0));
        require(!paymentTokens.contains(token));

        IPriceFeed priceFeed = IPriceFeed(priceFeedAddress);

        paymentTokens.add(token);
        priceFeeds[token] = priceFeed;
        maxPriceAges[token] = maxPriceAge;

        (, int256 price, , uint updatedAt, ) = priceFeed.latestRoundData();
        require(price > 0);
        require(block.timestamp - updatedAt <= maxPriceAge);

        emit PaymentTokenAdded(token);
    }

    /**
     * @notice Remove an existing fee payment token option
     * @param  token Token to remove
     */
    function removePaymentToken(address token) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        require(paymentTokens.contains(token));

        // AVAX and QI price feed configuration must not be deleted
        if (token != AVAX && token != address(qi)) {
            delete priceFeeds[token];
            delete maxPriceAges[token];
        }

        paymentTokens.remove(token);

        emit PaymentTokenRemoved(token);
    }

    /**
     * @notice Update the price feed configuration for a pre-existing payment token
     * @param  token ERC-20 token address
     * @param  priceFeedAddress Chainlink price feed address for the token
     * @param  maxPriceAge Maximum price feed response age
     */
    function configurePriceFeed(
        address token,
        address priceFeedAddress,
        uint maxPriceAge
    ) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));

        address oldPriceFeed = address(priceFeeds[token]);
        uint oldPriceMaxAge = maxPriceAges[token];

        require(oldPriceFeed != address(0));

        IPriceFeed priceFeed = IPriceFeed(priceFeedAddress);

        priceFeeds[token] = priceFeed;
        maxPriceAges[token] = maxPriceAge;

        (, int256 price, , uint updatedAt, ) = priceFeed.latestRoundData();
        require(price > 0);
        require(block.timestamp - updatedAt <= maxPriceAge);

        emit PriceFeedChanged(token, oldPriceFeed, priceFeedAddress, oldPriceMaxAge, maxPriceAge);
    }

    /**
     * @notice Change the required AVAX deposit amount for a registration
     * @param  newMinimumAvaxDeposit New minimum AVAX deposit amount (18 decimals)
     * @param  newMaximumAvaxDeposit New maximum AVAX deposit amount (18 decimals)
     */
    function setAvaxDepositRange(uint newMinimumAvaxDeposit, uint newMaximumAvaxDeposit) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        require(newMinimumAvaxDeposit <= newMaximumAvaxDeposit);

        uint oldMinimumAvaxDeposit = minimumAvaxDeposit;
        uint oldMaximumAvaxDeposit = maximumAvaxDeposit;

        minimumAvaxDeposit = newMinimumAvaxDeposit;
        maximumAvaxDeposit = newMaximumAvaxDeposit;

        emit AvaxDepositRangeUpdated(
            oldMinimumAvaxDeposit,
            minimumAvaxDeposit,
            oldMaximumAvaxDeposit,
            maximumAvaxDeposit
        );
    }

    /**
     * @notice Set the ValidatorRewarder contract address
     * @param  newValidatorRewarder ValidatorRewarder contract address
     */
    function setValidatorRewarder(address newValidatorRewarder) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));

        validatorRewarder = ValidatorRewarder(newValidatorRewarder);
    }

    /**
     * @notice Store the registration using _register after validating the subsidisation
     *         cap and validation duration.
     * @param  beneficiary The beneficiary of the registration
     * @param  nodeId ID of the node to register
     * @param  blsProofOfPossession BLS proof of possession (public key + signature)
     * @param  validationDuration Duration of the validation period
     * @param  feePaid Whether or not the fee was paid
     * @param  token ERC-20 payment token address
     * @param  tokenAmount Amount of ERC-20 tokens deposited
     * @param  isEligibleForQiRewards True if the node is eligible for QI rewards at the end of the validation
     */
    function _registerWithChecks(
        address beneficiary,
        string calldata nodeId,
        bytes calldata blsProofOfPossession,
        uint validationDuration,
        bool feePaid,
        address token,
        uint tokenAmount,
        bool isEligibleForQiRewards
    ) internal {
        uint subsidisationAmount;
        if (feePaid) {
            subsidisationAmount = 2000e18;
        } else {
            subsidisationAmount = 2000e18 - msg.value;
        }

        require(
            totalSubsidisedAmount + subsidisationAmount <= maximumSubsidisationAmount,
            "Subsidisation cap exceeded"
        );

        require(
            validationDuration == VALIDATION_DURATION_TWO_WEEKS ||
            validationDuration == VALIDATION_DURATION_FOUR_WEEKS ||
            validationDuration == VALIDATION_DURATION_EIGHT_WEEKS ||
            validationDuration == VALIDATION_DURATION_TWELVE_WEEKS,
            "Invalid staking duration"
        );

        totalSubsidisedAmount += subsidisationAmount;

        _register(
            beneficiary,
            nodeId,
            blsProofOfPossession,
            validationDuration,
            feePaid,
            token,
            tokenAmount,
            isEligibleForQiRewards
        );
    }

    /**
     * @notice Store the registration
     * @param  beneficiary The beneficiary of the registration
     * @param  nodeId ID of the node to register
     * @param  blsProofOfPossession BLS proof of possession (public key + signature)
     * @param  validationDuration Duration of the validation period
     * @param  feePaid Whether or not the fee was paid
     * @param  token Payment token address
     * @param  tokenAmount Amount of ERC-20 tokens deposited
     * @param  isEligibleForQiRewards True if the node is eligible for QI rewards at the end of the validation
     */
    function _register(
        address beneficiary,
        string calldata nodeId,
        bytes calldata blsProofOfPossession,
        uint validationDuration,
        bool feePaid,
        address token,
        uint tokenAmount,
        bool isEligibleForQiRewards
    ) internal whenNotPaused {
        uint registrationIndex = registrationIndicesByNodeId[nodeId];
        require(
            registrationIndex == 0 && bytes(nodeId).length != 0,
            "Node already registered"
        );

        require(blsProofOfPossession.length == 144);

        registrationIndicesByNodeId[nodeId] = registrations.length;
        registrations.push(
            Registration(
                beneficiary,
                nodeId,
                validationDuration,
                feePaid,
                TokenDepositDetails(
                    msg.value,
                    token,
                    tokenAmount
                ),
                0,
                qiSlashPercentage,
                avaxSlashPercentage,
                false,
                false
            )
        );

        blsProofOfPossessionByNodeId[nodeId] = blsProofOfPossession;
        qiRewardEligibilityByNodeId[nodeId] = isEligibleForQiRewards;

        accountRegistrationIndicesByNodeId[nodeId] = registeredNodeIdsByAccount[beneficiary].length;
        registeredNodeIdsByAccount[beneficiary].push(nodeId);

        emit NewRegistration(
            beneficiary,
            nodeId,
            blsProofOfPossession,
            validationDuration,
            feePaid,
            msg.value,
            token,
            tokenAmount
        );
    }

    /**
     * @dev   Remove a node registration. Note that all tokens must have been
     *        sent back to the original staker before deleting the registration
     *        entry in order not to lose the tokens.
     * @param nodeId Node ID to delete
     */
    function _deleteRegistration(string calldata nodeId) internal {
        uint registrationIndex = registrationIndicesByNodeId[nodeId];
        require(registrationIndex != 0);

        address registerer = registrations[registrationIndex].registerer;

        uint accountRegistrationIndex = accountRegistrationIndicesByNodeId[nodeId];
        uint accountRegistrationLastIndex = registeredNodeIdsByAccount[registerer].length - 1;

        if (accountRegistrationIndex != accountRegistrationLastIndex) {
            string memory lastNodeId = registeredNodeIdsByAccount[registerer][accountRegistrationLastIndex];
            registeredNodeIdsByAccount[registerer][accountRegistrationIndex] = lastNodeId;
            accountRegistrationIndicesByNodeId[lastNodeId] = accountRegistrationIndex;
        }

        registeredNodeIdsByAccount[registerer].pop();

        delete accountRegistrationIndicesByNodeId[nodeId];
        delete blsProofOfPossessionByNodeId[nodeId];
        delete qiRewardEligibilityByNodeId[nodeId];

        uint totalRegistrations = registrations.length - 1;
        if (registrationIndex != totalRegistrations) {
            string memory lastNodeId = registrations[totalRegistrations].nodeId;
            registrations[registrationIndex] = registrations[totalRegistrations];
            registrationIndicesByNodeId[lastNodeId] = registrationIndex;
        }

        registrations.pop();

        delete registrationIndicesByNodeId[nodeId];

        emit RegistrationDeleted(nodeId);
    }

    /**
     * @notice Get the registration fee in AVAX for a given validation duration
     * @param  validationDuration Validation duration in seconds
     * @return Registration fee in AVAX
     */
    function _getRegistrationFee(uint validationDuration) internal view returns (uint) {
        if (validationDuration == VALIDATION_DURATION_TWO_WEEKS) {
            return 8e18;
        }

        if (validationDuration == VALIDATION_DURATION_FOUR_WEEKS) {
            return 15e18;
        }

        if (validationDuration == VALIDATION_DURATION_EIGHT_WEEKS) {
            return 28e18;
        }

        if (validationDuration == VALIDATION_DURATION_TWELVE_WEEKS) {
            return 40e18;
        }

        revert("Invalid validation duration");
    }
}
