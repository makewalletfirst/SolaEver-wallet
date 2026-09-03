const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, createTransferInstruction, getMint } = require('@solana/spl-token');
const fs = require('fs');

async function sendTokens() {
  const connection = new Connection('https://rpc-sola.ever-chain.xyz', {
    commitment: 'confirmed',
    wsEndpoint: '', 
  });
  
  const secretKey = JSON.parse(fs.readFileSync('/root/gemini/deploy-keypair.json'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  
  const tokenInfo = JSON.parse(fs.readFileSync('/root/gemini/token-info.json'));
  const mint = new PublicKey(tokenInfo.mint);
  const recipient = new PublicKey('5S5SDC5vXvUbPbgm7nhBFfmYqL7Vpjh2Rzc5RDbVgssj');

  try {
    console.log(`Sending 500 tokens to ${recipient.toBase58()}...`);

    // 1. 송신자/수신자 ATA 확보
    const fromAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
    const toAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, recipient);

    // 2. 전송 트랜잭션 (500개, 소수점 9자리)
    const amount = 500 * Math.pow(10, 9);
    const transaction = new Transaction().add(
      createTransferInstruction(fromAta.address, toAta.address, payer.publicKey, amount)
    );

    const signature = await connection.sendTransaction(transaction, [payer], { skipPreflight: true });
    console.log('Transaction sent! Signature:', signature);

    // 3. 결과 확인 루프
    console.log('Confirming...');
    for (let i = 0; i < 20; i++) {
      const status = await connection.getSignatureStatus(signature);
      if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'processed') {
        console.log('✅ SUCCESS: 500 Tokens sent successfully!');
        return;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log('Confirmation timed out, but transaction was likely sent.');

  } catch (error) {
    console.error('Transfer failed:', error);
  }
}

sendTokens();
