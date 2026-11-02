require("@nomicfoundation/hardhat-toolbox");

// Optional public-network settings, read from the environment so that no
// credentials ever live in the repository.
const { RPC_URL, DEPLOYER_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.17",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
  networks: {
    ...(RPC_URL && DEPLOYER_KEY
      ? { remote: { url: RPC_URL, accounts: [DEPLOYER_KEY] } }
      : {}),
  },
};
