package com.calect.secure

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import com.facebook.react.bridge.*
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.security.KeyStore
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

class SecureStoreModule(context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  private val prefs: SharedPreferences =
    context.getSharedPreferences("secure_store_prefs", Context.MODE_PRIVATE)

  override fun getName() = "SecureStore"

  private val alias = "CalectMasterWrapKey"

  private fun getOrCreateKey(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

    val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    val spec = KeyGenParameterSpec.Builder(
      alias,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .setRandomizedEncryptionRequired(true)
      .setUserAuthenticationRequired(false)
      .build()

    keyGen.init(spec)
    return keyGen.generateKey()
  }

  @ReactMethod
  fun setItem(service: String, account: String, valueB64: String, promise: Promise) {
    try {
      val key = getOrCreateKey()
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, key)
      val plaintext = Base64.decode(valueB64, Base64.NO_WRAP)
      val ct = cipher.doFinal(plaintext)
      val iv = cipher.iv

      val payload = ByteArray(iv.size + ct.size)
      System.arraycopy(iv, 0, payload, 0, iv.size)
      System.arraycopy(ct, 0, payload, iv.size, ct.size)

      val b64 = Base64.encodeToString(payload, Base64.NO_WRAP)
      prefs.edit().putString("${service}::${account}", b64).apply()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("EKEYSTORE", e)
    }
  }

  @ReactMethod
  fun getItem(service: String, account: String, promise: Promise) {
    try {
      val b64 = prefs.getString("${service}::${account}", null)
      if (b64 == null) { promise.resolve(null); return }

      val payload = Base64.decode(b64, Base64.NO_WRAP)
      if (payload.size < 12) { promise.resolve(null); return }

      val key = getOrCreateKey()
      val iv = payload.copyOfRange(0, 12)
      val ct = payload.copyOfRange(12, payload.size)

      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
      val pt = cipher.doFinal(ct)
      val outB64 = Base64.encodeToString(pt, Base64.NO_WRAP)
      promise.resolve(outB64)
    } catch (e: Exception) {
      promise.reject("EKEYSTORE", e)
    }
  }

  @ReactMethod
  fun deleteItem(service: String, account: String, promise: Promise) {
    prefs.edit().remove("${service}::${account}").apply()
    promise.resolve(null)
  }
}
