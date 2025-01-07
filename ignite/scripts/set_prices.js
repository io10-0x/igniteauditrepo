const hre = require("hardhat");

(async () => {
  const avaxPriceFeed = await hre.ethers.getContractAt("PriceFeed", "0x95CA0a568236fC7413Cd2b794A7da24422c2BBb6");
  const qiPriceFeed = await hre.ethers.getContractAt("PriceFeed", "0x789a5FDac2b37FCD290fb2924382297A6AE65860");
  const usdcPriceFeed = await hre.ethers.getContractAt("PriceFeed", "0xE3573540ab8A1C4c754Fd958Dc1db39BBE81b208");

  const currentTime = Math.floor(new Date().getTime() / 1000);

  await avaxPriceFeed.setUpdatedAtTimestamp(currentTime);
  await qiPriceFeed.setUpdatedAtTimestamp(currentTime);
  await usdcPriceFeed.setUpdatedAtTimestamp(currentTime);

  await avaxPriceFeed.setPrice(2212345678);
  await qiPriceFeed.setPrice(765432);
})();
