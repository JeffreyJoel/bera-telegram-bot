// const { encrypt } = require("./encryption");
// const { Wallet } = require("ethers");

// function generateAccount(phrase, index = 0) {
    
//   const wallet = phrase.includes(" ")
//     ? Wallet.fromMnemonic(phrase, `m/44'/60'/0'/0/${index}`)
//     : new Wallet(phrase);

//   return {
//     address: wallet.address,
//     privateKey: encrypt(wallet.privateKey),
//     mnemonic: encrypt(phrase),
//   };
// }

// module.exports = {
//   generateAccount,
// };