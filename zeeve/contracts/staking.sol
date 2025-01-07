// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@looksrare/contracts-libs/contracts/lowLevelCallers/LowLevelWETH.sol";
import "./interfaces/IJoeRouter02.sol";
import "./interfaces/IIgnite.sol";

contract StakingContract is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    LowLevelWETH
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    // Variables for contracts and addresses
    IERC20Upgradeable public qiToken;
    IIgnite public igniteContract;
    address public zeeveWallet;
    IJoeRouter02 private joeRouter;
    address public intermediaryToken;
    // Configuration variables
    uint256 public avaxStakeAmount;
    uint256 public hostingFeeAvax;
    uint256 public slippage;
    uint256 public minSlippage;
    uint256 public maxSlippage;
    uint256 public refundPeriod;

    // Storage for accepted tokens and price feeds
    EnumerableSetUpgradeable.AddressSet private acceptedTokens;
    mapping(address => AggregatorV3Interface) public priceFeeds;
    mapping(address => uint256) public maxPriceAges;

    // Roles definition
    bytes32 public constant ZEEVE_SUPER_ADMIN_ROLE =
        keccak256("ZEEVE_SUPER_ADMIN_ROLE");
    bytes32 public constant ZEEVE_ADMIN_ROLE = keccak256("ZEEVE_ADMIN_ROLE");
    bytes32 public constant BENQI_SUPER_ADMIN_ROLE =
        keccak256("BENQI_SUPER_ADMIN_ROLE");
    bytes32 public constant BENQI_ADMIN_ROLE = keccak256("BENQI_ADMIN_ROLE");

    // Constant for AVAX token address
    address public constant AVAX = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // Constants for time durations
    uint256 public constant FORTNIGHT_IN_SECONDS = 86400 * 7 * 2;

    // Enum for staking status
    enum StakingStatus {
        None,
        Provisioning,
        Provisioned,
        Refunded
    }

    // Struct for stake records
    struct StakeRecord {
        uint256 amountStaked;
        uint256 hostingFeePaid;
        uint256 timestamp;
        uint256 duration;
        address tokenType; //address of the token
        StakingStatus status;
    }

    // Struct for user stake records
    struct UserStakeRecords {
        uint256 stakeCount;
        mapping(uint256 => StakeRecord) records;
    }

    // Mapping for user stake records
    mapping(address => UserStakeRecords) public stakeRecords;

    // Events
    event Staked(
        address indexed user,
        uint256 amount,
        uint256 duration,
        uint256 hostingFee,
        address tokenType,
        uint256 userStakeIndex,
        uint256 indexed timestamp
    );
    event IgniteRegistered(address indexed user, string nodeId, bytes blsKey);
    event Refunded(address indexed user, uint256 amount);
    event HostingFeeUpdated(uint256 oldFee, uint256 newFee);
    event StakingFeeUpdated(uint256 oldStakingFee, uint256 newStakingFee);
    event SlippageUpdated(uint256 oldSlippage, uint256 newSlippage);
    event MinSlippageUpdated(uint256 oldMinSlippage, uint256 newMinSlippage);
    event MaxSlippageUpdated(uint256 oldMaxSlippage, uint256 newMaxSlippage);
    event AdminRoleGranted(bytes32 role, address account, address operator);
    event AdminRoleRevoked(bytes32 role, address account, address operator);
    event PairAddressUpdated(
        address indexed updater,
        address oldPair,
        address newPair
    );
    event PriceFeedUpdated(
        address token,
        address oldPriceFeed,
        address newPriceFeed
    );
    event TokenAdded(address token);
    event TokenRemoved(address token);
    event IntermediaryTokenUpdated(address oldToken, address newToken);
    event RefundedStake(
        address indexed user,
        uint256 userStakeIndex,
        uint256 amount,
        uint256 refundId
    );

    // Struct for contract addresses
    struct ContractAddresses {
        address qiToken;
        address avaxPriceFeed;
        address qiPriceFeed;
        address zeeveWallet;
        address igniteContract;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ========================
    // Initialization Functions
    // ========================
    /**
     * @dev Initialize roles for the contract.
     * @param benqiSuperAdmin The address of the BENQI super admin.
     * @param benqiAdmin The address of the BENQI admin.
     * @param zeeveSuperAdmin The address of the ZEEVE super admin.
     * @param zeeveAdmin The address of the ZEEVE admin.
     */
    function initializeRoles(
        address benqiSuperAdmin,
        address benqiAdmin,
        address zeeveSuperAdmin,
        address zeeveAdmin
    ) private onlyInitializing {
        require(
            benqiSuperAdmin != address(0),
            "Invalid BENQI super admin address"
        );
        require(benqiAdmin != address(0), "Invalid BENQI admin address");
        require(
            zeeveSuperAdmin != address(0),
            "Invalid ZEEVE super admin address"
        );
        require(zeeveAdmin != address(0), "Invalid ZEEVE admin address");

        _grantRole(DEFAULT_ADMIN_ROLE, benqiSuperAdmin);
        _grantRole(BENQI_SUPER_ADMIN_ROLE, benqiSuperAdmin);
        _grantRole(BENQI_ADMIN_ROLE, benqiAdmin);
        _grantRole(ZEEVE_SUPER_ADMIN_ROLE, zeeveSuperAdmin);
        _grantRole(ZEEVE_ADMIN_ROLE, zeeveAdmin);
    }

    /**
     * @dev Set initial parameters for the contract.
     * @param addresses Struct containing contract addresses.
     * @param _initialStakingAmount Initial staking amount in AVAX.
     * @param _initialHostingFee Initial hosting fee in AVAX.
     * @param _joeRouter Address of the JoeRouter contract.
     * @param _maxAvaxPriceAge Maximum age for AVAX price data.
     * @param _maxQiPriceAge Maximum age for QI price data.
     */
    function setInitialParameters(
        ContractAddresses memory addresses,
        uint256 _initialStakingAmount,
        uint256 _initialHostingFee,
        address _joeRouter,
        uint256 _maxAvaxPriceAge,
        uint256 _maxQiPriceAge
    ) internal {
        require(
            addresses.zeeveWallet != address(0),
            "Invalid Zeeve wallet address"
        );
        require(
            addresses.igniteContract != address(0),
            "Invalid Ignite contract address"
        );
        require(_joeRouter != address(0), "Invalid JoeRouter address");
        require(
            _initialStakingAmount > 0,
            "Initial staking amount must be greater than zero"
        );
        require(
            _initialHostingFee > 0,
            "Initial hosting fee must be greater than zero"
        );

        qiToken = IERC20Upgradeable(addresses.qiToken);
        zeeveWallet = addresses.zeeveWallet;
        igniteContract = IIgnite(addresses.igniteContract);
        avaxStakeAmount = _initialStakingAmount;
        hostingFeeAvax = _initialHostingFee;
        joeRouter = IJoeRouter02(_joeRouter);
        slippage = 1; // 1% slippage
        minSlippage = 0; // Min slippage
        maxSlippage = 5; // Max slippage
        refundPeriod = 5 days;

        _initializePriceFeeds(
            addresses.avaxPriceFeed,
            _maxAvaxPriceAge,
            addresses.qiToken,
            addresses.qiPriceFeed,
            _maxQiPriceAge
        );
        acceptedTokens.add(AVAX);
        acceptedTokens.add(addresses.qiToken);
        intermediaryToken = joeRouter.WAVAX();
    }

    /**
     * @dev Initialize the contract.
     * @param addresses Struct containing contract addresses.
     * @param benqiSuperAdmin The address of the BENQI super admin.
     * @param benqiAdmin The address of the BENQI admin.
     * @param zeeveSuperAdmin The address of the ZEEVE super admin.
     * @param zeeveAdmin The address of the ZEEVE admin.
     * @param _initialStakingAmount Initial staking amount in AVAX.
     * @param _initialHostingFee Initial hosting fee in AVAX.
     * @param _joeRouter Address of the JoeRouter contract.
     * @param _maxAvaxPriceAge Maximum age for AVAX price data.
     * @param _maxQiPriceAge Maximum age for QI price data.
     */
    function initialize(
        ContractAddresses memory addresses,
        address benqiSuperAdmin,
        address benqiAdmin,
        address zeeveSuperAdmin,
        address zeeveAdmin,
        uint256 _initialStakingAmount,
        uint256 _initialHostingFee,
        address _joeRouter,
        uint256 _maxAvaxPriceAge,
        uint256 _maxQiPriceAge
    ) public initializer {
        __AccessControl_init_unchained();
        __ReentrancyGuard_init_unchained();
        __Pausable_init_unchained();
        initializeRoles(
            benqiSuperAdmin,
            benqiAdmin,
            zeeveSuperAdmin,
            zeeveAdmin
        );
        setInitialParameters(
            addresses,
            _initialStakingAmount,
            _initialHostingFee,
            _joeRouter,
            _maxAvaxPriceAge,
            _maxQiPriceAge
        );
    }

    /**
     * @dev Initialize price feeds for tokens.
     * @param _avaxPriceFeed Address of the AVAX price feed.
     * @param _maxAvaxPriceAge Maximum age for AVAX price data.
     * @param _qiToken Address of the QI token.
     * @param _qiPriceFeed Address of the QI price feed.
     * @param _maxQiPriceAge Maximum age for QI price data.
     */
    function _initializePriceFeeds(
        address _avaxPriceFeed,
        uint256 _maxAvaxPriceAge,
        address _qiToken,
        address _qiPriceFeed,
        uint256 _maxQiPriceAge
    ) internal onlyInitializing {
        _validateAndSetPriceFeed(AVAX, _avaxPriceFeed, _maxAvaxPriceAge);
        _validateAndSetPriceFeed(_qiToken, _qiPriceFeed, _maxQiPriceAge);
    }

    // ========================
    // Modifier Functions
    // ========================
    /**
     * @dev Modifier to check if the duration is valid.
     * @param duration The duration to check.
     */
    modifier onlyValidDuration(uint256 duration) {
        require(isValidDuration(duration), "Invalid duration");
        _;
    }

    // ========================
    // External Functions
    // ========================

    /**
     * @dev Set the slippage percentage.
     * @param _slippage The new slippage percentage.
     */
    function setSlippage(
        uint256 _slippage
    ) external onlyRole(BENQI_ADMIN_ROLE) {
        uint256 boundedSlippage = _slippage;
        if (_slippage < minSlippage) {
            boundedSlippage = minSlippage;
        } else if (_slippage > maxSlippage) {
            boundedSlippage = maxSlippage;
        }
        uint256 oldSlippage = slippage;
        slippage = boundedSlippage;
        emit SlippageUpdated(oldSlippage, _slippage);
    }

    /**
     * @dev Set the minimum slippage percentage.
     * @param _minSlippage The new minimum slippage percentage.
     */
    function setMinSlippage(
        uint256 _minSlippage
    ) external onlyRole(BENQI_ADMIN_ROLE) {
        require(slippage >= _minSlippage, "Error: minimum slippage must be lower than the current slippage");
        uint256 oldMinSlippage = minSlippage;
        minSlippage = _minSlippage;
        emit MinSlippageUpdated(oldMinSlippage, _minSlippage);
    }

    /**
     * @dev Set the maximum slippage percentage.
     * @param _maxSlippage The new maximum slippage percentage.
     */
    function setMaxSlippage(
        uint256 _maxSlippage
    ) external onlyRole(BENQI_ADMIN_ROLE) {
        require(_maxSlippage > 0, "Invalid maximum slippage percentage");
        require(slippage <= _maxSlippage, "Error: current slippage exceeds the maximum allowed limit");
        uint256 oldMaxSlippage = maxSlippage;
        maxSlippage = _maxSlippage;
        emit MaxSlippageUpdated(oldMaxSlippage, _maxSlippage);
    }

    /**
     * @dev Update the staking fee.
     * @param _newStakingFee The new staking fee.
     */
    function updateStakingFee(
        uint256 _newStakingFee
    ) external onlyRole(BENQI_ADMIN_ROLE) {
        require(_newStakingFee > 0, "Invalid staking fee"); // Check for zero value
        uint256 oldStakingFee = avaxStakeAmount;
        avaxStakeAmount = _newStakingFee;
        emit StakingFeeUpdated(oldStakingFee, _newStakingFee);
    }

    /**
     * @dev Update the hosting fee.
     * @param _newHostingFee The new hosting fee.
     */
    function updateHostingFee(uint256 _newHostingFee) external {
        require(_newHostingFee > 0, "Invalid hosting fee"); // Check for zero value

        require(
            hasRole(ZEEVE_ADMIN_ROLE, msg.sender) ||
                hasRole(BENQI_ADMIN_ROLE, msg.sender),
            "Not authorized to update hosting fee"
        );
        uint256 oldFee = hostingFeeAvax;
        hostingFeeAvax = _newHostingFee;
        emit HostingFeeUpdated(oldFee, _newHostingFee);
    }

    /**
     * @dev Register a node with the Ignite contract.
     * @param user The user address.
     * @param nodeId The node ID.
     * @param blsProofOfPossession The BLS proof of possession (public key + signature).
     * @param index The stake record index.
     */
    function registerNode(
        address user,
        string calldata nodeId,
        bytes calldata blsProofOfPossession,
        uint256 index
    ) external onlyRole(ZEEVE_ADMIN_ROLE) whenNotPaused {
        require(
            bytes(nodeId).length > 0 && blsProofOfPossession.length == 144,
            "Invalid node or BLS key"
        );
        require(
            igniteContract.registrationIndicesByNodeId(nodeId) == 0,
            "Node ID already registered"
        );
        // Retrieve the staking details from the stored records
        require(stakeRecords[user].stakeCount > 0, "Staking details not found");
        require(index < stakeRecords[user].stakeCount, "Index out of bounds"); // Ensures the index is valid

        StakeRecord storage record = stakeRecords[user].records[index]; // Access the record by index
        require(record.timestamp != 0, "Staking details not found");
        require(isValidDuration(record.duration), "Invalid duration");
        // Ensure the staking status is Provisioning
        require(
            record.status == StakingStatus.Provisioning,
            "Invalid staking status"
        );

        uint256 qiAmount = record.amountStaked;

        // Approve the Ignite contract to pull QI tokens
        qiToken.forceApprove(address(igniteContract), qiAmount);
        // Transfer the hosting fee to the Zeeve wallet
        if (record.tokenType == AVAX) {
            _transferETHAndWrapIfFailWithGasLimit(
                joeRouter.WAVAX(),
                zeeveWallet,
                record.hostingFeePaid,
                2300
            );
        } else {
            IERC20Upgradeable(record.tokenType).safeTransfer(
                zeeveWallet,
                record.hostingFeePaid
            );
        }

        // Call the external function
        igniteContract.registerWithPrevalidatedQiStake(
            user,
            nodeId,
            blsProofOfPossession,
            record.duration,
            qiAmount
        );
        // Reset allowance to 0 after the transfer for security
        qiToken.forceApprove(address(igniteContract), 0);
        // Update the status to Provisioned
        record.status = StakingStatus.Provisioned;

        emit IgniteRegistered(user, nodeId, blsProofOfPossession);
    }

    /**
     * @dev Stake AVAX for QI tokens.
     * @param duration The duration of the stake.
     */
    function stakeWithAVAX(
        uint256 duration
    ) external payable nonReentrant whenNotPaused onlyValidDuration(duration) {
        uint256 hostingFee = calculateHostingFee(duration);

        require(
            msg.value >= avaxStakeAmount + hostingFee,
            "Insufficient AVAX sent"
        );

        // Calculate the total required amount
        uint256 totalRequired = avaxStakeAmount + hostingFee;
        uint256 excessAmount = msg.value - totalRequired;

        // Perform the swap and check slippage
        uint256 stakingAmountInQi = swapForQI(avaxStakeAmount, AVAX);

        // Refund the excess amount to the user
        if (excessAmount > 0) {
            _transferETHAndWrapIfFailWithGasLimit(
                joeRouter.WAVAX(),
                msg.sender,
                excessAmount,
                2300
            );
            emit Refunded(msg.sender, excessAmount);
        }
        UserStakeRecords storage userRecords = stakeRecords[msg.sender];
        uint256 index = userRecords.stakeCount;

        // Record the staking details
        userRecords.records[index] = StakeRecord({
            amountStaked: stakingAmountInQi,
            hostingFeePaid: hostingFee,
            timestamp: block.timestamp,
            duration: duration,
            tokenType: AVAX,
            status: StakingStatus.Provisioning
        });

        userRecords.stakeCount += 1;

        emit Staked(
            msg.sender,
            stakingAmountInQi,
            duration,
            hostingFee,
            AVAX,
            index,
            block.timestamp
        );
    }

    /**
     * @dev Stake ERC20 tokens for QI tokens.
     * @param duration The duration of the stake.
     * @param amount The amount of tokens to stake.
     * @param token The address of the ERC20 token.
     */
    function stakeWithERC20(
        uint256 duration,
        uint256 amount,
        address token
    ) external nonReentrant whenNotPaused onlyValidDuration(duration) {
        require(isTokenAccepted(token), "Token not accepted");
        uint256 hostingFee = calculateHostingFee(duration);

        uint256 totalRequiredToken = convertAvaxToToken(
            token,
            avaxStakeAmount + hostingFee
        );

        require(amount >= totalRequiredToken, "Insufficient token");

        // Transfer tokens from the user to the contract
        IERC20Upgradeable(token).safeTransferFrom(
            msg.sender,
            address(this),
            totalRequiredToken
        );
        uint256 stakingAmountInQi;
        if (token == address(qiToken)) {
            stakingAmountInQi =
                totalRequiredToken -
                convertAvaxToToken(token, hostingFee);
        } else {
            stakingAmountInQi = swapForQI(
                convertAvaxToToken(token, avaxStakeAmount),
                token
            );
        }

        // Transfer the hosting fee in the original token to the Zeeve wallet
        uint256 hostingFeeInToken = convertAvaxToToken(token, hostingFee);
        UserStakeRecords storage userRecords = stakeRecords[msg.sender];
        uint256 index = userRecords.stakeCount;

        // Record the staking details
        userRecords.records[index] = StakeRecord({
            amountStaked: stakingAmountInQi,
            hostingFeePaid: hostingFeeInToken,
            timestamp: block.timestamp,
            duration: duration,
            tokenType: token,
            status: StakingStatus.Provisioning
        });
        userRecords.stakeCount += 1;

        emit Staked(
            msg.sender,
            stakingAmountInQi,
            duration,
            hostingFeeInToken,
            token,
            index,
            block.timestamp
        );
    }

    /**
     * @dev Add a new token to the list of accepted tokens.
     * @param token The address of the token.
     * @param priceFeedAddress The address of the price feed for the token.
     * @param maxPriceAge The maximum age of the price data.
     */
    function addToken(
        address token,
        address priceFeedAddress,
        uint256 maxPriceAge
    ) external onlyRole(BENQI_ADMIN_ROLE) {
        require(acceptedTokens.add(token), "Token already in accepted list");
        _validateAndSetPriceFeed(token, priceFeedAddress, maxPriceAge);
        emit TokenAdded(token);
    }

    /**
     * @dev Remove a token from the list of accepted tokens.
     * @param token The address of the token.
     */
    function removeToken(address token) external onlyRole(BENQI_ADMIN_ROLE) {
        require(token != address(0), "Invalid token address");
        require(acceptedTokens.remove(token), "Token not in accepted list");
        
        delete priceFeeds[token];
        delete maxPriceAges[token];

        emit TokenRemoved(token);
    }

    /**
     * @dev Update the price feed for a token.
     * @param token The address of the token.
     * @param newPriceFeed The address of the new price feed.
     */
    function updatePriceFeed(
        address token,
        address newPriceFeed
    ) external onlyRole(BENQI_ADMIN_ROLE) {
        require(acceptedTokens.contains(token), "Token not accepted"); // Check if the token is accepted
        address oldPriceFeed = address(priceFeeds[token]);
        _validateAndSetPriceFeed(token, newPriceFeed, maxPriceAges[token]);
        emit PriceFeedUpdated(token, oldPriceFeed, newPriceFeed);
    }

    /**
     * @dev Pause the contract.
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause the contract.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Get the stake records of a user.
     * @param user The address of the user.
     * @return records An array of stake records.
     */
    function getStakeRecords(
        address user
    ) external view returns (StakeRecord[] memory) {
        UserStakeRecords storage userRecords = stakeRecords[user];
        StakeRecord[] memory records = new StakeRecord[](
            userRecords.stakeCount
        );
        for (uint256 i = 0; i < userRecords.stakeCount; i++) {
            records[i] = userRecords.records[i];
        }
        return records;
    }

    /**
     * @dev Set the intermediary token address.
     * @param _intermediaryToken The address of the new intermediary token.
     */
    function setIntermediaryToken(
        address _intermediaryToken
    ) external onlyRole(BENQI_ADMIN_ROLE) {
        require(_intermediaryToken != address(0), "Invalid token address");
        address oldToken = intermediaryToken;
        intermediaryToken = _intermediaryToken;
        emit IntermediaryTokenUpdated(oldToken, _intermediaryToken);
    }

    /**
     * @dev Set the refund period.
     * @param _refundPeriod The new refund period in days.
     */
    function setRefundPeriod(
        uint256 _refundPeriod
    ) external onlyRole(BENQI_ADMIN_ROLE) {
        require(_refundPeriod > 0, "Invalid refund period"); // Check for zero value
        require(
            _refundPeriod <= FORTNIGHT_IN_SECONDS,
            "Refund period exceeds maximum limit"
        ); // Ensure the refund period does not exceed 1 fortnight
        refundPeriod = _refundPeriod;
    }

    /**
     * @dev Refund the staked amount to the user.
     * @param user The user address.
     * @param stakeIndex The index of the user's stake record.
     */
    function refundStakedAmount(
        address user,
        uint256 stakeIndex
    ) external onlyRole(BENQI_ADMIN_ROLE) {
        require(user != address(0), "Invalid user address");
        require(stakeRecords[user].stakeCount > 0, "No stake records found");
        require(
            stakeIndex < stakeRecords[user].stakeCount,
            "Invalid stake index"
        );

        StakeRecord storage record = stakeRecords[user].records[stakeIndex];
        require(
            record.status == StakingStatus.Provisioning,
            "Stake not in provisioning status"
        );
        require(
            block.timestamp > record.timestamp + refundPeriod,
            "Refund period not reached"
        );

        uint256 refundId = uint256(
            keccak256(abi.encodePacked(user, stakeIndex, block.timestamp))
        );
        uint256 stakedAmount = record.amountStaked;
        uint256 hostingFeePaid = record.hostingFeePaid;
        address tokenType = record.tokenType;

        // Refund the staked amount
        qiToken.safeTransfer(user, stakedAmount);
        // Refund the hosting fee
        if (tokenType == AVAX) {
            _transferETHAndWrapIfFailWithGasLimit(
                joeRouter.WAVAX(),
                user,
                hostingFeePaid,
                2300
            );
        } else {
            IERC20Upgradeable(tokenType).safeTransfer(user, hostingFeePaid);
        }
        // Update the status to Refunded
        record.status = StakingStatus.Refunded;

        emit RefundedStake(user, stakeIndex, stakedAmount, refundId);
    }

    // ========================
    // Public Functions
    // ========================
    /**
     * @dev Check if a token is accepted.
     * @param token The address of the token.
     * @return True if the token is accepted, false otherwise.
     */
    function isTokenAccepted(address token) public view returns (bool) {
        return acceptedTokens.contains(token);
    }

    /**
     * @dev Get the count of accepted tokens.
     * @return The count of accepted tokens.
     */
    function getAcceptedTokensCount() public view returns (uint256) {
        return acceptedTokens.length();
    }

    /**
     * @dev Get the list of accepted tokens.
     * @return An array of accepted token addresses.
     */
    function getAcceptedTokens() public view returns (address[] memory) {
        return acceptedTokens.values();
    }

    /**
     * @dev Convert AVAX amount to QI amount.
     * @param avaxAmount The amount of AVAX.
     * @return The equivalent amount of QI.
     */
    function convertAvaxToQI(uint256 avaxAmount) public view returns (uint256) {
        uint256 avaxUsdPrice = _getPriceInUSD(AVAX);
        uint256 qiUsdPrice = _getPriceInUSD(address(qiToken));

        return (avaxUsdPrice * avaxAmount) / qiUsdPrice;
    }

    /**
     * @notice Grants a role to an account.
     * @dev Overrides the AccessControlUpgradeable implementation.
     */
    function grantRole(
        bytes32,
        address
    ) public virtual override(AccessControlUpgradeable) {
        revert("Direct role granting is not allowed. Use grantAdminRole.");
    }

    /**
     * @notice Revokes a role from an account.
     * @dev Overrides the AccessControlUpgradeable implementation.
     */
    function revokeRole(
        bytes32,
        address
    ) public virtual override(AccessControlUpgradeable) {
        revert("Direct role revocation is not allowed. Use revokeAdminRole.");
    }

    /**
     * @notice Renounces a role by an account.
     * @dev Overrides the AccessControlUpgradeable implementation to prevent role renunciation.
     */
    function renounceRole(
        bytes32,
        address
    ) public virtual override(AccessControlUpgradeable) {
        revert("Renouncing roles is not allowed for this contract.");
    }

    // ========================
    // Internal Functions
    // ========================
    /**
     * @dev Check if the duration is valid.
     * @param duration The duration to check.
     * @return True if the duration is valid, false otherwise.
     */
    function isValidDuration(uint256 duration) internal view returns (bool) {
        try igniteContract.getRegistrationFee(duration) returns (uint256) {
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @dev Calculate the hosting fee based on duration.
     * @param duration The duration of the stake.
     * @return The hosting fee.
     */

    function calculateHostingFee(
        uint256 duration
    ) internal view returns (uint256) {
        require(isValidDuration(duration), "Invalid duration");

        uint256 numFortnights = duration / FORTNIGHT_IN_SECONDS; // 14 days
        return numFortnights * hostingFeeAvax;
    }

    /**
     * @dev Convert AVAX amount to the equivalent amount of a token.
     * @param token The address of the token.
     * @param avaxAmount The amount of AVAX.
     * @return The equivalent amount of the token.
     */

    function convertAvaxToToken(
        address token,
        uint256 avaxAmount
    ) internal view returns (uint256) {
        uint256 avaxUsdPrice = _getPriceInUSD(AVAX);
        uint256 tokenUsdPrice = _getPriceInUSD(token); // Get the price of 1 token in USD

        return (avaxUsdPrice * avaxAmount) / tokenUsdPrice;
    }

    /**
     * @dev Swap tokens for QI tokens.
     * @param amountIn The amount of tokens to swap.
     * @param token The address of the token.
     * @return The amount of QI tokens received.
     */
    function swapForQI(
        uint256 amountIn,
        address token
    ) internal returns (uint256) {
        uint256 expectedQiAmount = convertTokenToQi(token, amountIn);

        address[] memory path;
        if (token == joeRouter.WAVAX() || token == AVAX) {
            path = new address[](2);
            path[0] = joeRouter.WAVAX();
            path[1] = address(qiToken);
        } else {
            path = new address[](3);
            path[0] = token;
            path[1] = intermediaryToken;
            path[2] = address(qiToken);
        }

        // Get the best price quote
        uint256 slippageFactor = 100 - slippage; // Convert slippage percentage to factor
        uint256 amountOutMin = (expectedQiAmount * slippageFactor) / 100; // Apply slippage

        uint256[] memory amountOutReal;
        uint256 deadline = block.timestamp;

        if (token == AVAX) {
            // Perform the swap for AVAX
            amountOutReal = joeRouter.swapExactAVAXForTokens{value: amountIn}(
                amountOutMin,
                path,
                address(this),
                deadline
            );
        } else {
            // Check allowance and approve if necessary
            uint256 allowance = IERC20Upgradeable(token).allowance(
                address(this),
                address(joeRouter)
            );
            if (allowance < amountIn) {
                IERC20Upgradeable(token).forceApprove(
                    address(joeRouter),
                    amountIn
                );
            }
            // Perform the swap for ERC20 tokens
            amountOutReal = joeRouter.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                address(this),
                deadline
            );
        }

        // Slippage check
        uint256 lowerBound = amountOutMin;
        require(
            amountOutReal[amountOutReal.length - 1] >= lowerBound,
            "Excessive slippage"
        );

        return amountOutReal[amountOutReal.length - 1];
    }

    /**
     * @dev Validates and sets the price feed for a given token.
     * @param token The address of the token.
     * @param priceFeedAddress The address of the price feed contract.
     * @param maxPriceAge The maximum age (in seconds) for the price data to be considered valid.
     */
    function _validateAndSetPriceFeed(
        address token,
        address priceFeedAddress,
        uint256 maxPriceAge
    ) internal {
        require(token != address(0), "Invalid token address");
        require(priceFeedAddress != address(0), "Invalid price feed address");
        require(maxPriceAge > 0, "Invalid max price age");

        AggregatorV3Interface priceFeed = AggregatorV3Interface(
            priceFeedAddress
        );
        (, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        require(block.timestamp - updatedAt <= maxPriceAge, "Stale price");

        priceFeeds[token] = priceFeed;
        maxPriceAges[token] = maxPriceAge;
    }

    /**
     * @dev Gets the price of a given token in USD.
     * @param token The address of the token.
     * @return The price of the token amount in USD.
     */
    function _getPriceInUSD(address token) internal view returns (uint256) {
        (, int256 tokenPrice, , uint256 tokenUpdatedAt, ) = priceFeeds[token]
            .latestRoundData();
        require(
            tokenPrice > 0 &&
                block.timestamp - tokenUpdatedAt <= maxPriceAges[token],
            "Invalid or stale token price"
        );
        uint256 scaledTokenPrice = uint256(tokenPrice);
        uint256 feedDecimalDelta = uint256(18) -
            uint256(priceFeeds[token].decimals());
        if (feedDecimalDelta > 0) {
            scaledTokenPrice = scaledTokenPrice * (10 ** feedDecimalDelta);
        }
        uint256 tokenDecimalDelta = (token == AVAX)
            ? 18
            : IERC20Metadata(token).decimals();
        uint256 decimalDelta = uint256(18) - tokenDecimalDelta;
        if (decimalDelta > 0) {
            scaledTokenPrice = scaledTokenPrice * (10 ** decimalDelta);
        }
        return scaledTokenPrice;
    }

    /**
     * @dev Convert any token amount to the equivalent amount of QI.
     * @param token The address of the token.
     * @param amount The amount of the token.
     * @return The equivalent amount of QI.
     */
    function convertTokenToQi(
        address token,
        uint256 amount
    ) internal view returns (uint256) {
        uint256 tokenUsdPrice = _getPriceInUSD(token);
        uint256 qiUsdPrice = _getPriceInUSD(address(qiToken)); // Get the price of 1 QI in USD

        return (tokenUsdPrice * amount) / qiUsdPrice;
    }

    // ========================
    // Admin Functions
    // ========================

    /**
     * @dev Grant an admin role.
     * @param role The role to grant.
     * @param account The account to grant the role to.
     */
    function grantAdminRole(bytes32 role, address account) public {
        // Ensure the account parameter is not a zero address to prevent accidental misassignments
        require(
            account != address(0),
            "Cannot assign role to the zero address"
        );

        if (role == BENQI_ADMIN_ROLE) {
            require(
                hasRole(BENQI_SUPER_ADMIN_ROLE, msg.sender),
                "Not authorized to grant this role"
            );
        } else if (role == ZEEVE_ADMIN_ROLE) {
            require(
                hasRole(ZEEVE_SUPER_ADMIN_ROLE, msg.sender),
                "Not authorized to grant this role"
            );
        } else {
            // Optionally handle cases where an unknown role is attempted to be granted
            revert("Attempting to grant an unrecognized role");
        }
        // Check if the account already has the role
        if (hasRole(role, account)) {
            revert("Account already has the role");
        }
        _grantRole(role, account);
        emit AdminRoleGranted(role, account, msg.sender);
    }

    /**
     * @dev Revoke an admin role.
     * @param role The role to revoke.
     * @param account The account to revoke the role from.
     */
    function revokeAdminRole(bytes32 role, address account) public {
        // Ensure the account parameter is not a zero address to prevent accidental misassignments
        require(
            account != address(0),
            "Address cannot be zero"
        );

        if (role == BENQI_ADMIN_ROLE) {
            require(
                hasRole(BENQI_SUPER_ADMIN_ROLE, msg.sender),
                "Caller lacks BENQI_SUPER_ADMIN_ROLE authorization"
            );
        } else if (role == ZEEVE_ADMIN_ROLE) {
            require(
                hasRole(ZEEVE_SUPER_ADMIN_ROLE, msg.sender),
                "Caller lacks ZEEVE_SUPER_ADMIN_ROLE authorization"
            );
        } else {
            // Optionally handle cases where an unknown role is attempted to be granted
            revert("Role provided for revocation is not recognized");
        }
        // Check if the account actually has the role before revoking it
        if (!hasRole(role, account)) {
            revert("Account does not possess the specified role");
        }
        _revokeRole(role, account);
        emit AdminRoleRevoked(role, account, msg.sender);
    }

    /**
     * @dev Update an admin role.
     * @param role The role to update.
     * @param oldAdmin The account to revoke the role from.
     * @param newAdmin The account to grant the role to.
     */
    function updateAdminRole(
        bytes32 role,
        address oldAdmin,
        address newAdmin
    ) public {
        // Ensure the account parameter is not a zero address to prevent accidental misassignments
        require(
            newAdmin != address(0),
            "Cannot assign role to the zero address"
        );

        if (role == BENQI_ADMIN_ROLE) {
            require(
                hasRole(BENQI_SUPER_ADMIN_ROLE, msg.sender),
                "Not authorized to update this role"
            );
        } else if (role == ZEEVE_ADMIN_ROLE) {
            require(
                hasRole(ZEEVE_SUPER_ADMIN_ROLE, msg.sender),
                "Not authorized to update this role"
            );
        } else {
            // Optionally handle cases where an unknown role is attempted to be granted
            revert("Attempting to grant an unrecognized role");
        }
        // Check if oldAdmin actually has the role before revoking it
        if (!hasRole(role, oldAdmin)) {
            revert("Old admin does not have the role to be revoked");
        }

        // Check if newAdmin already has the role
        if (hasRole(role, newAdmin)) {
            revert("New admin already has the role");
        }
        _revokeRole(role, oldAdmin);
        _grantRole(role, newAdmin);
        emit AdminRoleRevoked(role, oldAdmin, msg.sender);
        emit AdminRoleGranted(role, newAdmin, msg.sender);
    }
}
