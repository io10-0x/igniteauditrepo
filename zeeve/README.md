# Staking Contract - Hardhat Project

## Description

This project includes a set of smart contracts designed to manage staking operations with AVAX and ERC20 tokens. The contracts utilize the OpenZeppelin library for secure and upgradable smart contract development. Key features include:

- Staking with AVAX and ERC20 tokens
- Slippage control and fee management
- Role-based access control for administrative functions
- Transparent upgradeability to allow seamless contract improvements

### Key Contracts

- **staking.sol**: The main contract that handles staking logic, fee calculations, and administrative roles.
- **Proxy**: Utilizes OpenZeppelin's transparent upgrade proxy pattern for upgradability.

### Key Functions

- `initialize` - Initializes the contract with essential parameters and roles.
- `stakeWithAVAX` - Allows users to stake AVAX.
- `stakeWithERC20` - Allows users to stake ERC20 tokens.
- `setSlippage`, `setPairBinStep`, `setSwapDeadline` - Administrative functions to configure the staking parameters.
- `updateStakingFee`, `updateHostingFee` - Functions to update staking and hosting fees.
- `registerNode` - Registers a node with the Ignite contract.

## Commands

### Install Dependencies

First, install the necessary dependencies:

```bash
npm install
```
Compile the smart contracts using the following command:
```bash
npx hardhat compile
```

To deploy the contracts:
```bash
npx hardhat run scripts/deploy.js --network <network-name>
```

Run the tests:

```bash
npx hardhat test --network <network-name>
```

