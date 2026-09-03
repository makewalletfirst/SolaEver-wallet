import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, ScrollView, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { keypairFromMnemonic } from '../lib/wallet';
import { sendSLE } from '../lib/transfer';
import { sendSPLToken, getTokenInfo } from '../lib/token';
import * as LocalAuthentication from 'expo-local-authentication';

export default function SendScreen({ navigation, route }: any) {
  const { mnemonic, tokenList } = route.params;
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState('SLE');
  const [isScannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const handleScan = ({ data }: { data: string }) => {
    setToAddress(data);
    setScannerVisible(false);
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('권한 필요', '카메라 권한이 필요합니다.');
        return;
      }
    }
    setScannerVisible(true);
  };

  const saveTxLocally = async (signature: string, addr: string) => {
    try {
      const key = `history_v2_${addr}`;
      const saved = await AsyncStorage.getItem(key);
      const history = saved ? JSON.parse(saved) : [];
      
      let assetName = 'SLE';
      if (selectedAsset !== 'SLE') {
        // 1) tokenList 에 metadata 가 같이 넘어왔으면 그 symbol 우선 사용 (mSOLA, lnSOLA 등)
        // 2) 못 찾으면 hardcoded COMMON_TOKENS fallback
        const found = tokenList.find((t: any) => (typeof t === 'string' ? t : t.mint) === selectedAsset);
        assetName = (found && typeof found === 'object' && found.symbol) || getTokenInfo(selectedAsset).symbol;
      }

      const newTx = {
        signature,
        blockTime: Math.floor(Date.now() / 1000),
        err: null,
        memo: `Sent ${amount} ${assetName}`,
        isLocal: true
      };

      await AsyncStorage.setItem(key, JSON.stringify([newTx, ...history].slice(0, 50)));
    } catch (e) { console.error("Local save failed", e); }
  };

  const authenticateBeforeSend = async (): Promise<boolean> => {
    // 지문 / FaceID 가 디바이스에 등록돼있는지 확인
    const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
    const isEnrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
    if (!hasHardware || !isEnrolled) {
      // 생체인증 불가 시 디바이스 PIN/패턴/비밀번호로 fallback (disableDeviceFallback: false)
    }
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: '송금 확인을 위해 인증해 주세요',
      cancelLabel: '취소',
      fallbackLabel: '비밀번호 사용',
      disableDeviceFallback: false,
    });
    return res.success;
  };

  const handleSend = async () => {
    if (!toAddress || !amount) {
      Alert.alert('에러', '모든 필드를 입력해 주세요.');
      return;
    }
    const parsed = parseFloat(amount);
    if (!isFinite(parsed) || parsed <= 0) {
      Alert.alert('에러', '올바른 금액을 입력해 주세요.');
      return;
    }

    // ── 송금 전 지문/비밀번호 인증 ──
    try {
      const ok = await authenticateBeforeSend();
      if (!ok) {
        Alert.alert('인증 취소', '인증이 완료되지 않아 전송을 중단했습니다.');
        return;
      }
    } catch (e: any) {
      Alert.alert('인증 실패', e?.message || '인증 중 오류가 발생했습니다.');
      return;
    }

    setLoading(true);
    try {
      const senderKeypair = await keypairFromMnemonic(mnemonic);
      let signature = '';

      if (selectedAsset === 'SLE') {
        signature = await sendSLE(senderKeypair, toAddress, parsed);
      } else {
        // sendSPLToken 내부에서 잔액 부족 / on-chain err 시 throw — Alert 으로 정확한 메시지 전달
        signature = await sendSPLToken(senderKeypair, selectedAsset, toAddress, parsed);
      }

      await saveTxLocally(signature, senderKeypair.publicKey.toBase58());

      Alert.alert('전송 성공', `트랜잭션이 완료되었습니다!`, [
        { text: '확인', onPress: () => navigation.goBack() }
      ]);
    } catch (error: any) {
      Alert.alert('전송 실패', error?.message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Send Assets</Text>
      
      <Text style={styles.label}>Select Asset</Text>
      <View style={styles.assetSelector}>
        <TouchableOpacity 
          style={[styles.assetOption, selectedAsset === 'SLE' && styles.selectedAsset]} 
          onPress={() => setSelectedAsset('SLE')}
        >
          <Text style={selectedAsset === 'SLE' ? styles.selectedText : {}}>SLE (Native)</Text>
        </TouchableOpacity>
        {tokenList.map((entry: any) => {
          // 새 형식 (객체 {mint, symbol, name}) 와 옛 형식 (문자열 mint) 둘 다 호환
          const mint = typeof entry === 'string' ? entry : entry.mint;
          const symbol = (typeof entry === 'object' && entry.symbol) || getTokenInfo(mint).symbol;
          return (
            <TouchableOpacity
              key={mint}
              style={[styles.assetOption, selectedAsset === mint && styles.selectedAsset]}
              onPress={() => setSelectedAsset(mint)}
            >
              <Text style={selectedAsset === mint ? styles.selectedText : {}} numberOfLines={1}>{symbol} (SPL)</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Recipient Address</Text>
          <TouchableOpacity onPress={openScanner}>
            <Text style={styles.scanBtnText}>[QR Scan]</Text>
          </TouchableOpacity>
        </View>
        <TextInput 
          style={styles.input} 
          placeholder="Solana Address" 
          value={toAddress} 
          onChangeText={setToAddress} 
          autoCapitalize="none" 
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Amount</Text>
        <TextInput style={styles.input} placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      </View>

      <TouchableOpacity style={[styles.button, loading && styles.disabled]} onPress={handleSend} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send Now</Text>}
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()} disabled={loading}>
        <Text>Cancel</Text>
      </TouchableOpacity>

      <Modal visible={isScannerVisible} animationType="slide">
        <View style={styles.scannerContainer}>
          <CameraView 
            style={StyleSheet.absoluteFillObject} 
            onBarcodeScanned={handleScan}
          />
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerText}>Scan Recipient's QR Code</Text>
            <TouchableOpacity style={styles.closeScannerBtn} onPress={() => setScannerVisible(false)}>
              <Text style={styles.closeScannerBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginTop: 40, marginBottom: 30 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#666', marginBottom: 10 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scanBtnText: { color: '#34c759', fontWeight: 'bold' },
  assetSelector: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  assetOption: { padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginRight: 10, marginBottom: 10 },
  selectedAsset: { backgroundColor: '#34c759', borderColor: '#34c759' },
  selectedText: { color: '#fff', fontWeight: 'bold' },
  inputGroup: { marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 15, fontSize: 16, backgroundColor: '#f9f9f9' },
  button: { backgroundColor: '#34c759', padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 20 },
  disabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  cancelButton: { alignItems: 'center', marginTop: 20, padding: 10 },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 50 },
  scannerText: { color: '#fff', fontSize: 18, marginBottom: 20, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 5 },
  closeScannerBtn: { backgroundColor: '#ff3b30', padding: 15, borderRadius: 10, minWidth: 100, alignItems: 'center' },
  closeScannerBtnText: { color: '#fff', fontWeight: 'bold' }
});
