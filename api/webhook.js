const { Telegraf, Scenes, session, Markup } = require("telegraf");
const { ethers } = require("ethers");
const express = require("express");
const AWS = require("aws-sdk");
const {
  generateAccount,
  validateAndGetSigner,
  createNewAccount,
} = require("../utils/index.js");

const tradingHubABI = require("../constants/tradingHubAbi.json");
const factoryAbi = require("../constants/factoryAbi.json");
const memeTokenAbi = require("../constants/memeTokenAbi.json");
const { decrypt } = require("../utils/encryption.js");

require("dotenv").config();

AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const dynamodb = new AWS.DynamoDB();
const TABLE_NAME = "WalletTable";


async function setWallet(userId, wallet) {
  const params = {
    TableName: TABLE_NAME,
    Item: AWS.DynamoDB.Converter.marshall({
      userId: userId.toString(),
      wallet: wallet,
    }),
  };

  try {
    await dynamodb.putItem(params).promise();
    console.log("Wallet saved successfully");
  } catch (error) {
    console.error("Error saving wallet:", error);
  }
}

async function getWallet(userId) {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      userId: { S: userId.toString() }, // 'S' specifies a string type
    },
  };

  try {
    const data = await dynamodb.getItem(params).promise();
    if (data.Item) {
      // Parse the wallet data from DynamoDB format
      return AWS.DynamoDB.Converter.unmarshall(data.Item).wallet;
    }
    return null;
  } catch (error) {
    console.error("Error getting wallet:", error);
    return null;
  }
}

