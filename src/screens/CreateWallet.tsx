import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import * as bip39 from 'bip39';
import { keypairFromMnemonic } from '../lib/wallet';
import { saveWallet } from '../lib/keystore';

export default function CreateWallet({ navigation }: any) {
  const [mnemonic, setMnemonic] = useState('');
  const [walletName, setWalletName] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState(1);

  const goToMnemonic = () => {
    if (!walletName.trim() || !password.trim()) {
      Alert.alert('Error', '지갑 이름과 비밀번호를 모두 입력해 주세요.');
      return;
    }
    if (password.length < 4 || password.length > 16) {
      Alert.alert('Error', '비밀번호는 4자에서 16자 사이여야 합니다.');
      return;
    }
    const mn = bip39.generateMnemonic();
    setMnemonic(mn);
    setStep(2);
  };

  const completeCreation = async () => {
    try {
      const keypair = await keypairFromMnemonic(mnemonic);
      const address = keypair.publicKey.toBase58();
      
      await saveWallet({
        name: walletName,
        mnemonic: mnemonic,
        address: address,
        password: password
      });

      Alert.alert('Success', '지갑이 생성되었습니다.', [
        { text: '확인', onPress: () => navigation.replace('Home', { mnemonic }) }
      ]);
    } catch (e) {
      Alert.alert('Error', '지갑 저장 중 오류가 발생했습니다.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Wallet</Text>
      
      {step === 1 ? (
        <View style={styles.stepContainer}>
          <Text style={styles.label}>지갑 이름 설정</Text>
          <TextInput 
            style={styles.input} 
            placeholder="예: My Main Wallet" 
            value={walletName} 
            onChangeText={setWalletName}
          />

          <Text style={styles.label}>지갑 비밀번호 설정</Text>
          <TextInput 
            style={styles.input} 
            placeholder="4~16자리 입력" 
            secureTextEntry
            value={password} 
            onChangeText={setPassword}
          />

          <TouchableOpacity style={styles.button} onPress={goToMnemonic}>
            <Text style={styles.buttonText}>Generate Mnemonic</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.stepContainer}>
          <Text style={styles.warning}>
            아래 니모닉 코드를 반드시 안전한 곳에 기록하세요. 
            분실 시 지갑을 절대 복구할 수 없습니다.
          </Text>
          <View style={styles.mnemonicBox}>
            <Text style={styles.mnemonicText}>{mnemonic}</Text>
          </View>
          <TouchableOpacity style={styles.button} onPress={completeCreation}>
            <Text style={styles.buttonText}>I've backed it up</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep(1)}>
            <Text>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 25, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginTop: 50, marginBottom: 30, textAlign: 'center' },
  stepContainer: { flex: 1 },
  label: { fontSize: 16, color: '#666', marginBottom: 10, fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 15, marginBottom: 25, fontSize: 16 },
  warning: { color: '#ff3b30', backgroundColor: '#fff2f2', padding: 15, borderRadius: 10, marginBottom: 20, lineHeight: 22, fontWeight: 'bold' },
  mnemonicBox: { backgroundColor: '#f8f9fa', padding: 20, borderRadius: 15, marginBottom: 30, borderWidth: 1, borderColor: '#eee' },
  mnemonicText: { fontSize: 18, color: '#333', textAlign: 'center', lineHeight: 28, fontWeight: '500' },
  button: { backgroundColor: '#34c759', padding: 18, borderRadius: 15, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  cancelBtn: { alignItems: 'center', marginTop: 20, padding: 10 }
});
