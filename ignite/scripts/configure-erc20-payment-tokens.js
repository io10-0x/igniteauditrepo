const hre = require("hardhat");

(async () => {
  const ignite = await hre.ethers.getContractAt("Ignite", "0x55a4eDd8A2c051079b426E9fbdEe285368824a89");

  const qiPriceFeed = await hre.ethers.getContractAt("PriceFeed", "0x789a5FDac2b37FCD290fb2924382297A6AE65860");
  const usdcPriceFeed = await hre.ethers.getContractAt("PriceFeed", "0xE3573540ab8A1C4c754Fd958Dc1db39BBE81b208");

  /*await qiPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000) - 10);
  await usdcPriceFeed.setUpdatedAtTimestamp(Math.floor(new Date().getTime() / 1000) - 10);

  await ignite.addPaymentToken(
    "0x52C84043CD9c865236f11d9Fc9F56aa003c1f922",
    "0x789a5FDac2b37FCD290fb2924382297A6AE65860",
    1800,
  );

  await ignite.addPaymentToken(
    "0xe336d36FacA76840407e6836d26119E1EcE0A2b4",
    "0xE3573540ab8A1C4c754Fd958Dc1db39BBE81b208",
    120,
  );*/

  await ignite.configurePriceFeed(
    "0x52C84043CD9c865236f11d9Fc9F56aa003c1f922",
    "0x789a5FDac2b37FCD290fb2924382297A6AE65860",
    86400 * 365,
  )

  await ignite.configurePriceFeed(
    "0xe336d36FacA76840407e6836d26119E1EcE0A2b4",
    "0xE3573540ab8A1C4c754Fd958Dc1db39BBE81b208",
    86400 * 365,
  )

  await ignite.configurePriceFeed(
    "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "0x95CA0a568236fC7413Cd2b794A7da24422c2BBb6",
    86400 * 365,
  )

  console.log(await ignite.maxPriceAges("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"))


  console.log(await ignite.getErc20PaymentMethods())
})();
