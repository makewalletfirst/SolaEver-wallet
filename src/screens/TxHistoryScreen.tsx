import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, Clipboard, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { connection } from '../lib/connection';
import { PublicKey } from '@solana/web3.js';

export default function TxHistoryScreen({ navigation, route }: any) {
  const { address } = route.params;
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const pubkey = new PublicKey(address);
      const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 20 });
      
      const serverHistory = signatures.map(sig => ({
        signature: sig.signature,
        blockTime: sig.blockTime,
        err: sig.err,
        memo: sig.memo,
        status: sig.confirmationStatus
      }));

      const localKey = `history_v2_${address}`;
      const localData = await AsyncStorage.getItem(localKey);
      const localHistory = localData ? JSON.parse(localData) : [];
      
      const serverSigs = new Set(serverHistory.map(s => s.signature));
      const filteredLocal = localHistory.filter((l: any) => !serverSigs.has(l.signature));
      
      const combined = [...filteredLocal, ...serverHistory].sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0));
      
      setHistory(combined);
      await AsyncStorage.setItem(localKey, JSON.stringify(combined.slice(0, 50)));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const openExplorer = (sig: string) => {
    WebBrowser.openBrowserAsync(`https://solaever.ever-chain.xyz/tx/${sig}`);
  };

  const clearHistory = async () => {
    Alert.alert('Clear History', '전체 거래 내역을 삭제하시겠습니까?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        const localKey = `history_v2_${address}`;
        await AsyncStorage.removeItem(localKey);
        setHistory([]);
      }}
    ]);
  };

  const deleteTx = async (sig: string) => {
    Alert.alert('Delete Transaction', '이 항목을 삭제하시겠습니까?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const newHistory = history.filter(item => item.signature !== sig);
        setHistory(newHistory);
        const localKey = `history_v2_${address}`;
        await AsyncStorage.setItem(localKey, JSON.stringify(newHistory.slice(0, 50)));
        setSelectedTx(null);
      }}
    ]);
  };

  const renderItem = ({ item }: any) => {
    const date = item.blockTime ? new Date(item.blockTime * 1000).toLocaleString() : 'Pending...';
    const isError = !!item.err;
    
    // Improved Status Logic
    let statusText = 'Success';
    let statusStyle = styles.success;

    if (isError) {
      statusText = 'Failed';
      statusStyle = styles.error;
    } else if (item.status === 'finalized' || item.status === 'confirmed') {
      statusText = 'Success';
      statusStyle = styles.success;
    } else if (item.status === 'processed') {
      statusText = 'Processing';
      statusStyle = styles.success;
    } else if (item.isLocal) {
      statusText = 'Pending';
      statusStyle = styles.pending;
    }

    return (
      <TouchableOpacity style={styles.txItem} onPress={() => setSelectedTx(item)}>
        <View style={styles.txMain}>
          <Text style={styles.txSig} numberOfLines={1}>{item.signature}</Text>
          <Text style={styles.txDate}>{date}</Text>
        </View>
        <View style={styles.txStatus}>
          <Text style={[styles.statusBadge, statusStyle]}>
            {statusText}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>History</Text>
        <TouchableOpacity onPress={clearHistory} style={styles.clearBtnContainer}>
          <Text style={styles.clearBtn}>Clear All</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#34c759" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.signature}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.emptyText}>거래 내역이 없습니다.</Text>}
          contentContainerStyle={{ padding: 20 }}
        />
      )}

      {/* Tx Detail Modal */}
      <Modal 
        visible={!!selectedTx} 
        transparent 
        animationType="slide"
        onRequestClose={() => setSelectedTx(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transaction Detail</Text>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteTx(selectedTx?.signature)}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Signature</Text>
              <Text style={styles.detailValue}>{selectedTx?.signature}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status</Text>
              <Text style={[styles.detailValue, selectedTx?.err ? {color: '#ff3b30'} : {color: '#34c759'}, {fontWeight: 'bold'}]}>
                {selectedTx?.err ? 'Failed' : (selectedTx?.status ? 'Success (' + selectedTx.status + ')' : (selectedTx?.isLocal ? 'Pending' : 'Success'))}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>
                {selectedTx?.blockTime ? new Date(selectedTx.blockTime * 1000).toLocaleString() : '-'}
              </Text>
            </View>

            {selectedTx?.memo && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Memo</Text>
                <Text style={styles.detailValue}>{selectedTx.memo}</Text>
              </View>
            )}

            <TouchableOpacity 
              style={styles.explorerBtn} 
              onPress={() => openExplorer(selectedTx.signature)}
            >
              <Text style={styles.explorerBtnText}>View on Explorer</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedTx(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn: { color: '#34c759', fontSize: 16, fontWeight: 'bold' },
  clearBtnContainer: { backgroundColor: '#fff2f2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#ff3b30' },
  clearBtn: { color: '#ff3b30', fontSize: 12, fontWeight: 'bold' },
  title: { fontSize: 20, fontWeight: 'bold' },
  txItem: { flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 12, elevation: 2, alignItems: 'center' },
  txMain: { flex: 1 },
  txSig: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 5 },
  txDate: { fontSize: 12, color: '#999' },
  txStatus: { marginLeft: 10 },
  statusBadge: { fontSize: 10, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, overflow: 'hidden' },
  success: { backgroundColor: '#e8f5e9', color: '#34c759' },
  pending: { backgroundColor: '#fff9e6', color: '#ff9500' },
  error: { backgroundColor: '#fff2f2', color: '#ff3b30' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 30, minHeight: 400 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', flex: 1 },
  deleteBtn: { backgroundColor: '#fff2f2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#ff3b30' },
  deleteBtnText: { color: '#ff3b30', fontSize: 12, fontWeight: 'bold' },
  detailRow: { marginBottom: 20 },
  detailLabel: { fontSize: 12, color: '#999', marginBottom: 5, fontWeight: 'bold' },
  detailValue: { fontSize: 14, color: '#333', lineHeight: 20 },
  explorerBtn: { backgroundColor: '#34c759', padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 10 },
  explorerBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  closeBtn: { padding: 20, alignItems: 'center' },
  closeBtnText: { color: '#666', fontSize: 16 }
});
