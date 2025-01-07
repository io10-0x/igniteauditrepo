const hre = require("hardhat");

(async () => {
  const avaxPriceFeed = await hre.ethers.getContractAt("PriceFeed", "0x95CA0a568236fC7413Cd2b794A7da24422c2BBb6");
  const qiPriceFeed = await hre.ethers.getContractAt("PriceFeed", "0x789a5FDac2b37FCD290fb2924382297A6AE65860");
  const usdcPriceFeed = await hre.ethers.getContractAt("PriceFeed", "0xE3573540ab8A1C4c754Fd958Dc1db39BBE81b208");

  await avaxPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000) - 10);
  await qiPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000) - 10);
  await usdcPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000) - 10);

  const Ignite = await hre.ethers.getContractFactory("Ignite");
  const ignite = await hre.upgrades.deployProxy(Ignite, [
    "0xa4DfF80B4a1D748BF28BC4A271eD834689Ea3407",
    "0x52C84043CD9c865236f11d9Fc9F56aa003c1f922",
    "0x95CA0a568236fC7413Cd2b794A7da24422c2BBb6",
    120,
    "0x789a5FDac2b37FCD290fb2924382297A6AE65860",
    1800,
    hre.ethers.utils.parseEther("500"),
    hre.ethers.utils.parseEther("1800")
  ]);

  await ignite.deployed();
  console.log("Ignite deployed to:", ignite.address);

  await ignite.addPaymentToken(
    "0x52C84043CD9c865236f11d9Fc9F56aa003c1f922",
    "0x789a5FDac2b37FCD290fb2924382297A6AE65860",
    1800,
  );

  await (await ignite.addPaymentToken(
    "0xe336d36FacA76840407e6836d26119E1EcE0A2b4",
    "0xE3573540ab8A1C4c754Fd958Dc1db39BBE81b208",
    120,
  )).wait();

  await (await ignite.setQiPriceMultiplier(9_500)).wait();

  //const ignite = await hre.ethers.getContractAt("Ignite", "0x277f722E66e81585272CE53413c487be198BcB85");

  console.log(await ignite.getErc20PaymentMethods())
})();
