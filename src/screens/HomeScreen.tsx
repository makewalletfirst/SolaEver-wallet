import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, ScrollView, Alert, Clipboard, TextInput, Modal, Image, ToastAndroid, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as LocalAuthentication from 'expo-local-authentication';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { PublicKey } from '@solana/web3.js';
import { keypairFromMnemonic } from '../lib/wallet';
import { getBalance } from '../lib/transfer';
import { getTokenBalance, getTokenInfo, fetchTokenMetadata } from '../lib/token';
import { setCurrentWallet, getCurrentWallet } from '../lib/keystore';

const TOKEN_LOGO_NATIVE = require('../../assets/sletoken.png');

export default function HomeScreen({ navigation, route }: any) {
  const { mnemonic } = route.params;
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [tokens, setTokens] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  
  // Modals
  const [isAddTokenModalVisible, setAddTokenModalVisible] = useState(false);
  const [isMnemonicVisible, setMnemonicVisible] = useState(false);
  const [isReceiveModalVisible, setReceiveModalVisible] = useState(false);
  const [isPassModalVisible, setPassModalVisible] = useState(false);
  const [selectedToken, setSelectedToken] = useState<any>(null);
  
  // States
  const [newTokenMint, setNewTokenMint] = useState('');
  const [inputPass, setInputPass] = useState('');
  const [isScannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const loadSavedTokens = async (ownerAddr: string) => {
    try {
      const saved = await AsyncStorage.getItem(`tokens_${ownerAddr}`);
      const mintList = saved ? JSON.parse(saved) : [];
      const tokenData = await Promise.all(mintList.map(async (mint: string) => {
        // balance + Metaplex metadata 동시 fetch
        const [bal, meta] = await Promise.all([
          getTokenBalance(mint, ownerAddr),
          fetchTokenMetadata(mint),
        ]);
        return {
          mint,
          balance: bal,
          symbol: meta.symbol,
          name: meta.name,
          imageUri: meta.imageUri || '',
        };
      }));
      setTokens(tokenData);
    } catch (e) { console.error(e); }
  };

  const loadWallet = useCallback(async () => {
    try {
      const keypair = await keypairFromMnemonic(mnemonic);
      const pubkey = keypair.publicKey.toBase58();
      setAddress(pubkey);
      const bal = await getBalance(pubkey);
      setBalance(bal);
      await loadSavedTokens(pubkey);
      setIsOnline(true);
    } catch (error: any) {
      setIsOnline(false);
      ToastAndroid.show('잔고 로딩 실패', ToastAndroid.SHORT);
    }
  }, [mnemonic]);

  useEffect(() => { loadWallet(); }, [loadWallet]);

  // 자동 새로고침 (5초마다 잔고 업데이트)
  useEffect(() => {
    const interval = setInterval(() => {
      loadWallet();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadWallet]);

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    ToastAndroid.show('클립보드에 복사했어요', ToastAndroid.SHORT);
  };

  const handleViewMnemonic = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: '니모닉 확인 인증' });
      if (result.success) { setMnemonicVisible(true); return; }
    }
    setPassModalVisible(true);
  };

  const verifyPassword = async () => {
    const wallet = await getCurrentWallet();
    if (inputPass === wallet?.password) {
      setPassModalVisible(false);
      setInputPass('');
      setMnemonicVisible(true);
    } else {
      Alert.alert('오류', '비밀번호가 일치하지 않습니다.');
    }
  };

  const deleteToken = async (mint: string) => {
    Alert.alert('토큰 삭제', '이 토큰을 목록에서 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        const saved = await AsyncStorage.getItem(`tokens_${address}`);
        let mintList = saved ? JSON.parse(saved) : [];
        mintList = mintList.filter((m: string) => m !== mint);
        await AsyncStorage.setItem(`tokens_${address}`, JSON.stringify(mintList));
        setSelectedToken(null);
        loadWallet();
      }}
    ]);
  };

  const handleAddToken = async () => {
    if (!newTokenMint) return;
    try {
      new PublicKey(newTokenMint);
    } catch (e) {
      Alert.alert('에러', '유효한 솔라나 토큰 주소가 아닙니다.');
      return;
    }
    const saved = await AsyncStorage.getItem(`tokens_${address}`);
    const mintList = saved ? JSON.parse(saved) : [];
    if (!mintList.includes(newTokenMint)) {
      await AsyncStorage.setItem(`tokens_${address}`, JSON.stringify([...mintList, newTokenMint]));
      setNewTokenMint(''); setAddTokenModalVisible(false); loadWallet();
    } else {
      Alert.alert('알림', '이미 추가된 토큰입니다.');
    }
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) { Alert.alert('권한 필요', '카메라 권한이 필요합니다.'); return; }
    }
    setScannerVisible(true);
  };

  const handleScanToken = ({ data }: { data: string }) => {
    setNewTokenMint(data);
    setScannerVisible(false);
  };

  const handleLogout = async () => {
    await setCurrentWallet(null);
    navigation.replace('Welcome');
  };

  const openTokenExplorer = (mint: string) => {
    WebBrowser.openBrowserAsync(`https://solaever.ever-chain.xyz/address/${mint}`);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWallet();
    setRefreshing(false);
  };

  return (
    <ScrollView 
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleContainer}>
            <Image source={TOKEN_LOGO_NATIVE} style={styles.headerLogo} resizeMode="contain" />
            <Text style={styles.title}>SolaEver</Text>
            <View style={styles.onlineBadge}>
              <View style={[styles.onlineDot, { backgroundColor: isOnline ? '#34c759' : '#ff3b30' }]} />
              <Text style={[styles.onlineText, { color: isOnline ? '#34c759' : '#ff3b30' }]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleViewMnemonic} style={styles.mnemonicBtn}>
            <Text style={styles.mnemonicBtnText}>{"View\nMnemonic"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>NATIVE BALANCE</Text>
        <View style={styles.balanceRow}>
          <View style={[styles.tokenLogoContainer, { borderWidth: 2, borderColor: '#fff' }]}>
            <Image source={TOKEN_LOGO_NATIVE} style={styles.cardTokenLogo} resizeMode="contain" />
          </View>
          <Text style={styles.balance}>{balance !== null ? `${balance.toLocaleString()} SLE` : '---'}</Text>
        </View>
        <View style={styles.addressRow}>
          <Text style={styles.address} numberOfLines={1} ellipsizeMode="middle">{address}</Text>
          <TouchableOpacity onPress={() => setReceiveModalVisible(true)} style={styles.copyBtn}>
            <Text style={styles.copyBtnText}>Receive</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionTitle}>My Tokens</Text>
      <View style={styles.tokenListWrapper}>
        <ScrollView nestedScrollEnabled={true}>
          {tokens.length === 0 ? (
            <Text style={styles.emptyText}>등록된 토큰이 없습니다.</Text>
          ) : (
            tokens.map((item, index) => {
              // metadata 이미 loadSavedTokens 에서 fetch 됨 — fallback 으로 hardcoded
              const fallback = getTokenInfo(item.mint);
              const symbol = item.symbol || fallback.symbol;
              const name = item.name || fallback.name;
              return (
                <TouchableOpacity key={index} style={styles.tokenItem} onPress={() => setSelectedToken({...item, symbol, name})}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    {item.imageUri ? (
                      <Image
                        source={{ uri: item.imageUri }}
                        style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#fff' }}
                      />
                    ) : (
                      <View style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{(symbol || '?').slice(0, 3)}</Text>
                      </View>
                    )}
                    <View>
                      <Text style={styles.tokenSymbol}>{symbol}</Text>
                      <Text style={styles.tokenMint}>{item.mint.slice(0, 4)}...{item.mint.slice(-4)}</Text>
                    </View>
                  </View>
                  <Text style={styles.tokenBalance}>{item.balance.toLocaleString()} {symbol}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      <TouchableOpacity style={styles.addBtn} onPress={() => setAddTokenModalVisible(true)}>
        <Text style={styles.addBtnText}>+ Add Token Mint</Text>
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Send', { mnemonic, tokenList: tokens.map(t => ({ mint: t.mint, symbol: t.symbol || 'TOKEN', name: t.name || '' })) })}>
          <Text style={styles.actionButtonText}>Send Assets</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.historyButton} onPress={() => navigation.navigate('TxHistory', { address })}>
          <Text style={styles.historyButtonText}>Transaction History</Text>
        </TouchableOpacity>
      </View>

      {/* Receive Modal */}
      <Modal visible={isReceiveModalVisible} transparent animationType="fade" onRequestClose={() => setReceiveModalVisible(false)}>
        <View style={styles.modalBg}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Receive Assets</Text>
            <View style={styles.qrContainer}><QRCode value={address} size={200} /></View>
            <Text style={styles.qrAddressText}>{address}</Text>
            <TouchableOpacity style={styles.actionButton} onPress={() => copyToClipboard(address)}><Text style={styles.actionButtonText}>Copy Address</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setReceiveModalVisible(false)}><Text>Close</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* Token Detail Modal */}
      <Modal visible={!!selectedToken} transparent animationType="slide" onRequestClose={() => setSelectedToken(null)}>
        <View style={styles.modalBg}><View style={[styles.modalContent, { minHeight: 300 }]}>
            <Text style={styles.modalTitle}>Token Detail</Text>
            
            <View style={[styles.detailRow, {flexDirection:'row', justifyContent:'space-between', alignItems:'center'}]}>
              <View>
                <Text style={styles.detailLabel}>Name</Text>
                <Text style={styles.detailValue}>{selectedToken?.name}</Text>
              </View>
              {/* 삭제 버튼을 이름 우측에 배치 */}
              <TouchableOpacity style={styles.miniDeleteBtn} onPress={() => deleteToken(selectedToken.mint)}>
                <Text style={styles.miniDeleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.detailRow}><Text style={styles.detailLabel}>Symbol</Text><Text style={styles.detailValue}>{selectedToken?.symbol}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Mint Address</Text><Text style={[styles.detailValue, { fontSize: 11 }]}>{selectedToken?.mint}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Balance</Text><Text style={[styles.detailValue, { fontWeight: 'bold', fontSize: 18 }]}>{selectedToken?.balance?.toLocaleString()} {selectedToken?.symbol}</Text></View>
            
            <TouchableOpacity style={styles.actionButton} onPress={() => openTokenExplorer(selectedToken.mint)}>
              <Text style={styles.actionButtonText}>View on Explorer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectedToken(null)}><Text>Close</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* Add Token Modal */}
      <Modal visible={isAddTokenModalVisible} transparent animationType="slide" onRequestClose={() => setAddTokenModalVisible(false)}>
        <View style={styles.modalBg}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add SPL Token</Text>
            <View style={styles.labelRow}>
                <Text style={styles.label}>Token Mint Address</Text>
                <TouchableOpacity onPress={openScanner}><Text style={{color:'#34c759', fontWeight:'bold'}}>[QR Scan]</Text></TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder="Mint Address" value={newTokenMint} onChangeText={setNewTokenMint} autoCapitalize="none" />
            <TouchableOpacity style={styles.actionButton} onPress={handleAddToken}><Text style={styles.actionButtonText}>Add Token</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setAddTokenModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* QR Scanner Modal */}
      <Modal visible={isScannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <View style={styles.scannerContainer}>
          <CameraView style={StyleSheet.absoluteFillObject} onBarcodeScanned={handleScanToken} />
          <View style={styles.scannerOverlay}>
            <TouchableOpacity style={styles.closeScannerBtn} onPress={() => setScannerVisible(false)}><Text style={{color:'#fff'}}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Password Modal */}
      <Modal visible={isPassModalVisible} transparent animationType="fade" onRequestClose={() => setPassModalVisible(false)}>
        <View style={styles.modalBg}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>비밀번호 인증</Text>
            <TextInput style={styles.input} placeholder="Password" secureTextEntry value={inputPass} onChangeText={setInputPass} />
            <TouchableOpacity style={styles.actionButton} onPress={verifyPassword}><Text style={styles.actionButtonText}>확인</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setPassModalVisible(false)}><Text>취소</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* Mnemonic View Modal */}
      <Modal visible={isMnemonicVisible} transparent animationType="fade" onRequestClose={() => setMnemonicVisible(false)}>
        <View style={styles.modalBg}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Your Mnemonic</Text>
            <View style={styles.mnemonicBox}><Text style={styles.mnemonicText}>{mnemonic}</Text></View>
            <TouchableOpacity style={styles.actionButton} onPress={() => copyToClipboard(mnemonic)}><Text style={styles.actionButtonText}>Copy to Clipboard</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setMnemonicVisible(false)}><Text>Close</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#f8f9fa', flexGrow: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 20 },
  headerLeft: { flexShrink: 1, marginRight: 5 },
  titleContainer: { flexDirection: 'row', alignItems: 'center', zIndex: 100 },
  title: { fontSize: 24, fontWeight: 'bold', marginRight: 5, color: '#333' },
  headerLogo: { width: 32, height: 32, marginRight: 8, zIndex: 102 },
  headerRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  logoutText: { color: '#ff3b30', marginLeft: 8, fontWeight: '600', fontSize: 11 },
  mnemonicBtn: { backgroundColor: '#e8f5e9', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  mnemonicBtnText: { color: '#34c759', fontSize: 9, fontWeight: 'bold', textAlign: 'center', lineHeight: 11 },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20, marginLeft: 2 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  onlineText: { fontSize: 9, fontWeight: 'bold' },
  card: { backgroundColor: '#34c759', borderRadius: 20, padding: 25, marginBottom: 30, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, zIndex: 10, overflow: 'visible' },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 15, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, zIndex: 11, overflow: 'visible', marginLeft: -12 },
  tokenLogoContainer: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginRight: 15, elevation: 2, zIndex: 12, overflow: 'visible' },
  cardTokenLogo: { width: 36, height: 36, zIndex: 13 },
  balance: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  addressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', paddingTop: 15 },
  address: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace', marginRight: 10 },
  copyBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5 },
  copyBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  
  tokenListWrapper: { maxHeight: 185, marginBottom: 10 }, // 2.5개 정도 보이도록 185px로 조정 (기존 200px)
  tokenItem: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, elevation: 1 },
  tokenSymbol: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  tokenMint: { fontSize: 12, color: '#999' },
  tokenBalance: { fontSize: 16, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#999', padding: 20 },

  addBtn: { alignItems: 'center', padding: 10, marginBottom: 20 },
  addBtnText: { color: '#34c759', fontWeight: 'bold' },
  actions: { marginTop: 10 },
  actionButton: { backgroundColor: '#34c759', padding: 18, borderRadius: 15, alignItems: 'center' },
  actionButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  historyButton: { borderWidth: 1, borderColor: '#34c759', padding: 15, borderRadius: 15, alignItems: 'center', marginTop: 15 },
  historyButtonText: { color: '#34c759', fontWeight: 'bold' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 25 },
  modalContent: { backgroundColor: '#fff', borderRadius: 25, padding: 30, elevation: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  mnemonicBox: { backgroundColor: '#f8f9fa', padding: 20, borderRadius: 15, marginBottom: 25, borderWidth: 1, borderColor: '#eee' },
  mnemonicText: { fontSize: 17, color: '#333', lineHeight: 26, textAlign: 'center', fontWeight: '500' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 15, marginBottom: 25, fontSize: 16 },
  qrContainer: { alignItems: 'center', marginVertical: 20, padding: 20, backgroundColor: '#fff', borderRadius: 20, elevation: 5 },
  qrAddressText: { fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 20, fontFamily: 'monospace' },
  cancelBtn: { alignItems: 'center', marginTop: 20, padding: 10 },
  detailRow: { marginBottom: 15 },
  detailLabel: { fontSize: 12, color: '#999', marginBottom: 2 },
  detailValue: { fontSize: 14, color: '#333' },
  miniDeleteBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fff2f2', borderWidth: 1, borderColor: '#ff3b30' },
  miniDeleteBtnText: { color: '#ff3b30', fontSize: 12, fontWeight: 'bold' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 50 },
  closeScannerBtn: { backgroundColor: '#ff3b30', padding: 15, borderRadius: 10 }
});
