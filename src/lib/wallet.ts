import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Buffer } from '@craftzdog/react-native-buffer';

// 니모닉 생성
export function generateMnemonic(): string {
  return bip39.generateMnemonic(128); // 12단어
}

// 니모닉 → 키페어 (Solana 표준 derivation path)
export async function keypairFromMnemonic(mnemonic: string): Promise<Keypair> {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
  return Keypair.fromSeed(Buffer.from(derivedSeed));
}
