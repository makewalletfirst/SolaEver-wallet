import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View, Alert, Text, TouchableOpacity, TextInput, Modal, StyleSheet } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import WelcomeScreen from './src/screens/WelcomeScreen';
import CreateWallet from './src/screens/CreateWallet';
import RestoreWallet from './src/screens/RestoreWallet';
import HomeScreen from './src/screens/HomeScreen';
import SendScreen from './src/screens/SendScreen';
import TxHistoryScreen from './src/screens/TxHistoryScreen';
import { getCurrentWallet, WalletInfo } from './src/lib/keystore';

type RootStackParamList = {
  Welcome: undefined;
  CreateWallet: undefined;
  RestoreWallet: undefined;
  Home: { mnemonic: string };
  Send: { mnemonic: string; tokenList: string[] };
  TxHistory: { address: string };
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [initialWallet, setInitialWallet] = useState<WalletInfo | null>(null);
  const [showPassModal, setShowPassModal] = useState(false);
  const [inputPass, setInputPass] = useState('');

  const handleAuthentication = async () => {
    try {
      const wallet = await getCurrentWallet();
      if (!wallet) {
        setAuthenticated(true);
        return;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'SolaEver 지갑 인증',
        });
        if (result.success) {
          setAuthenticated(true);
          return;
        }
      }
      
      setShowPassModal(true);
    } catch (e) {
      setShowPassModal(true);
    }
  };

  const verifyPassword = () => {
    if (inputPass === initialWallet?.password) {
      setAuthenticated(true);
      setShowPassModal(false);
    } else {
      Alert.alert('오류', '비밀번호가 일치하지 않습니다.');
    }
  };

  useEffect(() => {
    async function checkWallet() {
      try {
        const wallet = await getCurrentWallet();
        if (wallet) {
          setInitialWallet(wallet);
          await handleAuthentication();
        } else {
          setAuthenticated(true);
        }
      } catch (e) {
        setAuthenticated(true);
      } finally {
        setLoading(false);
      }
    }
    checkWallet();
  }, []);

  if (loading || (!authenticated && !showPassModal)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#34c759" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName={initialWallet ? 'Home' : 'Welcome'}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="CreateWallet" component={CreateWallet} />
        <Stack.Screen name="RestoreWallet" component={RestoreWallet} />
        <Stack.Screen name="Home" component={HomeScreen} initialParams={initialWallet ? { mnemonic: initialWallet.mnemonic } : undefined} />
        <Stack.Screen name="Send" component={SendScreen} />
        <Stack.Screen name="TxHistory" component={TxHistoryScreen} />
      </Stack.Navigator>

      {/* Password Fallback Modal */}
      <Modal visible={showPassModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>비밀번호 입력</Text>
            <Text style={styles.modalSub}>생체인식 실패 시 설정한 비밀번호를 입력하세요.</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Password" 
              secureTextEntry 
              value={inputPass}
              onChangeText={setInputPass}
            />
            <TouchableOpacity style={styles.btn} onPress={verifyPassword}>
              <Text style={styles.btnText}>인증하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 30 },
  modalContent: { backgroundColor: '#fff', borderRadius: 20, padding: 25 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  modalSub: { fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 15, marginBottom: 20, textAlign: 'center', fontSize: 18 },
  btn: { backgroundColor: '#34c759', padding: 15, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
