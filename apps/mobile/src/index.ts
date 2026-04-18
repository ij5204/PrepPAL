// src/index.ts (entry point registered in package.json "main")
import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
