// src/screens/onboarding/LoginScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';

type Mode = 'login' | 'signup';

export function LoginScreen() {
  const { signInWithEmail, signUpWithEmail, loading } = useAuthStore();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      Alert.alert('Missing name', 'Please enter your name.');
      return;
    }

    const { error } = mode === 'login'
      ? await signInWithEmail(email.trim(), password)
      : await signUpWithEmail(email.trim(), password, name.trim());

    if (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Logo */}
        <View style={s.logoArea}>
          <Text style={s.logoEmoji}>🥦</Text>
          <Text style={s.logoTitle}>PrepPAL</Text>
          <Text style={s.logoSubtitle}>Your personal meal helper</Text>
        </View>

        {/* Form */}
        <View style={s.form}>
          {mode === 'signup' && (
            <TextInput
              style={s.input}
              placeholder="Your name"
              placeholderTextColor="#6b7280"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="next"
            />
          )}
          <TextInput
            style={s.input}
            placeholder="Email"
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
          />
          <TextInput
            style={s.input}
            placeholder="Password"
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <TouchableOpacity
            style={[s.btn, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#0f1117" />
            ) : (
              <Text style={s.btnText}>
                {mode === 'login' ? 'Log In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.switchBtn}
            onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
          >
            <Text style={s.switchText}>
              {mode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Log in'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logoArea: { alignItems: 'center', marginBottom: 40 },
  logoEmoji: { fontSize: 60, marginBottom: 12 },
  logoTitle: { fontSize: 38, fontWeight: '900', color: '#f9fafb', letterSpacing: -1 },
  logoSubtitle: { fontSize: 15, color: '#9ca3af', marginTop: 4 },
  form: { gap: 12 },
  input: {
    backgroundColor: '#1a1f2e', borderRadius: 14, padding: 16,
    fontSize: 16, color: '#f9fafb',
    borderWidth: 1, borderColor: '#374151',
  },
  btn: {
    backgroundColor: '#22c55e', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 4,
    shadowColor: '#22c55e', shadowOpacity: 0.35,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  btnText: { fontSize: 17, fontWeight: '700', color: '#0f1117' },
  switchBtn: { alignItems: 'center', paddingVertical: 12 },
  switchText: { fontSize: 14, color: '#22c55e' },
});
