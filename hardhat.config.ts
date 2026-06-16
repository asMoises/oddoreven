import type { HardhatUserConfig } from "hardhat/config";

import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable } from "hardhat/config";
//import {hardhatVer};     // <-- new plugin

import "@nomicfoundation/hardhat-verify"; // <-- new plugin

import dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthersPlugin],
  /*
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },

  */

  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 }, // choose ON or OFF and keep it
      evmVersion: "cancun", // you’re already compiling to cancun
      viaIR: false, // keep consistent (true/false) for both steps
      // metadata: { bytecodeHash: "ipfs" }     // leave default unless you *also* used it at deploy
    },
  },

  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
      allowBlocksWithSameTimestamp: true,
      blockGasLimit: 1099511627775n,
    },

    local: {
      type: "http",
      chainType: "l1",

      url: "http://127.0.0.1:8545/",
      chainId: 31337,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
      },
    },
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
      allowBlocksWithSameTimestamp: true,
      blockGasLimit: 1099511627775n, // or as a number if you prefer
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
      allowBlocksWithSameTimestamp: true,
      blockGasLimit: 1099511627775n, // or as a number if you prefer
    },

    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    /*
    sepolia: {
      url: process.env.INFURA_URL,
      chainId: Number(process.env.CHAIN_ID),
      accounts: [String(process.env.PVK_ACCOUNT1)]      
    },
    //https://academy.binance.com/pt/articles/connecting-metamask-to-binance-smart-chain
   */
/*
    bsctest: {
      type: "http",
      chainType: "l1",
      url: process.env.BSCTEST_URL || "",
      chainId: Number(process.env.BSC_CHAIN_ID),
      accounts: [String(process.env.PVK_ACCOUNT1)],
    },

    bscTestnet: {
      type: "http",
      chainType: "l1",
      url:
        process.env.BSCTEST_URL ||
        "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: process.env.PVK_ACCOUNT1 ? [process.env.PVK_ACCOUNT1] : [],
    },
  },

  // NEW location in Hardhat v3
  verify: {
    etherscan: {
      // You can pass a single string or per-network object.
      // For multiple chains, prefer the object form:

      //apiKey: process.env.API_KEY
      //apiKey: process.env.API_KEY_BSC

      apiKey: process.env.ETHERSCAN_API_KEY || "",
    },
    //sourcify: {
    //  enabled: false
    //},
    blockscout: {
      enabled: false,
    },*/
  },
};

export default config;
