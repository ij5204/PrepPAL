import React, { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={s.wrap}>
          <Text style={s.title}>Something went wrong</Text>
          <Text style={s.body}>
            PrepPAL hit an unexpected issue. Restart the app to continue planning meals.
          </Text>
          <TouchableOpacity
            style={s.btn}
            onPress={() => this.setState({ hasError: false })}
            accessibilityRole="button"
          >
            <Text style={s.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#0f1117',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#f9fafb', marginBottom: 10 },
  body: { fontSize: 15, color: '#9ca3af', lineHeight: 22, marginBottom: 24 },
  btn: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '700', color: '#0f1117' },
});
