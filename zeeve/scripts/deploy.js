const { ethers, upgrades } = require("hardhat");
const hre = require("hardhat");

async function main() {
    const [deployer, benSuperAdmin, benAdmin] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);

    // const Box = await ethers.deployContract("SimpleStorage");
    const Box = await ethers.getContractFactory("StakingContract");

    const stakingFee = ethers.parseUnits("0.001", "ether");
    const initialHostingFee = ethers.parseUnits("0.001", "ether");  // Converts 1.4 AVAX to wei

    const qiTokenAddress = '0xFFd31a26B7545243F430C0999d4BF11A93408a8C';
    const avaxPriceFeed = '0x7dF6058dd1069998571497b8E3c0Eb13A8cb6a59';
    const qiPriceFeed = '0xF3f62E241bC33EF00C731D257F945e8645396Ced';
    const zeeveWallet = '0x6Ce78374dFf46B660E274d0b10E29890Eeb0167b';
    const igniteSmartContract = '0xF1652dc03Ee76F7b22AFc7FF1cD539Cf20d545D5';
    const benqiSuperAdmin = '0xcA7B774A20c1512cDD7461956943C0f3cBcbd087';
    const benqiAdmin = '0x6Ce78374dFf46B660E274d0b10E29890Eeb0167b';
    const zeeveSuperAdmin = '0xcA7B774A20c1512cDD7461956943C0f3cBcbd087';
    const zeeveAdmin = '0x6Ce78374dFf46B660E274d0b10E29890Eeb0167b';
    const routerAddress = '0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901';

    const maxAvaxPriceAge = 864000; // Example value in seconds
    const maxQiPriceAge = 864000;


    const contractAddresses = {
        qiToken: qiTokenAddress,
        avaxPriceFeed: avaxPriceFeed,
        qiPriceFeed: qiPriceFeed,
        zeeveWallet: zeeveWallet,
        igniteContract: igniteSmartContract,
    };

    const box = await upgrades.deployProxy(Box, [contractAddresses, benqiSuperAdmin, benqiAdmin, zeeveSuperAdmin, zeeveAdmin, stakingFee, initialHostingFee, routerAddress, maxAvaxPriceAge, maxQiPriceAge], { initializer: 'initialize' });

    await box.waitForDeployment();

    console.log("Contract deployed to: ", await box.getAddress());

    const proxyAddress = await box.getAddress();

    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("Implementation address", implAddress)

    const tx = await box.connect(benAdmin).addToken('0x15BF9589018313e32b07F92ABA2aeCef6E5B845b', '0x31CF013A08c6Ac228C94551d535d5BAfE19c602a', 864000);
    await tx.wait();

    const tx1 = await box.connect(benAdmin).addToken('0xB6076C93701D6a07266c31066B298AeC6dd65c2d', '0x7898AcCC83587C3C55116c5230C17a6Cd9C71bad', 864000);
    await tx1.wait();

    const tx2 = await box.connect(benAdmin).setSlippage(40);
    await tx2.wait();
}


main()