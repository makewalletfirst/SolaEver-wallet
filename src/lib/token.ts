import {
  PublicKey,
  Transaction,
  Keypair
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getMint
} from '@solana/spl-token';
import { Buffer } from 'buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connection } from './connection';

// SolaEver 에 미러링된 Metaplex Token Metadata Program (mainnet 동일 ID)
const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const COMMON_TOKENS: Record<string, { symbol: string, name: string }> = {
  "Es9vMFrzaDCSTMdUi9CcZ6SSTm82WWSXn8tWNRU3mgtf": { symbol: "USDT", name: "Tether USD" },
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC", name: "USD Coin" },
  "So11111111111111111111111111111111111111112": { symbol: "wSOL", name: "Wrapped Solana" },
  "8EFM5gy5oFK6A3rPpDPSBAsmgPAXDMdeHvRENvDPArZR": { symbol: "SLE-T", name: "SolaEver Token" },
  "3cxHQomt8DarqKFiwvDJbmAreBXd4pYo4h6LanB2xk6u": { symbol: "sBEC", name: "sBEC Token" }
};

export type TokenMeta = {
  symbol: string;
  name: string;
  imageUri?: string;   // 토큰 로고 (https URL, ipfs:// 는 gateway 로 변환)
  uri?: string;        // metadata.json URL (off-chain)
};

export function getTokenInfo(mint: string): TokenMeta {
  return COMMON_TOKENS[mint] || { symbol: "TOKEN", name: "Unknown Token" };
}

