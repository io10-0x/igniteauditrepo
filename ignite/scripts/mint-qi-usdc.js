const hre = require("hardhat");

(async () => {
  const FaucetToken = await hre.ethers.getContractFactory("FaucetToken");
  const qi = FaucetToken.attach("0x52C84043CD9c865236f11d9Fc9F56aa003c1f922");
  const usdc = FaucetToken.attach("0xe336d36FacA76840407e6836d26119E1EcE0A2b4");

  await qi.mint(hre.ethers.utils.parseEther("100000000"))
  await usdc.mint(hre.ethers.utils.parseEther("100000000"))
})();
