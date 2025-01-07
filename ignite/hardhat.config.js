require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("@openzeppelin/test-helpers");
require("@openzeppelin/hardhat-upgrades");
require("@nomicfoundation/hardhat-verify");

const glob = require("hardhat/internal/util/glob").glob;
const path = require("node:path");

const TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS = "compile:solidity:get-source-paths";

subtask(
  TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS,
  async (_, { config }) => {
    const paths = await glob(path.join(config.paths.root, "src/**/*.sol"));
    const testPaths = await glob(path.join(config.paths.root, "tests/contracts/*.sol"));

    return [
      ...paths,
      ...testPaths,
    ];
  }
);

module.exports = {
  solidity: {
    version: "0.8.18",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  paths: {
    sources: "./src",
    tests: "./tests",
  },
  etherscan: {
    apiKey: {
      avalanche: "snowtrace",
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    local: {
      url: "http://localhost:9650/ext/bc/C/rpc",
      chainId: 43112,
      accounts: [
        "56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027",
      ],
    },
    main: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      chainId: 43114,
    },
    mn1: {
      url: "http://mn1.dev.benqi.fi:9650/ext/bc/C/rpc",
      chainId: 43112,
      accounts: [
        // Default seed AVAX account
        "56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027",
      ],
    },
  },
};
