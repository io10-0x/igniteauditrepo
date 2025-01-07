/** @type import('hardhat/config').HardhatUserConfig */
require("@nomicfoundation/hardhat-ethers")
require("@openzeppelin/hardhat-upgrades")
require("@nomicfoundation/hardhat-chai-matchers");
require('dotenv').config();

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.5.17"
      },
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]
  },
  etherscan: {
    apiKey: {
      snowtrace: "snowtrace", // apiKey is not required, just set a placeholder
    },
    customChains: [
      {
        network: "snowtrace",
        chainId: 43113,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan",
          browserURL: "https://avalanche.testnet.localhost:8080"
        }
      }
    ]
  },
  networks: {
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.SEPOLIA_API_KEY}`,
      accounts: [process.env.SEPOLIA_PRIVATE_KEY]
    },
    binance: {
      url: 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
      accounts: [process.env.BINANCE_PRIVATE_KEY]
    },
    snowtrace: {
      url: 'https://api.avax-test.network/ext/bc/C/rpc',
      accounts: [process.env.FUJI_PRIVATE_KEY_DEPLOYER, process.env.FUJI_PRIVATE_KEY_BENQI_SUPER_ADMIN, process.env.FUJI_PRIVATE_KEY_BENQI_ADMIN, process.env.FUJI_PRIVATE_KEY_ZEEVE_SUPER_ADMIN, process.env.FUJI_PRIVATE_KEY_ZEEVE_ADMIN, process.env.FUJI_PRIVATE_KEY_OTHER]
    }
  }
};
