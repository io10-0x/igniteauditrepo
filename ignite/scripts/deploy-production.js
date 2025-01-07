const hre = require("hardhat");

(async () => {
  const [signer] = await hre.ethers.getSigners();

  const qi = "0x8729438EB15e2C8B576fCc6AeCdA6A148776C0F5";
  const sAVAX = "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE";
  const usdc = "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e";

  const avaxPriceFeed = "0x0a77230d17318075983913bc2145db16c7366156";
  const qiPriceFeed = "0x36e039e6391a5e7a7267650979fdf613f659be5d";
  const usdcPriceFeed = "0xf096872672f44d6eba71458d74fe67f9a77a23b9";

  const liquidStakingMultisig = "0x832c971F7C9f9a28789A934502010e74D8E489Cd";
  const pauseGuardianMultisig = "0x30d62267874DdA4D32Bb28ddD713f77d1aa99159";
  const botAddress = "0x565F0fe9715E3cb0Df579f186C299D6707887E83";

  const Ignite = await hre.ethers.getContractFactory("Ignite");
  const ignite = await hre.upgrades.deployProxy(Ignite, [
    sAVAX,
    qi,
    avaxPriceFeed,
    120,
    qiPriceFeed,
    1800,
    hre.ethers.utils.parseEther("500"),
    hre.ethers.utils.parseEther("1800"),
  ]);

  await ignite.deployed();
  console.log("Ignite deployed to:", ignite.address);

  await (await ignite.addPaymentToken(
    qi,
    qiPriceFeed,
    1800,
  )).wait();

  await (await ignite.addPaymentToken(
    usdc,
    usdcPriceFeed,
    86400,
  )).wait();

  await (await ignite.setQiPriceMultiplier(9_500)).wait();

  await (await ignite.grantRole(await ignite.ROLE_WITHDRAW(), botAddress)).wait();
  await (await ignite.grantRole(await ignite.ROLE_RELEASE_LOCKED_TOKENS(), botAddress)).wait();

  await (await ignite.grantRole(await ignite.ROLE_PAUSE(), pauseGuardianMultisig)).wait();
  await (await ignite.grantRole(await ignite.ROLE_UNPAUSE(), pauseGuardianMultisig)).wait();

  await (await ignite.grantRole(await ignite.DEFAULT_ADMIN_ROLE(), liquidStakingMultisig)).wait();
  await (await ignite.renounceRole(await ignite.DEFAULT_ADMIN_ROLE(), signer.address)).wait();
})();
