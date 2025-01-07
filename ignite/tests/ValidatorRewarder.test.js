const hre = require("hardhat");
const { expect } = require("chai");

describe("ValidatorRewarder", function () {
  let admin;
  let avaxPriceFeed;
  let qiPriceFeed;
  let qi;

  // Ignite is just an EOA because its functionality is not needed for ValidadtorRewarder tests
  let ignite;
  let validatorRewarder;

  const targetApr = 2500; // bps

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

  before(async () => {
    [admin, ignite] = await hre.ethers.getSigners();
    avaxPriceFeed = await deployPriceFeed(2_000_000_000);
    qiPriceFeed = await deployPriceFeed(1_000_000);

    const FaucetToken = await hre.ethers.getContractFactory("FaucetToken");
    qi = await FaucetToken.deploy("QI", "BENQI", 18);

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

    await qi.mint(hre.ethers.utils.parseEther("1000000"));
    await qi.transfer(validatorRewarder.address, hre.ethers.utils.parseEther("1000000"));
  });

  it("has correct initial parameters", async function () {
    expect(await validatorRewarder.ignite()).to.equal(ignite.address);
    expect(await validatorRewarder.qi()).to.equal(qi.address);
    expect(await validatorRewarder.targetApr()).to.equal(targetApr);
  });

  it("calculates rewards correctly", async function () {
    // 10k for half a year at 25 % = 1250
    expect(
      await validatorRewarder.calculateRewardAmount(
        60 * 60 * 24 * 365 / 2,
        10_000,
      ),
    ).to.equal(1250);

    // 125k for 3 months at 25 % = 7812
    expect(
      await validatorRewarder.calculateRewardAmount(
        60 * 60 * 24 * 365 / 4,
        125_000,
      ),
    ).to.equal(7812);
  });

  it("prevents unauthorised claimRewards calls", async function () {
    await expect(validatorRewarder.claimRewards(42, 42))
      .to.be.revertedWith("Unauthorized");
  });

  it("transfers QI to ignite when called", async function () {
    const qiBalanceBeforeClaim = await qi.balanceOf(ignite.address);

    await expect(
      await validatorRewarder
        .connect(ignite)
        .claimRewards(60 * 60 * 24 * 365 / 2, 10_000),
    )
      .to.emit(validatorRewarder, "ClaimRewards")
      .withArgs(1250)

    const qiBalanceAfterClaim = await qi.balanceOf(ignite.address);

    expect(qiBalanceAfterClaim.sub(qiBalanceBeforeClaim)).to.equal(1250);
  });
});
