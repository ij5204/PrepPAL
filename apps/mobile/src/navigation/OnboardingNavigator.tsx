// src/navigation/OnboardingNavigator.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/onboarding/LoginScreen';
import { CalorieGoalScreen } from '../screens/onboarding/CalorieGoalScreen';
import { FitnessGoalScreen } from '../screens/onboarding/FitnessGoalScreen';
import { DietaryRestrictionsScreen } from '../screens/onboarding/DietaryRestrictionsScreen';
import { AllergiesScreen } from '../screens/onboarding/AllergiesScreen';
import { PantrySetupScreen } from '../screens/onboarding/PantrySetupScreen';
import { NotificationsScreen } from '../screens/onboarding/NotificationsScreen';
import { OnboardingDoneScreen } from '../screens/onboarding/OnboardingDoneScreen';

export type OnboardingParamList = {
  Login: undefined;
  CalorieGoal: undefined;
  FitnessGoal: undefined;
  DietaryRestrictions: undefined;
  Allergies: undefined;
  PantrySetup: undefined;
  Notifications: undefined;
  Done: undefined;
};

const Stack = createNativeStackNavigator<OnboardingParamList>();

export function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0f1117' },
        headerTintColor: '#f9fafb',
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: '#0f1117' },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CalorieGoal" component={CalorieGoalScreen} options={{ title: 'Calorie Goal' }} />
      <Stack.Screen name="FitnessGoal" component={FitnessGoalScreen} options={{ title: 'Your Goal' }} />
      <Stack.Screen name="DietaryRestrictions" component={DietaryRestrictionsScreen} options={{ title: 'Dietary Preferences' }} />
      <Stack.Screen name="Allergies" component={AllergiesScreen} options={{ title: 'Allergies & Dislikes' }} />
      <Stack.Screen name="PantrySetup" component={PantrySetupScreen} options={{ title: 'Your Kitchen' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Stay Updated' }} />
      <Stack.Screen name="Done" component={OnboardingDoneScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
