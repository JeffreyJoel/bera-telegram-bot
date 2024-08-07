import { Telegraf, Scenes, session } from "telegraf";
import { ethers } from "ethers";
import { createRequire } from "module";
import express from "express";

const require = createRequire(import.meta.url);
const tradingHubABI = require("./constants/tradingHubAbi.json");
const factoryAbi = require("./constants/factoryAbi.json");

require("dotenv").config();

const app = express();

async function main() {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const PORT = 8080;

  const bot = new Telegraf(`${BOT_TOKEN}`);

  const privateKey = "";

  const provider = new ethers.JsonRpcProvider(
    "https://bartio.rpc.berachain.com"
  );

  const signer = new ethers.Wallet(privateKey, provider);

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
        ctx.reply("Error purchasing token");
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
      ctx.wizard.state.value = ctx.message.text;
      const { tokenAddress, minimumAmountOut, receiverAddress, value } =
        ctx.wizard.state;

  
      try {
        const ETHToSend = ethers.parseEther(`${value}`);
        const minimumAmountOutToReceive = ethers.parseUnits(
          `${minimumAmountOut}`,
          18
        );
        const buyTx = await tradingHubContractWithSigner.buy(
          tokenAddress,
          minimumAmountOutToReceive,
          receiverAddress,
          {
            value: ETHToSend,
          }
        );
        ctx.reply(`---- Purchasing token ----`);
        const receipt = await buyTx.wait();
        ctx.reply(`Token ${tokenAddress} purchased successfully`);
      } catch (error) {
        ctx.reply("Error purchasing token");
        console.error(error);
      }

      return ctx.scene.leave();
    }
  );

  bot.command("start", (ctx) => {
    ctx.reply(
      `Welcome! 
      \n/createNewMemeToken to create a new token 
      \n/buy to purchase a token
      \n/sell to sell a token`
    );
  });

  const stage = new Scenes.Stage([createTokenWizard, buyTokenWizard]);
  bot.use(session());
  bot.use(stage.middleware());

  bot.command("createNewMemeToken", (ctx) =>
    ctx.scene.enter("CREATE_TOKEN_WIZARD")
  );
  bot.command("buy", (ctx) => ctx.scene.enter("BUY_TOKEN_WIZARD"));

  // bot.command("createNewMemeToken", async (ctx) => {
  //   const args = ctx.message.text.split(" ");
  //   if (args.length !== 4) {
  //     return ctx.reply(
  //       "Please use the format: /createNewMemeToken <tokenName> <symbol> <liquidity>"
  //     );
  //   }
  //   const tokenName = args[1];
  //   const symbol = args[2];
  //   const liquidity = args[3];
  //   const liquidityToSend = ethers.parseEther(`${liquidity}`);

  //   try {
  //     const createMemeTx = await factoryContractWithSigner.createNewMeme(
  //       tokenName,
  //       symbol,
  //       {
  //         value: liquidityToSend
  //       }
  //     );

  //     ctx.reply(`Creating ${tokenName} token`);

  //     const receipt = await createMemeTx.wait();

  //     console.log(receipt);
  //     ctx.reply('Token created, but couldn\'t find the token address in the event logs.');

  //     // ctx.reply(`Created ${tokenName} with  ${symbol}`);
  //   } catch (error) {
  //     ctx.reply("Error creating meme token");
  //     console.error(error);
  //   }
  // });

  // bot.command("buy", async (ctx) => {
  //   const args = ctx.message.text.split(" ");
  //   if (args.length !== 5) {
  //     return ctx.reply(
  //       "Please use the format: /buy <tokenAddress> <minimumAmountOut> <receiverAddress> <amountIn>"
  //     );
  //   }
  //   const tokenAddress = args[1];
  //   const minimumAmountOut = args[2];
  //   const receiverAddress = args[3];
  //   const amountIn = args[4]

  //   const amountToSend = ethers.parseEther(`${amountIn}`);
  //   const minimumAmountOutToReceive = ethers.parseUnits(`${minimumAmountOut}`, 18);

  //   try {
  //     const buyTx = await tradingHubContractWithSigner.buy(
  //       tokenAddress,
  //       minimumAmountOutToReceive,
  //       receiverAddress,
  //       {
  //         value: amountToSend
  //       }
  //     );

  //     console.log(buyTx);

  //     ctx.reply(`--- Purchasing token ---`);

  //     const receipt = await buyTx.wait();

  //     console.log(receipt);
  //     // ctx.reply(`Created ${tokenName} with  ${symbol}`);
  //     ctx.reply(`Token ${tokenAddress} purchased successfully`)

  //   } catch (error) {
  //     ctx.reply("Error purchasing token");
  //     console.error(error);
  //   }
  // });

  // bot.command("sell", async (ctx) => {
  //   const args = ctx.message.text.split(" ");
  //   if (args.length !== 4) {
  //     return ctx.reply(
  //       "Please use the format: /sell <tokenAddress> <receiverAddress> <amount>"
  //     );
  //   }
  //   const tokenAddress = args[1];
  //   const receiverAddress = args[2];
  //   const amount = args[3]
  //   const amountToSend = ethers.parseEther(`${amount}`);

  //   try {
  //     const sellTx = await tradingHubContractWithSigner.sell(
  //       tokenAddress,
  //       receiverAddress,
  //       amountToSend,
  //     );

  //     ctx.reply(`--- Selling token ---`);

  //     const receipt = await sellTx.wait();

  //     console.log(receipt);

  //     ctx.reply(`Token ${tokenAddress} sold successfully`);

  //   } catch (error) {
  //     ctx.reply("Error selling token");
  //     console.error(error);
  //   }
  // });

  // Set up the webhook
  app.use(
    await bot.createWebhook({
      domain: "https://ae3d-102-89-43-30.ngrok-free.app",
    })
  );

  app.listen(PORT, () => {
    console.log(`Bot is running on port ${PORT}`);
  });
}
main();
