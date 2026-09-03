import { Connection } from '@solana/web3.js';

export const RPC_ENDPOINT = 'https://rpc-sola.ever-chain.xyz';

export const connection = new Connection(RPC_ENDPOINT, 'confirmed');
