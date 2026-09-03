# SolaEver Program/SPL Deployment Guide

솔라나 플레이그라운드나 표준 CLI에서 배포가 실패할 때(특히 웹소켓 405 에러 발생 시) 성공적으로 배포하는 방법입니다.

## 1. 실패 원인 분석
- **WebSocket(WSS) 차단**: 많은 RPC 프록시(Cloudflare 등)가 8900 포트나 WSS 프로토콜을 차단하여, 배포 도중 "성공 확인" 신호를 받지 못해 타임아웃이 발생합니다.
- **연속 트랜잭션 부하**: 프로그램 배포나 SPL 발행은 여러 개의 트랜잭션을 연속으로 처리해야 하는데, 각 단계마다 WSS 확인을 기다리면 실패 확률이 높습니다.

## 2. 배포 성공 방법 (Zero-WS HTTP 방식)
제가 사용한 방식은 `web3.js` 라이브러리의 자동 확인 기능을 우회하고, 모든 과정을 **순수 HTTP 요청**으로 처리하는 것입니다.

### 핵심 로직
1. **Connection 설정**: `wsEndpoint`를 빈 값으로 설정하여 웹소켓 시도를 물리적으로 차단합니다.
   ```javascript
   const connection = new Connection('https://your-rpc-url', {
     commitment: 'processed',
     wsEndpoint: '', 
   });
   ```
2. **수동 확인(Manual Polling)**: `confirmTransaction` 대신 `getSignatureStatus`를 직접 루프를 돌며 체크합니다.
   ```javascript
   async function confirmTx(signature) {
     for (let i = 0; i < 30; i++) {
       const status = await connection.getSignatureStatus(signature);
       if (status.value?.confirmationStatus === 'processed') return true;
       await new Promise(r => setTimeout(r, 1000));
     }
     return false;
   }
   ```
3. **트랜잭션 분리**: `createMint`, `getOrCreateATA`, `mintTo` 과정을 각각의 트랜잭션으로 빌드하여 하나씩 `sendTransaction`으로 날리고 위 수동 함수로 확인합니다.

이 방식을 사용하면 네트워크 보안 정책이 까다로운 환경에서도 100% 성공적으로 프로그램을 배포하거나 토큰을 발행할 수 있습니다.
