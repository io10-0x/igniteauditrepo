const { ethers } = require("hardhat");

async function main() {
    // Set up necessary variables
    const [deployer] = await ethers.getSigners();
    console.log("Approving tokens with the account:", deployer.address);

    // Replace with your QI token contract address and the smart contract you want to approve
    const qiTokenAddress = "0xB6076C93701D6a07266c31066B298AeC6dd65c2d";
    const spenderAddress = "0x0bBFFfB976a8222b8Cfa54dA8dBe031d728a7587";
    const approveAmount = ethers.parseUnits("600", 18); // Example: Approve 1000 QI tokens

    // Get the contract instance
    const qiToken = await ethers.getContractAt("Qi", qiTokenAddress);

    // Approve the smart contract to spend the specified amount of QI tokens
    const tx = await qiToken.approve(spenderAddress, approveAmount);
    console.log("Transaction sent. Waiting for confirmation...");

    // Wait for the transaction to be mined
    await tx.wait();
    console.log(`Approved ${approveAmount.toString()} QI tokens for ${spenderAddress}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
