package com.calect.secure

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import com.facebook.react.bridge.*

import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

// 追加: EncryptedFile 系
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.MasterKey
import java.io.File

class SecureStoreModule(private val reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx) {

  override fun getName() = "SecureStore"

  // ===== キーストア+SharedPreferences（小さな値の保存向け） =====

  private val prefs: SharedPreferences =
    reactCtx.getSharedPreferences("secure_store_prefs", Context.MODE_PRIVATE)

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
      .setUserAuthenticationRequired(false) // 端末ポリシーで変更可
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
      if (b64 == null) {
        promise.resolve(null); return
      }
      val payload = Base64.decode(b64, Base64.NO_WRAP)
      // GCM の推奨 IV は 12 bytes。保存時の cipher.iv 長で切り出すのが安全だが、
      // ここでは 12 固定フォーマットで保存しているため 12 を採用。
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
      // Key 失効/端末状態変化等で復号できない場合もここに来る
      promise.reject("EKEYSTORE", e)
    }
  }

  @ReactMethod
  fun deleteItem(service: String, account: String, promise: Promise) {
    prefs.edit().remove("${service}::${account}").apply()
    promise.resolve(null)
  }

  // ===== EncryptedFile（大きめの JSON/スナップショット保存向け） =====

  private fun baseDir(ctx: Context): File {
    val dir = File(ctx.filesDir, "secure")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  private fun encryptedFile(ctx: Context, name: String): EncryptedFile {
    val masterKey = MasterKey.Builder(ctx)
      .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
      .build()

    val file = File(baseDir(ctx), "$name.bin")
    return EncryptedFile.Builder(
      ctx,
      file,
      masterKey,
      EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
    ).build()
  }

  /** UTF-8 文字列を暗号化して内部ストレージに保存（同名があれば上書き） */
  @ReactMethod
  fun saveEncrypted(name: String, dataUtf8: String, promise: Promise) {
    try {
      val f = File(baseDir(reactCtx), "$name.bin")
      if (f.exists()) f.delete() // EncryptedFile は追記不可のため一度消す
      val ef = encryptedFile(reactCtx, name)
      ef.openFileOutput().use { it.write(dataUtf8.toByteArray(Charsets.UTF_8)) }
      val res = Arguments.createMap().apply { putBoolean("ok", true) }
      promise.resolve(res)
    } catch (e: Exception) {
      val res = Arguments.createMap().apply {
        putBoolean("ok", false)
        putString("error", e.message)
      }
      promise.resolve(res)
    }
  }

  /** 暗号化ファイルを復号して UTF-8 文字列で返す */
  @ReactMethod
  fun loadEncrypted(name: String, promise: Promise) {
    try {
      val f = File(baseDir(reactCtx), "$name.bin")
      if (!f.exists()) {
        val res = Arguments.createMap().apply { putBoolean("ok", false) }
        promise.resolve(res); return
      }
      val ef = encryptedFile(reactCtx, name)
      val data = ef.openFileInput().use { it.readBytes() }.toString(Charsets.UTF_8)
      val res = Arguments.createMap().apply {
        putBoolean("ok", true)
        putString("dataUtf8", data)
      }
      promise.resolve(res)
    } catch (e: Exception) {
      // 改ざん・鍵失効等で復号できない場合
      val res = Arguments.createMap().apply { putBoolean("ok", false) }
      promise.resolve(res)
    }
  }

  /** 暗号化ファイルを削除 */
  @ReactMethod
  fun deleteEncrypted(name: String, promise: Promise) {
    val f = File(baseDir(reactCtx), "$name.bin")
    val ok = if (f.exists()) f.delete() else true
    val res = Arguments.createMap().apply { putBoolean("ok", ok) }
    promise.resolve(res)
  }
}
