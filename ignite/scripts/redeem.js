const hre = require("hardhat");

(async () => {
  const ignite = await hre.ethers.getContractAt("Ignite", "0x0938Ae5E07A7af37Bfb629AC94fA55B2eDA5E930");

  await ignite.redeemAfterExpiry("NodeID-N9j9Dow31vgiUduNLASM2gwXmkgNoNyY3");
})();
