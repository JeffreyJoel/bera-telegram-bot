const { Telegraf, Scenes, session, Markup } = require("telegraf");
const { ethers } = require("ethers");
const express = require("express");
const {
  generateAccount,
  validateAndGetSigner,
  setBotDescription,
  createNewAccount,
} = require("../utils/index.js");

const tradingHubABI = require("../constants/tradingHubAbi.json");
const factoryAbi = require("../constants/factoryAbi.json");
const memeTokenAbi = require("../constants/memeTokenAbi.json");

require("dotenv").config();

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

  await setBotDescription(bot);

  function generateCommandList() {
    return `Here are all available commands:
      \n/start - Start the bot and see this message
      \n/help - Show this help message
      \n/createWallet - Create a new wallet
      \n/importWallet - Import an existing wallet
      \n/showWalletAddress - View your wallet address
      \n/createNewMemeToken - Create a new token
      \n/buy - Purchase a token
      \n/sell - Sell a token
      \n/checkBalance - Check your token balance
      \n/cancel - Cancel ongoing command`;
  }

  // using scenes to achieve better ux
  const createTokenWizard = new Scenes.WizardScene(
    "CREATE_TOKEN_WIZARD",
    (ctx) => {
      ctx.reply("Please enter the token name:");
      return ctx.wizard.next();
    },
    (ctx) => {
      ctx.wizard.state.tokenName = ctx.message.text;
      ctx.reply("Please enter the token symbol:");
      return ctx.wizard.next();
    },
    (ctx) => {
      ctx.wizard.state.symbol = ctx.message.text;
      ctx.reply("Please enter the value in ETH to send:");
      return ctx.wizard.next();
    },

    async (ctx) => {
      ctx.wizard.state.value = ctx.message.text;
      const { tokenName, symbol, value } = ctx.wizard.state;

      try {
        const signer = validateAndGetSigner(ctx, provider);
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

        ctx.reply(`--- Creating ${tokenName} token ----`);
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
          `Token created successfully!
          \nTransaction Hash: ${receipt.hash}
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
      ctx.reply("Please enter the token address:");
      return ctx.wizard.next();
    },
    (ctx) => {
      ctx.wizard.state.tokenAddress = ctx.message.text;
      ctx.reply("Please enter the receiver address:");
      return ctx.wizard.next();
    },
    (ctx) => {
      ctx.wizard.state.receiverAddress = ctx.message.text;
      ctx.reply("Please enter the amount of ETH to send:");
      return ctx.wizard.next();
    },
    async (ctx) => {
      ctx.wizard.state.value = ctx.message.text;
      const { tokenAddress, receiverAddress, value } =
        ctx.wizard.state;
      console.log(tokenAddress, receiverAddress, value);

      try {
        const signer = validateAndGetSigner(ctx, provider);
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
        ctx.reply(`---- Purchasing token ----`);
        console.log(buyTx);
        const receipt = await buyTx.wait();
        console.log(receipt);
        ctx.reply(`Token ${tokenAddress} purchased successfully 
        \nTransaction Hash: ${receipt.hash}`);
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
      ctx.reply("Please enter the token address:");
      return ctx.wizard.next();
    },
    (ctx) => {
      ctx.wizard.state.tokenAddress = ctx.message.text;
      ctx.reply("Please enter amount of tokens:");
      return ctx.wizard.next();
    },
    (ctx) => {
      ctx.wizard.state.amount = ctx.message.text;
      ctx.reply("Please enter the receiver address:");
      return ctx.wizard.next();
    },
    (ctx) => {
      ctx.wizard.state.receiverAddress = ctx.message.text;
      ctx.reply("Please enter the amount of ETH to send:");
      return ctx.wizard.next();
    },
    async (ctx) => {
      ctx.wizard.state.value = ctx.message.text;
      const { tokenAddress, amount, receiverAddress, value } = ctx.wizard.state;

      try {
        const signer = validateAndGetSigner(ctx, provider);
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
        ctx.reply(`---- Approving ----`);

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
          ctx.reply(`---- Selling token ----`);
          const receipt = await sellTx.wait();

          console.log(receipt);
          ctx.reply(
          `Token ${tokenAddress} sold successfully 
          \nTransaction Hash: ${receipt.hash}`);
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
      ctx.reply("Please enter the token address:");
      return ctx.wizard.next();
    },
    async (ctx) => {
      ctx.wizard.state.tokenAddress = ctx.message.text;
      const { tokenAddress } = ctx.wizard.state;

      try {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          memeTokenAbi,
          provider
        );

        const userAddress = ctx.session.userAddress;
        const balance = await tokenContract.balanceOf(userAddress);
        ctx.reply(`---- Fetching balance ----`);
        ctx.reply(`Your balance is ${ethers.formatUnits(balance, 18)}`);
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
      const userAddress = ctx.session.userAddress;
      try {
        if (userAddress) {
          ctx.reply(`Your wallet address is: ${userAddress}
            \n use /help to see all available commands`);
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

  async function sendWelcomeMessage(ctx) {
    ctx.reply(
      `Welcome to BondingTestBot!
     \n${generateCommandList()}`
    );
  }
  async function sendHelpMessage(ctx) {
    ctx.reply(generateCommandList());
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
  bot.command("help", sendHelpMessage);
  bot.command("createNewMemeToken", (ctx) =>
    ctx.scene.enter("CREATE_TOKEN_WIZARD")
  );
  bot.command("buy", (ctx) => ctx.scene.enter("BUY_TOKEN_WIZARD"));
  bot.command("sell", (ctx) => ctx.scene.enter("SELL_TOKEN_WIZARD"));

  bot.command("checkBalance", (ctx) =>
    ctx.scene.enter("CHECK_TOKEN_BALANCE_WIZARD")
  );
  bot.command("importWallet", (ctx) => ctx.scene.enter("IMPORT_WALLET_WIZARD"));
  bot.command("createWallet", (ctx) => ctx.scene.enter("CREATE_WALLET_WIZARD"));

  bot.command("showWalletAddress", (ctx) =>
    ctx.scene.enter("GET_WALLET_WIZARD")
  );
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
      // domain: "https://0b07-102-89-84-157.ngrok-free.app",
    })
  );

  app.listen(PORT, () => {
    console.log(`Bot is running on port ${PORT}`);
  });
}
main();
