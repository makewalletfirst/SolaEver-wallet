const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

const keypair = Keypair.generate();
const publicKey = keypair.publicKey.toBase58();
const secretKey = Array.from(keypair.secretKey);

fs.writeFileSync('/root/gemini/deploy-keypair.json', JSON.stringify(secretKey));
console.log(publicKey);
