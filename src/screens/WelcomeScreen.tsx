import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, TextInput } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as LocalAuthentication from 'expo-local-authentication';
import { loadWallets, setCurrentWallet, deleteWallet, WalletInfo } from '../lib/keystore';

type RootStackParamList = {
  Welcome: undefined;
  CreateWallet: undefined;
  RestoreWallet: undefined;
  Home: { mnemonic: string };
};

type WelcomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Welcome'>;

interface Props {
  navigation: WelcomeScreenNavigationProp;
}

export default function WelcomeScreen({ navigation }: Props) {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showPassModal, setShowPassModal] = useState(false);
  const [targetWallet, setInitialTarget] = useState<{wallet: WalletInfo, mode: 'login' | 'delete'} | null>(null);
  const [inputPass, setInputPass] = useState('');

  const fetchWallets = async () => {
    setLoading(true);
    const list = await loadWallets();
    setWallets(list);
    setLoading(false);
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchWallets();
    });
    return unsubscribe;
  }, [navigation]);

  const handleAuthAction = async (wallet: WalletInfo, mode: 'login' | 'delete') => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: mode === 'login' ? `${wallet.name} 지갑 접속 인증` : `${wallet.name} 지갑 삭제 인증`,
      });
      if (result.success) {
        mode === 'login' ? executeLogin(wallet) : executeDelete(wallet);
        return;
      }
    }
    
    setInitialTarget({ wallet, mode });
    setShowPassModal(true);
  };

  const verifyPassword = () => {
    if (inputPass === targetWallet?.wallet.password) {
      const { wallet, mode } = targetWallet;
      setShowPassModal(false);
      setInputPass('');
      mode === 'login' ? executeLogin(wallet) : executeDelete(wallet);
    } else {
      Alert.alert('오류', '비밀번호가 일치하지 않습니다.');
    }
  };

  const executeLogin = async (wallet: WalletInfo) => {
    await setCurrentWallet(wallet.address);
    navigation.replace('Home', { mnemonic: wallet.mnemonic });
  };

  const executeDelete = (wallet: WalletInfo) => {
    Alert.alert(
      '지갑 삭제',
      `'${wallet.name}' 지갑을 목록에서 삭제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        { 
          text: '삭제', 
          style: 'destructive', 
          onPress: async () => {
            await deleteWallet(wallet.address);
            fetchWallets();
          } 
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SolaEver Wallet</Text>
      <Text style={styles.subtitle}>Welcome to SLE Network</Text>
      
      {loading ? (
        <ActivityIndicator size="large" color="#34c759" />
      ) : (
        <View style={styles.walletListContainer}>
          {wallets.length > 0 && <Text style={styles.sectionTitle}>Saved Wallets</Text>}
          <ScrollView style={styles.scrollView}>
            {wallets.map((w, i) => (
              <View key={i} style={styles.walletItem}>
                <TouchableOpacity 
                  style={styles.walletInfo} 
                  onPress={() => handleAuthAction(w, 'login')}
                >
                  <Text style={styles.walletName}>{w.name}</Text>
                  <Text style={styles.walletAddress}>{w.address.slice(0, 8)}...{w.address.slice(-8)}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.deleteBtn}
                  onPress={() => handleAuthAction(w, 'delete')}
                >
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('CreateWallet')}>
          <Text style={styles.buttonText}>Create New Wallet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => navigation.navigate('RestoreWallet')}>
          <Text style={styles.secondaryButtonText}>Restore Wallet</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showPassModal} transparent animationType="slide" onRequestClose={() => setShowPassModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>비밀번호 인증</Text>
            <TextInput 
              style={styles.passInput} 
              placeholder="Password" 
              secureTextEntry 
              value={inputPass}
              onChangeText={setInputPass}
              autoFocus
            />
            <TouchableOpacity style={styles.button} onPress={verifyPassword}>
              <Text style={styles.buttonText}>인증하기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPassModal(false)}>
              <Text>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: 'bold', marginTop: 60, textAlign: 'center', color: '#333' },
  subtitle: { fontSize: 18, color: '#666', marginBottom: 40, textAlign: 'center' },
  walletListContainer: { flex: 1, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#999', marginBottom: 10, textTransform: 'uppercase' },
  scrollView: { flex: 1 },
  walletItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa', borderRadius: 15, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  walletInfo: { flex: 1 },
  walletName: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  walletAddress: { fontSize: 12, color: '#888', fontFamily: 'monospace' },
  deleteBtn: { padding: 10 },
  deleteBtnText: { color: '#ff3b30', fontWeight: '600' },
  footer: { paddingBottom: 20 },
  button: { backgroundColor: '#34c759', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginBottom: 12, elevation: 2 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  secondaryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#34c759' },
  secondaryButtonText: { color: '#34c759', fontSize: 18, fontWeight: 'bold' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 30 },
  modalContent: { backgroundColor: '#fff', borderRadius: 25, padding: 30, elevation: 20 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  passInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 15, marginBottom: 20, fontSize: 18, textAlign: 'center' },
  cancelBtn: { alignItems: 'center', marginTop: 10, padding: 10 }
});
