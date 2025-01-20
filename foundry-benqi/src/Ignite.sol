// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0; //c floating pragmas are not recommended but is already known issue so no need to report

import "@openzeppelin/contracts-upgradeable/contracts/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/interfaces/IERC20MetadataUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/utils/structs/EnumerableSetUpgradeable.sol";

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
    bytes32 public constant ROLE_REGISTER_WITHOUT_COLLATERAL =
        keccak256("ROLE_REGISTER_WITHOUT_COLLATERAL");
    bytes32 public constant ROLE_RELEASE_LOCKED_TOKENS =
        keccak256("ROLE_RELEASE_LOCKED_TOKENS");
    bytes32 public constant ROLE_PAUSE = keccak256("ROLE_PAUSE");
    bytes32 public constant ROLE_UNPAUSE = keccak256("ROLE_UNPAUSE");
    bytes32 public constant ROLE_REGISTER_WITH_FLEXIBLE_PRICE_CHECK =
        keccak256("ROLE_REGISTER_WITH_FLEXIBLE_PRICE_CHECK");

    uint public constant VALIDATION_DURATION_TWO_WEEKS = 86400 * 7 * 2; //c do these need to be public ??
    uint public constant VALIDATION_DURATION_FOUR_WEEKS = 86400 * 7 * 4;
    uint public constant VALIDATION_DURATION_EIGHT_WEEKS = 86400 * 7 * 8;
    uint public constant VALIDATION_DURATION_TWELVE_WEEKS = 86400 * 7 * 12;
    uint public constant VALIDATION_DURATION_ONE_YEAR = 86400 * 365;

    address public constant AVAX = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address public constant FEE_RECIPIENT =
        0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa; //q are these addresses placeholders or are they real addresses?? if they are real, are they owned by the protocol??
    address public constant SLASHED_TOKEN_RECIPIENT =
        0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB;

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
    event Redeem(
        string nodeId,
        uint avaxAmount,
        address token,
        uint tokenAmount
    );

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
    event QiPriceMultiplierUpdated(
        uint oldQiPriceMultiplier,
        uint newQiPriceMultiplier
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    //c no natspec comments
    function initialize(
        address _sAVAX,
        address _qi,
        address _avaxPriceFeed,
        uint _maxAvaxPriceAge,
        address _qiPriceFeed,
        uint _maxQiPriceAge,
        uint _minimumAvaxDeposit,
        uint _maximumAvaxDeposit
    ) public initializer {
        //c might want to include an onlyowner modifier here to make sure no one initalises the contract before the intended address. already known issue so no need to report
        require(_minimumAvaxDeposit <= _maximumAvaxDeposit); //c no zero checks for _minimumAvaxDeposit and _maximumAvaxDeposit. if both are set to 0, then the contract will not work as intended. already known issue so no need to report

        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        sAVAX = IStakedAvax(_sAVAX); //bugREPORTED This is the only time inside this contract that the sAVAX contract is used so why is it here ? in ignite.test.js, it is also deployed but never used. cant find it in the staking.sol contract either

        qi = IERC20Upgradeable(_qi); //c unlike this one which is used in multiple places

        _initialisePriceFeeds(
            _avaxPriceFeed,
            _maxAvaxPriceAge, //q what happens when the max price age is reached? is the contract paused?
            _qi,
            _qiPriceFeed,
            _maxQiPriceAge
        );

        minimumAvaxDeposit = _minimumAvaxDeposit;
        maximumAvaxDeposit = _maximumAvaxDeposit;

        qiSlashPercentage = 5_000;
        maximumSubsidisationAmount = 50_000e18;

        qiPriceMultiplier = 10_000; //q what is this price multiplier supposed to be doing ??

        registrations.push(
            Registration(
                address(0), //c this stops anyone from registering a zero address and also puts a dummy registration at index 0
                "",
                0,
                false,
                TokenDepositDetails(0, address(0), 0),
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

        (, int256 avaxPrice, , uint avaxPriceUpdatedAt, ) = avaxPriceFeed
            .latestRoundData();
        require(avaxPrice > 0);
        require(block.timestamp - avaxPriceUpdatedAt <= _maxAvaxPriceAge); //bugINFORMATIONAL should probably add an error message here because if a function errors out, the error message will be helpful for debugging

        (, int256 qiPrice, , uint qiPriceUpdatedAt, ) = qiPriceFeed
            .latestRoundData();
        require(qiPrice > 0);
        require(block.timestamp - qiPriceUpdatedAt <= _maxQiPriceAge); //bugINFORMATIONAL should probably add an error message here
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
        //c I thought the lack of whennotpaused modifier was a bug but the internal _register function contains the whennotpaused modifier which means no one can register when the contract is paused
        require(
            msg.value >= minimumAvaxDeposit && //c from this statement, I am guessing that I have to send an amount of avax to the contract to register and the amount of qi is taken from me via safetransferfrom below
                msg.value <= maximumAvaxDeposit &&
                msg.value % 1e9 == 0, //q why is this check here. it checks that the value is a multiple of 1e9 but why is this necessary. also note that 0 is a multiple of 1e9
            "Invalid value"
        );

        //c notice how there the minimumcontractbalance is not updated here. The reason is because when stake is deposited by a user via this function, the idea is that the avax the user sent to
        // this contract is withdrawn with the withdraw function in this contract to mix with the avax provided by benqi to make 2000 avax to start the validator. This is the only amount that the
        //the withdraw function is allowed to withdraw.

        // Verify that the sender can receive AVAX
        (bool success, ) = msg.sender.call(""); //c a1: assumes i cannot do anything from the receive function of a contract to attack this
        //so far this is checking out because this function doesnt let me reenter due to modifier and even if i call another user facing function to stake with same node id, the _register function checks to see if a node has already been registered so that wont work
        //the fact that there are so little user facing functions makes it hard to exploit this. theres not many functions i can call
        require(success); //bugREPORTED if there is a contract with a receive function that rejects zero value transactions, then this will fail casuing a DOS

        (, int256 avaxPrice, , uint avaxPriceUpdatedAt, ) = priceFeeds[AVAX]
            .latestRoundData();
        (, int256 qiPrice, , uint qiPriceUpdatedAt, ) = priceFeeds[address(qi)]
            .latestRoundData();

        require(qiPrice > 0 && avaxPrice > qiPrice);
        require(block.timestamp - avaxPriceUpdatedAt <= maxPriceAges[AVAX]); //c checks if the price feed is up to date
        require(
            block.timestamp - qiPriceUpdatedAt <= maxPriceAges[address(qi)] //c checks if the price feed is up to date
        );

        // QI deposit amount is 10 % (thus, note the divider) of the AVAX value
        // that BENQI subsidises for the validator.
        uint qiAmount = (uint(avaxPrice) * (2000e18 - msg.value)) / //bugINFORMATIONAL avoid using magic numbers. I am guessing 2000e18 is the minimum amount of avax needed to start a validator
            uint(qiPrice) /
            10; //bugREPORTED so users must deposit 10% of the avax value being subsidised by benqi in qi tokens. This is inconsistent to the examples given in the whitepaper at https://docs.benqi.fi/ignite/payg-and-stake#stake
        //c this id divided by 10 to get 10% of it
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
        //c * @notice Pause new registrations, withdrawals, releases, and redemptions. natspec was in pause modifier definition so modifier should be in all functions that register, withdraw, release, or redeem
        uint registrationFee = _getRegistrationFee(validationDuration);
        require(msg.value == registrationFee);

        // Verify that the sender can receive AVAX
        (bool success, ) = msg.sender.call("");
        require(success);

        // Fees cannot be withdrawn from the contract until the registration is released
        minimumContractBalance += registrationFee; //q need more clarification on what this minimumContractBalance is used for

        _registerWithChecks(
            msg.sender,
            nodeId,
            blsProofOfPossession,
            validationDuration,
            true, //c fee paid variableis only set to true with non staking registrations (pay as you go)
            address(0), //c when zero address is passed, tokenamount is set to 0 as expected in the next line
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
        //c * @notice Pause new registrations, withdrawals, releases, and redemptions. natspec was in pause modifier definition so modifier should be in all functions that register, withdraw, release, or redeem
        require(paymentTokens.contains(tokenAddress));

        IERC20MetadataUpgradeable token = IERC20MetadataUpgradeable(
            tokenAddress
        );

        (, int256 avaxPrice, , uint avaxPriceUpdatedAt, ) = priceFeeds[AVAX]
            .latestRoundData();
        (, int256 tokenPrice, , uint tokenPriceUpdatedAt, ) = priceFeeds[
            tokenAddress
        ].latestRoundData();

        require(avaxPrice > 0 && tokenPrice > 0);
        require(block.timestamp - avaxPriceUpdatedAt <= maxPriceAges[AVAX]);
        require(
            block.timestamp - tokenPriceUpdatedAt <= maxPriceAges[tokenAddress]
        );

        uint registrationFee = _getRegistrationFee(validationDuration);
        uint tokenAmount = (uint(avaxPrice) * registrationFee) /
            uint(tokenPrice) /
            10 ** (18 - token.decimals()); //bugREPORTED tokens with higher than 18 decimal places will break this formula. need to make sure tokens with higher than 18 decimals are not included. see https://github.com/d-xo/weird-erc20
        //c formula seems to make sense. see notes.md for more info
        //q need to find out how i can use an erc777 token to call another function that does something malicious

        if (tokenAddress == address(qi)) {
            tokenAmount = (tokenAmount * qiPriceMultiplier) / 10_000; //c in initialiser function, qiPriceMultiplier is set to 10_000 so unless multiplier is updated, this line does nothing
        }

        require(tokenAmount > 0);

        token.safeTransferFrom(msg.sender, address(this), tokenAmount); //c tether gold always returns false but the return value of the function is never checked so it is not a problem

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
        //q why does this function exist ??

        string calldata nodeId,
        bytes calldata blsProofOfPossession,
        uint validationDuration
    ) external {
        //c cannot send raw avax to this function because it is not payable .... fuck
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
    )
        external
    //c a1: assumes that the node id and bls proof of possession are valid and unique. this checks out because only the staking contract can call this function
    //and in the registernode function that calls this function, there are checks that make these assumptions valid. same goes for validation duration
    //c a2: assumes that qi amount is non zero or dust value. this checks out as long as avaxstakedamount and hosting fee are large enough so we can safely assume this checks out
    {
        //bug no nonreentrant modifier here so i can reenter this function but need to figure out how to exploit this. it is a known issue but if i can escalate it, it will be a high severity issue
        //c I thought this was an issue but the internal _register function contains the whennotpaused modifier which means no one can register when the contract is paused
        require(
            hasRole(ROLE_REGISTER_WITH_FLEXIBLE_PRICE_CHECK, msg.sender),
            "ROLE_REGISTER_WITH_FLEXIBLE_PRICE_CHECK"
        ); //c a3: assumes hasRole function works as expected and that the role is correctly spelt. this checks out. I have glanced through this in the access contract and
        //the contract is from openzeppelin so it is safe to assume that it works properly

        (, int256 avaxPrice, , uint avaxPriceUpdatedAt, ) = priceFeeds[AVAX]
            .latestRoundData(); //c a4: assumes that the chainlink price feeds dont return any other useful information by only selecting 2 variables from it.
        //this checks out because the other values are roundid, startedat and answeredinround which are not useful in this context
        (, int256 qiPrice, , uint qiPriceUpdatedAt, ) = priceFeeds[address(qi)]
            .latestRoundData();

        require(avaxPrice > 0 && qiPrice > 0);
        require(block.timestamp - avaxPriceUpdatedAt <= maxPriceAges[AVAX]);
        require(
            block.timestamp - qiPriceUpdatedAt <= maxPriceAges[address(qi)]
        );
        //c a5: assumes that the chainklink oracles will always work.
        //bugKNOWN a5: if the chainlink oracles are compromised, the contract will not work as intended. this is a known issue so no need to report

        // 200 AVAX + 1 AVAX fee
        uint expectedQiAmount = (uint(avaxPrice) * 201e18) / uint(qiPrice); //q what is the significance of 201e18 i am guessing users to have a qi stake that is worth at least 201 avax (or 90% of it based on the next line)
        //c a6: assumes that this formula has no overflow or precision loss and returns the qi amount with correct token decimals. this checks out.
        //c a7: assumes that the 201 avax minimum requirement is never going to change
        //bugREPORTED a7 this isnt a correct assumption. if the protocol decide that the 201 avax minimum requirement is too large or too small , they have to upgrade the contract to change it.
        require(qiAmount >= (expectedQiAmount * 9) / 10); //c this is to make sure that the user has a qi stake that is worth at least 90% of 201 avax. the reason for 90% is because the
        //"ROLE_REGISTER_WITH_FLEXIBLE_PRICE_CHECK" will be assigned to the staking contract and in the staking.sol contract, this function is called from the registernode function but the prices are checked in the function
        //and then again in this function so prices could change between when it is calculated in the zeeve contract and when it is calculated in this function so because of this, the protocol dont require qiamount == expectedqiamount.
        //To account for price changes, the protocol requires that the qi amount is at least 90% of the expected qi amount

        qi.safeTransferFrom(msg.sender, address(this), qiAmount);
        //c a8: assumes that the safetransferfrom function correctly transfers the qi amount from the staking contract to this contract. this checks out as we can safely assume that the safetransferfrom function that comes from openzeppelin works as expected
        //c a9: assumes that the qi token is safe in this contract and cannot be drained.
        //c so far, apart from the qi stakers lack of slashing exploit which i reported, i cant seem to find another way to invalidate a9 so far. I searched for everywhere in this contract where the word qi was used
        // and cannot think of a way to make the qi token unsafe in this contract

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
    function redeemAfterExpiry(
        string calldata nodeId
    ) external nonReentrant whenNotPaused {
        //c * @notice Pause new registrations, withdrawals, releases, and redemptions. natspec was in pause modifier definition so modifier should be in all functions that register, withdraw, release, or redeem
        uint registrationIndex = registrationIndicesByNodeId[nodeId];
        require(registrationIndex != 0);

        Registration storage registration = registrations[registrationIndex];

        require(registration.registerer == msg.sender);
        require(registration.withdrawable); //c this is changed in the releaseLockedTokens function so this function cannot be called until the releaseLockedTokens function is called

        // If feePaid is true and the registration is withdrawable, it must have been released
        // with the failed flag set, meaning that the validator could not be started and the
        // fee should be refunded.
        if (registration.feePaid) {
            //q is there an alternative to nested if statements ??
            if (registration.tokenDeposits.avaxAmount > 0) {
                //c if user paid fee with registerwithavaxfee and teh failed flag was set to true in releaselockedtokens
                uint avaxDepositAmount = registration.tokenDeposits.avaxAmount;

                minimumContractBalance -= avaxDepositAmount;

                _deleteRegistration(nodeId); //c i learnt how arrays are deleted in solidity from this function. see notes.md for more info

                (bool success, ) = payable(msg.sender).call{
                    value: avaxDepositAmount
                }(""); //bug low level call i can use to call another function in this contract with a receive function and attack this contract somehow
                require(success);

                emit Redeem(nodeId, avaxDepositAmount, address(0), 0);
            } else {
                //c if user paid fee with registerwitherc20fee
                IERC20Upgradeable token = IERC20Upgradeable(
                    registration.tokenDeposits.token
                );
                uint tokenDepositAmount = registration
                    .tokenDeposits
                    .tokenAmount;

                _deleteRegistration(nodeId);

                token.safeTransfer(msg.sender, tokenDepositAmount);

                emit Redeem(nodeId, 0, address(token), tokenDepositAmount);
            }

            return; //c so at this point, all registrations that were made with fees should be redeemed
        }

        // tokenAmount is always denominated in QI tokens for stake model registrations
        uint qiDepositAmount = registration.tokenDeposits.tokenAmount;
        uint avaxDepositAmount = registration.tokenDeposits.avaxAmount;

        uint avaxRedemptionAmount;

        uint qiRedemptionAmount;
        // If a validator was slashed, the slash amount was already transferred to the
        // slashed token recipient. The remaining QI tokens are held in this contract.
        if (registration.slashed) {
            avaxRedemptionAmount =
                avaxDepositAmount -
                (avaxDepositAmount * registration.avaxSlashPercentage) /
                10_000; //q this code is repeated in the releaseLockedTokens function. could define a variable for this but reading from storage is not cheap so it might not be worth it but can look into this
            qiRedemptionAmount =
                qiDepositAmount -
                (qiDepositAmount * registration.qiSlashPercentage) /
                10_000;

            minimumContractBalance -= avaxRedemptionAmount;
        } else {
            avaxRedemptionAmount =
                avaxDepositAmount +
                registration.rewardAmount;
            qiRedemptionAmount = qiDepositAmount;

            if (qiRewardEligibilityByNodeId[nodeId]) {
                //c if the node was registered using registerwithqiprevalidatedstake, then the node is eligible for rewards and the rewards are paid in gavax by calling a claimrewards function from validatorrewarder.sol
                qiRedemptionAmount += validatorRewarder.claimRewards(
                    registration.validationDuration,
                    qiDepositAmount
                ); //c claimrewards function returns the reward amount
                //c a1: assumes that the claim rewards function calculates rewards correctly
            }

            minimumContractBalance -= avaxRedemptionAmount;
        }

        _deleteRegistration(nodeId);

        qi.safeTransfer(msg.sender, qiRedemptionAmount);
        //c a2: assumes that the rewards + original stakers deposit (less fee) is sent back to the staking contract
        //this checks out because qiRedemptionAmount = qiDepositAmount and qiRedemptionAmount += validatorRewarder.claimRewards(registration.validationDuration,qiDepositAmount) as seen in this function. Also  registration.tokenDeposits.tokenAmount -= fee in the releaselockedtokens contract which is called before this function
        if (avaxRedemptionAmount > 0) {
            (bool success, ) = msg.sender.call{value: avaxRedemptionAmount}(""); //bug low level call i can use to call another function in this contract with a receive function and attack this contract somehow
            require(success);
        }

        emit Redeem(
            nodeId,
            avaxRedemptionAmount,
            address(qi),
            qiRedemptionAmount
        );
    }

    /**
     * @notice Returns the number of registrations
     * @return Number of registrations
     */
    function getTotalRegistrations() external view returns (uint) {
        //c makes sense
        // Subtract 1 because the first registration is a dummy registration
        return registrations.length - 1;
    }

    /**
     * @notice Returns the number of available ERC-20 payment tokens for the fee model
     * @return Number of payment methods
     */
    function getTotalErc20PaymentMethods() external view returns (uint) {
        //c makes sense
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
        //c makes sense
        address account,
        uint from,
        uint to
    ) external view returns (Registration[] memory) {
        Registration[] memory accountRegistrations = new Registration[](
            to - from
        );

        for (uint i = from; i < to; ++i) {
            accountRegistrations[i - from] = registrations[
                registrationIndicesByNodeId[
                    registeredNodeIdsByAccount[account][i]
                ]
            ];
        }

        return accountRegistrations;
    }

    /**
     * @notice Returns the number of registrations made by the given account
     * @param  account Account to query
     * @return Number of registrations
     */
    function getAccountRegistrationCount(
        //c makes sense
        address account
    ) external view returns (uint) {
        return registeredNodeIdsByAccount[account].length;
    }

    /**
     * @notice Get the registration fee in AVAX for a given validation duration
     * @param  validationDuration Validation duration in seconds
     * @return Registration fee in AVAX
     */
    function getRegistrationFee(
        //c makes sense
        uint validationDuration
    ) external view returns (uint) {
        return _getRegistrationFee(validationDuration);
    }

    /**
     * @notice Called to withdraw AVAX from the contract to start validation
     * @param  amount Amount of AVAX to be withdrawn
     */
    function withdraw(uint amount) external whenNotPaused {
        //c so when this stake is deposited by a user, with registerwithstake, the idea is that the avax the user sent to ignite is withdrawn with this function to mix with the avax provided by benqi to make 2000 avax to start the validator.
        //c  I got this logic from the ignite.test.js file in the tests folder of the ignite directory
        //c no nonreentrant modifier here so i can reenter this function but because of the last check in the function, it wont matter
        require(hasRole(ROLE_WITHDRAW, msg.sender));

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success);

        require(
            address(this).balance >= minimumContractBalance,
            "Withdrawal amount too big"
        ); //q might this check might be what I need to mix with one of the low level calls in the register functions to exploit the contract

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
        //c * @notice Pause new registrations, withdrawals, releases, and redemptions. natspec was in pause modifier definition so modifier should be in all functions that register, withdraw, release, or redeem
        require(hasRole(ROLE_RELEASE_LOCKED_TOKENS, msg.sender));

        uint registrationIndex = registrationIndicesByNodeId[nodeId]; //c this is the index of the registration in the registrations array
        require(registrationIndex != 0);

        Registration storage registration = registrations[registrationIndex];

        require(!registration.withdrawable);

        emit RegistrationExpired(nodeId);

        // If the failed flag is set, this means that a validator could not be started for the
        // given node ID and the principal stake or fee should be returned to the user in whole.
        if (failed) {
            if (registration.feePaid) {
                require(msg.value == 0); //c msg.value sent by zeeve contract

                totalSubsidisedAmount -= 2000e18;
            } else {
                require(
                    msg.value == registration.tokenDeposits.avaxAmount,
                    "Message value must match the AVAX deposit amount"
                );

                // Non-tokenised registrations do not count towards the subsidisation cap
                // nor can have a non-zero AVAX deposit and should be deleted immediately.
                if (registration.tokenDeposits.tokenAmount == 0) {
                    _deleteRegistration(nodeId); //c this check is to make sure that if the users feepaid boolean is set to false, then the validator was registered using either registerwithstake, registerwithqivalidatedstake or registerwithoutcollateral function
                    //and in all but redeemwithoutcollateral functions, when _registerwithchecks is called, the token and tokenamount are populated and are most likely not going to be 0 which means that it is highly unlikely that registration.tokenDeposits.tokenAmount == 0 and feepaid is false unless registerwithoutcollateral is called
                    //so this function is deleting all registrations that were  made with the registerwithoutcollateral function

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
        // there is nothing for the user to claim afterwards. //q confirm that only stakers (users who call registerwithqiprevalidatedstake) are eligible for rewards
        if (registration.feePaid) {
            require(msg.value == 0); //c this is because users who paid fees dont get rewards so msg.value should not have a value

            totalSubsidisedAmount -= 2000e18;

            if (registration.tokenDeposits.avaxAmount > 0) {
                uint avaxDepositAmount = registration.tokenDeposits.avaxAmount;

                minimumContractBalance -= avaxDepositAmount;

                _deleteRegistration(nodeId);

                (bool success, ) = FEE_RECIPIENT.call{value: avaxDepositAmount}( //bug can i call another function in this contract with a receive function and attack this contract somehow
                    ""
                );
                require(success); //c if the person pays a fee by using registerwithAvax or registerwitherc20, then the fee is sent to the fee recipient and the registration is deleted and they get no rewards
            } else {
                IERC20Upgradeable token = IERC20Upgradeable(
                    registration.tokenDeposits.token
                );
                uint tokenDepositAmount = registration
                    .tokenDeposits
                    .tokenAmount;

                _deleteRegistration(nodeId);

                token.safeTransfer(FEE_RECIPIENT, tokenDepositAmount); //c if the person pays a fee by using registerwithAvax or registerwitherc20, then the fee is sent to the fee recipient and the registration is deleted and they get no rewards
            }

            return; //c so at this point, all registrations that were made with fees should be deleted
        }

        // If a token deposit was not made, this is a registration by a privileged
        // account. These registrations cannot be rewarded nor can they be slashed.
        // Non-tokenised registrations do not count towards the subsidisation cap.
        if (
            registration.tokenDeposits.avaxAmount == 0 &&
            registration.tokenDeposits.tokenAmount == 0 //c this if condition takes into account people who call redeemwithoutcollateral but they dont yet realise that there is no check in redeemwithoutcollateral to make sure msg.value is 0 so once a user sets msg.value to any value that isnt 0, this if condition is skipped entirely.        ) {
        ) {
            require(msg.value == 0);

            _deleteRegistration(nodeId);

            return;
        }

        registration.withdrawable = true;

        totalSubsidisedAmount -=
            2000e18 -
            registration.tokenDeposits.avaxAmount;

        if (qiRewardEligibilityByNodeId[nodeId]) {
            //bugREPORTED what if this user should be slashed ?? users who register with fees dont get any rewards so if they misbehave, it doesnt really matter becausE their fee gets taken regardless but if a user
            //registers with a qi stake, they get a reward regardless of if they misbehave or not so they have more of an incentive to misbehave, surely this cant be intended
            require(msg.value == 0);

            uint fee = registration.tokenDeposits.tokenAmount / 201; //c dividing by 201 to get 0.5% of the token amount. this formula essentially takes 0.5% of the qi deposit
            //bugREPORTED once deployed, this fee can never change unless the whole contract is upgraded so the protocol should have a way to update this fee within the current contract instance
            registration.tokenDeposits.tokenAmount -= fee; //c no zero check needed for fee amount becuase tokenAmoutn is always going to be larger than 201

            qi.safeTransfer(FEE_RECIPIENT, fee);

            emit ValidatorRewarded(nodeId, 0); //q so if the node is eligible for qirewards , you want to reward them 0?? this might make sense because protocol said that rewards for qistakers are in gavax which is distributed by the claimrewards function in the validatorrewarder contract
            //bugREPORTED based on my comment on the last line, no validator is being rewarded here so why is this event emitted
        } else if (msg.value > registration.tokenDeposits.avaxAmount) {
            //c so if msg.value is greater than the user's avax deposit, it means that the validation was completed successfully and the staker who used registerwithstake can get rewards
            uint rewards = msg.value - registration.tokenDeposits.avaxAmount;

            registration.rewardAmount = rewards;
            minimumContractBalance += msg.value;

            emit ValidatorRewarded(nodeId, rewards); //q would it not be better to emit this event when the rewards are actually sent to the user
        } else {
            require(msg.value == registration.tokenDeposits.avaxAmount); //c if the users avax deposit is equal to the msg.value, then the validator has misbehaved and needs to slashed as seen below

            registration.slashed = true;

            uint qiSlashAmount;
            uint avaxSlashAmount;

            if (registration.qiSlashPercentage > 0) {
                // tokenDeposits.tokenAmount is always denominated in QI for stake model registrations
                qiSlashAmount =
                    (registration.tokenDeposits.tokenAmount *
                        registration.qiSlashPercentage) /
                    10_000; //c standard getting a percentage of a value using 10000 as scaling factor

                qi.safeTransfer(SLASHED_TOKEN_RECIPIENT, qiSlashAmount);
            }

            if (registration.avaxSlashPercentage > 0) {
                avaxSlashAmount =
                    (registration.tokenDeposits.avaxAmount *
                        registration.avaxSlashPercentage) /
                    10_000;

                minimumContractBalance += msg.value - avaxSlashAmount;

                (bool success, ) = SLASHED_TOKEN_RECIPIENT.call{
                    value: avaxSlashAmount
                }("");
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
     * @notice Resume new registrations, withdrawals, releases, and redemptions.
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
        //c makes sense
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
        //c makes sense
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
    function setMaximumSubsidisationAmount(
        //c makes sense
        uint newMaximumSubsidisationAmount
    ) external {
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
        //c makes sense
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        require(newQiPriceMultiplier <= 10_000);

        uint oldQiPriceMultiplier = qiPriceMultiplier;
        qiPriceMultiplier = newQiPriceMultiplier;

        emit QiPriceMultiplierUpdated(
            oldQiPriceMultiplier,
            newQiPriceMultiplier
        );
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

        paymentTokens.add(token); //c paymentTokens is a set from enumerablesetupgradeable.sol which is a contract that contains structs called set and enumerableset. the og set struct contains a bytes32 array and a mapping
        //it was originally created to store bytes but it can also store addresses but the addresses are a wrapper of the original bytes set struct. by wrapper, all i mean is that the addressset struct contains the original
        //bytes set struct but it contains an add function for example that allows a user to pass an address instead of a bytes32 and in the function definition of the add function, the address is converted to a bytes32 and
        //then added to the bytes32 array. the addressset struct also contains a contains function that checks if the address is in the bytes32 array. You can see all of this in the enumerablesetupgradeable.sol file
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
        //c makes sense
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        require(paymentTokens.contains(token));

        // AVAX and QI price feed configuration must not be deleted
        if (token != AVAX && token != address(qi)) {
            delete priceFeeds[token];
            delete maxPriceAges[token];
        }
        //bug docs say that the avax and qi price feed configs cannot be deleted but they can easily be reset. all admin has to do is remove avax or qi with this function and add it back
        //again with the addpaymenttoken function
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

        emit PriceFeedChanged(
            token,
            oldPriceFeed,
            priceFeedAddress,
            oldPriceMaxAge,
            maxPriceAge
        );
    }

    /**
     * @notice Change the required AVAX deposit amount for a registration
     * @param  newMinimumAvaxDeposit New minimum AVAX deposit amount (18 decimals)
     * @param  newMaximumAvaxDeposit New maximum AVAX deposit amount (18 decimals)
     */
    function setAvaxDepositRange(
        uint newMinimumAvaxDeposit,
        uint newMaximumAvaxDeposit
    ) external {
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
     * @param  feePaid Whether or not the fee was paid //c this is for people using pay as you go and pay the one time fee, all stakers should have this set to false
     * @param  token ERC-20 payment token address
     * @param  tokenAmount Amount of ERC-20 tokens deposited
     * @param  isEligibleForQiRewards True if the node is eligible for QI rewards at the end of the validation //c only users who register with prevaildatedqistake are eligible for rewards
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
            totalSubsidisedAmount + subsidisationAmount <=
                maximumSubsidisationAmount,
            "Subsidisation cap exceeded"
        ); //c subsidisation check

        require(
            validationDuration == VALIDATION_DURATION_TWO_WEEKS ||
                validationDuration == VALIDATION_DURATION_FOUR_WEEKS ||
                validationDuration == VALIDATION_DURATION_EIGHT_WEEKS ||
                validationDuration == VALIDATION_DURATION_TWELVE_WEEKS,
            "Invalid staking duration"
        ); //q is a user not allowed to stake for one year ?

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
                TokenDepositDetails(msg.value, token, tokenAmount),
                0,
                qiSlashPercentage,
                avaxSlashPercentage,
                false,
                false
            )
        );

        blsProofOfPossessionByNodeId[nodeId] = blsProofOfPossession;
        qiRewardEligibilityByNodeId[nodeId] = isEligibleForQiRewards;

        accountRegistrationIndicesByNodeId[nodeId] = registeredNodeIdsByAccount[
            beneficiary
        ].length; //c the accountRegistrationIndicesByNodeId mapping just records the index of the node in the registeredNodeIdsByAccount array. so for the first registration, the node will be at index 0 of the registeredNodeIdsByAccount array so the accountRegistrationIndicesByNodeId will have to be 0 for the node id which
        //is why the accountRegistrationIndicesByNodeId[nodeId] = registeredNodeIdsByAccount[beneficiary].length; line is placed before the registeredNodeIdsByAccount[beneficiary].push(nodeId); line
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

        uint accountRegistrationIndex = accountRegistrationIndicesByNodeId[
            nodeId
        ];
        uint accountRegistrationLastIndex = registeredNodeIdsByAccount[
            registerer
        ].length - 1; //c this gets the last node in this array. we need to delete the last node id in the array to keep the array in order.  see notes.md for more info

        if (accountRegistrationIndex != accountRegistrationLastIndex) {
            //c this is why they updated accountRegistrationIndicesByNodeId before registeredNodeIdsByAccount in the _register function
            string memory lastNodeId = registeredNodeIdsByAccount[registerer][
                accountRegistrationLastIndex
            ]; //c gets the last node id from the array of node ids registered by the account
            registeredNodeIdsByAccount[registerer][
                accountRegistrationIndex
            ] = lastNodeId; //c replaces the node id at accountRegistrationIndex with the last node id to essentially delete the node id at accountRegistrationIndex. See full explanation in notes.md
            accountRegistrationIndicesByNodeId[
                lastNodeId
            ] = accountRegistrationIndex; //c so the position that the deleted node was in is now occupied by the last node id
        }

        registeredNodeIdsByAccount[registerer].pop(); //c since we have moved the node id at the end of the array to the position of the deleted node id in the if statement, the node id in the last index of the array is still there so we now currently have duplicate node ids in the array, we can now pop the last element of the array to remove duplicates

        delete accountRegistrationIndicesByNodeId[nodeId]; //
        delete blsProofOfPossessionByNodeId[nodeId];
        delete qiRewardEligibilityByNodeId[nodeId];

        uint totalRegistrations = registrations.length - 1;
        if (registrationIndex != totalRegistrations) {
            string memory lastNodeId = registrations[totalRegistrations].nodeId;
            registrations[registrationIndex] = registrations[
                totalRegistrations
            ];
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
    function _getRegistrationFee(
        uint validationDuration
    ) internal view returns (uint) {
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
