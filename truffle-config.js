require('dotenv').config()

const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  plugins: [
    'truffle-plugin-verify'
  ],
  api_keys: {
    bscscan: process.env.BSCSCAN_API_KEY
  },
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
    rinkeby_testnet: {
      provider: () => new HDWalletProvider(process.env.MNEMONIC, 'https://rinkeby.infura.io/v3/' + process.env.INFURA_API_KEY),
      network_id: 4,
      gas: 5500000,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    },
    bsc_testnet: {
      provider: () => new HDWalletProvider(process.env.MNEMONIC_DEV, `https://data-seed-prebsc-2-s1.binance.org:8545`),
      network_id: 97,
      confirmations: 2,
      timeoutBlocks: 200,
      networkCheckTimeout: 100000,
      skipDryRun: true,
      from: process.env.BSC_TESTNET_DEPLOYER_ADDRESS
    },
    bsc_mainnet: {
      provider: () => new HDWalletProvider(process.env.MNEMONIC, `https://bsc-dataseed1.binance.org/`),
      network_id: 56,
      confirmations: 2,
      timeoutBlocks: 200,
      networkCheckTimeout: 100000,
      skipDryRun: true,
      from: process.env.BSC_MAINNET_DEPLOYER_ADDRESS
    },
  },

  compilers: {
    solc: {
      version: "0.8.10",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
      }
    }
  }
};
