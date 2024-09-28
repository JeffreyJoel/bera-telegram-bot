const { encrypt, decrypt } = require("./encryption");
const { Wallet, ethers } = require("ethers");

//This creates a new random account for users to interact with
function createNewAccount() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: encrypt(wallet.privateKey),
    mnemonic: encrypt(wallet.mnemonic.phrase),
  };
}

//This imports an already existing account based on the user's private key or mnemonic
function generateAccount(phrase, index = 0) {
  const wallet = phrase.includes(" ")
    ? Wallet.fromMnemonic(phrase, `m/44'/60'/0'/0/${index}`)
    : new Wallet(phrase);

  return {
    address: wallet.address,
    privateKey: encrypt(wallet.privateKey),
    mnemonic: encrypt(phrase),
  };
}

//This gets a signer based on the stored private key
function validateAndGetSigner(wallet, provider) {
  if (!wallet?.privateKey) {
    throw new Error(
      "No private key found in session. Please import a wallet first."
    );
  }
  const decryptedPrivateKey = decrypt(wallet?.privateKey);
  const privateKey = decryptedPrivateKey.startsWith("0x")
    ? decryptedPrivateKey.slice(2)
    : decryptedPrivateKey;
  if (privateKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(privateKey)) {
    throw new Error("Invalid private key format.");
  }
  return new ethers.Wallet(privateKey, provider);
}

//This sets the bot description message before the first interaction with the bot
async function setBotDescription(bot) {
  try {
    await bot.telegram.setMyDescription(
      "Welcome to BondingTestBot! 🚀\n\n" +
        "This bot allows you to create, buy, and sell meme tokens on the Bera testnet.\n\n" +
        "Before we begin, please make sure you have a wallet ready. " +
        "You can import an existing wallet or create a new one using this bot.\n\n" +
        "Click 'Start' to begin your journey into meme tokens!"
    );
    console.log("Bot description set successfully");
  } catch (error) {
    console.error("Error setting bot description:", error);
  }
}

module.exports = {
  generateAccount,
  validateAndGetSigner,
  setBotDescription,
  createNewAccount
};
