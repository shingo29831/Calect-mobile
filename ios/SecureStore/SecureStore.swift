// ios/SecureStore/SecureStore.swift
import Foundation
import Security
import React

@objc(SecureStore)
class SecureStore: NSObject {

  private func baseQuery(service: String, account: String) -> [String: Any] {
    // 端末間移行を避けるため THIS_DEVICE_ONLY を推奨
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    ]
  }

  // MARK: - RCT bridged methods (signatures must match RCT_EXTERN_METHOD)

  /// setItem(service, account, valueB64)
  @objc func setItem(_ service: NSString,
                     account: NSString,
                     valueB64: NSString,
                     resolve: RCTPromiseResolveBlock,
                     reject: RCTPromiseRejectBlock) {
    // Base64 → Data
    guard let data = Data(base64Encoded: valueB64 as String) else {
      reject("EINVAL", "invalid base64", nil)
      return
    }

    // upsert: 既存削除→追加
    var query = baseQuery(service: service as String, account: account as String)
    SecItemDelete(query as CFDictionary)

    query[kSecValueData as String] = data
    let status = SecItemAdd(query as CFDictionary, nil)

    if status == errSecSuccess {
      resolve(nil) // JS 側では Promise<void>
    } else {
      reject("EKEYCHAIN", "SecItemAdd failed \(status)", nil)
    }
  }

  /// getItem(service, account) → base64 | null
  @objc func getItem(_ service: NSString,
                     account: NSString,
                     resolve: RCTPromiseResolveBlock,
                     reject: RCTPromiseRejectBlock) {
    var query = baseQuery(service: service as String, account: account as String)
    query[kSecReturnData as String] = kCFBooleanTrue
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var out: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &out)

    switch status {
    case errSecSuccess:
      if let data = out as? Data {
        resolve(data.base64EncodedString()) // JS 側では string(base64)
      } else {
        resolve(NSNull())
      }
    case errSecItemNotFound:
      resolve(NSNull())
    default:
      reject("EKEYCHAIN", "SecItemCopyMatching failed \(status)", nil)
    }
  }

  /// deleteItem(service, account)
  @objc func deleteItem(_ service: NSString,
                        account: NSString,
                        resolve: RCTPromiseResolveBlock,
                        reject: RCTPromiseRejectBlock) {
    let query = baseQuery(service: service as String, account: account as String)
    let status = SecItemDelete(query as CFDictionary)

    if status == errSecSuccess || status == errSecItemNotFound {
      resolve(nil)
    } else {
      reject("EKEYCHAIN", "SecItemDelete failed \(status)", nil)
    }
  }
}
