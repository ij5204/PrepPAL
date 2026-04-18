// src/navigation/TabNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { HomeScreen } from '../screens/home/HomeScreen';
import { PantryScreen } from '../screens/pantry/PantryScreen';
import { MealsScreen } from '../screens/meals/MealsScreen';
import { GroceryScreen } from '../screens/grocery/GroceryScreen';

export type TabParamList = {
  Home: undefined;
  Pantry: undefined;
  Meals: undefined;
  Grocery: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const icons: Record<string, string> = {
  Home: '🏠',
  Pantry: '🥦',
  Meals: '🍳',
  Grocery: '🛒',
};

export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.6 }}>
            {icons[route.name]}
          </Text>
        ),
        tabBarActiveTintColor: '#22c55e',
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: {
          backgroundColor: '#0f1117',
          borderTopColor: '#1f2937',
          paddingBottom: 6,
          paddingTop: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: { backgroundColor: '#0f1117' },
        headerTintColor: '#f9fafb',
        headerTitleStyle: { fontWeight: '700' },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Pantry" component={PantryScreen} />
      <Tab.Screen name="Meals" component={MealsScreen} options={{ title: 'Meal Ideas' }} />
      <Tab.Screen name="Grocery" component={GroceryScreen} options={{ title: 'Grocery List' }} />
    </Tab.Navigator>
  );
}
