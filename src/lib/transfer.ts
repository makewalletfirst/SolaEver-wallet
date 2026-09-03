import {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  Keypair,
  Finality
} from '@solana/web3.js';
import { connection, RPC_ENDPOINT } from './connection';

export async function sendSLE(
  sender: Keypair,
  toAddress: string,
  amount: number
): Promise<string> {
  try {
    const toPubkey = new PublicKey(toAddress);
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    const { blockhash } = await connection.getLatestBlockhash('processed');

    const transaction = new Transaction({
      feePayer: sender.publicKey,
      recentBlockhash: blockhash,
    }).add(
      SystemProgram.transfer({
        fromPubkey: sender.publicKey,
        toPubkey,
        lamports,
      })
    );

    const signature = await connection.sendTransaction(transaction, [sender], {
      skipPreflight: true,
      preflightCommitment: 'processed',
    });

    return signature;
  } catch (error: any) {
    throw error;
  }
}

export async function getBalance(address: string): Promise<number> {
  try {
    const response = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address, { commitment: 'processed' }]
      }),
    });
    const json = await response.json();
    return json.result.value / LAMPORTS_PER_SOL;
  } catch (error: any) {
    throw new Error(`${error.message}`);
  }
}

// 통합 트랜잭션 내역 조회 (v1.3: 저장 및 동기화 최적화)
export async function getTransactionHistory(address: string) {
  try {
    const owner = new PublicKey(address);
    let allAddresses = [address];

    try {
      const tokenAccounts = await connection.getTokenAccountsByOwner(owner, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
      }, 'processed');
      
      const ataAddresses = tokenAccounts.value.map(ta => ta.pubkey.toBase58());
      allAddresses = [...allAddresses, ...ataAddresses];
    } catch (e) {
      console.warn("ATA fetch skipped or failed", e);
    }

    // 'confirmed'로 안 오면 'processed'로라도 가져오기 위해 commitment를 유연하게 설정
    const fetchSignatures = async (addr: string, commitment: Finality) => {
      try {
        return await connection.getSignaturesForAddress(new PublicKey(addr), { limit: 15 }, commitment);
      } catch (e) {
        return [];
      }
    };

    const allSignaturesPromises = allAddresses.map(addr => fetchSignatures(addr, 'confirmed'));
    const results = await Promise.all(allSignaturesPromises);
    let merged = results.flat();

    // 만약 confirmed 결과가 너무 적으면 processed로 한 번 더 시도 (보강)
    if (merged.length < 5) {
      const processedPromises = allAddresses.map(addr => fetchSignatures(addr, 'processed'));
      const processedResults = await Promise.all(processedPromises);
      merged = [...merged, ...processedResults.flat()];
    }
    
    const unique = Array.from(new Map(merged.map(item => [item.signature, item])).values());
    return unique.sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0)).slice(0, 30);
    
  } catch (error: any) {
    console.error("Integrated History fetch failed:", error);
    return [];
  }
}
