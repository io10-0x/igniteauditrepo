const hre = require("hardhat");
const { expect } = require("chai");
const { smock } = require("@defi-wonderland/smock");


const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("Ignite", function () {
  // The Ignite contract
  let ignite;

  // The sAVAX contract
  let sAVAX;

  // The Ignite contract deployer (Ethers signer)
  let admin;

  // The recipient of slashed tokens (Ethers signer)
  let slashedTokenRecipient;

  // The recipient of registration fees (Ethers signer)
  let feeRecipient;

  // The QI token contract
  let qi;

  // Chainlink-compatible AVAX price feed contract
  let avaxPriceFeed;

  // Chainlink-compatible QI price feed contract
  let qiPriceFeed;

  // Validator BLS public key
  const blsKey = "8d609cdd38ffc9ad01c91d1ae4fccb8cd6c75a6ad33a401da42283b0c3b59bbaf5abc172335ea4d9c31baa936818f0ab";

  // Validator BLS signature
  const blsSignature = "8c12c805e7dfe4bfe38be44685ee852d931d73b3c0820a1343d731909120cee4895f9b60990520a90d06a031a42e0f8616d415b543408c24be0da90d5e7fa8242f4fd32dadf34c790996ca474dbdbcd763f82c53880db19fd3b30d13cee278b4";

  // Validator BLS proof of possession (PoP)
  const blsPoP = Buffer.from(blsKey + blsSignature, "hex");

  before(async function () {
    admin = await hre.ethers.getSigner();
    slashedTokenRecipient = await hre.ethers.getImpersonatedSigner("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
    feeRecipient = await hre.ethers.getImpersonatedSigner("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa");

    await admin.sendTransaction({
      to: slashedTokenRecipient.address,
      value: hre.ethers.utils.parseEther("100"),
    });

    await admin.sendTransaction({
      to: feeRecipient.address,
      value: hre.ethers.utils.parseEther("100"),
    });
  });

  /**
   * Deploy the QI token.
   *
   * @returns {Promise<void>}
   */
  const deployQi = async () => {
    const FaucetToken = await hre.ethers.getContractFactory("FaucetToken");
    qi = await FaucetToken.deploy("QI", "BENQI", 18);
  }

  /**
   * Deploy an ERC-20 FaucetToken.
   *
   * @param decimals Number of decimals (defaults to 18)
   * @returns {Promise<Contract>}
   */
  const deployErc20Token = async (decimals = 18) => {
    const FaucetToken = await hre.ethers.getContractFactory("FaucetToken");

    return FaucetToken.deploy("MOCK", "Mock Token", decimals);
  }

  /**
   * Deploy a new Chainlink-compatible price feed oracle
   *
   * @param price Initial price
   * @returns {Promise<Contract>}
   */
  const deployPriceFeed = async (price) => {
    const PriceFeed = await hre.ethers.getContractFactory("PriceFeed");

    return PriceFeed.deploy(price);
  }

  /**
   * Deploy a mock sAVAX contract.
   *
   * @returns {Promise<void>}
   */
  const deployStakedAvax = async () => {
    const StakedAvax = await hre.ethers.getContractFactory("StakedAvax");
    const stakedAvax = await StakedAvax.deploy();
    sAVAX = await smock.fake(stakedAvax, {
      address: "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE",
    });
  }


  /**
   * Deploy the Ignite contracts.
   *
   * @returns {Promise<void>}
   */
  const deployIgnite = async () => {
    const Ignite = await hre.ethers.getContractFactory("Ignite");
    ignite = await hre.upgrades.deployProxy(
      Ignite,
      [
        "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE",
        qi.address,
        avaxPriceFeed.address,
        120,
        qiPriceFeed.address,
        1800,
        hre.ethers.utils.parseEther("25"),
        hre.ethers.utils.parseEther("1500"),
      ],
    );

    await ignite.deployed();
  };

  /**
   * Reset the network to its initial empty state with impersonated accounts.
   *
   * @returns {Promise<void>}
   */
  const resetNetwork = async () => {
    await hre.network.provider.send("hardhat_reset");

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [slashedTokenRecipient.address],
    });

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [feeRecipient.address],
    });

    await admin.sendTransaction({
      to: slashedTokenRecipient.address,
      value: hre.ethers.utils.parseEther("100"),
    });

    await admin.sendTransaction({
      to: feeRecipient.address,
      value: hre.ethers.utils.parseEther("100"),
    });
  }

  /**
   * Grant an Ignite access control role to an address.
   *
   * @param role Role to grant
   * @param address Address for which the role is granted
   * @returns {Promise<void>}
   */
  const grantRole = async (role, address) => {
    await ignite.grantRole(
      hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes(role)),
      address,
    );
  }

  /**
   * Reset the network and deploy all contracts.
   *
   * @returns {Promise<void>}
   */
  const setup = async () => {
    await resetNetwork()
    await deployQi();
    await deployStakedAvax();

    avaxPriceFeed = await deployPriceFeed(2_000_000_000);
    qiPriceFeed = await deployPriceFeed(1_000_000);

    await deployIgnite();

    await ignite.addPaymentToken(qi.address, qiPriceFeed.address, 1800);
  }

  describe("General", function () {
    it("deploys", async function () {
      await setup();

      expect(ignite.address).not.to.be.empty;
    });
  });

  describe("Registration", function () {
    describe("With stake", function () {
      it("does not allow registration without AVAX", async function() {
        await setup();

        // Set AVAX price to $20 and QI price to $0.01
        await avaxPriceFeed.setPrice(2_000_000_000);
        await qiPriceFeed.setPrice(1_000_000);

        await expect(
          ignite.registerWithStake("NodeID-1", blsPoP, 86400 * 14),
        ).to.be.revertedWith("Invalid value")
      });

      it("allows node registration with AVAX and QI", async function () {
        await setup();

        // Set AVAX price to $20 and QI price to $0.01
        await avaxPriceFeed.setPrice(2_000_000_000);
        await qiPriceFeed.setPrice(1_000_000);

        // Mint 10M QI and allow Ignite to spend it
        await qi.mint(hre.ethers.utils.parseEther("10000000"));
        await qi.approve(ignite.address, hre.ethers.utils.parseEther("10000000"));

        // Register a node with 1500 AVAX and 100k QI
        const receipt = await ignite.registerWithStake("NodeID-1", blsPoP, 86400 * 14, {
          value: hre.ethers.utils.parseEther("1500"),
        });

        await expect(receipt)
          .to.emit(ignite, "NewRegistration")
          .withArgs(
            admin.address,
            "NodeID-1",
            "0x" + blsPoP.toString("hex"),
            86400 * 14,
            false,
            hre.ethers.utils.parseEther("1500"),
            qi.address,
            hre.ethers.utils.parseEther("100000"),
          );

        // 1500 AVAX from the user, 500 AVAX from BENQI
        expect(await ignite.totalSubsidisedAmount()).to.equal(hre.ethers.utils.parseEther("500"));

        const registration = await ignite.registrations(1);

        expect(registration.tokenDeposits.avaxAmount).to.equal(hre.ethers.utils.parseEther("1500"));
        expect(registration.tokenDeposits.tokenAmount).to.equal(hre.ethers.utils.parseEther("100000"));

        // 100k QI should have been transferred from the registerer to Ignite
        expect(await qi.balanceOf(admin.address)).to.equal(hre.ethers.utils.parseEther("9900000"));
        expect(await qi.balanceOf(ignite.address)).to.equal(hre.ethers.utils.parseEther("100000"));

        expect(await ignite.blsProofOfPossessionByNodeId("NodeID-1")).to.equal("0x" + blsPoP.toString("hex"));
      });

      it("enforces AVAX deposit range", async function () {
        await setup();

        // Set AVAX price to $20 and QI price to $0.01
        await avaxPriceFeed.setPrice(2_000_000_000);
        await qiPriceFeed.setPrice(1_000_000);

        // Mint 10M QI and allow Ignite to spend it
        await qi.mint(hre.ethers.utils.parseEther("10000000"));
        await qi.approve(ignite.address, hre.ethers.utils.parseEther("10000000"));

        await expect(
          ignite.registerWithStake(
            "NodeID-1",
            blsPoP,
            86400 * 14,
            {
              value: hre.ethers.utils.parseEther("10"),
            },
          ),
        ).to.be.reverted;

        await expect(
          ignite.registerWithStake(
            "NodeID-1",
            blsPoP,
            86400 * 14,
            {
              value: hre.ethers.utils.parseEther("1700"),
            },
          ),
        ).to.be.reverted;
      });

      it("reverts if token prices are stale", async function () {
        await setup();

        // Set AVAX price to $20 (updated at UNIX timestamp 0) and QI price to $0.01
        await avaxPriceFeed.setPrice(2_000_000_000);
        await avaxPriceFeed.setUpdatedAtTimestamp(0);
        await qiPriceFeed.setPrice(1_000_000);

        // Mint 10M QI and allow Ignite to spend it
        await qi.mint(hre.ethers.utils.parseEther("10000000"));
        await qi.approve(ignite.address, hre.ethers.utils.parseEther("10000000"));

        await expect(
          ignite.registerWithStake("NodeID-1", blsPoP, 86400 * 14, {
            value: hre.ethers.utils.parseEther("1500"),
          }),
        ).to.be.reverted;

        // Set AVAX price to $20 (updated now) and QI price to $0.01 (updated at UNIX timestamp 0)
        await avaxPriceFeed.setPrice(2_000_000_000);
        await avaxPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000));
        await qiPriceFeed.setPrice(1_000_000);
        await qiPriceFeed.setUpdatedAtTimestamp(0);

        await expect(
          ignite.registerWithStake("NodeID-1", blsPoP, 86400 * 14, {
            value: hre.ethers.utils.parseEther("1500"),
          }),
        ).to.be.reverted;
      });

      it("reverts if total subsidised AVAX amount exceeds the limit", async function () {
        await qiPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000));

        await ignite.setMaximumSubsidisationAmount(hre.ethers.utils.parseEther("500"));

        await expect(ignite.registerWithStake("NodeID-1", blsPoP, 86400 * 14, {
          value: hre.ethers.utils.parseEther("1000"),
        })).to.be.reverted;
      });
    });

    describe("With fee", function () {
      before(async function () {
        await setup();
      });

      it("estimates AVAX staking rewards correctly", async function () {
        expect(await ignite.getRegistrationFee(86400 * 7 * 2)).to.equal(hre.ethers.utils.parseEther("8"));
        expect(await ignite.getRegistrationFee(86400 * 7 * 4)).to.equal(hre.ethers.utils.parseEther("15"));
        expect(await ignite.getRegistrationFee(86400 * 7 * 8)).to.equal(hre.ethers.utils.parseEther("28"));
        expect(await ignite.getRegistrationFee(86400 * 7 * 12)).to.equal(hre.ethers.utils.parseEther("40"));
      });

      describe("AVAX", async function () {
        it("allows registering by paying a fee in AVAX", async function () {
          const fee = await ignite.getRegistrationFee(86400 * 14);

          const receipt = await ignite.registerWithAvaxFee(
            "NodeID-1",
            blsPoP,
            86400 * 14,
            {
              value: fee,
            },
          );

          expect(receipt).to.emit(ignite, "NewRegistration")
            .withArgs(
              admin.address,
              "NodeID-1",
              "0x" + blsPoP.toString("hex"),
              86400 * 14,
              true,
              fee,
              0,
              0,
            );
        });

        it("reverts if the deposit amount is incorrect", async function () {
          const fee = await ignite.getRegistrationFee(86400 * 14);

          await expect(
            ignite.registerWithAvaxFee(
              "NodeID-2",
              blsPoP,
              86400 * 14,
              {
                value: fee.sub(1),
              },
            ),
          ).to.be.reverted;
        });
      });

      describe("USDC", async function () {
        let usdc;
        let usdcPriceFeed;

        before(async function () {
          usdc = await deployErc20Token(6);
          usdcPriceFeed = await deployPriceFeed(100_000_000);

          await ignite.addPaymentToken(usdc.address, usdcPriceFeed.address, 120);
        });

        it("allows registering by paying a fee in USDC", async function () {
          const feeInAvax = await ignite.getRegistrationFee(86400 * 14);

          // Mint USDC and allow Ignite to spend it
          await usdc.mint(hre.ethers.utils.parseEther("10000000"));
          await usdc.approve(ignite.address, hre.ethers.utils.parseEther("10000000"));

          const initialUserUsdcBalance = await usdc.balanceOf(admin.address);
          const initialIgniteUsdcBalance = await usdc.balanceOf(ignite.address);

          expect(initialUserUsdcBalance).to.equal(hre.ethers.utils.parseEther("10000000"));
          expect(initialIgniteUsdcBalance).to.equal(0);

          // AVAX is $20 and USDC is $1 so the fee should be 20 * feeInAvax, shifted by 12 decimals
          const usdcFee = feeInAvax.mul(20).div(hre.ethers.BigNumber.from(10).pow(12));

          const receipt = await ignite.registerWithErc20Fee(usdc.address, "NodeID-2", blsPoP, 86400 * 14);

          await expect(receipt).to.emit(ignite, "NewRegistration")
            .withArgs(
              admin.address,
              "NodeID-2",
              "0x" + blsPoP.toString("hex"),
              86400 * 14,
              true,
              0,
              usdc.address,
              usdcFee,
            );

          expect(await usdc.balanceOf(admin.address)).to.equal(initialUserUsdcBalance.sub(usdcFee));
          expect(await usdc.balanceOf(ignite.address)).to.equal(usdcFee);
        });

        it("reverts if token prices are invalid", async function () {
          // Stale AVAX price
          await avaxPriceFeed.setPrice(2_000_000_000);
          await avaxPriceFeed.setUpdatedAtTimestamp(0);
          await usdcPriceFeed.setPrice(100_000_000);

          await expect(ignite.registerWithErc20Fee(usdc.address, "NodeID-3", blsPoP, 86400 * 14))
            .to.be.reverted;

          // Stale USDC price
          await avaxPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000));
          await usdcPriceFeed.setUpdatedAtTimestamp(0);
          await expect(ignite.registerWithErc20Fee(usdc.address, "NodeID-3", blsPoP, 86400 * 14))
            .to.be.reverted;

          // Invalid AVAX or token price
          await avaxPriceFeed.setPrice(-1);
          await expect(ignite.registerWithErc20Fee(usdc.address, "NodeID-3", blsPoP, 86400 * 14))
            .to.be.reverted;

          await avaxPriceFeed.setPrice(2_000_000_000);
          await usdcPriceFeed.setPrice(-1);

          await expect(ignite.registerWithErc20Fee(usdc.address, "NodeID-3", blsPoP, 86400 * 14))
            .to.be.reverted;

          // Zero token amount
          await avaxPriceFeed.setPrice(1);
          await usdcPriceFeed.setPrice(hre.ethers.utils.parseEther("1000000000000000"));
          await usdcPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000));
          await expect(ignite.registerWithErc20Fee(usdc.address, "NodeID-3", blsPoP, 86400 * 14))
            .to.be.reverted;
        });
      });

      describe("QI", async function () {
        it("allows registering by paying a fee in QI", async function () {
          await avaxPriceFeed.setPrice(2_000_000_000);
          await avaxPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000));
          await qiPriceFeed.setPrice(1_000_000);
          await qiPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000));

          const feeInAvax = await ignite.getRegistrationFee(86400 * 14);

          // Mint QI and allow Ignite to spend it
          await qi.mint(hre.ethers.utils.parseEther("10000000"));
          await qi.approve(ignite.address, hre.ethers.utils.parseEther("10000000"));

          const initialUserQiBalance = await qi.balanceOf(admin.address);
          const initialIgniteQiBalance = await qi.balanceOf(ignite.address);

          expect(initialUserQiBalance).to.equal(hre.ethers.utils.parseEther("10000000"));
          expect(initialIgniteQiBalance).to.equal(0);

          // AVAX is $20 and QI is $0.01 so the fee should be 2000 * feeInAvax
          const qiFee = feeInAvax.mul(2000);

          const receipt = await ignite.registerWithErc20Fee(qi.address, "NodeID-3", blsPoP, 86400 * 14);

          await expect(receipt).to.emit(ignite, "NewRegistration")
            .withArgs(
              admin.address,
              "NodeID-3",
              "0x" + blsPoP.toString("hex"),
              86400 * 14,
              true,
              0,
              qi.address,
              qiFee,
            );

          expect(await qi.balanceOf(admin.address)).to.equal(initialUserQiBalance.sub(qiFee));
          expect(await qi.balanceOf(ignite.address)).to.equal(qiFee);
        });

        it("reverts if token prices are invalid", async function () {
          // Stale AVAX price
          await avaxPriceFeed.setUpdatedAtTimestamp(0);

          await expect(ignite.registerWithErc20Fee(qi.address, "NodeID-4", blsPoP, 86400 * 14))
            .to.be.reverted;

          // Stale QI price
          await avaxPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000));
          await qiPriceFeed.setUpdatedAtTimestamp(0);

          await expect(ignite.registerWithErc20Fee(qi.address, "NodeID-4", blsPoP, 86400 * 14))
            .to.be.reverted;
        });

        it("applies QI discount", async function () {
          await avaxPriceFeed.setPrice(2_000_000_000);
          await avaxPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000));
          await qiPriceFeed.setPrice(1_000_000);
          await qiPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000));

          await ignite.setQiPriceMultiplier(9_500);

          const feeInAvax = await ignite.getRegistrationFee(86400 * 14);

          const initialUserQiBalance = await qi.balanceOf(admin.address);
          const initialIgniteQiBalance = await qi.balanceOf(ignite.address);

          // AVAX is $20 and QI is $0.01 so the fee should be 2000 * feeInAvax
          // multiplied by 0,95 QI price multiplier
          const qiFee = feeInAvax.mul(2_000).mul(9_500).div(10_000);

          const receipt = await ignite.registerWithErc20Fee(qi.address, "NodeID-42", blsPoP, 86400 * 14);

          await expect(receipt).to.emit(ignite, "NewRegistration")
            .withArgs(
              admin.address,
              "NodeID-42",
              "0x" + blsPoP.toString("hex"),
              86400 * 14,
              true,
              0,
              qi.address,
              qiFee,
            );

          expect(await qi.balanceOf(admin.address)).to.equal(initialUserQiBalance.sub(qiFee));
          expect(await qi.balanceOf(ignite.address)).to.equal(initialIgniteQiBalance.add(qiFee));
        });
      });
    });

    describe("Superpools", function () {
      const targetApr = 2500;
      let validatorRewarder;

      before(async function () {
        await setup();

        const ValidatorRewarder = await hre.ethers.getContractFactory("ValidatorRewarder");
        validatorRewarder = await hre.upgrades.deployProxy(
          ValidatorRewarder,
          [
            qi.address,
            ignite.address,
            targetApr,
            admin.address,
          ],
        );

        await qi.mint(hre.ethers.utils.parseEther("1000000000"));
        await qi.transfer(validatorRewarder.address, hre.ethers.utils.parseEther("100000000"));

        await grantRole("ROLE_REGISTER_WITH_FLEXIBLE_PRICE_CHECK", admin.address);
      });

      it("registers with exact token prices", async function () {
        // AVAX $20, QI $0.01
        const qiStake = hre.ethers.utils.parseEther("200").mul(2_000);
        const qiFee = hre.ethers.utils.parseEther("1").mul(2_000);

        await qi.approve(ignite.address, qiStake.add(qiFee));

        const receipt = ignite.registerWithPrevalidatedQiStake(
          admin.address,
          "NodeID-Superpools1",
          "0x" + blsPoP.toString("hex"),
          86400 * 28,
          qiStake.add(qiFee),
        );

        await expect(receipt).to.emit(ignite, "NewRegistration")
          .withArgs(
            admin.address,
            "NodeID-Superpools1",
            "0x" + blsPoP.toString("hex"),
            86400 * 28,
            false,
            0,
            qi.address,
            qiStake.add(qiFee),
          );
      });

      it("registers with 5 % price difference", async function () {
        // AVAX $20, QI $0.01
        const qiStake = hre.ethers.utils.parseEther("200").mul(2_000);
        const qiFee = hre.ethers.utils.parseEther("1").mul(2_000);

        await qi.approve(ignite.address, qiStake.add(qiFee).mul(95).div(100));

        const receipt = ignite.registerWithPrevalidatedQiStake(
          admin.address,
          "NodeID-Superpools2",
          "0x" + blsPoP.toString("hex"),
          86400 * 28,
          qiStake.add(qiFee).mul(95).div(100),
        );

        await expect(receipt).to.emit(ignite, "NewRegistration")
          .withArgs(
            admin.address,
            "NodeID-Superpools2",
            "0x" + blsPoP.toString("hex"),
            86400 * 28,
            false,
            0,
            qi.address,
            qiStake.add(qiFee).mul(95).div(100),
          );
      });

      it("reverts with a 15 % price difference", async function () {
        // AVAX $20, QI $0.01
        const qiStake = hre.ethers.utils.parseEther("200").mul(2_000);
        const qiFee = hre.ethers.utils.parseEther("1").mul(2_000);

        await qi.approve(ignite.address, qiStake.add(qiFee));

        const receipt = ignite.registerWithPrevalidatedQiStake(
          admin.address,
          "NodeID-Superpools",
          "0x" + blsPoP.toString("hex"),
          86400 * 28,
          qiStake.add(qiFee).mul(85).div(100),
        );

        await expect(receipt).to.be.reverted;
      });
    });
  });

  describe("Withdrawals", function () {
    before(setup);

    it("enforces access control", async function () {
      await expect(ignite.withdraw(hre.ethers.utils.parseEther("1")))
        .to.be.reverted;
    });

    it("prevents withdrawing beyond the contract minimum allowed balance", async function () {
      // Mint 10M QI and allow Ignite to spend it
      await qi.mint(hre.ethers.utils.parseEther("10000000"));
      await qi.approve(ignite.address, hre.ethers.utils.parseEther("10000000"));

      // Register a node with 1000 AVAX and 2M QI
      await ignite.registerWithStake("NodeID-1", blsPoP, 86400 * 14, {
        value: hre.ethers.utils.parseEther("1000"),
      });

      // No registrations have ended yet so the minimum contract balance should be zero
      expect(await ignite.minimumContractBalance()).to.equal(hre.ethers.utils.parseEther("0"));

      expect(await ignite.blsProofOfPossessionByNodeId("NodeID-1")).to.equal("0x" + blsPoP.toString("hex"));

      // Allow the admin to call releaseLockedTokens
      await grantRole("ROLE_RELEASE_LOCKED_TOKENS", admin.address);

      // Release the registration with 100 AVAX of user rewards and no slashing
      await ignite.releaseLockedTokens(
        "NodeID-1",
        false,
        {
          value: hre.ethers.utils.parseEther("1100"),
        },
      );

      expect(await ignite.blsProofOfPossessionByNodeId("NodeID-1")).to.equal("0x" + blsPoP.toString("hex"));

      // After the registration release, the contract balance should not drop
      // below 1100 AVAX (registration principal + user rewards) to allow the tokens
      // to be redeemed.
      expect(await ignite.minimumContractBalance())
        .to.equal(hre.ethers.utils.parseEther("1100"));

      // The principal was never withdrawn, so the contract balance should be
      // principal * 2 + user rewards.
      expect(await hre.ethers.provider.getBalance(ignite.address))
        .to.equal(hre.ethers.utils.parseEther("2100"));

      // Allow the admin to call withdraw
      await grantRole("ROLE_WITHDRAW", admin.address);

      // The contract balance is 2100 AVAX and the minimum allowed balance is
      // 1100 AVAX meaning that only 1000 AVAX should be withdrawale. Withdrawing
      // 1500 AVAX should revert.
      await expect(ignite.withdraw(hre.ethers.utils.parseEther("1500")))
        .to.be.reverted;
    });

    it("bot can withdraw AVAX", async function () {
      const priorBalance = await hre.ethers.provider.getBalance(admin.address);

      const receipt = await ignite.withdraw(hre.ethers.utils.parseEther("500"));
      const { gasUsed, effectiveGasPrice } = await receipt.wait();
      const transactionCost = gasUsed.mul(effectiveGasPrice);

      await expect(receipt)
        .to.emit(ignite, "Withdraw")
        .withArgs(hre.ethers.utils.parseEther("500"));

      const posteriorBalance = await hre.ethers.provider.getBalance(admin.address);

      // The account balance should increase by the withdrawal amount, not
      // including the transaction cost.
      expect(posteriorBalance.sub(priorBalance).add(transactionCost))
        .to.equal(hre.ethers.utils.parseEther("500"));
    });
  });

  describe("Registration releases", function () {
    before(setup);

    before(async function () {
      // Mint 100M QI and allow Ignite to spend it
      await qi.mint(hre.ethers.utils.parseEther("100000000"));
      await qi.approve(ignite.address, hre.ethers.utils.parseEther("100000000"));
    });

    const setupRegistration = async () => {
      // Mint 100M QI and allow Ignite to spend it
      await qi.mint(hre.ethers.utils.parseEther("100000000"));
      await qi.approve(ignite.address, hre.ethers.utils.parseEther("100000000"));

      // Register NodeID-1 for two weeks with 1500 AVAX and 100k QI
      await ignite.registerWithStake(
        "NodeID-1",
        blsPoP,
        86400 * 14,
        {
          value: hre.ethers.utils.parseEther("1500"),
        },
      );
    }

    const setupRoles = async () => {
      await grantRole("ROLE_RELEASE_LOCKED_TOKENS", admin.address);
    }

    it("enforces access control", async function () {
      await expect(
        ignite.releaseLockedTokens(
          "NodeID-1",
          false,
        )
      ).to.be.reverted;

      await setupRoles();

      await ignite.registerWithStake(
        "NodeID-1",
        blsPoP,
        86400 * 14,
        {
          value: hre.ethers.utils.parseEther("1500"),
        },
      );
    });

    it("enforces zero msg.value for failed fee registrations", async function () {
      const fee = await ignite.getRegistrationFee(86400 * 14);

      await ignite.registerWithAvaxFee(
        "NodeID-AvaxFee",
        blsPoP,
        86400 * 14,
        {
          value: fee,
        },
      );

      await expect(
        ignite.releaseLockedTokens(
          "NodeID-AvaxFee",
          true,
          {
            value: hre.ethers.utils.parseEther("100"),
          },
        ),
      ).to.be.reverted;
    });

    it("enforces msg.value to amount to principal AVAX deposit for failed stake registrations", async function () {
      await expect(
        ignite.releaseLockedTokens(
          "NodeID-1",
          true,
          {
            value: hre.ethers.utils.parseEther("100"),
          },
        ),
      ).to.be.reverted;

      await expect(
        ignite.releaseLockedTokens(
          "NodeID-1",
          true,
          {
            value: hre.ethers.utils.parseEther("1500"),
          },
        ),
      ).not.to.be.reverted;
    });

    it("reverts if there are no registrations", async function () {
      await setup();
      await setupRoles();

      await expect(
        ignite.releaseLockedTokens(
          "NodeID-1",
          false,
        ),
      ).to.be.reverted;
    });

    it("reverts if the registration is not found", async function () {
      await setupRegistration();

      await expect(
        ignite.releaseLockedTokens(
          "NodeID-NOT-FOUND",
          false,
        ),
      ).to.be.reverted;
    });

    it("reverts on double release", async function () {
      await ignite.registerWithStake("NodeID-3", blsPoP, 86400 * 14, {
        value: hre.ethers.utils.parseEther("1500"),
      });

      await ignite.releaseLockedTokens(
        "NodeID-3",
        false,
        {
          value: hre.ethers.utils.parseEther("1510"),
        },
      );

      await expect(
        ignite.releaseLockedTokens(
          "NodeID-3",
          false,
          {
            value: hre.ethers.utils.parseEther("1510"),
          },
        ),
      ).to.be.reverted;
    });

    it("decreases total subsidised AVAX amount on the release of failed validations", async function () {
      // Fee model
      const fee = await ignite.getRegistrationFee(86400 * 14);
      let initialTotalSubsidisedAmount = await ignite.totalSubsidisedAmount();

      await ignite.registerWithAvaxFee("NodeID-Fail-1", blsPoP, 86400 * 14, {
        value: fee,
      });

      await ignite.releaseLockedTokens("NodeID-Fail-1", true);

      let totalSubsidisedAmount = await ignite.totalSubsidisedAmount();

      expect(totalSubsidisedAmount).to.equal(initialTotalSubsidisedAmount);

      await ignite.redeemAfterExpiry("NodeID-Fail-1");

      // Stake model
      initialTotalSubsidisedAmount = await ignite.totalSubsidisedAmount();

      await ignite.registerWithStake("NodeID-Fail-2", blsPoP, 86400 * 14, {
        value: hre.ethers.utils.parseEther("200"),
      });

      await ignite.releaseLockedTokens("NodeID-Fail-2", true, {
        value: hre.ethers.utils.parseEther("200"),
      });

      totalSubsidisedAmount = await ignite.totalSubsidisedAmount();

      expect(totalSubsidisedAmount).to.equal(initialTotalSubsidisedAmount);

      await ignite.redeemAfterExpiry("NodeID-Fail-2");
    });

    describe("registrations can be released", async function () {
      const userRewardShare = hre.ethers.utils.parseEther("100");

      it("with rewards", async function () {
        const receipt = await ignite.releaseLockedTokens(
          "NodeID-1",
          false,
          {
            value: hre.ethers.utils.parseEther("1600"),
          },
        );

        await expect(receipt)
          .to.emit(ignite, "RegistrationExpired")
          .withArgs("NodeID-1");

        await expect(receipt)
          .to.emit(ignite, "ValidatorRewarded")
          .withArgs("NodeID-1", userRewardShare);

        const registration = await ignite.registrations(1);

        expect(registration.withdrawable).to.be.true;
        expect(registration.rewardAmount).to.equal(userRewardShare);
        expect(registration.slashed).to.be.false;
      });

      it("with QI slashing", async function () {
        await ignite.registerWithStake(
          "NodeID-4",
          blsPoP,
          86400 * 14,
          {
            value: hre.ethers.utils.parseEther("1500"),
          },
        );

        // Setting the slash percentage after the registration should not affect
        // past registrations.
        await ignite.setQiSlashPercentage("3000");
        await ignite.setAvaxSlashPercentage("3000");

        const initialIgniteQiBalance = await qi.balanceOf(ignite.address);

        const receipt = await ignite.releaseLockedTokens(
          "NodeID-4",
          false,
          {
            value: hre.ethers.utils.parseEther("1500"),
          },
        );

        // 50 % of the QI deposit should be slashed
        const qiSlashAmount = hre.ethers.utils.parseEther("50000");

        await expect(receipt)
          .to.emit(ignite, "RegistrationExpired")
          .withArgs("NodeID-4");

        await expect(receipt)
          .to.emit(ignite, "ValidatorSlashed")
          .withArgs("NodeID-4", qiSlashAmount, hre.ethers.utils.parseEther("0"));

        // Slashed tokens go to the slashed token recipient, the rest remains in the contract
        expect(await qi.balanceOf(slashedTokenRecipient.address)).to.equal(qiSlashAmount);
        expect(initialIgniteQiBalance.sub(await qi.balanceOf(ignite.address)))
          .to.equal(hre.ethers.utils.parseEther("50000"));

        const registration = await ignite.registrations(3);

        expect(registration.withdrawable).to.be.true;
        expect(registration.rewardAmount).to.equal(hre.ethers.utils.parseEther("0"));
        expect(registration.slashed).to.be.true;
      });

      it("without collateral", async function () {
        await expect(ignite.registerWithoutCollateral("NodeID-5", blsPoP, 86400 * 14))
          .to.be.reverted;

        await grantRole("ROLE_REGISTER_WITHOUT_COLLATERAL", admin.address);

        ignite.registerWithoutCollateral("NodeID-5", blsPoP, 86400 * 14);

        expect(await ignite.blsProofOfPossessionByNodeId("NodeID-5")).to.equal("0x" + blsPoP.toString("hex"));

        const priorTotalSubsidisedAvax = await ignite.totalSubsidisedAmount();

        const receipt = await ignite.releaseLockedTokens("NodeID-5", false);

        await expect(receipt)
          .to.emit(ignite, "RegistrationExpired")
          .withArgs("NodeID-5");

        await expect(receipt)
          .to.emit(ignite, "RegistrationDeleted")
          .withArgs("NodeID-5");

        const posteriorTotalSubsidisedAvax = await ignite.totalSubsidisedAmount();

        expect(priorTotalSubsidisedAvax.sub(posteriorTotalSubsidisedAvax))
          .to.equal(hre.ethers.utils.parseEther("0"));

        await expect(ignite.redeemAfterExpiry("NodeID-5"))
          .to.be.reverted;

        expect(await ignite.blsProofOfPossessionByNodeId("NodeID-5")).to.equal("0x");
      });

      it("with QI and AVAX slashing", async function () {
        await setup();
        await setupRoles();

        await qi.mint(hre.ethers.utils.parseEther("100000000"));
        await qi.approve(ignite.address, hre.ethers.utils.parseEther("100000000"));

        await ignite.setQiSlashPercentage("5000");
        await ignite.setAvaxSlashPercentage("2500");

        await ignite.registerWithStake(
          "NodeID-1",
          blsPoP,
          86400 * 14,
          {
            value: hre.ethers.utils.parseEther("1500"),
          },
        );

        const priorSlashTokenRecipientAvaxBalance = await hre.ethers.provider.getBalance(slashedTokenRecipient.address);

        const receipt = await ignite.releaseLockedTokens(
          "NodeID-1",
          false,
          {
            value: hre.ethers.utils.parseEther("1500"),
          },
        );

        const posteriorSlashTokenRecipientAvaxBalance = await hre.ethers.provider.getBalance(slashedTokenRecipient.address);

        // 50 % of the QI deposit and 25 % of the AVAX deposit should be slashed
        const qiSlashAmount = hre.ethers.utils.parseEther("50000");
        const avaxSlashAmount = hre.ethers.utils.parseEther("375");

        await expect(receipt)
          .to.emit(ignite, "RegistrationExpired")
          .withArgs("NodeID-1");

        await expect(receipt)
          .to.emit(ignite, "ValidatorSlashed")
          .withArgs("NodeID-1", qiSlashAmount, avaxSlashAmount);

        // Slashed tokens go to the slashed token recipient, the rest remains in the contract
        expect(await qi.balanceOf(slashedTokenRecipient.address)).to.equal(qiSlashAmount);
        expect(await qi.balanceOf(ignite.address)).to.equal(hre.ethers.utils.parseEther("50000"));
        expect(posteriorSlashTokenRecipientAvaxBalance.sub(priorSlashTokenRecipientAvaxBalance)).to.equal(avaxSlashAmount);

        const registration = await ignite.registrations(1);

        expect(registration.withdrawable).to.be.true;
        expect(registration.rewardAmount).to.equal(hre.ethers.utils.parseEther("0"));
        expect(registration.slashed).to.be.true;

        expect(await ignite.minimumContractBalance()).to.equal(hre.ethers.utils.parseEther("1125"));
      });

      describe("with fee in", async function () {
        let fee;

        before(async function () {
          fee = await ignite.getRegistrationFee(86400 * 14);
        });

        it("AVAX", async function () {
          await ignite.registerWithAvaxFee("NodeID-AVAX-FEE", blsPoP, 86400 * 14, {
            value: fee,
          });

          const minimumContractBalanceBeforeRelease = await ignite.minimumContractBalance();
          const totalSubsidisedAmountBeforeRelease = await ignite.totalSubsidisedAmount();

          const releaseReceipt = await ignite.releaseLockedTokens("NodeID-AVAX-FEE", false);

          const minimumContractBalanceAfterRelease = await ignite.minimumContractBalance();
          const totalSubsidisedAmountAfterRelease = await ignite.totalSubsidisedAmount();

          await expect(releaseReceipt).to.changeEtherBalance(feeRecipient, fee);
          await expect(releaseReceipt).to.changeEtherBalance(ignite, fee.mul(-1));
          await expect(releaseReceipt)
            .to.emit(ignite, "RegistrationDeleted")
            .withArgs("NodeID-AVAX-FEE");

          expect(minimumContractBalanceBeforeRelease.sub(minimumContractBalanceAfterRelease)).to.equal(fee);
          expect(totalSubsidisedAmountBeforeRelease.sub(totalSubsidisedAmountAfterRelease))
            .to.equal(hre.ethers.utils.parseEther("2000"));
        });

        it("QI", async function () {
          // AVAX price is $20 and QI price is $0.01
          const qiFee = fee.mul(2000);

          const registrationReceipt = await ignite.registerWithErc20Fee(qi.address, "NodeID-QI-FEE", blsPoP, 86400 * 14);

          await expect(registrationReceipt).to.changeTokenBalance(qi, admin, qiFee.mul(-1));

          const releaseReceipt = await ignite.releaseLockedTokens("NodeID-QI-FEE", false);

          await expect(releaseReceipt).to.changeTokenBalance(qi, feeRecipient, qiFee);
          await expect(releaseReceipt).to.changeTokenBalance(qi, ignite.address, qiFee.mul(-1));
          await expect(releaseReceipt)
            .to.emit(ignite, "RegistrationDeleted")
            .withArgs("NodeID-QI-FEE");
        });

        it("USDC", async function () {
          const usdc = await deployErc20Token(6);
          const usdcPriceFeed = await deployPriceFeed(100_000_000);

          await ignite.addPaymentToken(usdc.address, usdcPriceFeed.address, 120);

          await usdc.mint(hre.ethers.utils.parseEther("100000000"));
          await usdc.approve(ignite.address, hre.ethers.utils.parseEther("100000000"));

          // AVAX price is $20 and USDC price is $1
          const usdcFee = fee.mul(20).div(hre.ethers.BigNumber.from(10).pow(12));

          const registrationReceipt = await ignite.registerWithErc20Fee(usdc.address, "NodeID-USDC-FEE", blsPoP, 86400 * 14);

          await expect(registrationReceipt).to.changeTokenBalance(usdc, admin, usdcFee.mul(-1));

          const releaseReceipt = await ignite.releaseLockedTokens("NodeID-USDC-FEE", false);

          await expect(releaseReceipt).to.changeTokenBalance(usdc, feeRecipient, usdcFee);
          await expect(releaseReceipt).to.changeTokenBalance(usdc, ignite.address, usdcFee.mul(-1));
          await expect(releaseReceipt)
            .to.emit(ignite, "RegistrationDeleted")
            .withArgs("NodeID-USDC-FEE");
        });
      });
    });
  });

  describe("Redemptions", function () {
    const setupBalancesAndApprovals = async () => {
      // Mint 100M QI and allow Ignite to spend it
      await qi.mint(hre.ethers.utils.parseEther("100000000"));
      await qi.approve(ignite.address, hre.ethers.utils.parseEther("100000000"));
    }

    before(async function () {
      await setup();
      await setupBalancesAndApprovals();

      // Register NodeID-1 for two weeks with 1500 AVAX and 100k QI
      await ignite.registerWithStake(
        "NodeID-1",
        blsPoP,
        86400 * 14,
        {
          value: hre.ethers.utils.parseEther("1500"),
        },
      );
    });

    it("reverts before a registrations becomes redeemable", async function () {
      await expect(ignite.redeemAfterExpiry("NodeID-1"))
        .to.be.reverted;
    });

    it("reverts if redeemer is not the registerer", async function () {
      await expect(
        ignite
          .connect(slashedTokenRecipient)
          .redeemAfterExpiry("NodeID-1"),
      ).to.be.reverted;
    });

    it("reverts if the registration is not found", async function() {
      await expect(ignite.redeemAfterExpiry("NodeID-NOT-FOUND"))
        .to.be.reverted;
    });

    describe("users can withdraw tokens after the registration becomes withdrawable", async function () {
      const targetApr = 2500;
      let validatorRewarder;

      beforeEach(async function () {
        await setup();
        await setupBalancesAndApprovals();
        await grantRole("ROLE_RELEASE_LOCKED_TOKENS", admin.address);

        const ValidatorRewarder = await hre.ethers.getContractFactory("ValidatorRewarder");
        validatorRewarder = await hre.upgrades.deployProxy(
          ValidatorRewarder,
          [
            qi.address,
            ignite.address,
            targetApr,
            admin.address,
          ],
        );

        await qi.mint(hre.ethers.utils.parseEther("1000000000"));
        await qi.transfer(validatorRewarder.address, hre.ethers.utils.parseEther("100000000"));

        await grantRole("ROLE_REGISTER_WITH_FLEXIBLE_PRICE_CHECK", admin.address);

        await ignite.setValidatorRewarder(validatorRewarder.address);
      });

      it("with rewards", async function () {
        // Register NodeID-1 for two weeks with 1500 AVAX and 100k QI
        await ignite.registerWithStake(
          "NodeID-1",
          blsPoP,
          86400 * 14,
          {
            value: hre.ethers.utils.parseEther("1500"),
          },
        );

        const rewards = hre.ethers.utils.parseEther("100");

        // Grant 100 AVAX worth of rewards to the validator
        await ignite.releaseLockedTokens(
          "NodeID-1",
          false,
          {
            value: hre.ethers.utils.parseEther("1500").add(rewards),
          },
        );

        expect(await ignite.minimumContractBalance())
          .to.equal(hre.ethers.utils.parseEther("1500").add(rewards));

        expect(await ignite.getTotalRegistrations()).to.equal(1);

        const priorAvaxBalance = await hre.ethers.provider.getBalance(admin.address);
        const priorQiBalance = await qi.balanceOf(admin.address);

        const receipt = await ignite.redeemAfterExpiry("NodeID-1");

        const { gasUsed, effectiveGasPrice } = await receipt.wait();
        const transactionCost = gasUsed.mul(effectiveGasPrice);

        await expect(receipt)
          .to.emit(ignite, "Redeem")
          .withArgs(
            "NodeID-1",
            hre.ethers.utils.parseEther("1500").add(rewards),
            qi.address,
            hre.ethers.utils.parseEther("100000"),
          );

        // Account AVAX balance should've grown by principal + rewards (1600 AVAX) and
        // QI balance should've grown by principal (100k QI).
        const posteriorAvaxBalance = await hre.ethers.provider.getBalance(admin.address);
        const posteriorQiBalance = await qi.balanceOf(admin.address);

        expect(posteriorAvaxBalance.sub(priorAvaxBalance).add(transactionCost))
          .to.equal(hre.ethers.utils.parseEther("1500").add(rewards));

        expect(posteriorQiBalance.sub(priorQiBalance))
          .to.equal(hre.ethers.utils.parseEther("100000"));

        // The contract should've reset the minimum balance back to zero and the
        // registration should have been deleted.
        expect(await ignite.minimumContractBalance()).to.equal(0);
        expect(await ignite.getTotalRegistrations()).to.equal(0);
        await expect(ignite.registrations(1)).to.be.reverted;

        await expect(receipt)
          .to.emit(ignite, "RegistrationDeleted")
          .withArgs("NodeID-1");
      });

      it("with slashing", async function () {
        // Register NodeID-3 for two weeks with 1000 AVAX and 200k QI
        await ignite.registerWithStake("NodeID-1", blsPoP, 86400 * 14, {
          value: hre.ethers.utils.parseEther("1000"),
        });

        await ignite.releaseLockedTokens("NodeID-1", false, {
          value: hre.ethers.utils.parseEther("1000"),
        });

        expect(await ignite.minimumContractBalance()).to.equal(hre.ethers.utils.parseEther("1000"));

        const priorAvaxBalance = await hre.ethers.provider.getBalance(admin.address);
        const priorQiBalance = await qi.balanceOf(admin.address);

        const receipt = await ignite.redeemAfterExpiry("NodeID-1");

        const { gasUsed, effectiveGasPrice } = await receipt.wait();
        const transactionCost = gasUsed.mul(effectiveGasPrice);

        const posteriorAvaxBalance = await hre.ethers.provider.getBalance(admin.address);
        const posteriorQiBalance = await qi.balanceOf(admin.address);

        // Original registerer should receive back 50 % of the original QI
        // deposit and 100 % of the AVAX.
        expect(posteriorQiBalance.sub(priorQiBalance))
          .to.equal(hre.ethers.utils.parseEther("100000"));

        expect(posteriorAvaxBalance.add(transactionCost).sub(priorAvaxBalance))
          .to.equal(hre.ethers.utils.parseEther("1000"));

        expect(await ignite.minimumContractBalance()).to.equal(0);
        expect(await ignite.getTotalRegistrations()).to.equal(0);
        await expect(ignite.registrations(1)).to.be.reverted;

        await expect(receipt)
          .to.emit(ignite, "RegistrationDeleted")
          .withArgs("NodeID-1");
      });

      describe("when starting the validator failed after paying a fee in", async function () {
        it("USDC", async function () {
          const usdc = await deployErc20Token(6);
          const usdcPriceFeed = await deployPriceFeed(100_000_000);

          await ignite.addPaymentToken(usdc.address, usdcPriceFeed.address, 120);

          await usdc.mint(hre.ethers.utils.parseEther("100000000"));
          await usdc.approve(ignite.address, hre.ethers.utils.parseEther("100000000"));

          const userUsdcBalanceBeforeRegistration = await usdc.balanceOf(admin.address);
          await ignite.registerWithErc20Fee(usdc.address, "NodeID-Fail1", blsPoP, 86400 * 14);
          const userUsdcBalanceAfterRegistration = await usdc.balanceOf(admin.address);

          const fee = userUsdcBalanceBeforeRegistration.sub(userUsdcBalanceAfterRegistration);

          await ignite.releaseLockedTokens("NodeID-Fail1", true);

          const userUsdcBalanceBeforeRedemption = await usdc.balanceOf(admin.address);

          await expect(ignite.redeemAfterExpiry("NodeID-Fail1"))
            .to.emit(ignite, "Redeem")
            .withArgs("NodeID-Fail1", 0, usdc.address, fee);

          const userUsdcBalanceAfterRedemption = await usdc.balanceOf(admin.address);

          expect(userUsdcBalanceAfterRedemption.sub(userUsdcBalanceBeforeRedemption)).to.equal(fee);
        });

        it("QI", async function () {
          await qi.mint(hre.ethers.utils.parseEther("100000000"));
          await qi.approve(ignite.address, hre.ethers.utils.parseEther("100000000"));

          const userQiBalanceBeforeRegistration = await qi.balanceOf(admin.address);
          await ignite.registerWithErc20Fee(qi.address, "NodeID-Fail2", blsPoP, 86400 * 14);
          const userQiBalanceAfterRegistration = await qi.balanceOf(admin.address);

          const fee = userQiBalanceBeforeRegistration.sub(userQiBalanceAfterRegistration);

          await ignite.releaseLockedTokens("NodeID-Fail2", true);

          const userQiBalanceBeforeRedemption = await qi.balanceOf(admin.address);

          await expect(ignite.redeemAfterExpiry("NodeID-Fail2"))
            .to.emit(ignite, "Redeem")
            .withArgs("NodeID-Fail2", 0, qi.address, fee);

          const userQiBalanceAfterRedemption = await qi.balanceOf(admin.address);

          expect(userQiBalanceAfterRedemption.sub(userQiBalanceBeforeRedemption)).to.equal(fee);
        });

        it("AVAX", async function () {
          const fee = await ignite.getRegistrationFee(86400 * 14);

          await expect(() => ignite.registerWithAvaxFee("NodeID-Fail3", blsPoP, 86400 * 14, {
            value: fee,
          })).to.changeEtherBalance(admin, fee.mul(-1));

          await ignite.releaseLockedTokens("NodeID-Fail3", true);

          const redemptionReceipt = ignite.redeemAfterExpiry("NodeID-Fail3");

          await expect(redemptionReceipt)
            .to.emit(ignite, "Redeem")
            .withArgs("NodeID-Fail3", fee, ZERO_ADDRESS, 0);

          await expect(redemptionReceipt)
            .to.changeEtherBalance(admin, fee);
        });
      });

      it("when starting the validator failed after staking AVAX and QI", async function () {
        const registrationReceipt = ignite.registerWithStake("NodeID-Fail4", blsPoP, 86400 * 14, {
          value: hre.ethers.utils.parseEther("1000"),
        });

        await expect(registrationReceipt).to.changeEtherBalance(admin, hre.ethers.utils.parseEther("-1000"));
        await expect(registrationReceipt).to.changeTokenBalance(qi, admin, hre.ethers.utils.parseEther("-200000"));

        await ignite.releaseLockedTokens("NodeID-Fail4", true, {
          value: hre.ethers.utils.parseEther("1000"),
        });

        const redemptionReceipt = ignite.redeemAfterExpiry("NodeID-Fail4");

        await expect(redemptionReceipt).to.changeEtherBalance(admin, hre.ethers.utils.parseEther("1000"));
        await expect(redemptionReceipt).to.changeTokenBalance(qi, admin, hre.ethers.utils.parseEther("200000"));
      });

      it("using superpools", async function () {
        // AVAX $20, QI $0.01
        const qiStake = hre.ethers.utils.parseEther("200").mul(2_000);
        const qiFee = hre.ethers.utils.parseEther("1").mul(2_000);

        const qiRewards = await validatorRewarder.calculateRewardAmount(86400 * 28, qiStake);

        await qi.approve(ignite.address, qiStake.add(qiFee));

        const registrationReceipt = await ignite.registerWithPrevalidatedQiStake(
          admin.address,
          "NodeID-Superpools3",
          "0x" + blsPoP.toString("hex"),
          86400 * 28,
          qiStake.add(qiFee),
        );

        await expect(registrationReceipt)
          .to.emit(ignite, "NewRegistration")
          .withArgs(
            admin.address,
            "NodeID-Superpools3",
            "0x" + blsPoP.toString("hex"),
            86400 * 28,
            false,
            0,
            qi.address,
            qiStake.add(qiFee),
          );

        const feeRecipientQiBalanceBeforeRelease = await qi.balanceOf(feeRecipient.address);

        const releaseReceipt = await ignite.releaseLockedTokens("NodeID-Superpools3", false, { value: 0 });
        await expect(releaseReceipt)
          .to.emit(ignite, "ValidatorRewarded")
          .withArgs("NodeID-Superpools3", 0);

        const feeRecipientQiBalanceAfterRelease = await qi.balanceOf(feeRecipient.address);

        expect(feeRecipientQiBalanceAfterRelease.sub(feeRecipientQiBalanceBeforeRelease)).to.equal(qiFee);

        const qiBalanceBeforeClaim = await qi.balanceOf(admin.address);

        await ignite.redeemAfterExpiry("NodeID-Superpools3");

        const qiBalanceAfterClaim = await qi.balanceOf(admin.address);

        expect(qiBalanceAfterClaim.sub(qiBalanceBeforeClaim)).to.equal(qiStake.add(qiRewards));
      });
    });
  });

  describe("Payment methods", function () {
    before(setup);

    describe("Adding", function () {
      const eth = "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB";

      it("enforces access control rules", async function () {
        await expect(
          ignite
            .connect(slashedTokenRecipient)
            .addPaymentToken(ZERO_ADDRESS, ZERO_ADDRESS, 0)
        ).to.be.reverted;
      });

      it("prevents zero token address", async function () {
        await expect(ignite.addPaymentToken(ZERO_ADDRESS, ZERO_ADDRESS, 0))
          .to.be.reverted;
      });

      it("adds a valid payment method", async function () {
        const priceFeed = await deployPriceFeed(20_000_000);

        expect(await ignite.getTotalErc20PaymentMethods()).to.equal(1);

        const receipt = ignite.addPaymentToken(eth, priceFeed.address, 120);

        await expect(receipt).not.to.be.reverted;
        await expect(receipt)
          .to.emit(ignite, "PaymentTokenAdded")
          .withArgs(eth);

        expect(await ignite.getTotalErc20PaymentMethods()).to.equal(2);
        expect(await ignite.getErc20PaymentMethods()).to.eql([qi.address, eth]);
        expect(await ignite.priceFeeds(eth)).to.equal(priceFeed.address);
        expect(await ignite.maxPriceAges(eth)).to.equal(120);
      });

      it("prevents adding the same token more than once", async function () {
        await expect(ignite.addPaymentToken(eth, "0x1111111111111111111111111111111111111111", 0))
          .to.be.reverted;
      });

      it("validates the price feed", async function () {
        const dai = "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70";

        const priceFeed = await deployPriceFeed(50);
        await priceFeed.setPrice(-1);

        await expect(ignite.addPaymentToken(dai, priceFeed.address, 120))
          .to.be.reverted;

        await priceFeed.setPrice(42);
        await priceFeed.setUpdatedAtTimestamp(0);

        await expect(ignite.addPaymentToken(dai, priceFeed.address, 120))
          .to.be.reverted;
      });
    });

    describe("Removing", function () {
      before(setup);

      it("enforces access control", async function () {
        await expect(
          ignite
            .connect(slashedTokenRecipient)
            .removePaymentToken(ZERO_ADDRESS)
        ).to.be.reverted;
      });

      it("checks for the existence of a token", async function () {
        await expect(ignite.removePaymentToken("0x0123456789012345678901234567890123456789"))
          .to.be.reverted;
      });

      it("removes existing payment methods", async function () {
        const token1 = "0x1111111111111111111111111111111111111111";
        const token2 = "0x2222222222222222222222222222222222222222";
        const token3 = "0x3333333333333333333333333333333333333333";
        const token4 = "0x4444444444444444444444444444444444444444";

        const priceFeed = await deployPriceFeed(42);

        await Promise.all([
          ignite.addPaymentToken(token1, priceFeed.address, 120),
          ignite.addPaymentToken(token2, priceFeed.address, 120),
          ignite.addPaymentToken(token3, priceFeed.address, 120),
          ignite.addPaymentToken(token4, priceFeed.address, 120),
        ]);

        expect(await ignite.getErc20PaymentMethods())
          .to.eql([qi.address, token1, token2, token3, token4]);

        expect(await ignite.getTotalErc20PaymentMethods()).to.equal(5);

        await ignite.removePaymentToken(token1);

        expect(await ignite.getErc20PaymentMethods())
          .to.eql([qi.address, token4, token2, token3]);

        expect(await ignite.getTotalErc20PaymentMethods()).to.equal(4);

        await ignite.removePaymentToken(token4);

        expect(await ignite.getErc20PaymentMethods())
          .to.eql([qi.address, token3, token2]);

        expect(await ignite.getTotalErc20PaymentMethods()).to.equal(3);

        await ignite.removePaymentToken(token3);

        expect(await ignite.getErc20PaymentMethods()).to.eql([qi.address, token2]);
        expect(await ignite.getTotalErc20PaymentMethods()).to.equal(2);

        await ignite.removePaymentToken(token2);
        await ignite.removePaymentToken(qi.address);

        expect(await ignite.getTotalErc20PaymentMethods()).to.equal(0);
        expect(await ignite.getErc20PaymentMethods()).to.eql([]);
      });
    });

    describe("Configuring price feeds", function () {
      it("enforces access control", async function () {
        await expect(
          ignite
            .connect(feeRecipient)
            .configurePriceFeed(
              "0x1111111111111111111111111111111111111111",
              ZERO_ADDRESS,
              0,
            ),
        ).to.be.reverted;
      });

      it("does not allow zero address for feeds", async function () {
        await expect(
          ignite.configurePriceFeed(
            "0x1111111111111111111111111111111111111111",
            ZERO_ADDRESS,
            0,
          ),
        ).to.be.reverted;
      });

      it("makes sure the token exists", async function () {
        await expect(
          ignite.configurePriceFeed(
            "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead",
            "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead",
            42,
          ),
        ).to.be.reverted;
      });

      it("validates the prices feed", async function () {
        const priceFeed = await deployPriceFeed(42);

        await ignite.addPaymentToken(
          "0x1111111111111111111111111111111111111111",
          priceFeed.address,
          42,
        );

        await expect(
          ignite.configurePriceFeed(
            "0x1111111111111111111111111111111111111111",
            "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead",
            42,
          ),
        ).to.be.reverted;

        await priceFeed.setPrice(-1);
        await priceFeed.setUpdatedAtTimestamp(0);

        await expect(
          ignite.configurePriceFeed(
            "0x1111111111111111111111111111111111111111",
            priceFeed.address,
            42,
          ),
        ).to.be.reverted;

        await priceFeed.setPrice(42);

        await expect(
          ignite.configurePriceFeed(
            "0x1111111111111111111111111111111111111111",
            priceFeed.address,
            42,
          ),
        ).to.be.reverted;
      });

      it("adds a valid feed", async function () {
        const token = "0x1111111111111111111111111111111111111111";

        const oldPriceFeedAddress = await ignite.priceFeeds(token);
        const oldMaxPriceAge = await ignite.maxPriceAges(token);

        const priceFeed = await deployPriceFeed(42);

        const receipt = await ignite.configurePriceFeed(
          token,
          priceFeed.address,
          424242,
        );

        await expect(receipt).to.be.not.reverted;
        await expect(receipt)
          .to.emit(ignite, "PriceFeedChanged")
          .withArgs(
            token,
            oldPriceFeedAddress,
            priceFeed.address,
            oldMaxPriceAge,
            424242,
          );
      });
    });
  });

  describe("Miscellaneous", function () {
    before(async function () {
      await setup();
      await grantRole("ROLE_REGISTER_WITHOUT_COLLATERAL", admin.address);
      await grantRole("ROLE_RELEASE_LOCKED_TOKENS", admin.address);
    });

    it("deletes registrations properly", async function () {
      await ignite.registerWithoutCollateral("A", blsPoP, 86400 * 14);
      await ignite.registerWithoutCollateral("B", blsPoP, 86400 * 14);
      await ignite.registerWithoutCollateral("C", blsPoP, 86400 * 14);
      await ignite.registerWithoutCollateral("D", blsPoP, 86400 * 14);

      expect(await ignite.getTotalRegistrations()).to.equal(4);

      let registrations = await Promise.all([
        ignite.registrations(1),
        ignite.registrations(2),
        ignite.registrations(3),
        ignite.registrations(4),
      ]);

      expect(registrations.map(({ nodeId }) => nodeId)).to.eql(["A", "B", "C", "D"]);

      let accountRegistrationIndices = await Promise.all([
        ignite.accountRegistrationIndicesByNodeId("A"),
        ignite.accountRegistrationIndicesByNodeId("B"),
        ignite.accountRegistrationIndicesByNodeId("C"),
        ignite.accountRegistrationIndicesByNodeId("D"),
      ]);

      expect(accountRegistrationIndices.map((i) => i.toNumber())).to.eql([0, 1, 2, 3]);

      expect(await ignite.getAccountRegistrationCount(admin.address)).to.equal(4);

      let indices = await Promise.all([
        ignite.registrationIndicesByNodeId("A"),
        ignite.registrationIndicesByNodeId("B"),
        ignite.registrationIndicesByNodeId("C"),
        ignite.registrationIndicesByNodeId("D"),
      ]);

      expect(indices.map((i) => i.toNumber())).to.eql([1, 2, 3, 4]);

      await ignite.releaseLockedTokens("B", false);

      expect(await ignite.getTotalRegistrations()).to.equal(3);

      registrations = await Promise.all([
        ignite.registrations(1),
        ignite.registrations(2),
        ignite.registrations(3),
      ]);

      expect(registrations.map(({ nodeId }) => nodeId)).to.eql(["A", "D", "C"]);

      accountRegistrationIndices = await Promise.all([
        ignite.accountRegistrationIndicesByNodeId("A"),
        ignite.accountRegistrationIndicesByNodeId("C"),
        ignite.accountRegistrationIndicesByNodeId("D"),
      ]);

      expect(accountRegistrationIndices.map((i) => i.toNumber())).to.eql([0, 2, 1]);

      expect(await ignite.getAccountRegistrationCount(admin.address)).to.equal(3);

      indices = await Promise.all([
        ignite.registrationIndicesByNodeId("A"),
        ignite.registrationIndicesByNodeId("C"),
        ignite.registrationIndicesByNodeId("D"),
      ]);

      expect(indices.map((i) => i.toNumber())).to.eql([1, 3, 2]);

      await expect(ignite.releaseLockedTokens("D", false)).not.to.be.reverted;

      expect(await ignite.getTotalRegistrations()).to.equal(2);

      registrations = await Promise.all([
        ignite.registrations(1),
        ignite.registrations(2),
      ]);

      expect(registrations.map(({ nodeId }) => nodeId)).to.eql(["A", "C"]);

      accountRegistrationIndices = await Promise.all([
        ignite.accountRegistrationIndicesByNodeId("A"),
        ignite.accountRegistrationIndicesByNodeId("C"),
      ]);

      expect(accountRegistrationIndices.map((i) => i.toNumber())).to.eql([0, 1]);

      expect(await ignite.getAccountRegistrationCount(admin.address)).to.equal(2);

      indices = await Promise.all([
        ignite.registrationIndicesByNodeId("A"),
        ignite.registrationIndicesByNodeId("C"),
      ]);

      expect(indices.map((i) => i.toNumber())).to.eql([1, 2]);

      await ignite.releaseLockedTokens("A", false);
      await ignite.releaseLockedTokens("C", false);

      expect(await ignite.getTotalRegistrations()).to.equal(0);

      accountRegistrationIndices = await Promise.all([
        ignite.accountRegistrationIndicesByNodeId("A"),
        ignite.accountRegistrationIndicesByNodeId("C"),
      ]);

      expect(accountRegistrationIndices.map((i) => i.toNumber())).to.eql([0, 0]);

      expect(await ignite.getAccountRegistrationCount(admin.address)).to.equal(0);

      indices = await Promise.all([
        ignite.registrationIndicesByNodeId("A"),
        ignite.registrationIndicesByNodeId("C"),
      ]);

      expect(indices.map((i) => i.toNumber())).to.eql([0, 0]);

      expect((await ignite.registrations(0)).nodeId).to.equal("");
    });

    describe("reading account registrations", async function () {
      before(async function () {
        await ignite.registerWithoutCollateral("A", blsPoP, 86400 * 14);
        await ignite.registerWithoutCollateral("B", blsPoP, 86400 * 14);
        await ignite.registerWithoutCollateral("C", blsPoP, 86400 * 14);
      });

      it("returns the correct number of registrations", async function () {
        expect(await ignite.getAccountRegistrationCount(admin.address)).to.equal(3);
      });

      it("returns the correct registrations", async function () {
        let registrations = await ignite.getRegistrationsByAccount(admin.address, 0, 3);
        expect(registrations.map(({ nodeId }) => nodeId)).to.eql(["A", "B", "C"]);

        registrations = await ignite.getRegistrationsByAccount(admin.address, 2, 3);
        expect(registrations.map(({ nodeId }) => nodeId)).to.eql(["C"]);

        registrations = await ignite.getRegistrationsByAccount(admin.address, 1, 2);
        expect(registrations.map(({ nodeId }) => nodeId)).to.eql(["B"]);
      });
    });
  });
});
