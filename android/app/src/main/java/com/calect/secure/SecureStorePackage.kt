package com.calect.secure

import com.facebook.react.TurboReactPackage
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

/**
 * TurboModule 用（New Architecture / Bridgeless で使用）
 * ※ クラス名を SecureStoreTurboPackage に変更して衝突回避
 */
class SecureStoreTurboPackage : TurboReactPackage() {
  override fun getModule(name: String, context: ReactApplicationContext): NativeModule? =
    if (name == "SecureStore") SecureStoreModule(context) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      "SecureStore" to ReactModuleInfo(
        /* name           = */ "SecureStore",
        /* className      = */ "SecureStore",
        /* canOverride    = */ false,
        /* needsEagerInit = */ false,
        /* hasConstants   = */ true,
        /* isCxxModule    = */ false,
        /* isTurboModule  = */ true
      )
    )
  }
}

/**
 * 旧アーキテクチャ用（Fabric/Bridgeless無効のときのフォールバック）
 * ※ クラス名を SecureStorePackage（従来名）として残す
 */
class SecureStorePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(SecureStoreModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
