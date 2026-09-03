const { Connection, Keypair, Transaction, PublicKey } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, createTransferInstruction, getMint } = require('@solana/spl-token');
const fs = require('fs');

async function run() {
  const connection = new Connection('https://rpc-sola.ever-chain.xyz', 'processed');
  const secretKey = JSON.parse(fs.readFileSync('/root/gemini/deploy-keypair.json'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const toAddr = new PublicKey('5S5SDC5vXvUbPbgm7nhBFfmYqL7Vpjh2Rzc5RDbVgssj');

  async function transfer(mintAddr, amount) {
    console.log(`Transferring ${amount} of ${mintAddr}...`);
    const mint = new PublicKey(mintAddr);
    const fromAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
    const toAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, toAddr);
    const mintInfo = await getMint(connection, mint);
    
    const tx = new Transaction().add(
      createTransferInstruction(fromAta.address, toAta.address, payer.publicKey, BigInt(amount * Math.pow(10, mintInfo.decimals)))
    );
    const sig = await connection.sendTransaction(tx, [payer]);
    console.log(`Success: ${sig}`);
  }

  try {
    await transfer('8EFM5gy5oFK6A3rPpDPSBAsmgPAXDMdeHvRENvDPArZR', 90000);  // SLE-T
    await transfer('3cxHQomt8DarqKFiwvDJbmAreBXd4pYo4h6LanB2xk6u', 900000); // sBEC
  } catch (e) { console.error(e); }
}
run();
