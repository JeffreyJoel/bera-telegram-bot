const { Telegraf, Scenes, session } = require("telegraf");
const { ethers } = require("ethers");
const express = require("express");
const { generateAccount } = require("./utils/index.js");

const tradingHubABI = require("./constants/tradingHubAbi.json");
const factoryAbi = require("./constants/factoryAbi.json");
const memeTokenAbi = require("./constants/memeTokenAbi.json");

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

  const signer = new ethers.Wallet(privateKey, provider);
  // const wallet = new ethers.Wallet(privateKey);
  let userAddress;

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

  const factoryContractWithSigner = factoryContract.connect(signer);
  const tradingHubContractWithSigner = tradingHubContract.connect(signer);

  // using scenes to achieve better ux
  //TODO make this more modular
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
      ctx.reply("Please enter the liquidity amount:");
      return ctx.wizard.next();
    },
    async (ctx) => {
      ctx.wizard.state.liquidity = ctx.message.text;
      const { tokenName, symbol, liquidity } = ctx.wizard.state;

      try {
        const liquidityToSend = ethers.parseEther(`${liquidity}`);
        const createMemeTx = await factoryContractWithSigner.createNewMeme(
          tokenName,
          symbol,
          {
            value: liquidityToSend,
          }
        );
        ctx.reply(`--- Creating ${tokenName} token ----`);
        const receipt = await createMemeTx.wait();
        ctx.reply("Token created successfully.");
      } catch (error) {
        ctx.reply("Error creating meme token");
        console.error(error);
      }

      return ctx.scene.leave();
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
          }
        );
        ctx.reply(`---- Purchasing token ----`);
        const receipt = await buyTx.wait();
        ctx.reply(`Token ${tokenAddress} purchased successfully`);
      } catch (error) {
        ctx.reply(`Error purchasing token: ${error?.shortMessage}`);
        console.error(error);
      }

      return ctx.scene.leave();
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
        const ETHToSend = ethers.parseEther(`${value}`);
        const amountToSell = ethers.parseUnits(`${amount}`, 18);
        const sellTx = await tradingHubContractWithSigner.buy(
          tokenAddress,
          receiverAddress,
          amountToSell,
          {
            value: ETHToSend,
          }
        );
        ctx.reply(`---- Selling token ----`);
        const receipt = await sellTx.wait();

        console.log(receipt);
        ctx.reply(`Token ${tokenAddress} sold successfully`);
      } catch (error) {
        ctx.reply(`Error selling token: ${error?.shortMessage}`);
        console.error(error);
      }

      return ctx.scene.leave();
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
        const balance = await tokenContract.balanceOf(userAddress);
        ctx.reply(`---- Fetching balance ----`);
        ctx.reply(`Your balance is ${ethers.formatUnits(balance, 18)}`);
      } catch (error) {
        ctx.reply(`Error fetching balance: ${error?.shortMessage}`);
        console.error(error);
      }

      return ctx.scene.leave();
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
        ctx.session.address = wallet.address;
        ctx.reply("Your wallet address is: " + wallet.address);
      } catch (error) {
        console.log(error);
        ctx.reply(
          "This does not appear to be a valid private key / mnemonic phrase. Please try again."
        );
      }
      return ctx.scene.leave();
    }
  );

  bot.command("start", (ctx) => {
    ctx.reply(
      `Welcome to BondingTestBot! 
      \n/importWallet to import an already existing wallet
      \n/createNewMemeToken to create a new token 
      \n/buy to purchase a token
      \n/sell to sell a token
      \n/checkBalance to check your token balance
      `
    );
  });

  const stage = new Scenes.Stage([
    createTokenWizard,
    buyTokenWizard,
    sellTokenWizard,
    checkTokenBalance,
    importWallet,
  ]);
  bot.use(session());
  bot.use(stage.middleware());

  bot.command("createNewMemeToken", (ctx) =>
    ctx.scene.enter("CREATE_TOKEN_WIZARD")
  );
  bot.command("buy", (ctx) => ctx.scene.enter("BUY_TOKEN_WIZARD"));
  bot.command("sell", (ctx) => ctx.scene.enter("SELL_TOKEN_WIZARD"));

  bot.command("checkBalance", (ctx) =>
    ctx.scene.enter("CHECK_TOKEN_BALANCE_WIZARD")
  );
  bot.command("importWallet", (ctx) => ctx.scene.enter("IMPORT_WALLET_WIZARD"));
  // bot.command("getAddress", (ctx) => {
  //   try {
  //     if (userAddress) {
  //       ctx.reply(`Your wallet address is: ${userAddress}`);
  //     } else {
  //       ctx.reply(
  //         "You haven't imported a wallet yet. Please use the /importWallet command to import your wallet."
  //       );
  //     }
  //   } catch (error) {
  //     console.log(error);
  //     ctx.reply(error?.shortMessage);
  //   }
  // });
  // Set up the webhook
  app.use(
    await bot.createWebhook({
      domain: "https://f67e-102-88-70-132.ngrok-free.app",
    })
  );

  app.listen(PORT, () => {
    console.log(`Bot is running on port ${PORT}`);
  });
}
main();
