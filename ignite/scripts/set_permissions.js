const hre = require("hardhat");

(async () => {
  const [signer] = await hre.ethers.getSigners();
  const ignite = await hre.ethers.getContractAt("Ignite", "0x0938Ae5E07A7af37Bfb629AC94fA55B2eDA5E930");

  const account = "0x889bCbF50A566603CFa8C0b59Cb7815d60A54e02";
  await ignite.grantRole(await ignite.ROLE_WITHDRAW(), account);
  await ignite.grantRole(await ignite.ROLE_RELEASE_LOCKED_TOKENS(), account);
})();
