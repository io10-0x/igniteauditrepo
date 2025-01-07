const { expect, assert } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("StakingContract", function () {
    let StakingContract, stakingContract;
    let deployer, benqiSuperAdmin, benqiAdmin, zeeveSuperAdmin, zeeveAdmin, otherUser, qiToken;
    let contractAddresses;

    const qiTokenAddress = '0xFFd31a26B7545243F430C0999d4BF11A93408a8C';
    const avaxPriceFeed = '0x7dF6058dd1069998571497b8E3c0Eb13A8cb6a59';
    const qiPriceFeed = '0xF3f62E241bC33EF00C731D257F945e8645396Ced';
    const zeeveWallet = '0x6Ce78374dFf46B660E274d0b10E29890Eeb0167b';
    const igniteSmartContract = '0xF1652dc03Ee76F7b22AFc7FF1cD539Cf20d545D5';
    const joeRouterAddress = '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901';
    const initialStakingAmount = ethers.parseUnits("0.001", "ether"); // 200 AVAX
    const initialHostingFee = ethers.parseUnits("0.001", "ether"); // 1.4 AVAX
    const AVAX = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

    before(async function () {
        // Get signers
        [deployer, benqiSuperAdmin, benqiAdmin, zeeveSuperAdmin, zeeveAdmin, otherUser] = await ethers.getSigners();

        qiToken = await ethers.getContractAt("IERC20", qiTokenAddress);
        contractAddresses = {
            qiToken: qiTokenAddress,
            avaxPriceFeed,
            qiPriceFeed,
            zeeveWallet,
            igniteContract: igniteSmartContract
        }

        // Get the ContractFactory and deploy the proxy
        StakingContract = await ethers.getContractFactory("StakingContract");
        stakingContract = await upgrades.deployProxy(StakingContract, [
            contractAddresses,
            benqiSuperAdmin.address,
            benqiAdmin.address,
            zeeveSuperAdmin.address,
            zeeveAdmin.address,
            initialStakingAmount,
            initialHostingFee,
            joeRouterAddress,
            432000,
            432000
        ], { initializer: 'initialize' });

        await stakingContract.waitForDeployment();
        console.log("Contract deployed to: ", await stakingContract.getAddress());

    });
    describe("initializeRoles", function () {
        it("Should grant DEFAULT_ADMIN_ROLE to benqiSuperAdmin", async function () {
            const defaultAdminRole = await stakingContract.DEFAULT_ADMIN_ROLE();
            expect(await stakingContract.hasRole(defaultAdminRole, benqiSuperAdmin.address)).to.be.true;
        });

        it("Should grant BENQI_SUPER_ADMIN_ROLE to benqiSuperAdmin", async function () {
            const benqiSuperAdminRole = await stakingContract.BENQI_SUPER_ADMIN_ROLE();
            expect(await stakingContract.hasRole(benqiSuperAdminRole, benqiSuperAdmin.address)).to.be.true;
        });

        it("Should grant BENQI_ADMIN_ROLE to benqiAdmin", async function () {
            const benqiAdminRole = await stakingContract.BENQI_ADMIN_ROLE();
            expect(await stakingContract.hasRole(benqiAdminRole, benqiAdmin.address)).to.be.true;
        });

        it("Should grant ZEEVE_SUPER_ADMIN_ROLE to zeeveSuperAdmin", async function () {
            const zeeveSuperAdminRole = await stakingContract.ZEEVE_SUPER_ADMIN_ROLE();
            expect(await stakingContract.hasRole(zeeveSuperAdminRole, zeeveSuperAdmin.address)).to.be.true;
        });

        it("Should grant ZEEVE_ADMIN_ROLE to zeeveAdmin", async function () {
            const zeeveAdminRole = await stakingContract.ZEEVE_ADMIN_ROLE();
            expect(await stakingContract.hasRole(zeeveAdminRole, zeeveAdmin.address)).to.be.true;
        });

        it("Should revert if any role is assigned to zero address", async function () {
            await expect(
                upgrades.deployProxy(StakingContract, [
                    contractAddresses,
                    ethers.ZeroAddress,
                    benqiAdmin.address,
                    zeeveSuperAdmin.address,
                    zeeveAdmin.address,
                    ethers.parseUnits("0.001", "ether"),
                    ethers.parseUnits("0.001", "ether"),
                    ethers.ZeroAddress,
                    432000,
                    432000
                ], { initializer: 'initialize' })
            ).to.be.revertedWith("Invalid BENQI super admin address");

            await expect(
                upgrades.deployProxy(StakingContract, [
                    contractAddresses,
                    benqiSuperAdmin.address,
                    ethers.ZeroAddress,
                    zeeveSuperAdmin.address,
                    zeeveAdmin.address,
                    ethers.parseUnits("0.001", "ether"),
                    ethers.parseUnits("0.001", "ether"),
                    ethers.ZeroAddress,
                    432000,
                    432000
                ], { initializer: 'initialize' })
            ).to.be.revertedWith("Invalid BENQI admin address");

            await expect(
                upgrades.deployProxy(StakingContract, [
                    contractAddresses,
                    benqiSuperAdmin.address,
                    benqiAdmin.address,
                    ethers.ZeroAddress,
                    zeeveAdmin.address,
                    ethers.parseUnits("0.001", "ether"),
                    ethers.parseUnits("0.001", "ether"),
                    ethers.ZeroAddress,
                    432000,
                    432000
                ], { initializer: 'initialize' })
            ).to.be.revertedWith("Invalid ZEEVE super admin address");

            await expect(
                upgrades.deployProxy(StakingContract, [
                    contractAddresses,
                    benqiSuperAdmin.address,
                    benqiAdmin.address,
                    zeeveSuperAdmin.address,
                    ethers.ZeroAddress,
                    ethers.parseUnits("0.001", "ether"),
                    ethers.parseUnits("0.001", "ether"),
                    ethers.ZeroAddress,
                    432000,
                    432000
                ], { initializer: 'initialize' })
            ).to.be.revertedWith("Invalid ZEEVE admin address");
        });
        it("Should not assign any unintended roles to benqiSuperAdmin", async function () {
            const zeeveAdminRole = await stakingContract.ZEEVE_ADMIN_ROLE();
            expect(await stakingContract.hasRole(zeeveAdminRole, benqiSuperAdmin.address)).to.be.false;
        });
        it("Should not assign any unintended roles to zeeveSuperAdmin", async function () {
            const benqiAdminRole = await stakingContract.BENQI_ADMIN_ROLE();
            expect(await stakingContract.hasRole(benqiAdminRole, zeeveSuperAdmin.address)).to.be.false;
        });
    });
    describe("setInitialParameters", function () {
        it("Should set qiToken correctly", async function () {
            const qiToken = await stakingContract.qiToken();
            expect(qiToken).to.equal(contractAddresses.qiToken);
        });

        it("Should set zeeveWallet correctly", async function () {
            const zeeveWallet = await stakingContract.zeeveWallet();
            expect(zeeveWallet).to.equal(contractAddresses.zeeveWallet);
        });

        it("Should set igniteContract correctly", async function () {
            const igniteContract = await stakingContract.igniteContract();
            expect(igniteContract).to.equal(contractAddresses.igniteContract);
        });

        it("Should set avaxStakeAmount correctly", async function () {
            const avaxStakeAmount = await stakingContract.avaxStakeAmount();
            expect(avaxStakeAmount).to.equal(ethers.parseUnits("0.001", "ether"));
        });

        it("Should set hostingFeeAvax correctly", async function () {
            const hostingFeeAvax = await stakingContract.hostingFeeAvax();
            expect(hostingFeeAvax).to.equal(ethers.parseUnits("0.001", "ether"));
        });

        it("Should set slippage to 1", async function () {
            const slippage = await stakingContract.slippage();
            expect(slippage).to.equal(1);
        });

        it("Should initialize price feeds correctly", async function () {
            const avaxPriceFeed = await stakingContract.priceFeeds(AVAX);
            expect(avaxPriceFeed).to.equal(contractAddresses.avaxPriceFeed);
        });

        it("Should revert if any contract address is zero", async function () {
            await expect(
                upgrades.deployProxy(StakingContract, [
                    { ...contractAddresses, qiToken: ethers.ZeroAddress },
                    benqiSuperAdmin.address,
                    benqiAdmin.address,
                    zeeveSuperAdmin.address,
                    zeeveAdmin.address,
                    ethers.parseUnits("0.001", "ether"),
                    ethers.parseUnits("0.001", "ether"),
                    joeRouterAddress,
                    432000,
                    432000
                ], { initializer: 'initialize' })
            ).to.be.revertedWith("Invalid token address");

            await expect(
                upgrades.deployProxy(StakingContract, [
                    { ...contractAddresses, zeeveWallet: ethers.ZeroAddress },
                    benqiSuperAdmin.address,
                    benqiAdmin.address,
                    zeeveSuperAdmin.address,
                    zeeveAdmin.address,
                    ethers.parseUnits("0.001", "ether"),
                    ethers.parseUnits("0.001", "ether"),
                    joeRouterAddress,
                    432000,
                    432000
                ], { initializer: 'initialize' })
            ).to.be.revertedWith("Invalid Zeeve wallet address");

            await expect(
                upgrades.deployProxy(StakingContract, [
                    { ...contractAddresses, igniteContract: ethers.ZeroAddress },
                    benqiSuperAdmin.address,
                    benqiAdmin.address,
                    zeeveSuperAdmin.address,
                    zeeveAdmin.address,
                    ethers.parseUnits("0.001", "ether"),
                    ethers.parseUnits("0.001", "ether"),
                    joeRouterAddress,
                    432000,
                    432000
                ], { initializer: 'initialize' })
            ).to.be.revertedWith("Invalid Ignite contract address");

            await expect(
                upgrades.deployProxy(StakingContract, [
                    contractAddresses,
                    benqiSuperAdmin.address,
                    benqiAdmin.address,
                    zeeveSuperAdmin.address,
                    zeeveAdmin.address,
                    ethers.parseUnits("0.001", "ether"),
                    ethers.parseUnits("0.001", "ether"),
                    ethers.ZeroAddress,
                    432000,
                    432000
                ], { initializer: 'initialize' })
            ).to.be.revertedWith("Invalid JoeRouter address");

            await expect(
                upgrades.deployProxy(StakingContract, [
                    { ...contractAddresses, avaxPriceFeed: ethers.ZeroAddress },
                    benqiSuperAdmin.address,
                    benqiAdmin.address,
                    zeeveSuperAdmin.address,
                    zeeveAdmin.address,
                    ethers.parseUnits("0.001", "ether"),
                    ethers.parseUnits("0.001", "ether"),
                    joeRouterAddress,
                    432000,
                    432000
                ], { initializer: 'initialize' })
            ).to.be.revertedWith("Invalid price feed address");

            await expect(
                upgrades.deployProxy(StakingContract, [
                    { ...contractAddresses, qiPriceFeed: ethers.ZeroAddress },
                    benqiSuperAdmin.address,
                    benqiAdmin.address,
                    zeeveSuperAdmin.address,
                    zeeveAdmin.address,
                    ethers.parseUnits("0.001", "ether"),
                    ethers.parseUnits("0.001", "ether"),
                    joeRouterAddress,
                    432000,
                    432000
                ], { initializer: 'initialize' })
            ).to.be.revertedWith("Invalid price feed address");
        });

        it("Should revert if initial staking amount or initial hosting fee is zero", async function () {
            await expect(
                upgrades.deployProxy(StakingContract, [
                    contractAddresses,
                    benqiSuperAdmin.address,
                    benqiAdmin.address,
                    zeeveSuperAdmin.address,
                    zeeveAdmin.address,
                    0,
                    ethers.parseUnits("0.001", "ether"),
                    joeRouterAddress,
                    432000,
                    432000
                ], { initializer: 'initialize' })
            ).to.be.revertedWith("Initial staking amount must be greater than zero");

            await expect(
                upgrades.deployProxy(StakingContract, [
                    contractAddresses,
                    benqiSuperAdmin.address,
                    benqiAdmin.address,
                    zeeveSuperAdmin.address,
                    zeeveAdmin.address,
                    ethers.parseUnits("0.001", "ether"),
                    0,
                    joeRouterAddress,
                    432000,
                    432000
                ], { initializer: 'initialize' })
            ).to.be.revertedWith("Initial hosting fee must be greater than zero");
        });
        it("Should not allow initialize to be called more than once", async function () {
            await expect(
                stakingContract.initialize(
                    contractAddresses,
                    benqiSuperAdmin.address,
                    benqiAdmin.address,
                    zeeveSuperAdmin.address,
                    zeeveAdmin.address,
                    ethers.parseUnits("0.001", "ether"),
                    ethers.parseUnits("0.001", "ether"),
                    joeRouterAddress,
                    172800,
                    172800
                )
            ).to.be.revertedWith("Initializable: contract is already initialized");
        });
    });

    describe("Modifiers", function () {
        describe("onlyValidDuration", function () {
            it("should allow function execution with valid duration", async function () {
                const validDuration = 1209600; // Example valid duration
                const avaxStakeAmount = await stakingContract.avaxStakeAmount()
                const hostingFeeAmount = await stakingContract.hostingFeeAvax()

                const totalRequiredQi = await stakingContract.convertAvaxToQI(avaxStakeAmount + hostingFeeAmount);

                const tx = await qiToken.connect(deployer).approve(await stakingContract.getAddress(), totalRequiredQi);
                await tx.wait();

                const tx1 = await stakingContract.stakeWithERC20(validDuration, totalRequiredQi, qiTokenAddress);
                await tx1.wait();

                await expect(tx1).to.not.be.reverted;
            });

            it("should revert function execution with invalid duration", async function () {
                const invalidDuration = 1; // Example invalid duration
                const avaxStakeAmount = await stakingContract.avaxStakeAmount()
                const hostingFeeAmount = await stakingContract.hostingFeeAvax()

                const totalRequiredQi = await stakingContract.convertAvaxToQI(avaxStakeAmount + hostingFeeAmount);
                const tx = await qiToken.connect(deployer).approve(await stakingContract.getAddress(), totalRequiredQi);
                await tx.wait();
                await expect(stakingContract.stakeWithERC20(invalidDuration, totalRequiredQi, qiTokenAddress)).to.be.revertedWith("Invalid duration");
            });
        });
    });

    describe("setSlippage", function () {
        it("should set the slippage percentage by authorized role", async function () {
            const oldSlippage = await stakingContract.slippage();

            const tx = await stakingContract.connect(benqiAdmin).setSlippage(2);
            await tx.wait();

            expect(await stakingContract.slippage()).to.equal(2);
            await expect(tx).to.emit(stakingContract, 'SlippageUpdated').withArgs(oldSlippage, 2);
        });
        it("should revert if the slippage is above the maximum slippage", async function () {
            const invalidSlippage = 60; // 60%

            // Attempt to set the slippage above the maximum value
            await expect(
                stakingContract.connect(benqiAdmin).setSlippage(invalidSlippage)
            ).to.be.revertedWith("Slippage must be between min and max");
        });

        it("should revert if called by unauthorized user", async function () {
            await expect(stakingContract.connect(otherUser).setSlippage(3))
                .to.be.reverted;

            expect(await stakingContract.slippage()).to.not.equal(3);
        });

        it("should revert if slippage percentage is set to zero", async function () {
            await expect(stakingContract.connect(benqiAdmin).setSlippage(0))
                .to.be.revertedWith("Invalid slippage percentage");

            expect(await stakingContract.slippage()).to.not.equal(0);
        });
    });

    describe("updateStakingFee", function () {
        it("should update the staking fee by authorized role", async function () {
            const oldStakingFee = await stakingContract.avaxStakeAmount();

            const tx = await stakingContract.connect(benqiAdmin).updateStakingFee(ethers.parseUnits("0.002", "ether"));
            await tx.wait();

            expect(await stakingContract.avaxStakeAmount()).to.equal(ethers.parseUnits("0.002", "ether"));
            await expect(tx).to.emit(stakingContract, 'StakingFeeUpdated').withArgs(oldStakingFee, ethers.parseUnits("0.002", "ether"));

            const tx1 = await stakingContract.connect(benqiAdmin).updateStakingFee(ethers.parseUnits("0.001", "ether"));
            await tx1.wait();
        });

        it("should revert if called by unauthorized user", async function () {
            await expect(stakingContract.connect(otherUser).updateStakingFee(ethers.parseUnits("0.002", "ether")))
                .to.be.reverted;

            expect(await stakingContract.avaxStakeAmount()).to.not.equal(ethers.parseUnits("0.002", "ether"));
        });

        it("should revert if staking fee is set to zero", async function () {
            await expect(stakingContract.connect(benqiAdmin).updateStakingFee(0))
                .to.be.revertedWith("Invalid staking fee");

            expect(await stakingContract.avaxStakeAmount()).to.not.equal(0);
        });
    });

    describe("updateHostingFee", function () {
        it("should update the hosting fee by authorized roles", async function () {
            const oldFee = await stakingContract.hostingFeeAvax();

            const tx1 = await stakingContract.connect(benqiAdmin).updateHostingFee(ethers.parseUnits("0.002", "ether"));
            await tx1.wait();

            expect(await stakingContract.hostingFeeAvax()).to.equal(ethers.parseUnits("0.002", "ether"));
            await expect(tx1).to.emit(stakingContract, 'HostingFeeUpdated').withArgs(oldFee, ethers.parseUnits("0.002", "ether"));

            const tx2 = await stakingContract.connect(zeeveAdmin).updateHostingFee(ethers.parseUnits("0.003", "ether"));
            await tx2.wait();

            expect(await stakingContract.hostingFeeAvax()).to.equal(ethers.parseUnits("0.003", "ether"));
            await expect(tx2).to.emit(stakingContract, 'HostingFeeUpdated').withArgs(ethers.parseUnits("0.002", "ether"), ethers.parseUnits("0.003", "ether"));

            const tx3 = await stakingContract.connect(benqiAdmin).updateHostingFee(ethers.parseUnits("0.001", "ether"));
            await tx3.wait();
        });

        it("should revert if called by unauthorized user", async function () {
            await expect(stakingContract.connect(otherUser).updateHostingFee(ethers.parseUnits("0.002", "ether")))
                .to.be.reverted;

            expect(await stakingContract.hostingFeeAvax()).to.not.equal(ethers.parseUnits("0.002", "ether"));
        });

        it("should revert if hosting fee is set to zero", async function () {
            await expect(stakingContract.connect(benqiAdmin).updateHostingFee(0))
                .to.be.revertedWith("Invalid hosting fee");

            expect(await stakingContract.hostingFeeAvax()).to.not.equal(0);
        });
    });
    describe("Register Node", function () {
        it("should register a node successfully", async function () {
            const nodeId = "node-127";
            const blsKey = ethers.hexlify(ethers.randomBytes(144));
            const stakeIndex = 0;
            const duration = 1209600;

            // Mock the staking details
            const tx1 = await stakingContract.connect(benqiAdmin).setSlippage(40)
            await tx1.wait();

            const tx2 = await stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: ethers.parseEther("0.002", "ether") });
            await tx2.wait();

            // Check Zeeve wallet balance before registration
            const zeeveWalletAddress = await stakingContract.zeeveWallet();
            const initialZeeveWalletBalance = await ethers.provider.getBalance(zeeveWalletAddress);
            const tx3 = await stakingContract.connect(zeeveAdmin).registerNode(otherUser.address, nodeId, blsKey, stakeIndex);
            const receipt = await tx3.wait();

            const stakeRecords = await stakingContract.getStakeRecords(otherUser.address);
            const stakeRecord = stakeRecords[stakeIndex];
            expect(stakeRecord.status).to.equal(2); // 1 means Provisioned

            // Check if allowance was set to 0 after Ignite pulled tokens
            const finalAllowance = await qiToken.allowance(otherUser.address, igniteSmartContract);
            expect(finalAllowance).to.equal(0); // Allowance should be reset to 0

            // Check Zeeve wallet balance after registration
            const finalZeeveWalletBalance = await ethers.provider.getBalance(zeeveWalletAddress);
            expect(finalZeeveWalletBalance).to.be.gt(initialZeeveWalletBalance); // Ensure balance has increased

            let igniteRegisteredEvent = null;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = stakingContract.interface.parseLog(log);
                    if (parsedLog.name === "IgniteRegistered") {
                        igniteRegisteredEvent = parsedLog;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }

            assert(igniteRegisteredEvent, "IgniteRegistered event not found");
            expect(igniteRegisteredEvent.args.user).to.equal(otherUser.address);
            expect(igniteRegisteredEvent.args.nodeId).to.equal(nodeId);
            expect(igniteRegisteredEvent.args.blsKey).to.equal(blsKey);
        });
        it("should revert if BLS proof of possession length is not 144 bytes", async function () {
            const nodeId = "node-123";
            // Intentionally pass a blsProofOfPossession that is not 144 bytes (e.g., 100 bytes)
            const invalidBlsProofOfPossession = ethers.hexlify(ethers.randomBytes(100)); // 100 bytes instead of 144

            const stakeIndex = 0;

            await expect(stakingContract.connect(zeeveAdmin).registerNode(otherUser.address, nodeId, invalidBlsProofOfPossession, stakeIndex))
                .to.be.revertedWith("Invalid node or BLS key"); // Expect revert due to invalid length
        });
        it("should revert if called by non-admin", async function () {
            const nodeId = "node-123";
            const blsKey = ethers.hexlify(ethers.randomBytes(144));
            const stakeIndex = 0;

            await expect(stakingContract.connect(otherUser).registerNode(otherUser.address, nodeId, blsKey, stakeIndex))
                .to.be.reverted;
        });
        it("should revert if node ID is empty", async function () {
            const blsKey = ethers.hexlify(ethers.randomBytes(144));
            const stakeIndex = 0;

            await expect(stakingContract.connect(zeeveAdmin).registerNode(otherUser.address, "", blsKey, stakeIndex))
                .to.be.revertedWith("Invalid node or BLS key");
        });
        it("should revert if BLS key is empty", async function () {
            const nodeId = "node-123";
            const stakeIndex = 0;

            await expect(stakingContract.connect(zeeveAdmin).registerNode(otherUser.address, nodeId, "0x", stakeIndex))
                .to.be.revertedWith("Invalid node or BLS key");
        });
        it("should revert if no staking details are found", async function () {
            const nodeId = "node-128";
            const blsKey = ethers.hexlify(ethers.randomBytes(144));
            const stakeIndex = 0;

            // Ensure the allowance is not set
            const allowance = await qiToken.allowance(otherUser.address, igniteSmartContract);
            expect(allowance).to.equal(0); // No tokens should be approved

            await expect(stakingContract.connect(zeeveAdmin).registerNode(otherUser.address, nodeId, blsKey, stakeIndex))
                .to.be.revertedWith("Staking details not found");
        });
        it("should revert if index is out of bounds", async function () {
            const nodeId = "node-129";
            const blsKey = ethers.hexlify(ethers.randomBytes(144));
            const stakeIndex = 1; // Assume the user has only 1 stake record at index 0
            const duration = 1209600;
            const tx1 = await stakingContract.connect(benqiAdmin).setSlippage(40)
            await tx1.wait();

            // Mock the staking details
            const tx = await stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: ethers.parseEther("0.002", "ether") });
            await tx.wait()

            await expect(stakingContract.connect(zeeveAdmin).registerNode(otherUser.address, nodeId, blsKey, stakeIndex))
                .to.be.revertedWith("Index out of bounds");
        });
        it("should revert if node ID is already registered by another user", async function () {
            const nodeId = "node-123";
            const blsKey = ethers.hexlify(ethers.randomBytes(144));
            const stakeIndex = 0;
            const duration = 1209600;

            // Mock the staking details
            const tx = await stakingContract.connect(benqiAdmin).setSlippage(40);
            await tx.wait()
            const tx1 = await stakingContract.connect(benqiAdmin).stakeWithAVAX(duration, { value: ethers.parseEther("0.002") });
            await tx1.wait()

            // Register the node with the first user
            await expect(stakingContract.connect(zeeveAdmin).registerNode(benqiAdmin.address, nodeId, blsKey, stakeIndex))
                .to.be.revertedWith("Node ID already registered");
        });

        it("should allow the same user to re-register the same node ID", async function () {
            this.timeout(60000); // Increase timeout to 60 seconds
            const nodeId = "node-456";
            const blsKey = ethers.hexlify(ethers.randomBytes(144));
            const stakeIndex = 0;
            const newStakeIndex = 1;
            const duration = 1209600;

            // Mock the staking details
            const tx = await stakingContract.connect(benqiAdmin).setSlippage(40);
            await tx.wait()
            const tx1 = await stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: ethers.parseEther("0.002") });
            await tx1.wait()
            // Register the node with the first user
            const tx2 = await stakingContract.connect(zeeveAdmin).registerNode(otherUser.address, nodeId, blsKey, stakeIndex);
            await tx2.wait()

            // Try to register the same node ID again with the same user
            const tx3 = await stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: ethers.parseEther("0.002") });
            await tx3.wait()
            await new Promise(resolve => setTimeout(resolve, 2000));

            const tx4 = await stakingContract.connect(zeeveAdmin).registerNode(otherUser.address, nodeId, blsKey, newStakeIndex);
            await tx4.wait();

            const stakeRecords = await stakingContract.getStakeRecords(otherUser.address);
            const stakeRecord = stakeRecords[newStakeIndex];
            expect(stakeRecord.status).to.equal(2); // 2 means Provisioned
        });
        it("should revert if the same user tries to re-register the same node ID before expiry", async function () {
            const nodeId = "node-1456";
            const blsKey = ethers.hexlify(ethers.randomBytes(144));
            const stakeIndex = 0;
            const newStakeIndex = 1;
            const duration = 1209600; // 14 days

            // Mock the staking details
            const tx = await stakingContract.connect(benqiAdmin).setSlippage(50);
            await tx.wait()
            const tx1 = await stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: ethers.parseEther("0.002") });
            await tx1.wait()

            // Register the node
            const tx3 = await stakingContract.connect(zeeveAdmin).registerNode(otherUser.address, nodeId, blsKey, stakeIndex);
            await tx3.wait()
            const tx4 = await stakingContract.connect(benqiAdmin).setSlippage(50);
            await tx4.wait()

            const tx5 = await stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: ethers.parseEther("0.002") });
            await tx5.wait()
            // Try to register the same node ID again before expiry
            await expect(stakingContract.connect(zeeveAdmin).registerNode(otherUser.address, nodeId, blsKey, newStakeIndex))
                .to.be.revertedWith("Node ID already registered and active or invalid staking status");
        });

    })
    describe("Set Intermediary Token", function () {
        it("should set the intermediary token address successfully", async function () {
            const newIntermediaryToken = '0x15BF9589018313e32b07F92ABA2aeCef6E5B845b'; // Use mockUSDC as the new intermediary token

            // Set the intermediary token address
            const tx = await stakingContract.connect(benqiAdmin).setIntermediaryToken(newIntermediaryToken);
            const receipt = await tx.wait();

            // Verify the event emitted
            let intermediaryTokenUpdatedEvent = null;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = stakingContract.interface.parseLog(log);
                    if (parsedLog.name === "IntermediaryTokenUpdated") {
                        intermediaryTokenUpdatedEvent = parsedLog;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }

            assert(intermediaryTokenUpdatedEvent, "IntermediaryTokenUpdated event not found");
            expect(intermediaryTokenUpdatedEvent.args.oldToken).to.not.equal(newIntermediaryToken);
            expect(intermediaryTokenUpdatedEvent.args.newToken).to.equal(newIntermediaryToken);

            // Verify the new intermediary token address is set
            const updatedIntermediaryToken = await stakingContract.intermediaryToken();
            expect(updatedIntermediaryToken).to.equal(newIntermediaryToken);
        });

        it("should revert if called by non-admin", async function () {
            const newIntermediaryToken = '0x15BF9589018313e32b07F92ABA2aeCef6E5B845b';

            await expect(
                stakingContract.connect(otherUser).setIntermediaryToken(newIntermediaryToken)
            ).to.be.reverted;
        });

        it("should revert if the intermediary token address is invalid", async function () {
            const invalidTokenAddress = ethers.ZeroAddress;

            await expect(
                stakingContract.connect(benqiAdmin).setIntermediaryToken(invalidTokenAddress)
            ).to.be.revertedWith("Invalid token address");
        });
    });

    describe("Slippage Management", function () {
        let minSlippage = 1;
        let maxSlippage = 5;

        beforeEach(async function () {
            const tx = await stakingContract.connect(benqiAdmin).setMaxSlippage(maxSlippage);
            await tx.wait()
            const tx1 = await stakingContract.connect(benqiAdmin).setMinSlippage(minSlippage);
            await tx1.wait()
        });

        it("should set the minimum slippage successfully", async function () {
            const newMinSlippage = 2;
            const tx = await stakingContract.connect(benqiAdmin).setMinSlippage(newMinSlippage);
            const receipt = await tx.wait();

            expect(await stakingContract.minSlippage()).to.equal(newMinSlippage);
            let minSlippageUpdatedEvent = null;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = stakingContract.interface.parseLog(log);
                    if (parsedLog.name === "MinSlippageUpdated") {
                        minSlippageUpdatedEvent = parsedLog;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            expect(minSlippageUpdatedEvent).to.not.be.undefined;
            expect(minSlippageUpdatedEvent.args.oldMinSlippage).to.equal(minSlippage);
            expect(minSlippageUpdatedEvent.args.newMinSlippage).to.equal(newMinSlippage);
        });

        it("should revert if min slippage exceeds max slippage", async function () {
            const newMinSlippage = 6;
            await expect(stakingContract.connect(benqiAdmin).setMinSlippage(newMinSlippage)).to.be.revertedWith("Min slippage exceeds max slippage");
        });

        it("should set the maximum slippage successfully", async function () {
            const newMaxSlippage = 6;
            const tx = await stakingContract.connect(benqiAdmin).setMaxSlippage(newMaxSlippage);
            const receipt = await tx.wait();

            expect(await stakingContract.maxSlippage()).to.equal(newMaxSlippage);
            let maxSlippageUpdatedEvent = null;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = stakingContract.interface.parseLog(log);
                    if (parsedLog.name === "MaxSlippageUpdated") {
                        maxSlippageUpdatedEvent = parsedLog;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            expect(maxSlippageUpdatedEvent).to.not.be.undefined;
            expect(maxSlippageUpdatedEvent.args.oldMaxSlippage).to.equal(maxSlippage);
            expect(maxSlippageUpdatedEvent.args.newMaxSlippage).to.equal(newMaxSlippage);
        });

        it("should revert if max slippage is below min slippage", async function () {
            const newMaxSlippage = 0;
            await expect(stakingContract.connect(benqiAdmin).setMaxSlippage(newMaxSlippage)).to.be.revertedWith("Max slippage below min slippage");
        });

        it("should revert if called by non-admin", async function () {
            const newMinSlippage = 2;
            const newMaxSlippage = 6;

            await expect(stakingContract.connect(otherUser).setMinSlippage(newMinSlippage)).to.be.reverted;
            await expect(stakingContract.connect(otherUser).setMaxSlippage(newMaxSlippage)).to.be.reverted;
        });
    });
    describe("Set Refund Period", function () {
        it("should set the refund period successfully", async function () {
            const newRefundPeriod = 7; // 7 days
            const tx = await stakingContract.connect(benqiAdmin).setRefundPeriod(newRefundPeriod);
            await tx.wait();

            expect(await stakingContract.refundPeriod()).to.equal(newRefundPeriod);
        });
        it("should revert if the refund period is zero", async function () {
            await expect(
                stakingContract.connect(benqiAdmin).setRefundPeriod(0)
            ).to.be.revertedWith("Invalid refund period");
        });

        it("should revert if called by non-admin", async function () {
            const newRefundPeriod = 7;
            await expect(
                stakingContract.connect(otherUser).setRefundPeriod(newRefundPeriod)
            ).to.be.reverted;
        });
    });
    describe("Refund Staked Amount", function () {
        it("should refund the staked amount and hosting fee successfully", async function () {
            const stakeIndex = 0;
            const refundPeriodInSeconds = 1;

            // Set the refund period to 1 second
            const tx0 = await stakingContract.connect(benqiAdmin).setRefundPeriod(refundPeriodInSeconds);
            await tx0.wait();
            const tnx = await stakingContract.connect(benqiAdmin).setSlippage(40)
            await tnx.wait();
            // Mock the staking details
            const tx1 = await stakingContract.connect(otherUser).stakeWithAVAX(1209600, { value: ethers.parseEther("0.002") });
            await tx1.wait();

            await new Promise(resolve => setTimeout(resolve, 2000));
            const initialBalance = await ethers.provider.getBalance(otherUser.address);

            const tx2 = await stakingContract.connect(benqiAdmin).refundStakedAmount(otherUser.address, stakeIndex);
            const receipt = await tx2.wait();

            const stakeRecords = await stakingContract.getStakeRecords(otherUser.address);
            const stakeRecord = stakeRecords[stakeIndex];
            expect(stakeRecord.status).to.equal(3); // 3 means Refunded
            let refundedStakeEvent = null;

            for (const log of receipt.logs) {
                try {
                    const parsedLog = stakingContract.interface.parseLog(log);
                    if (parsedLog.name === "RefundedStake") {
                        refundedStakeEvent = parsedLog;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            expect(refundedStakeEvent).to.not.be.undefined;
            expect(refundedStakeEvent.args.user).to.equal(otherUser.address);
            expect(refundedStakeEvent.args.userStakeIndex).to.equal(stakeIndex);
            const finalBalance = await ethers.provider.getBalance(otherUser.address);
            expect(finalBalance).to.be.gt(initialBalance);

        });
        it("should revert if the user address is invalid", async function () {
            const stakeIndex = 0;
            await expect(
                stakingContract.connect(benqiAdmin).refundStakedAmount(ethers.ZeroAddress, stakeIndex)
            ).to.be.revertedWith("Invalid user address");
        });
        it("should revert if the user address is invalid", async function () {
            const stakeIndex = 0;
            await expect(
                stakingContract.connect(benqiAdmin).refundStakedAmount(ethers.ZeroAddress, stakeIndex)
            ).to.be.revertedWith("Invalid user address");
        });

        it("should revert if no stake records are found", async function () {
            const stakeIndex = 0;
            await expect(
                stakingContract.connect(benqiAdmin).refundStakedAmount(benqiAdmin.address, stakeIndex)
            ).to.be.revertedWith("No stake records found");
        });

        it("should revert if the stake index is invalid", async function () {
            const stakeIndex = 1;
            await expect(
                stakingContract.connect(benqiAdmin).refundStakedAmount(otherUser.address, stakeIndex)
            ).to.be.revertedWith("Invalid stake index");
        });

        it("should revert if the stake is not in provisioning status", async function () {
            const stakeIndex = 0;
            const duration = 1209600;
            const tx0 = await stakingContract.connect(benqiAdmin).setSlippage(40)
            await tx0.wait();
            // Mock the staking details
            const tx = await stakingContract.connect(benqiAdmin).stakeWithAVAX(duration, { value: ethers.parseEther("0.002") });
            await tx.wait();

            // Register the node to change the status to Provisioned
            const nodeId = "node-123";
            const blsKey = ethers.hexlify(ethers.randomBytes(32));
            const tx1 = await stakingContract.connect(zeeveAdmin).registerNode(benqiAdmin.address, nodeId, blsKey, stakeIndex);
            await tx1.wait()

            await expect(
                stakingContract.connect(benqiAdmin).refundStakedAmount(benqiAdmin.address, stakeIndex)
            ).to.be.revertedWith("Stake not in provisioning status");
        });

        it("should revert if the refund period is not reached", async function () {
            const stakeIndex = 1;
            const duration = 1209600;
            const refundPeriodInSeconds = 14350;

            // Set the refund period to 1 second
            const tx0 = await stakingContract.connect(benqiAdmin).setRefundPeriod(refundPeriodInSeconds);
            await tx0.wait();
            const tnx = await stakingContract.connect(benqiAdmin).setSlippage(40)
            await tnx.wait();
            // Mock the staking details
            const tx = await stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: ethers.parseEther("0.002") });
            await tx.wait();

            await expect(
                stakingContract.connect(benqiAdmin).refundStakedAmount(otherUser.address, stakeIndex)
            ).to.be.revertedWith("Refund period not reached");
        });
    });

    describe("Stake With AVAX", function () {
        it("should stake AVAX successfully", async function () {
            const duration = 1209600; // Example duration in seconds (14 days)
            const avaxAmount = ethers.parseEther("0.003"); // Example amount
            const tx = await stakingContract.connect(benqiAdmin).setSlippage(40);
            await tx.wait()
            const transaction = await stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: avaxAmount });
            const receipt = await transaction.wait();
            assert(receipt.status, "Transaction failed");

            let stakedEvent = null;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = stakingContract.interface.parseLog(log);
                    if (parsedLog.name === "Staked") {
                        stakedEvent = parsedLog;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            // Verify emitted event

            expect(stakedEvent.args.user).to.equal(otherUser.address);
            expect(stakedEvent.args.duration).to.equal(duration);
            expect(stakedEvent.args.tokenType).to.equal(AVAX);

            // Verify stake record
            const stakeRecords = await stakingContract.getStakeRecords(otherUser.address);
            const stakeRecord = stakeRecords[stakeRecords.length - 1];

            expect(stakeRecord.amountStaked).to.be.gt(0); // Staked amount in QI
            expect(stakeRecord.hostingFeePaid).to.be.gt(0); // Hosting fee paid in AVAX
            expect(stakeRecord.timestamp).to.be.gt(0); // Timestamp should be set
            expect(stakeRecord.duration).to.equal(duration); // Duration should match
            expect(stakeRecord.tokenType).to.equal(AVAX); // Token type should be "AVAX"
            expect(stakeRecord.status).to.equal(1); // Status should be "Provisioning"
        });
        it("should revert if contract is paused", async function () {
            const duration = 1209600; // Example duration in seconds (14 days)
            const avaxAmount = ethers.parseEther("0.002"); // Example amount
            const tx = await stakingContract.connect(benqiAdmin).setSlippage(20);
            await tx.wait()
            const tx1 = await stakingContract.connect(benqiSuperAdmin).pause();
            await tx1.wait()
            await expect(stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: avaxAmount }))
                .to.be.revertedWith("Pausable: paused");
            const tx2 = await stakingContract.connect(benqiSuperAdmin).unpause();
            await tx2.wait()
        });
        it("should revert if duration is invalid", async function () {
            const invalidDuration = 0; // Invalid duration
            const avaxAmount = ethers.parseEther("0.002"); // Example amount

            await expect(stakingContract.connect(otherUser).stakeWithAVAX(invalidDuration, { value: avaxAmount }))
                .to.be.revertedWith("Invalid duration");
        });
        it("should revert if insufficient AVAX is sent", async function () {
            const duration = 1209600; // Example duration in seconds (14 days)
            const avaxAmount = ethers.parseEther("0.00001"); // Insufficient amount

            await expect(stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: avaxAmount }))
                .to.be.revertedWith("Insufficient AVAX sent");
        });
        it("should refund excess AVAX amount", async function () {
            const duration = 1209600; // Example duration in seconds (14 days)
            const avaxAmount = ethers.parseEther("0.003"); // Excess amount
            const avaxStakingAmount = await stakingContract.avaxStakeAmount();
            const hostingFee = await stakingContract.hostingFeeAvax()

            const initialBalance = await ethers.provider.getBalance(otherUser.address);

            const tx = await stakingContract.connect(benqiAdmin).setSlippage(40);
            await tx.wait()

            const transaction = await stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: avaxAmount });
            const receipt = await transaction.wait();
            const gasUsed = ethers.toBigInt(receipt.gasUsed);
            const gasPrice = transaction.gasPrice;

            const finalBalance = await ethers.provider.getBalance(otherUser.address);
            let refundedEvent = null;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = stakingContract.interface.parseLog(log);
                    if (parsedLog.name === "Refunded") {
                        refundedEvent = parsedLog;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }

            expect(refundedEvent.args.user).to.equal(otherUser.address);
            expect(refundedEvent.args.amount).to.be.gt(0); // Refund amount should be greater than 0

            // Check if the refund amount is correctly calculated
            const expectedBalance = initialBalance - (gasUsed * gasPrice) - avaxStakingAmount - hostingFee;
            expect(finalBalance).to.be.closeTo(expectedBalance, ethers.parseEther("0.01")); // Allow small variance due to gas
        });
        it("should emit correct events on successful staking", async function () {
            const duration = 1209600; // Example duration in seconds (14 days)
            const avaxAmount = ethers.parseEther("0.002"); // Example amount
            const tx = await stakingContract.connect(benqiAdmin).setSlippage(40);
            await tx.wait()
            const transaction = await stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: avaxAmount });
            const receipt = await transaction.wait();
            let refundEvent = null;
            let stakedEvent = null;

            for (const log of receipt.logs) {
                try {
                    const parsedLog = stakingContract.interface.parseLog(log);
                    if (parsedLog.name === "Refunded") {
                        refundEvent = parsedLog;
                    }
                    else if (parsedLog.name === "Staked") {
                        stakedEvent = parsedLog;
                    }
                } catch (error) {
                    continue;
                }
            }
            // Verify emitted 
            assert(stakedEvent, "Staked event not found");
            expect(stakedEvent.args.user).to.equal(otherUser.address);
            expect(stakedEvent.args.duration).to.equal(duration);
            expect(stakedEvent.args.tokenType).to.equal(AVAX);

            if (refundEvent) {
                expect(refundEvent.args.user).to.equal(otherUser.address);
                expect(refundEvent.args.amount).to.be.gte(0);
            }
        });
        it("should correctly record stake details after successful staking", async function () {
            const duration = 1209600; // Example duration in seconds (14 days)
            const avaxAmount = ethers.parseEther("0.002"); // Example amount
            const tx = await stakingContract.connect(benqiAdmin).setSlippage(40);
            await tx.wait()
            await stakingContract.connect(otherUser).stakeWithAVAX(duration, { value: avaxAmount });

            // Verify stake record
            const stakeRecords = await stakingContract.getStakeRecords(otherUser.address);
            const stakeRecord = stakeRecords[stakeRecords.length - 1];
            expect(stakeRecord.amountStaked).to.be.gt(0); // Staked amount in QI
            expect(stakeRecord.hostingFeePaid).to.be.gt(0); // Hosting fee paid in AVAX
            expect(stakeRecord.timestamp).to.be.gt(0); // Timestamp should be set
            expect(stakeRecord.duration).to.equal(duration); // Duration should match
            expect(stakeRecord.tokenType).to.equal(AVAX); // Token type should be "AVAX"
            expect(stakeRecord.status).to.equal(1); // Status should be "Provisioning"
        });

    })
    describe("Stake with ERC-20 token", function () {
        it("should stake QI ERC20 tokens successfully", async function () {
            const duration = 1209600; // 14 days in seconds
            const tokenAmount = ethers.parseUnits("10000", 18); // Example amount of ERC20 tokens
            // Approve the staking contract to spend the tokens
            const transaction = await qiToken.connect(deployer).approve(stakingContract.getAddress(), tokenAmount);
            await transaction.wait()
            // Call the staking function
            const tx = await stakingContract.connect(deployer).stakeWithERC20(duration, tokenAmount, qiTokenAddress);
            const receipt = await tx.wait();

            // Ensure the transaction was successful and check for events
            assert(receipt.status, "Transaction failed");

            if (receipt.events) {
                const event = receipt.events.find(event => event.event === "Staked");
                assert(event, "Staked event not found");

                expect(event.args.user).to.equal(deployer.address);
                expect(event.args.duration).to.equal(duration);
                expect(event.args.tokenType).to.equal(qiTokenAddress.toLowerCase());
            }

            // Verify stake record
            const stakeRecords = await stakingContract.getStakeRecords(deployer.address);
            const stakeRecord = stakeRecords[stakeRecords.length - 1];

            expect(stakeRecord.amountStaked).to.be.gt(0); // Staked amount in QI
            expect(stakeRecord.hostingFeePaid).to.be.gt(0); // Hosting fee paid in ERC20 tokens
            expect(stakeRecord.timestamp).to.be.gt(0); // Timestamp should be set
            expect(stakeRecord.duration).to.equal(duration); // Duration should match
            expect(stakeRecord.tokenType).to.equal(qiTokenAddress); // Token type should match
            expect(stakeRecord.status).to.equal(1); // Status should be "Provisioning"
        });
        it("should stake Wrapped Avax ERC20 tokens successfully", async function () {
            const duration = 1209600; // 14 days in seconds
            const tokenAmount = ethers.parseUnits("0.003", 18); // Example amount of ERC20 tokens
            const wrappedAvaxToken = '0xd00ae08403B9bbb9124bB305C09058E32C39A48c'
            // Approve the staking contract to spend the tokens
            let wrappedAvax = await ethers.getContractAt("IERC20", wrappedAvaxToken)
            const transaction = await wrappedAvax.connect(deployer).approve(stakingContract.getAddress(), tokenAmount);
            await transaction.wait()
            // Call the staking function
            const tx1 = await stakingContract.connect(benqiAdmin).setSlippage(40);
            await tx1.wait()
            const tx2 = await stakingContract.connect(benqiAdmin).addToken(wrappedAvaxToken, '0x526f8926F3A8adbf0dcd4ff41B1C9e69b55Aa699', 432000);
            await tx2.wait()
            const tx3 = await stakingContract.connect(deployer).stakeWithERC20(duration, tokenAmount, wrappedAvaxToken);
            const receipt = await tx3.wait();

            // Ensure the transaction was successful and check for events
            assert(receipt.status, "Transaction failed");
            let stakedEvent = null;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = stakingContract.interface.parseLog(log);
                    if (parsedLog.name === "Staked") {
                        stakedEvent = parsedLog;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            assert(stakedEvent, "Staked event not found");

            expect(stakedEvent.args.user).to.equal(deployer.address);
            expect(stakedEvent.args.duration).to.equal(duration);
            expect(stakedEvent.args.tokenType).to.equal(wrappedAvaxToken);

            // Verify stake record
            const stakeRecords = await stakingContract.getStakeRecords(deployer.address);
            const stakeRecord = stakeRecords[stakeRecords.length - 1];

            expect(stakeRecord.amountStaked).to.be.gt(0); // Staked amount in QI
            expect(stakeRecord.hostingFeePaid).to.be.gt(0); // Hosting fee paid in ERC20 tokens
            expect(stakeRecord.timestamp).to.be.gt(0); // Timestamp should be set
            expect(stakeRecord.duration).to.equal(duration); // Duration should match
            expect(stakeRecord.tokenType).to.equal(wrappedAvaxToken); // Token type should match
            expect(stakeRecord.status).to.equal(1); // Status should be "Provisioning"
        });
        it("should stake WBTC ERC20 tokens successfully", async function () {
            const duration = 1209600; // 14 days in seconds
            const tokenAmount = ethers.parseUnits("1000", 18); // Example amount of WBTC tokens
            const wbtcToken = '0x15BF9589018313e32b07F92ABA2aeCef6E5B845b'; // Replace with the actual WBTC token address
            let wrappedBTC = await ethers.getContractAt("IERC20", wbtcToken)

            // Approve the staking contract to spend the tokens
            const transaction = await wrappedBTC.connect(deployer).approve(stakingContract.getAddress(), tokenAmount);
            await transaction.wait();
            // Add the token to the staking contract
            const tx1 = await stakingContract.connect(benqiAdmin).setSlippage(40);
            await tx1.wait();
            const tx2 = await stakingContract.connect(benqiAdmin).addToken(wbtcToken, '0x31CF013A08c6Ac228C94551d535d5BAfE19c602a', 432000);
            await tx2.wait();
            // Call the staking function
            const tx3 = await stakingContract.connect(deployer).stakeWithERC20(duration, tokenAmount, wbtcToken);
            const receipt = await tx3.wait();

            // Ensure the transaction was successful and check for events
            assert(receipt.status, "Transaction failed");
            let stakedEvent = null;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = stakingContract.interface.parseLog(log);
                    if (parsedLog.name === "Staked") {
                        stakedEvent = parsedLog;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            assert(stakedEvent, "Staked event not found");

            expect(stakedEvent.args.user).to.equal(deployer.address);
            expect(stakedEvent.args.duration).to.equal(duration);
            expect(stakedEvent.args.tokenType).to.equal(wbtcToken);

            // Verify stake record
            const stakeRecords = await stakingContract.getStakeRecords(deployer.address);
            const stakeRecord = stakeRecords[stakeRecords.length - 1];

            expect(stakeRecord.amountStaked).to.be.gt(0); // Staked amount in QI
            expect(stakeRecord.hostingFeePaid).to.be.gt(0); // Hosting fee paid in ERC20 tokens
            expect(stakeRecord.timestamp).to.be.gt(0); // Timestamp should be set
            expect(stakeRecord.duration).to.equal(duration); // Duration should match
            expect(stakeRecord.tokenType).to.equal(wbtcToken); // Token type should match
            expect(stakeRecord.status).to.equal(1); // Status should be "Provisioning"
        });
        it("should stake USDC ERC20 tokens successfully", async function () {
            const duration = 1209600; // 14 days in seconds
            const tokenAmount = ethers.parseUnits("1", 18); // Example amount of USDC tokens
            const usdcToken = '0xB6076C93701D6a07266c31066B298AeC6dd65c2d'; // Replace with the actual USDC token address
            let usdc = await ethers.getContractAt("IERC20", usdcToken)

            // Approve the staking contract to spend the tokens
            const transaction = await usdc.connect(deployer).approve(stakingContract.getAddress(), tokenAmount);
            await transaction.wait();
            // Add the token to the staking contract
            const tx1 = await stakingContract.connect(benqiAdmin).setSlippage(40);
            await tx1.wait();
            const tx2 = await stakingContract.connect(benqiAdmin).addToken(usdcToken, '0x7898AcCC83587C3C55116c5230C17a6Cd9C71bad', 432000);
            await tx2.wait();
            // Call the staking function
            const tx3 = await stakingContract.connect(deployer).stakeWithERC20(duration, tokenAmount, usdcToken);
            const receipt = await tx3.wait();

            // Ensure the transaction was successful and check for events
            assert(receipt.status, "Transaction failed");
            let stakedEvent = null;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = stakingContract.interface.parseLog(log);
                    if (parsedLog.name === "Staked") {
                        stakedEvent = parsedLog;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            assert(stakedEvent, "Staked event not found");

            expect(stakedEvent.args.user).to.equal(deployer.address);
            expect(stakedEvent.args.duration).to.equal(duration);
            expect(stakedEvent.args.tokenType).to.equal(usdcToken);

            // Verify stake record
            const stakeRecords = await stakingContract.getStakeRecords(deployer.address);
            const stakeRecord = stakeRecords[stakeRecords.length - 1];

            expect(stakeRecord.amountStaked).to.be.gt(0); // Staked amount in QI
            expect(stakeRecord.hostingFeePaid).to.be.gt(0); // Hosting fee paid in ERC20 tokens
            expect(stakeRecord.timestamp).to.be.gt(0); // Timestamp should be set
            expect(stakeRecord.duration).to.equal(duration); // Duration should match
            expect(stakeRecord.tokenType).to.equal(usdcToken); // Token type should match
            expect(stakeRecord.status).to.equal(1); // Status should be "Provisioning"
        });
        it("should revert if contract is paused", async function () {
            const duration = 1209600; // 14 days in seconds
            const tokenAmount = ethers.parseUnits("100", 18); // Example amount of ERC20 tokens

            const tx = await stakingContract.connect(benqiSuperAdmin).pause();
            await tx.wait()
            await expect(stakingContract.connect(deployer).stakeWithERC20(duration, tokenAmount, qiTokenAddress))
                .to.be.revertedWith("Pausable: paused");
            const tx1 = await stakingContract.connect(benqiSuperAdmin).unpause();
            await tx1.wait()
        });
        it("should revert if duration is invalid", async function () {
            const invalidDuration = 0; // Invalid duration
            const tokenAmount = ethers.parseUnits("100", 18); // Example amount of ERC20 tokens

            await expect(stakingContract.connect(deployer).stakeWithERC20(invalidDuration, tokenAmount, qiTokenAddress))
                .to.be.revertedWith("Invalid duration");
        });
        it("should revert if token is not accepted", async function () {
            const duration = 1209600; // 14 days in seconds
            const tokenAmount = ethers.parseUnits("100", 18); // Example amount of ERC20 tokens

            await expect(stakingContract.connect(deployer).stakeWithERC20(duration, tokenAmount, '0x6Ce78374dFf46B660E274d0b10E29890Eeb0167b'))
                .to.be.revertedWith("Token not accepted");
        });
        it("should revert if insufficient tokens are sent", async function () {
            const duration = 1209600; // 14 days in seconds
            const tokenAmount = ethers.parseUnits("0.5", 18); // Insufficient amount of ERC20 tokens

            // Approve the staking contract to spend the tokens
            await qiToken.connect(deployer).approve(stakingContract.getAddress(), tokenAmount);

            await expect(stakingContract.connect(deployer).stakeWithERC20(duration, tokenAmount, qiTokenAddress))
                .to.be.revertedWith("Insufficient token");
        });
        it("should revert if allowance is not set or insufficient", async function () {
            const duration = 1209600; // 14 days in seconds
            const tokenAmount = ethers.parseUnits("0.1", 18); // Example amount of ERC20 tokens

            await expect(stakingContract.connect(deployer).stakeWithERC20(duration, tokenAmount, qiTokenAddress))
                .to.be.revertedWith("Insufficient token");
        });

        it("should refund excess token amount", async function () {
            const duration = 1209600; // 14 days in seconds
            const tokenAmount = ethers.parseUnits("200", 18); // Excess amount of ERC20 tokens

            // Approve the staking contract to spend the tokens
            const tx = await qiToken.connect(deployer).approve(stakingContract.getAddress(), tokenAmount);
            await tx.wait()

            const initialBalance = await qiToken.balanceOf(deployer.address);

            const transaction = await stakingContract.connect(deployer).stakeWithERC20(duration, tokenAmount, qiTokenAddress);
            const receipt = await transaction.wait();

            if (receipt.events) {
                const refundEvent = receipt.events.find(event => event.event === "Refunded");
                assert(refundEvent, "Refunded event not found");

                expect(refundEvent.args.user).to.equal(deployer.address);
                expect(refundEvent.args.amount).to.be.gt(0); // Refund amount should be greater than 0
            }

            // Check if the refund amount is correctly calculated
            const finalBalance = await qiToken.balanceOf(deployer.address);
            expect(finalBalance).to.be.gt(initialBalance - tokenAmount); // Check for proper refund
        });
        it("should emit correct events on successful staking", async function () {
            const duration = 1209600; // 14 days in seconds
            const tokenAmount = ethers.parseUnits("100", 18); // Example amount of ERC20 tokens

            // Approve the staking contract to spend the tokens
            const tx = await qiToken.connect(deployer).approve(stakingContract.getAddress(), tokenAmount);
            await tx.wait()

            const transaction = await stakingContract.connect(deployer).stakeWithERC20(duration, tokenAmount, qiTokenAddress);
            const receipt = await transaction.wait();

            // Verify emitted events
            if (receipt.events) {
                const stakeEvent = receipt.events.find(event => event.event === "Staked");
                const refundEvent = receipt.events.find(event => event.event === "Refunded");

                assert(stakeEvent, "Staked event not found");
                expect(stakeEvent.args.user).to.equal(deployer.address);
                expect(stakeEvent.args.duration).to.equal(duration);
                expect(stakeEvent.args.tokenType).to.equal(qiTokenAddress.toLowerCase());

                if (refundEvent) {
                    expect(refundEvent.args.user).to.equal(deployer.address);
                    expect(refundEvent.args.amount).to.be.gt(0); // Refund amount should be greater than 0
                }
            }
        });
    })
    describe("addToken", function () {
        it("should add a new token successfully", async function () {
            const wrappedAvaxToken = '0xd00ae08403B9bbb9124bB305C09058E32C39A48c'

            const tx = await stakingContract.connect(benqiAdmin).addToken(wrappedAvaxToken, avaxPriceFeed, 432000)
            await tx.wait()
            await expect(tx)
                .to.emit(stakingContract, "TokenAdded")
                .withArgs(wrappedAvaxToken);

            expect(await stakingContract.isTokenAccepted(wrappedAvaxToken)).to.be.true;
        });

        it("should revert if the token already exists", async function () {
            const wrappedAvaxToken = '0xd00ae08403B9bbb9124bB305C09058E32C39A48c'
            await expect(stakingContract.connect(benqiAdmin).addToken(wrappedAvaxToken, avaxPriceFeed, 432000))
                .to.be.revertedWith("Token already exists");
        });

        it("should revert if called by an account without BENQI_ADMIN_ROLE", async function () {
            const wrappedAvaxToken = '0xd00ae08403B9bbb9124bB305C09058E32C39A48c'
            await expect(stakingContract.connect(otherUser).addToken(wrappedAvaxToken, avaxPriceFeed, 432000))
                .to.be.reverted;
        });

        it("should revert if token address is zero", async function () {
            await expect(stakingContract.connect(benqiAdmin).addToken(ethers.ZeroAddress, avaxPriceFeed, 3600))
                .to.be.revertedWith("Invalid token address");
        });

        it("should revert if price feed address is zero", async function () {
            const wrappedAvaxToken = '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901'
            await expect(stakingContract.connect(benqiAdmin).addToken(wrappedAvaxToken, ethers.ZeroAddress, 3600))
                .to.be.revertedWith("Invalid price feed address");
        });

        it("should revert if max price age is zero", async function () {
            const wrappedAvaxToken = '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901'
            await expect(stakingContract.connect(benqiAdmin).addToken(wrappedAvaxToken, avaxPriceFeed, 0))
                .to.be.revertedWith("Invalid max price age");
        });
    });
    describe("removeToken", function () {
        it("should remove an existing token successfully", async function () {
            const wrappedAvaxToken = '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901'
            const tx = await stakingContract.connect(benqiAdmin).addToken(wrappedAvaxToken, avaxPriceFeed, 432000)
            await tx.wait()
            await expect(stakingContract.connect(benqiAdmin).removeToken(wrappedAvaxToken))
                .to.emit(stakingContract, "TokenRemoved")
                .withArgs(wrappedAvaxToken);

            expect(await stakingContract.isTokenAccepted(wrappedAvaxToken)).to.be.false;
        });

        it("should revert if the token is not accepted", async function () {
            const nonAcceptedToken = '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901'; // replace with a non-accepted token address

            await expect(stakingContract.connect(benqiAdmin).removeToken(nonAcceptedToken))
                .to.be.revertedWith("Token not accepted");
        });

        it("should revert if called by an account without BENQI_ADMIN_ROLE", async function () {
            const nonAcceptedToken = '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901'; // replace with a non-accepted token address
            await expect(stakingContract.connect(otherUser).removeToken(nonAcceptedToken))
                .to.be.reverted;
        });

        it("should revert if token address is zero", async function () {
            await expect(stakingContract.connect(benqiAdmin).removeToken(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid token address");
        });
    });

    describe("updatePriceFeed", function () {
        it("should update the price feed for a token successfully", async function () {
            const wrappedAvaxToken = '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901'
            const tx = await stakingContract.connect(benqiAdmin).addToken(wrappedAvaxToken, avaxPriceFeed, 432000)
            await tx.wait()
            const transaction = await stakingContract.connect(benqiAdmin).updatePriceFeed(wrappedAvaxToken, qiPriceFeed)
            await transaction.wait()
            await expect(transaction)
                .to.emit(stakingContract, "PriceFeedUpdated")
                .withArgs(wrappedAvaxToken, avaxPriceFeed, qiPriceFeed);

            const updatedPriceFeed = await stakingContract.priceFeeds(wrappedAvaxToken);
            expect(updatedPriceFeed).to.equal(qiPriceFeed);
            const tx1 = await stakingContract.connect(benqiAdmin).removeToken(wrappedAvaxToken)
            await tx1.wait()
        });

        it("should revert if the token is not accepted", async function () {
            const nonAcceptedToken = '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901'; // replace with a non-accepted token address

            await expect(stakingContract.connect(benqiAdmin).updatePriceFeed(nonAcceptedToken, qiPriceFeed))
                .to.be.revertedWith("Token not accepted");
        });

        it("should revert if called by an account without BENQI_ADMIN_ROLE", async function () {
            const wrappedAvaxToken = '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901'
            await expect(stakingContract.connect(otherUser).updatePriceFeed(wrappedAvaxToken, qiPriceFeed))
                .to.be.reverted;
        });

        it("should revert if new price feed address is zero", async function () {
            const wrappedAvaxToken = '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901'
            await expect(stakingContract.connect(benqiAdmin).updatePriceFeed(wrappedAvaxToken, ethers.ZeroAddress))
                .to.be.revertedWith("Invalid price feed address");
        });
    });

    describe("Get stake records", async function () {
        before(async function () {
            const tx = await stakingContract.connect(benqiAdmin).setSlippage(10);
            await tx.wait()
            const tx1 = await stakingContract.connect(zeeveAdmin).stakeWithAVAX(86400 * 7 * 2, { value: ethers.parseEther("0.002") })
            await tx1.wait()
        })

        it("should return an empty array when the user has no stake records", async function () {
            const records = await stakingContract.getStakeRecords(benqiSuperAdmin.address);
            expect(records).to.be.an('array').that.is.empty;
        });

        it("should return all stake records for a user with multiple stakes", async function () {
            const records = await stakingContract.getStakeRecords(zeeveAdmin.address);
            expect(records).to.be.an('array').that.has.lengthOf(1);
        });

        it("should return correct details in stake records", async function () {
            const records = await stakingContract.getStakeRecords(zeeveAdmin.address);
            expect(records[0].amountStaked).to.be.gt(0);
            expect(records[0].hostingFeePaid).to.be.gt(0);
            expect(records[0].duration).to.equal(1209600);
            expect(records[0].tokenType).to.equal("AVAX");
            expect(records[0].status).to.equal(0); // StakingStatus.Provisioning
        });

        it("should return an empty array for an address with no stakes even if called by an admin", async function () {
            const records = await stakingContract.getStakeRecords(benqiSuperAdmin.address);
            expect(records).to.be.an('array').that.is.empty;
        });
    })

    describe("isTokenAccepted", function () {
        it("should return true for an accepted token", async function () {
            const isAccepted = await stakingContract.isTokenAccepted(qiTokenAddress);
            expect(isAccepted).to.be.true;
        });

        it("should return false for a token that is not accepted", async function () {
            const token = '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901';
            const isAccepted = await stakingContract.isTokenAccepted(token);
            expect(isAccepted).to.be.false;
        });
    });
    describe("getAcceptedTokensCount", function () {
        it("should return the correct count of accepted tokens", async function () {
            const count = await stakingContract.getAcceptedTokensCount();
            expect(count).to.equal(2); // Assuming two tokens are accepted initially
        });
    });
    describe("getAcceptedTokens", function () {
        it("should return an array of accepted token addresses", async function () {
            const tokens = await stakingContract.getAcceptedTokens();
            expect(tokens).to.be.an('array').that.includes(qiTokenAddress);
        });
    });
    describe("convertAvaxToQI", function () {
        it("should correctly convert AVAX amount to QI amount", async function () {
            const avaxAmount = ethers.parseEther("1");
            const qiAmount = await stakingContract.convertAvaxToQI(avaxAmount);
            expect(qiAmount).to.be.a('bigint');
        });
    });
    describe("grantAdminRole", function () {
        it("should grant BENQI_ADMIN_ROLE by BENQI_SUPER_ADMIN_ROLE successfully", async function () {
            const tx = await stakingContract.connect(benqiSuperAdmin).grantAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address);
            await tx.wait()
            expect(await stakingContract.hasRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address)).to.be.true;
        });

        it("should grant ZEEVE_ADMIN_ROLE by ZEEVE_SUPER_ADMIN_ROLE successfully", async function () {
            const tx = await stakingContract.connect(zeeveSuperAdmin).grantAdminRole(stakingContract.ZEEVE_ADMIN_ROLE(), otherUser.address);
            await tx.wait()
            expect(await stakingContract.hasRole(stakingContract.ZEEVE_ADMIN_ROLE(), otherUser.address)).to.be.true;
        });

        it("should emit AdminRoleGranted event on successful role grant", async function () {
            const tx = await stakingContract.connect(benqiSuperAdmin).grantAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address);
            await tx.wait()
            await expect(tx)
                .to.emit(stakingContract, "AdminRoleGranted")
                .withArgs(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address, benqiSuperAdmin.address);
        });

        it("should revert if account is zero address", async function () {
            await expect(stakingContract.connect(benqiSuperAdmin).grantAdminRole(stakingContract.BENQI_ADMIN_ROLE(), ethers.ZeroAddress))
                .to.be.revertedWith("Cannot assign role to the zero address");
        });

        it("should revert if non-super admin tries to grant BENQI_ADMIN_ROLE", async function () {
            await expect(stakingContract.connect(otherUser).grantAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address))
                .to.be.revertedWith("Not authorized to grant this role");
        });

        it("should revert if non-super admin tries to grant ZEEVE_ADMIN_ROLE", async function () {
            await expect(stakingContract.connect(otherUser).grantAdminRole(stakingContract.ZEEVE_ADMIN_ROLE(), otherUser.address))
                .to.be.revertedWith("Not authorized to grant this role");
        });

        it("should revert if trying to grant an unrecognized role", async function () {
            const unrecognizedRole = ethers.encodeBytes32String("UNRECOGNIZED_ROLE");
            await expect(stakingContract.connect(benqiSuperAdmin).grantAdminRole(unrecognizedRole, otherUser.address))
                .to.be.revertedWith("Attempting to grant an unrecognized role");
        });
        it("should revert if account already has the role", async function () {
            await stakingContract.connect(benqiSuperAdmin).grantAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address);
            await expect(stakingContract.connect(benqiSuperAdmin).grantAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address))
                .to.be.revertedWith("Account already has the role");
        });
    });

    describe("revokeAdminRole", function () {
        it("should revoke BENQI_ADMIN_ROLE by BENQI_SUPER_ADMIN_ROLE successfully", async function () {
            const tx = await stakingContract.connect(benqiSuperAdmin).revokeAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address);
            await tx.wait()
            expect(await stakingContract.hasRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address)).to.be.false;
        });

        it("should revoke ZEEVE_ADMIN_ROLE by ZEEVE_SUPER_ADMIN_ROLE successfully", async function () {
            const tx = await stakingContract.connect(zeeveSuperAdmin).revokeAdminRole(stakingContract.ZEEVE_ADMIN_ROLE(), otherUser.address);
            await tx.wait()
            expect(await stakingContract.hasRole(stakingContract.ZEEVE_ADMIN_ROLE(), otherUser.address)).to.be.false;
        });

        it("should emit AdminRoleRevoked event on successful role revocation", async function () {
            await expect(stakingContract.connect(benqiSuperAdmin).revokeAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address))
                .to.emit(stakingContract, "AdminRoleRevoked")
                .withArgs(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address, benqiSuperAdmin.address);
        });

        it("should revert if account is zero address", async function () {
            await expect(stakingContract.connect(benqiSuperAdmin).revokeAdminRole(stakingContract.BENQI_ADMIN_ROLE(), ethers.ZeroAddress))
                .to.be.revertedWith("Cannot assign role to the zero address");
        });

        it("should revert if non-super admin tries to revoke BENQI_ADMIN_ROLE", async function () {
            await expect(stakingContract.connect(otherUser).revokeAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address))
                .to.be.revertedWith("Not authorized to revoke this role");
        });

        it("should revert if non-super admin tries to revoke ZEEVE_ADMIN_ROLE", async function () {
            await expect(stakingContract.connect(otherUser).revokeAdminRole(stakingContract.ZEEVE_ADMIN_ROLE(), otherUser.address))
                .to.be.revertedWith("Not authorized to revoke this role");
        });

        it("should revert if trying to revoke an unrecognized role", async function () {
            const unrecognizedRole = ethers.encodeBytes32String("UNRECOGNIZED_ROLE");
            await expect(stakingContract.connect(benqiSuperAdmin).revokeAdminRole(unrecognizedRole, otherUser.address))
                .to.be.revertedWith("Attempting to grant an unrecognized role");
        });
        it("should revert if account does not have the role", async function () {
            await expect(stakingContract.connect(benqiSuperAdmin).revokeAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address))
                .to.be.revertedWith("Account does not have the role to be revoked");
        });
    });

    describe("updateAdminRole", function () {
        beforeEach(async function () {
            // Revoke roles from otherUser if they already have them (for idempotency)
            if (await stakingContract.hasRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address)) {
                await stakingContract.connect(benqiSuperAdmin).revokeAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address);
            }
            if (await stakingContract.hasRole(stakingContract.ZEEVE_ADMIN_ROLE(), otherUser.address)) {
                await stakingContract.connect(zeeveSuperAdmin).revokeAdminRole(stakingContract.ZEEVE_ADMIN_ROLE(), otherUser.address);
            }

            // Grant the roles to otherUser for the test
            await stakingContract.connect(benqiSuperAdmin).grantAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address);
            await stakingContract.connect(zeeveSuperAdmin).grantAdminRole(stakingContract.ZEEVE_ADMIN_ROLE(), otherUser.address);
        });

        it("should update BENQI_ADMIN_ROLE by BENQI_SUPER_ADMIN_ROLE successfully", async function () {
            // Ensure benqiAdmin doesn't already have the role
            if (await stakingContract.hasRole(stakingContract.BENQI_ADMIN_ROLE(), benqiAdmin.address)) {
                await stakingContract.connect(benqiSuperAdmin).revokeAdminRole(stakingContract.BENQI_ADMIN_ROLE(), benqiAdmin.address);
            }

            // Update role
            const tx1 = await stakingContract.connect(benqiSuperAdmin).updateAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address, benqiAdmin.address);
            await tx1.wait();

            // Assertions
            expect(await stakingContract.hasRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address)).to.be.false;
            expect(await stakingContract.hasRole(stakingContract.BENQI_ADMIN_ROLE(), benqiAdmin.address)).to.be.true;
        });

        it("should update ZEEVE_ADMIN_ROLE by ZEEVE_SUPER_ADMIN_ROLE successfully", async function () {
            // Ensure zeeveAdmin doesn't already have the role
            if (await stakingContract.hasRole(stakingContract.ZEEVE_ADMIN_ROLE(), zeeveAdmin.address)) {
                await stakingContract.connect(zeeveSuperAdmin).revokeAdminRole(stakingContract.ZEEVE_ADMIN_ROLE(), zeeveAdmin.address);
            }

            // Update role
            const tx = await stakingContract.connect(zeeveSuperAdmin).updateAdminRole(stakingContract.ZEEVE_ADMIN_ROLE(), otherUser.address, zeeveAdmin.address);
            await tx.wait();

            // Assertions
            expect(await stakingContract.hasRole(stakingContract.ZEEVE_ADMIN_ROLE(), otherUser.address)).to.be.false;
            expect(await stakingContract.hasRole(stakingContract.ZEEVE_ADMIN_ROLE(), zeeveAdmin.address)).to.be.true;
        });

        it("should emit AdminRoleRevoked and AdminRoleGranted events on successful role update", async function () {
            // Ensure benqiAdmin does not already have the role
            if (await stakingContract.hasRole(stakingContract.BENQI_ADMIN_ROLE(), benqiAdmin.address)) {
                const tx1 = await stakingContract.connect(benqiSuperAdmin).revokeAdminRole(stakingContract.BENQI_ADMIN_ROLE(), benqiAdmin.address);
                await tx1.wait();
            }

            // Perform the role update
            const tx = await stakingContract.connect(benqiSuperAdmin).updateAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address, benqiAdmin.address);
            await tx.wait()

            // Check emitted events
            await expect(tx)
                .to.emit(stakingContract, "AdminRoleRevoked")
                .withArgs(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address, benqiSuperAdmin.address)
                .and.to.emit(stakingContract, "AdminRoleGranted")
                .withArgs(stakingContract.BENQI_ADMIN_ROLE(), benqiAdmin.address, benqiSuperAdmin.address);
        });

        it("should revert if newAdmin is zero address", async function () {
            await expect(stakingContract.connect(benqiSuperAdmin).updateAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address, ethers.ZeroAddress))
                .to.be.revertedWith("Cannot assign role to the zero address");
        });

        it("should revert if non-super admin tries to update BENQI_ADMIN_ROLE", async function () {
            await expect(stakingContract.connect(otherUser).updateAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address, benqiAdmin.address))
                .to.be.revertedWith("Not authorized to update this role");
        });

        it("should revert if non-super admin tries to update ZEEVE_ADMIN_ROLE", async function () {
            await expect(stakingContract.connect(otherUser).updateAdminRole(stakingContract.ZEEVE_ADMIN_ROLE(), otherUser.address, zeeveAdmin.address))
                .to.be.revertedWith("Not authorized to update this role");
        });

        it("should revert if trying to update an unrecognized role", async function () {
            const unrecognizedRole = ethers.encodeBytes32String("UNRECOGNIZED_ROLE");
            await expect(stakingContract.connect(benqiSuperAdmin).updateAdminRole(unrecognizedRole, otherUser.address, benqiAdmin.address))
                .to.be.revertedWith("Attempting to grant an unrecognized role");
        });
        it("should revert if newAdmin already has the role", async function () {
            // Ensure benqiAdmin has the role before trying to update
            if (!await stakingContract.hasRole(stakingContract.BENQI_ADMIN_ROLE(), benqiAdmin.address)) {
                await stakingContract.connect(benqiSuperAdmin).grantAdminRole(stakingContract.BENQI_ADMIN_ROLE(), benqiAdmin.address);
            }

            // Try updating with the same admin, which should revert
            await expect(stakingContract.connect(benqiSuperAdmin).updateAdminRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address, benqiAdmin.address))
                .to.be.revertedWith("New admin already has the role");
        });
    });
    describe("grantRole", function () {
        it("should revert if trying to call grantRole directly", async function () {
            await expect(stakingContract.grantRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address))
                .to.be.revertedWith("Direct role granting is not allowed. Use grantAdminRole.");
        });
    });

    describe("revokeRole", function () {
        it("should revert if trying to call revokeRole directly", async function () {
            await expect(stakingContract.revokeRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address))
                .to.be.revertedWith("Direct role revocation is not allowed. Use revokeAdminRole.");
        });
    });

    describe("renounceRole", function () {
        it("should revert if trying to call renounceRole directly", async function () {
            await expect(stakingContract.renounceRole(stakingContract.BENQI_ADMIN_ROLE(), otherUser.address))
                .to.be.revertedWith("Renouncing roles is not allowed for this contract.");
        });
    });
});