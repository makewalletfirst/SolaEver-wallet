import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';

// 전역 Buffer 설정
global.Buffer = Buffer;
global.process = require('process');
global.process.env.NODE_ENV = __DEV__ ? 'development' : 'production';
global.process.nextTick = setImmediate;

// Uint8Array.prototype.slice 누락 방지 (일부 구형 JSC 엔진용)
if (typeof Uint8Array.prototype.slice !== 'function') {
  Uint8Array.prototype.slice = function(start, end) {
    return new Uint8Array(this.buffer, this.byteOffset + (start || 0), (end || this.byteLength) - (start || 0));
  };
}

// Crypto 설정
if (typeof global.crypto !== 'object') {
  global.crypto = {};
}
if (typeof global.crypto.getRandomValues !== 'function') {
  global.crypto.getRandomValues = (array) => {
    const { getRandomValues } = require('react-native-get-random-values');
    return getRandomValues(array);
  };
}

// Text Encoding
const { TextEncoder, TextDecoder } = require('text-encoding');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

console.log('SolaEver Wallet Shim Loaded Successfully');
