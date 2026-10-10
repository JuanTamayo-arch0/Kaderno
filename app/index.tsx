import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { C } from '../lib/theme';

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.brand} size="large" />
      </View>
    );
  }
  return <Redirect href={session ? '/(tabs)' : '/login'} />;
}
