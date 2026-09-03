const { Connection, Keypair, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const { createInitializeMintInstruction, MINT_SIZE, TOKEN_PROGRAM_ID, getMinimumBalanceForRentExemptMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction } = require('@solana/spl-token');
const fs = require('fs');

async function deploy() {
  // 웹소켓을 절대 사용하지 않도록 설정
  const connection = new Connection('https://rpc-sola.ever-chain.xyz', {
    commitment: 'processed',
    wsEndpoint: '', 
  });
  
  const secretKey = JSON.parse(fs.readFileSync('/root/gemini/deploy-keypair.json'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  // 수동 확인 함수 (웹소켓 없이 오직 HTTP로만 확인)
  async function confirmTx(signature) {
    console.log(`Checking status for: ${signature.slice(0, 10)}...`);
    for (let i = 0; i < 30; i++) {
      const status = await connection.getSignatureStatus(signature);
      if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'processed') {
        return true;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  try {
    console.log('--- Start Zero-WS Deployment ---');

    // 1. Mint 생성 트랜잭션
    const mint = Keypair.generate();
    const lamports = await getMinimumBalanceForRentExemptMint(connection);
    const { blockhash } = await connection.getLatestBlockhash();
    
    const mintTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(mint.publicKey, 9, payer.publicKey, payer.publicKey)
    );
    
    console.log('1. Sending Mint creation...');
    const s1 = await connection.sendTransaction(mintTx, [payer, mint], { skipPreflight: true });
    await confirmTx(s1);

    // 2. ATA 생성 트랜잭션
    const ata = await getAssociatedTokenAddress(mint.publicKey, payer.publicKey);
    const ataTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(payer.publicKey, ata, payer.publicKey, mint.publicKey)
    );
    
    console.log('2. Creating ATA...');
    const s2 = await connection.sendTransaction(ataTx, [payer], { skipPreflight: true });
    await confirmTx(s2);

    // 3. 민팅 트랜잭션 (10만 개)
    const mintToTx = new Transaction().add(
      createMintToInstruction(mint.publicKey, ata, payer.publicKey, 100000 * Math.pow(10, 9))
    );
    
    console.log('3. Minting tokens...');
    const s3 = await connection.sendTransaction(mintToTx, [payer], { skipPreflight: true });
    await confirmTx(s3);

    console.log('\n✅ ALL SUCCESS!');
    console.log('Token Mint Address:', mint.publicKey.toBase58());
    console.log('ATA Address:', ata.toBase58());

    fs.writeFileSync('/root/gemini/token-info.json', JSON.stringify({
      mint: mint.publicKey.toBase58(),
      ata: ata.toBase58(),
      deployer: payer.publicKey.toBase58()
    }, null, 2));

  } catch (error) {
    console.error('Deployment Failed:', error);
  }
}

deploy();
