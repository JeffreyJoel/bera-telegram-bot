const { Telegraf, Scenes, session } = require("telegraf");
const { ethers } = require("ethers");
const express = require("express");
const { generateAccount, validateAndGetSigner } = require("../utils/index.js");
// const { decrypt } = require("../utils/encryption.js");

const tradingHubABI = require("../constants/tradingHubAbi.json");
const factoryAbi = require("../constants/factoryAbi.json");
const memeTokenAbi = require("../constants/memeTokenAbi.json");

require("dotenv").config();

const app = express();
async function main() {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const PORT = 8080;

  const bot = new Telegraf(`${BOT_TOKEN}`);

  const privateKey = `${process.env.PRIVATE_KEY}`;

  const provider = new ethers.JsonRpcProvider(
    "https://bartio.rpc.berachain.com"
  );

  // const signer = new ethers.Wallet(privateKey, provider);
  // const wallet = new ethers.Wallet(privateKey);
  // const userAddress = wallet.address;
  // let userAddress;

  const tradingHubAddress = `${process.env.TRADING_HUB_CONTRACT_ADDRESS}`;
  const factoryAddress = `${process.env.FACTORY_CONTRACT_ADDRESS}`;

  const tradingHubContract = new ethers.Contract(
    tradingHubAddress,
    tradingHubABI,
    provider
  );
  const factoryContract = new ethers.Contract(
    factoryAddress,
    factoryAbi,
    provider
  );

  async function sendWelcomeMessage(ctx) {
    ctx.reply(
      `Welcome to BondingTestBot! 
 \nHere are a list of actions you can perform
      \n/importWallet to import an already existing wallet
      \n/showWalletAddress to view your wallet address
      \n/createNewMemeToken to create a new token 
      \n/buy to purchase a token
      \n/sell to sell a token
      \n/checkBalance to check your token balance
      `
    );
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
      ctx.wizard.state.liquidity = ctx.message.text;
      const { tokenName, symbol, liquidity } = ctx.wizard.state;

      try {
        const signer = validateAndGetSigner(ctx, provider);
        const factoryContractWithSigner = factoryContract.connect(signer);
        const liquidityToSend = ethers.parseEther(`${liquidity}`);
        const createMemeTx = await factoryContractWithSigner.createNewMeme(
          tokenName,
          symbol,
          {
            value: liquidityToSend,
          }
        );
        ctx.reply(`--- Creating ${tokenName} token ----`);
        // const receipt = await createMemeTx.wait();

        const eventSignature =
          "0x01fb0165fee40718cec1862fc8dd2dbd6fc0fdef7623971ac15ffd2daf21b986";
        const filter = {
          address: factoryContract.address,
          topics: [eventSignature],
        };

        const tokenCreatedPromise = new Promise((resolve, reject) => {
          provider.once(filter, (log) => {
            const tokenAddress = ethers.getAddress(
              "0x" + log.topics[1].slice(26)
            );
            const creatorAddress = ethers.getAddress(
              "0x" + log.topics[2].slice(26)
            );
            resolve({ tokenAddress, creatorAddress });
          });

          setTimeout(
            () => reject(new Error("Timeout waiting for token creation event")),
            120000
          );
        });
        const [receipt, { tokenAddress, creatorAddress }] = await Promise.all([
          createMemeTx.wait(),
          tokenCreatedPromise,
        ]);
        console.log(receipt);
        ctx.reply(`Token created successfully!
          \nToken Address: ${tokenAddress}
          \nCreator Address: ${creatorAddress}
          \nTransaction Hash: ${receipt.hash}`);
      } catch (error) {
        ctx.reply(
          `Error creating meme token: ${error?.shortMessage || error?.message}`
        );
        console.error(error);
      } finally {
        await ctx.scene.leave();
        await sendWelcomeMessage(ctx);
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
      ctx.reply("Please enter the minimum amount out:");
      return ctx.wizard.next();
    },
    (ctx) => {
      ctx.wizard.state.minimumAmountOut = ctx.message.text;
      ctx.reply("Please enter the receiver address:");
      return ctx.wizard.next();
    },
    (ctx) => {
      ctx.wizard.state.receiverAddress = ctx.message.text;
      ctx.reply("Please enter the amount of ETH to send:");
      return ctx.wizard.next();
    },
    async (ctx) => {
      ctx.wizard.state.amountIn = ctx.message.text;
      const { tokenAddress, minimumAmountOut, receiverAddress, amountIn } =
        ctx.wizard.state;
      try {
        const signer = validateAndGetSigner(ctx, provider);
        const tradingHubContractWithSigner = tradingHubContract.connect(signer);
        const amountToSend = ethers.parseEther(`${amountIn}`);
        const minimumAmountOutToReceive = ethers.parseUnits(
          `${minimumAmountOut}`,
          18
        );
        const buyTx = await tradingHubContractWithSigner.buy(
          tokenAddress,
          minimumAmountOutToReceive,
          receiverAddress,
          {
            value: amountToSend,
            gasLimit: 30000000,
          }
        );
        ctx.reply(`---- Purchasing token ----`);
        const receipt = await buyTx.wait();
        ctx.reply(`Token ${tokenAddress} purchased successfully`);
      } catch (error) {
      `Error creating meme token: ${error?.shortMessage || error?.message}`
        console.error(error);
      } finally {
        await ctx.scene.leave();
        await sendWelcomeMessage(ctx);
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
        const ETHToSend = ethers.parseEther(`${value}`);
        const amountToSell = ethers.parseUnits(`${amount}`, 18);
        const sellTx = await tradingHubContractWithSigner.buy(
          tokenAddress,
          receiverAddress,
          amountToSell,
          {
            value: ETHToSend,
            gasLimit: 500000,
          }
        );
        ctx.reply(`---- Selling token ----`);
        const receipt = await sellTx.wait();

        console.log(receipt);
        ctx.reply(`Token ${tokenAddress} sold successfully`);
      } catch (error) {
        `Error creating meme token: ${error?.shortMessage || error?.message}`
        console.error(error);
      } finally {
        await ctx.scene.leave();
        await sendWelcomeMessage(ctx);
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
       `Error creating meme token: ${error?.shortMessage || error?.message}`
        console.error(error);
      } finally {
        await ctx.scene.leave();
        await sendWelcomeMessage(ctx);
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
        ctx.reply("Your wallet address is: " + wallet.address);
      } catch (error) {
        console.log(error);
        `Error creating meme token: ${error?.shortMessage || error?.message}`
        ctx.reply(
          "This does not appear to be a valid private key / mnemonic phrase. Please try again."
        );
      } finally {
        await ctx.scene.leave();
        await sendWelcomeMessage(ctx);
      }
    }
  );

  const showWalletDetails = new Scenes.WizardScene(
    "GET_WALLET_WIZARD",
    async (ctx) => {
      const userAddress = ctx.session.userAddress;
      try {
        if (userAddress) {
          ctx.reply(`Your wallet address is: ${userAddress}`);
        } else {
          ctx.reply(
            "You haven't imported a wallet yet. Please use the /importWallet command to import your wallet."
          );
        }
      } catch (error) {
        console.log(error);
       `Error creating meme token: ${error?.shortMessage || error?.message}`
      } finally {
        await ctx.scene.leave();
        await sendWelcomeMessage(ctx);
      }
    }
  );

  bot.use(session());

  const stage = new Scenes.Stage([
    createTokenWizard,
    buyTokenWizard,
    sellTokenWizard,
    checkTokenBalance,
    importWallet,
    showWalletDetails,
  ]);

  bot.use(stage.middleware());

  bot.command("start", sendWelcomeMessage);
  bot.command("createNewMemeToken", (ctx) =>
    ctx.scene.enter("CREATE_TOKEN_WIZARD")
  );
  bot.command("buy", (ctx) => ctx.scene.enter("BUY_TOKEN_WIZARD"));
  bot.command("sell", (ctx) => ctx.scene.enter("SELL_TOKEN_WIZARD"));

  bot.command("checkBalance", (ctx) =>
    ctx.scene.enter("CHECK_TOKEN_BALANCE_WIZARD")
  );
  bot.command("importWallet", (ctx) => ctx.scene.enter("IMPORT_WALLET_WIZARD"));
  bot.command("showWalletAddress", (ctx) =>
    ctx.scene.enter("GET_WALLET_WIZARD")
  );

  stage.command("scene.leave", sendWelcomeMessage);

  app.use(
    await bot.createWebhook({
      domain: "https://tg-bot-weld.vercel.app",
      path: "/api/webhook",
      // domain: "https://f67e-102-88-70-132.ngrok-free.app",
    })
  );

  app.listen(PORT, () => {
    console.log(`Bot is running on port ${PORT}`);
  });
}
main();
