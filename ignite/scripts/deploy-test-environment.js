const hre = require("hardhat");

(async () => {
  // QI
  const FaucetToken = await hre.ethers.getContractFactory("FaucetToken");
  //const qi = await FaucetToken.deploy("QI", "BENQI", 18);
  //await qi.deployed();

  const qi = "0x52C84043CD9c865236f11d9Fc9F56aa003c1f922";

  //console.log("QI deployed to:", qi.address);

  // USDC
  const usdc = await FaucetToken.deploy("USDC", "USD Coin", 6);
  await usdc.deployed();

  console.log("USDC deployed to:", usdc.address);

  // Price feeds
  const PriceFeed = await hre.ethers.getContractFactory("PriceFeed");

  const avaxPriceFeed = await PriceFeed.deploy("2000000000"); // $20
  await avaxPriceFeed.deployed();
  console.log("AVAX price feed deployed to:", avaxPriceFeed.address);

  const qiPriceFeed = await PriceFeed.deploy("1000000");      // $0.01
  await qiPriceFeed.deployed();
  console.log("QI price feed deployed to:", qiPriceFeed.address);

  const usdcPriceFeed = await PriceFeed.deploy("100000000");  // $1
  await usdcPriceFeed.deployed();
  console.log("USDC price feed deployed to:", usdcPriceFeed.address);

  // Ignite
  const Ignite = await hre.ethers.getContractFactory("Ignite");
  const ignite = await hre.upgrades.deployProxy(Ignite, [
    qi,
    avaxPriceFeed.address,
    120,
    qiPriceFeed.address,
    1800,
    hre.ethers.utils.parseEther("500"),
    hre.ethers.utils.parseEther("1800")
  ]);

  await ignite.deployed();
  console.log("Ignite deployed to:", ignite.address);
})();