async function main() {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const PORT = 8080;

  const bot = new Telegraf(`${BOT_TOKEN}`);

  const provider = new ethers.JsonRpcProvider(
    "https://bartio.rpc.berachain.com"
  );

  const tradingHubAddress = "0x608d407fA33F179eA5070fddcEcED7A5e64d0063";
  const factoryAddress = "0x03217b5073e872eFAdE8d4A4425800CaC9293398";

  const tradingHubContract = new ethers.Contract(
    "0x608d407fA33F179eA5070fddcEcED7A5e64d0063",
    tradingHubABI,
    provider
  );
  const factoryContract = new ethers.Contract(
    factoryAddress,
    factoryAbi,
    provider
  );

  // using scenes to achieve better ux
  const createTokenWizard = new Scenes.WizardScene(
    "CREATE_TOKEN_WIZARD",
    (ctx) => {
      ctx.reply(
        "Please enter the token name:",
        Markup.inlineKeyboard([
          Markup.button.callback("🚫 Cancel operation", "cancel"),
        ])
      );
      return ctx.wizard.next();
    },
    (ctx) => {
      if (
        ctx.updateType === "callback_query" &&
        ctx.update.callback_query.data === "cancel"
      ) {
        ctx.reply(
          `Operation cancelled.`,
          Markup.inlineKeyboard([Markup.button.callback("❓Help", "help")])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.tokenName = ctx.message.text;
      ctx.reply(
        "Please enter the token symbol:",
        Markup.inlineKeyboard([
          Markup.button.callback("🚫 Cancel operation", "cancel"),
        ])
      );
      return ctx.wizard.next();
    },
    (ctx) => {
      if (
        ctx.updateType === "callback_query" &&
        ctx.update.callback_query.data === "cancel"
      ) {
        ctx.reply(
          `Operation cancelled.`,
          Markup.inlineKeyboard([Markup.button.callback("❓Help", "help")])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.symbol = ctx.message.text;
      ctx.reply(
        "Please enter the value in ETH to send:",
        Markup.inlineKeyboard([
          Markup.button.callback("🚫 Cancel operation", "cancel"),
        ])
      );
      return ctx.wizard.next();
    },

    async (ctx) => {
      if (
        ctx.updateType === "callback_query" &&
        ctx.update.callback_query.data === "cancel"
      ) {
        ctx.reply(
          `Operation cancelled.`,
          Markup.inlineKeyboard([Markup.button.callback("❓Help", "help")])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.value = ctx.message.text;
      const { tokenName, symbol, value } = ctx.wizard.state;
      const userId = ctx.from.id;

      try {
        let wallet = await getWallet(userId);
        const signer = validateAndGetSigner(wallet, provider);
        const factoryContractWithSigner = factoryContract.connect(signer);
        const valueToSend = ethers.parseEther(value);
        const createMemeTx = await factoryContractWithSigner.createNewMeme(
          tokenName,
          symbol,
          {
            value: valueToSend,
            gasLimit: 20000000,
          }
        );
        console.log(createMemeTx);

        ctx.reply(`Please wait, token creation is in progress...`);
        const receipt = await createMemeTx.wait();

        ///This is to query the memetoken creation event to get back the token address and other token details
        // const eventSignature =
        //   "0x01fb0165fee40718cec1862fc8dd2dbd6fc0fdef7623971ac15ffd2daf21b986";
        // const filter = {
        //   address: factoryContract.address,
        //   topics: [eventSignature],
        // };

        // const tokenCreatedPromise = new Promise((resolve, reject) => {
        //   provider.once(filter, (log) => {
        //     const tokenAddress = ethers.getAddress(
        //       "0x" + log.topics[1].slice(26)
        //     );
        //     const creatorAddress = ethers.getAddress(
        //       "0x" + log.topics[2].slice(26)
        //     );
        //     resolve({ tokenAddress, creatorAddress });
        //   });

        //   setTimeout(
        //     () => reject(new Error("Timeout waiting for token creation event")),
        //     120000
        //   );
        // });
        // const [receipt, { tokenAddress, creatorAddress }] = await Promise.all([
        //   createMemeTx.wait(),
        //   tokenCreatedPromise,
        // ]);
        console.log(receipt);
        ctx.reply(
          `Token created successfully!! 🎉
          \nTransaction Hash: https://bartio.beratrail.io/tx/${receipt.hash}
          `
          // \nToken Address: ${tokenAddress}
          // \nCreator Address: ${creatorAddress}
        );
      } catch (error) {
        ctx.reply(
          `Error creating meme token: ${error?.shortMessage || error?.message}
          \n use /help to see all available commands`
        );
        console.error(error);
        await ctx.scene.leave();
      } finally {
        await ctx.scene.leave();
      }
    }
  );

  const buyTokenWizard = new Scenes.WizardScene(
    "BUY_TOKEN_WIZARD",
    (ctx) => {
      ctx.reply(
        "Please enter the token address:",
        Markup.inlineKeyboard([
          Markup.button.callback("🚫 Cancel operation", "cancel"),
        ])
      );
      return ctx.wizard.next();
    },
    (ctx) => {
      if (
        ctx.updateType === "callback_query" &&
        ctx.update.callback_query.data === "cancel"
      ) {
        ctx.reply(
          `Operation cancelled.`,
          Markup.inlineKeyboard([Markup.button.callback("❓Help", "help")])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.tokenAddress = ctx.message.text;
      ctx.reply(
        "Please enter the receiver address:",
        Markup.inlineKeyboard([
          Markup.button.callback("🚫 Cancel operation", "cancel"),
        ])
      );
      return ctx.wizard.next();
    },
    (ctx) => {
      if (
        ctx.updateType === "callback_query" &&
        ctx.update.callback_query.data === "cancel"
      ) {
        ctx.reply(
          `Operation cancelled.`,
          Markup.inlineKeyboard([Markup.button.callback("❓Help", "help")])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.receiverAddress = ctx.message.text;
      ctx.reply(
        "Please enter the amount of ETH to send:",
        Markup.inlineKeyboard([
          Markup.button.callback("🚫 Cancel operation", "cancel"),
        ])
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (
        ctx.updateType === "callback_query" &&
        ctx.update.callback_query.data === "cancel"
      ) {
        ctx.reply(
          `Operation cancelled.`,
          Markup.inlineKeyboard([Markup.button.callback("❓Help", "help")])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.value = ctx.message.text;
      const { tokenAddress, receiverAddress, value } = ctx.wizard.state;
      console.log(tokenAddress, receiverAddress, value);

      const userId = ctx.from.id;

      try {
        let wallet = await getWallet(userId);

        const signer = validateAndGetSigner(wallet, provider);
        const tradingHubContractWithSigner = tradingHubContract.connect(signer);
        const valueToSend = ethers.parseEther(value);
        const buyTx = await tradingHubContractWithSigner.buy(
          tokenAddress,
          0,
          receiverAddress,
          {
            value: valueToSend,
            gasLimit: 20000000,
          }
        );
        ctx.reply(`Please wait, purchase transaction is in progress...`);

        console.log(buyTx);
        const receipt = await buyTx.wait();
        console.log(receipt);
        ctx.reply(`Token ${tokenAddress} purchased successfully!! 🎉
        \nTransaction Hash: https://bartio.beratrail.io/tx/${receipt.hash}`);
      } catch (error) {
        ctx.reply(
          `Error purchasing token: ${error?.shortMessage || error?.message}
          \n use /help to see all available commands`
        );

        console.error(error);
        return ctx.scene.leave();
      } finally {
        return ctx.scene.leave();
      }
    }
  );

  const sellTokenWizard = new Scenes.WizardScene(
    "SELL_TOKEN_WIZARD",
    (ctx) => {
      ctx.reply(
        "Please enter the token address:",
        Markup.inlineKeyboard([
          Markup.button.callback("🚫 Cancel operation", "cancel"),
        ])
      );

      return ctx.wizard.next();
    },
    (ctx) => {
      if (
        ctx.updateType === "callback_query" &&
        ctx.update.callback_query.data === "cancel"
      ) {
        ctx.reply(
          `Operation cancelled.`,
          Markup.inlineKeyboard([Markup.button.callback("❓Help", "help")])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.tokenAddress = ctx.message.text;
      ctx.reply(
        "Please enter amount of tokens:",
        Markup.inlineKeyboard([
          Markup.button.callback("🚫 Cancel operation", "cancel"),
        ])
      );
      return ctx.wizard.next();
    },
    (ctx) => {
      if (
        ctx.updateType === "callback_query" &&
        ctx.update.callback_query.data === "cancel"
      ) {
        ctx.reply(
          `Operation cancelled.`,
          Markup.inlineKeyboard([Markup.button.callback("❓Help", "help")])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.amount = ctx.message.text;
      ctx.reply(
        "Please enter the receiver address:",
        Markup.inlineKeyboard([
          Markup.button.callback("🚫 Cancel operation", "cancel"),
        ])
      );
      return ctx.wizard.next();
    },
    (ctx) => {
      if (
        ctx.updateType === "callback_query" &&
        ctx.update.callback_query.data === "cancel"
      ) {
        ctx.reply(
          `Operation cancelled.`,
          Markup.inlineKeyboard([Markup.button.callback("❓Help", "help")])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.receiverAddress = ctx.message.text;
      ctx.reply(
        "Please enter the value in ETH to send:",
        Markup.inlineKeyboard([
          Markup.button.callback("🚫 Cancel operation", "cancel"),
        ])
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (
        ctx.updateType === "callback_query" &&
        ctx.update.callback_query.data === "cancel"
      ) {
        ctx.reply(
          `Operation cancelled.`,
          Markup.inlineKeyboard([Markup.button.callback("❓Help", "help")])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.value = ctx.message.text;
      const { tokenAddress, amount, receiverAddress, value } = ctx.wizard.state;
      const userId = ctx.from.id;

      try {
        let wallet = await getWallet(userId);

        const signer = validateAndGetSigner(wallet, provider);
        const tradingHubContractWithSigner = tradingHubContract.connect(signer);
        const valueToSend = ethers.parseEther(value);
        const amountToSell = ethers.parseUnits(amount, 18);
        const tokenContract = new ethers.Contract(
          tokenAddress,
          memeTokenAbi,
          signer
        );
        const approveTx = await tokenContract.approve(
          tradingHubAddress,
          amountToSell
        );
        ctx.reply(
          `Please wait, we're approving the contract to sell your tokens...`
        );

        const approveReceipt = await approveTx.wait();
        console.log(approveReceipt);

        if (approveReceipt.status === 1) {
          const sellTx = await tradingHubContractWithSigner.sell(
            tokenAddress,
            receiverAddress,
            amountToSell,
            {
              gasLimit: 20000000,
            }
          );
          ctx.reply(`Please wait, we're selling your tokens...`);
          const receipt = await sellTx.wait();

          console.log(receipt);
          ctx.reply(
            `Token ${tokenAddress} sold successfully!! 🎉
          \nTransaction Hash: https://bartio.beratrail.io/tx/${receipt.hash}`
          );
        }
      } catch (error) {
        ctx.reply(
          `Error selling token: ${error?.shortMessage || error?.message}
          \n use /help to see all available commands`
        );
        console.error(error);
        return ctx.scene.leave();
      } finally {
        return ctx.scene.leave();
      }
    }
  );

  const checkTokenBalance = new Scenes.WizardScene(
    "CHECK_TOKEN_BALANCE_WIZARD",
    (ctx) => {
      ctx.reply(
        "Please enter the token address:",
        Markup.inlineKeyboard([
          Markup.button.callback("🚫 Cancel operation", "cancel"),
        ])
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (
        ctx.updateType === "callback_query" &&
        ctx.update.callback_query.data === "cancel"
      ) {
        ctx.reply(
          `Operation cancelled.`,
          Markup.inlineKeyboard([Markup.button.callback("❓Help", "help")])
        );
        return ctx.scene.leave();
      }
      ctx.wizard.state.tokenAddress = ctx.message.text;
      const { tokenAddress } = ctx.wizard.state;

      const userId = ctx.from.id;

      try {
        let wallet = await getWallet(userId);
        console.log(wallet);
        const userAddress = wallet?.address;

        const tokenContract = new ethers.Contract(
          tokenAddress,
          memeTokenAbi,
          provider
        );
        const balance = await tokenContract.balanceOf(userAddress);
        ctx.reply(`Please wait, we're fetching your balance... `);
        ctx.reply(`Balance fetched!! 🎉
          /n Your balance is ${ethers.formatUnits(balance, 18)}`);
      } catch (error) {
        ctx.reply(
          `Error fetching balance: ${error?.shortMessage || error?.message}
          \n use /help to see all available commands`
        );
        console.error(error);
        return ctx.scene.leave();
      } finally {
        return ctx.scene.leave();
      }
    }
  );

  const importWallet = new Scenes.WizardScene(
    "IMPORT_WALLET_WIZARD",
    (ctx) => {
      ctx.reply(
        "Please provide either the private key of the wallet you wish to import or a 12-word mnemonic phrase."
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      ctx.wizard.state.phrase = ctx.message.text;
      ctx.session.phrase = ctx.message.text;
      const { phrase } = ctx.wizard.state;

      try {
        const wallet = generateAccount(phrase);
        ctx.session.userAddress = wallet.address;
        ctx.session.privateKey = wallet.privateKey;
        ctx.reply(`Your wallet address is: ${wallet.address}
        \n use /help to see all available commands`);
      } catch (error) {
        console.log(error);
        `Error importing wallet: ${error?.shortMessage || error?.message}
        \n use /help to see all available commands
        `;
        ctx.reply(
          `This does not appear to be a valid private key / mnemonic phrase. Please try again.
          \n use /help to see all available commands`
        );
        return ctx.scene.leave();
      } finally {
        return ctx.scene.leave();
      }
    }
  );

  const createNewWallet = new Scenes.WizardScene(
    "CREATE_WALLET_WIZARD",
    async (ctx) => {
      try {
        const wallet = createNewAccount();
        ctx.session.userAddress = wallet.address;
        ctx.session.privateKey = wallet.privateKey;
        ctx.reply(`Wallet created successfully!
        \nYour wallet address is: ${wallet.address}
        \n make use of the berachain faucet https://bartio.faucet.berachain.com/ to claim tokens.
        \n use /help to see all available commands`);
      } catch (error) {
        console.log(error);

        ctx.reply(
          `Error creating wallet: ${error?.shortMessage || error?.message}
          \n use /help to see all available commands
          `
        );
        return ctx.scene.leave();
      } finally {
        return ctx.scene.leave();
      }
    }
  );

  const showWalletDetails = new Scenes.WizardScene(
    "GET_WALLET_WIZARD",
    async (ctx) => {
      const userId = ctx.from.id;

      try {
        let wallet = await getWallet(userId);
        // console.log(wallet);
        let formattedBalance;
        const userAddress = wallet?.address;
        
        if (wallet) {
          const balance = await provider.getBalance(wallet.address);
          formattedBalance = ethers.formatEther(balance);
        }
        const privateKey = wallet?.privateKey;
        if (userAddress) {
          ctx.reply(
            `
            💰 Wallet Details
            \n Your wallet address is:\n\`${userAddress}\`\n 
            \n Your private key is: \n\`${decrypt(privateKey)}\`\n 
             \n ⚠️ IMPORTANT: Always remember to keep your private key secure.
            \nYour wallet balance is: ${formattedBalance} BERA  
            \n use /help to see all available commands`,
            { parse_mode: "Markdown" }
          );
        } else {
          ctx.reply(
            `You haven't imported a wallet yet.
              \nPlease use the /importWallet command to import your wallet, or use the /createWallet command to create a new wallet`
          );
        }
      } catch (error) {
        console.log(error);
        return ctx.scene.leave();
      } finally {
        return ctx.scene.leave();
      }
    }
  );

  function generateInlineButtons() {
    return Markup.inlineKeyboard([
      // [
      //   Markup.button.callback("🔨 Create Wallet", "createWallet"),
      //   Markup.button.callback("📥 Import Wallet", "importWallet"),
      // ],
      [Markup.button.callback("🪙 Create Meme Token", "createNewMemeToken")],
      [Markup.button.callback("👁️ Show Wallet Details", "showWalletAddress")],
      [
        Markup.button.callback("💰 Buy", "buy"),
        Markup.button.callback("🤑 Sell", "sell"),
      ],
      [
        Markup.button.callback("💼 Check Balance", "checkBalance"),
        Markup.button.callback("❓ Help", "help"),
      ],
    ]);
  }

  async function sendWelcomeMessage(ctx) {
    const userId = ctx.from.id;
    let wallet = await getWallet(userId);

    if (!wallet) {
      wallet = createNewAccount();
      await setWallet(userId, wallet);
    }
    let formattedBalance;
  
    if (wallet) {
      const balance = await provider.getBalance(wallet.address);
      formattedBalance = ethers.formatEther(balance);
    }

    const walletInfo = `
  🎉 Welcome to LootBot! 🤖
  
  📬 We've automatically created the wallet below to allow you interact with this bot: 
  \n\`${wallet.address}\`\n\nYour wallet balance is: ${formattedBalance} BERA\n\nMake use of the Berachain faucet https://bartio.faucet.berachain.com/ to claim tokens to interact with this bot.
    `;

    await ctx.reply(walletInfo, { parse_mode: "Markdown" });
    await ctx.reply(
      "Here are the available commands:",
      generateInlineButtons()
    );
  }

  async function sendHelpMessage(ctx) {
    await ctx.reply(
      "Here are the available commands:",
      generateInlineButtons()
    );
  }

  function createCancelCommand(operationName) {
    return (ctx) => {
      ctx.reply(`${operationName} cancelled.`);
      return ctx.scene.leave();
    };
  }

  function applyCancelCommand(wizard, operationName) {
    wizard.command("cancel", createCancelCommand(operationName));
  }

  bot.use(session());

  const stage = new Scenes.Stage([
    createTokenWizard,
    buyTokenWizard,
    sellTokenWizard,
    checkTokenBalance,
    importWallet,
    showWalletDetails,
    createNewWallet,
  ]);

  bot.use(stage.middleware());

  bot.command("start", sendWelcomeMessage);
  bot.action("help", sendHelpMessage);
  bot.command("help", sendHelpMessage);

  bot.action("createNewMemeToken", (ctx) =>
    ctx.scene.enter("CREATE_TOKEN_WIZARD")
  );
  bot.action("buy", (ctx) => ctx.scene.enter("BUY_TOKEN_WIZARD"));
  bot.action("sell", (ctx) => ctx.scene.enter("SELL_TOKEN_WIZARD"));

  bot.action("checkBalance", (ctx) =>
    ctx.scene.enter("CHECK_TOKEN_BALANCE_WIZARD")
  );
  bot.action("importWallet", (ctx) => ctx.scene.enter("IMPORT_WALLET_WIZARD"));
  bot.action("createWallet", (ctx) => ctx.scene.enter("CREATE_WALLET_WIZARD"));

  bot.action("showWalletAddress", (ctx) =>
    ctx.scene.enter("GET_WALLET_WIZARD")
  );
  bot.action("cancel", (ctx) => {
    ctx.reply(
      `Operation cancelled.`,
      Markup.inlineKeyboard([
        Markup.button.callback("🚫 Cancel operation", "cancel"),
      ])
    );
    return ctx.scene.leave();
  });
  // Apply cancel command to each wizard
  applyCancelCommand(createTokenWizard, "Token creation");
  applyCancelCommand(buyTokenWizard, "Token purchase");
  applyCancelCommand(sellTokenWizard, "Token sale");
  applyCancelCommand(checkTokenBalance, "Balance check");
  applyCancelCommand(importWallet, "Wallet import");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}`, err);
    if (
      err.code === "ETIMEDOUT" ||
      err.code === "ECONNRESET" ||
      ctx.updateType === "TimeoutError"
    ) {
      ctx.reply("Sorry, the server is not responding. Please try again later.");
    } else {
      ctx.reply("An error occurred. Please try again.");
      return ctx.scene.leave();
    }
  });

  const app = express();

  app.use(
    await bot.createWebhook({
      domain: "https://tg-bot-weld.vercel.app",
      path: "/api/webhook",
      // domain: "https://7072-102-89-75-254.ngrok-free.app",
    })
  );

  app.listen(PORT, () => {
    console.log(`Bot is running on port ${PORT}`);
  });
}
main();
