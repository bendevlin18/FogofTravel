import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, StyleSheet } from 'react-native';
import MapScreen from '../screens/MapScreen';
import FlightsScreen from '../screens/FlightsScreen';
import StatsScreen from '../screens/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Map: '🗺',
    Flights: '✈',
    Stats: '📊',
    Settings: '⚙',
  };
  return (
    <Text style={[styles.icon, focused && styles.iconFocused]}>
      {icons[label] ?? '•'}
    </Text>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Map"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: '#4fc3f7',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      })}
    >
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Flights" component={FlightsScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#0f0f23',
    borderTopColor: '#222',
    borderTopWidth: 1,
    paddingTop: 4,
  },
  tabLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  icon: {
    fontSize: 20,
  },
  iconFocused: {
    fontSize: 22,
  },
});