// ipfs://<cid>/path → https gateway 변환 (RN Image 가 ipfs 직접 못 부름)
function normalizeUri(u: string): string {
  if (!u) return '';
  if (u.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${u.slice(7)}`;
  return u;
}

/**
 * Metaplex Token Metadata 를 chain 에서 fetch.
 * 1) metadata PDA derive (seeds = ["metadata", METAPLEX, mint])
 * 2) getAccountInfo 로 PDA 의 raw bytes
 * 3) name / symbol / uri 파싱 (borsh String — u32 len + bytes)
 * 4) uri 가 있으면 off-chain JSON fetch → image URL 추출
 * 5) AsyncStorage 캐싱 (24h)
 */
export async function fetchTokenMetadata(mintAddress: string): Promise<TokenMeta> {
  // 1) hardcoded 우선
  if (COMMON_TOKENS[mintAddress]) return COMMON_TOKENS[mintAddress];

  // 2) AsyncStorage 캐시 — 24 시간 유효
  const CACHE_KEY = `tokenmeta_v1_${mintAddress}`;
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const obj = JSON.parse(cached);
      if (Date.now() - (obj.ts || 0) < 24 * 3600 * 1000) {
        return { symbol: obj.symbol, name: obj.name, imageUri: obj.imageUri, uri: obj.uri };
      }
    }
  } catch { /* ignore */ }

  // 3) Metaplex PDA fetch
  try {
    const mint = new PublicKey(mintAddress);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METAPLEX_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      METAPLEX_PROGRAM_ID
    );
    const info = await connection.getAccountInfo(pda);
    if (!info || !info.data) {
      return { symbol: 'TOKEN', name: 'Unknown Token' };
    }
    const data = Buffer.from(info.data);

    // layout: 1 (key) + 32 (update_authority) + 32 (mint) + DataV2
    // DataV2 의 String 들은 borsh: u32 length(LE) + utf-8 bytes (null padding 후 null 자동 제거)
    let off = 1 + 32 + 32;
    const readStr = (): string => {
      if (off + 4 > data.length) return '';
      const len = data.readUInt32LE(off); off += 4;
      if (len === 0 || off + len > data.length) return '';
      const s = data.slice(off, off + len).toString('utf-8').replace(/\0+$/, '').trim();
      off += len;
      return s;
    };
    const name = readStr();
    const symbol = readStr();
    const uri = readStr();

    // 4) off-chain JSON fetch — image URL 추출
    let imageUri = '';
    const httpUri = normalizeUri(uri);
    if (httpUri && /^https?:\/\//.test(httpUri)) {
      try {
        const r = await fetch(httpUri, { method: 'GET' });
        if (r.ok) {
          const j = await r.json();
          imageUri = normalizeUri(j.image || j.logoURI || '');
        }
      } catch { /* off-chain fetch 실패 — 이름/심볼만 표시 */ }
    }

    const result: TokenMeta = {
      symbol: symbol || 'TOKEN',
      name: name || 'Unknown Token',
      uri,
      imageUri,
    };
    // 5) 캐시 저장
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ...result, ts: Date.now() }));
    } catch { /* ignore */ }
    return result;
  } catch (e) {
    return { symbol: 'TOKEN', name: 'Unknown Token' };
  }
}

export async function getTokenBalance(mintAddress: string, ownerAddress: string): Promise<number> {
  try {
    const mint = new PublicKey(mintAddress);
    const owner = new PublicKey(ownerAddress);
    const response = await connection.getTokenAccountsByOwner(owner, { mint });
    if (response.value.length === 0) return 0;
    const balanceInfo = await connection.getTokenAccountBalance(response.value[0].pubkey, 'processed');
    return balanceInfo.value.uiAmount || 0;
  } catch (error) {
    return 0;
  }
}

export async function sendSPLToken(
  sender: Keypair,
  mintAddress: string,
  toAddress: string,
  amount: number
): Promise<string> {
  const mint = new PublicKey(mintAddress);
  const toPubkey = new PublicKey(toAddress);

  const mintInfo = await getMint(connection, mint, 'processed');
  const rawAmount = BigInt(Math.floor(amount * Math.pow(10, mintInfo.decimals)));

  // ── 1) sender 의 진짜 source token account 결정 ────────────────────────
  //   SolaEver 에선 ATA program 호환 이슈로 사용자가 일반 token account
  //   (ATA 가 아닌 keypair-based) 에 보유 중인 경우가 흔함.
  //   `getTokenAccountsByOwner` 로 모든 token account 확인 후 잔액 있는 것 사용.
  const senderAccounts = await connection.getTokenAccountsByOwner(sender.publicKey, { mint });
  if (senderAccounts.value.length === 0) {
    throw new Error(`이 토큰을 보유하고 있지 않습니다 (token account 없음).`);
  }
  // 잔액 있는 첫 번째 account 사용
  let sourceAcc = senderAccounts.value[0].pubkey;
  let sourceBalance = 0n;
  for (const acc of senderAccounts.value) {
    const bal = await connection.getTokenAccountBalance(acc.pubkey, 'processed');
    const raw = BigInt(bal.value.amount);
    if (raw > sourceBalance) { sourceBalance = raw; sourceAcc = acc.pubkey; }
  }
  if (sourceBalance < rawAmount) {
    throw new Error(`잔액이 부족합니다 (보유 ${Number(sourceBalance) / Math.pow(10, mintInfo.decimals)}).`);
  }

  // ── 2) recipient 의 destination token account 결정 ────────────────────
  //   1순위: recipient 가 이미 가진 token account (ATA 든 일반이든)
  //   2순위: ATA program 으로 새 ATA 생성 시도 (SolaEver 호환되면 OK)
  const recipientAccounts = await connection.getTokenAccountsByOwner(toPubkey, { mint });
  let destAcc;
  if (recipientAccounts.value.length > 0) {
    destAcc = recipientAccounts.value[0].pubkey;
  } else {
    // 없으면 ATA 생성 시도 (fail 시 명확한 메시지)
    try {
      const ata = await getOrCreateAssociatedTokenAccount(connection, sender, mint, toPubkey, false, 'processed');
      destAcc = ata.address;
    } catch (e: any) {
      throw new Error(`받는 사람의 token account 가 없고 자동 생성도 실패: ${e?.message || String(e)}`);
    }
  }

  // ── 3) transfer instruction + send (skipPreflight=false 로 simulation 통과 검증) ──
  const { blockhash } = await connection.getLatestBlockhash('processed');
  const transaction = new Transaction({
    feePayer: sender.publicKey,
    recentBlockhash: blockhash,
  }).add(
    createTransferInstruction(sourceAcc, destAcc, sender.publicKey, rawAmount)
  );

  const signature = await connection.sendTransaction(transaction, [sender], {
    skipPreflight: false,
    preflightCommitment: 'processed',
  });

  // ── 4) confirm + 실제 err 검사 (err !== null 이면 on-chain 실패) ─────────
  for (let i = 0; i < 15; i++) {
    const status = await connection.getSignatureStatus(signature);
    const v = status.value;
    if (v && (v.confirmationStatus === 'processed' || v.confirmationStatus === 'confirmed' || v.confirmationStatus === 'finalized')) {
      if (v.err) {
        throw new Error(`트랜잭션 실패 (on-chain): ${JSON.stringify(v.err)}`);
      }
      return signature;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('트랜잭션 확인 시간 초과 — 네트워크 상태를 확인하세요.');
}
