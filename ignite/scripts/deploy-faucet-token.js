const hre = require("hardhat");

(async () => {
  // QI
  const FaucetToken = await hre.ethers.getContractFactory("FaucetToken");
  const qi = await FaucetToken.deploy("QI", "BENQI", 18);
  await qi.deployed();

  console.log("QI deployed to:", qi.address);
})();
