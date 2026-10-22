import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import WebViewShell from '@/components/WebViewShell';
import { AuthBootstrap } from '@/components/AuthBootstrap';
import { colors } from '@/theme';

const isNative = require('react-native').Platform.OS !== 'web';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root}>
          <StatusBar style="dark" />
          {/*
            Stack tetap dipasang supaya expo-router punya navigator di semua platform.
            Di Android/iOS, WebView shell menutupi seluruh layar di atas Stack.
          */}
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'fade',
            }}
          />
          {isNative ? (
            <View style={StyleSheet.absoluteFill}>
              <WebViewShell />
            </View>
          ) : (
            <AuthBootstrap />
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
