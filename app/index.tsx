import { StyleSheet, Text, View } from 'react-native';

export default function FoundationScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Checkout foundation</Text>
      <Text>Payment recovery is implemented and tested headlessly. Checkout controls arrive in Milestone 2.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: '#ffffff' },
  title: { fontSize: 24, fontWeight: '600' },
});
