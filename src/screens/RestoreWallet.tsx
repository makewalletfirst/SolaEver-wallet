import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import * as bip39 from 'bip39';
import { keypairFromMnemonic } from '../lib/wallet';
import { saveWallet } from '../lib/keystore';

export default function RestoreWallet({ navigation }: any) {
  const [mnemonic, setMnemonic] = useState('');
  const [walletName, setWalletName] = useState('');
  const [password, setPassword] = useState('');

  const handleRestore = async () => {
    if (!walletName.trim() || !password.trim()) {
      Alert.alert('Error', '지갑 이름과 비밀번호를 모두 입력해 주세요.');
      return;
    }
    if (password.length < 4 || password.length > 16) {
      Alert.alert('Error', '비밀번호는 4자에서 16자 사이여야 합니다.');
      return;
    }
    if (!bip39.validateMnemonic(mnemonic.trim())) {
      Alert.alert('Error', '유효하지 않은 니모닉 코드입니다.');
      return;
    }

    try {
      const keypair = await keypairFromMnemonic(mnemonic.trim());
      const address = keypair.publicKey.toBase58();

      await saveWallet({
        name: walletName,
        mnemonic: mnemonic.trim(),
        address: address,
        password: password
      });

      Alert.alert('Success', '지갑이 복구되었습니다.', [
        { text: '확인', onPress: () => navigation.replace('Home', { mnemonic: mnemonic.trim() }) }
      ]);
    } catch (e) {
      Alert.alert('Error', '지갑 복구 중 오류가 발생했습니다.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Restore Wallet</Text>
      
      <Text style={styles.label}>지갑 이름 설정</Text>
      <TextInput 
        style={styles.input} 
        placeholder="예: My Old Wallet" 
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

      <Text style={styles.label}>니모닉 코드 입력 (12 or 24 words)</Text>
      <TextInput 
        style={[styles.input, styles.textArea]} 
        placeholder="word1 word2 ..." 
        multiline 
        numberOfLines={4}
        value={mnemonic} 
        onChangeText={setMnemonic}
        autoCapitalize="none"
      />

      <TouchableOpacity style={styles.button} onPress={handleRestore}>
        <Text style={styles.buttonText}>Restore Now</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
        <Text>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 25, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginTop: 50, marginBottom: 30, textAlign: 'center' },
  label: { fontSize: 16, color: '#666', marginBottom: 10, fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 15, marginBottom: 25, fontSize: 16 },
  textArea: { height: 120, textAlignVertical: 'top' },
  button: { backgroundColor: '#34c759', padding: 18, borderRadius: 15, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  cancelBtn: { alignItems: 'center', marginTop: 20, padding: 10 }
});
