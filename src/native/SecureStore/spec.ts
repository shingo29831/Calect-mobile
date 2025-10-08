// TurboModule spec
import {TurboModule, TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  // 値はBase64で渡す
  setItem(service: string, account: string, valueB64: string): Promise<void>;
  getItem(service: string, account: string): Promise<string | null>;
  deleteItem(service: string, account: string): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SecureStore');
