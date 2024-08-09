
const { encrypt, decrypt } = require("./encryption");
const { Wallet, ethers } = require("ethers");

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


function validateAndGetSigner(ctx, provider) {
    if (!ctx.session.privateKey) {
      throw new Error(
        "No private key found in session. Please import a wallet first."
      );
    }
    const decryptedPrivateKey = decrypt(ctx.session.privateKey);
    const privateKey = decryptedPrivateKey.startsWith("0x")
      ? decryptedPrivateKey.slice(2)
      : decryptedPrivateKey;
    if (privateKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(privateKey)) {
      throw new Error("Invalid private key format.");
    }
    return new ethers.Wallet(privateKey, provider);
  }

module.exports = {
    generateAccount,
    validateAndGetSigner
}
