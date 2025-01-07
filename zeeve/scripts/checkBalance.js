const { ethers } = require("hardhat");

async function main() {
    // Set up necessary variables
    const [deployer] = await ethers.getSigners();
    console.log("Checking balance for the account:", deployer.address);

    // Replace with your QI token contract address and the smart contract you want to approve
    const qiTokenAddress = "0xFFd31a26B7545243F430C0999d4BF11A93408a8C";
    const spenderAddress = "0x0623A4E8066EbF345b1f9D8BE24eC8911A9FfbA8";

    // Get the contract instance
    const qiToken = await ethers.getContractAt("Qi", qiTokenAddress);

    // Approve the smart contract to spend the specified amount of QI tokens
    const tx = await qiToken.balanceOf(spenderAddress);
    console.log("Balance", tx.toString());

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
