const hre = require("hardhat");

(async () => {
  const [signer] = await hre.ethers.getSigners();
  const ignite = await hre.ethers.getContractAt("Ignite", "0x0938Ae5E07A7af37Bfb629AC94fA55B2eDA5E930");

  const avaxPriceFeed = await hre.ethers.getContractAt("PriceFeed", "0x95CA0a568236fC7413Cd2b794A7da24422c2BBb6");
  const qiPriceFeed = await hre.ethers.getContractAt("PriceFeed", "0x789a5FDac2b37FCD290fb2924382297A6AE65860");
  const usdcPriceFeed = await hre.ethers.getContractAt("PriceFeed", "0xE3573540ab8A1C4c754Fd958Dc1db39BBE81b208");

  const qi = await hre.ethers.getContractAt("FaucetToken", "0x52C84043CD9c865236f11d9Fc9F56aa003c1f922");

  const currentTime = Math.floor(new Date().getTime() / 1000);

  await avaxPriceFeed.setUpdatedAtTimestamp(currentTime);
  await qiPriceFeed.setUpdatedAtTimestamp(currentTime);
  await usdcPriceFeed.setUpdatedAtTimestamp(currentTime);

  await qi.mint(hre.ethers.utils.parseEther("10000000"));
  await qi.approve(ignite.address, hre.ethers.utils.parseEther("1000000000"));

  await ignite.registerWithStake("NodeID-INVALID", 86400 * 14, {
    value: hre.ethers.utils.parseEther("1500"),
  });
})();
