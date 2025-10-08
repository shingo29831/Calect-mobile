import Foundation
import Security

@objc(SecureStore)
class SecureStore: NSObject, SecureStoreSpec {

  private func baseQuery(service: String, account: String) -> [String: Any] {
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      // 端末間移行不可（推奨）
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    ]
  }

  @objc func setItem(_ service: NSString, account: NSString, valueB64: NSString,
                     resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard let data = Data(base64Encoded: valueB64 as String) else {
      reject("EINVAL", "invalid base64", nil); return
    }
    var q = baseQuery(service: service as String, account: account as String)
    SecItemDelete(q as CFDictionary) // upsert

    q[kSecValueData as String] = data
    let status = SecItemAdd(q as CFDictionary, nil)
    if status == errSecSuccess {
      resolve(nil)
    } else {
      reject("EKEYCHAIN", "SecItemAdd failed \(status)", nil)
    }
  }

  @objc func getItem(_ service: NSString, account: NSString,
                     resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    var q = baseQuery(service: service as String, account: account as String)
    q[kSecReturnData as String] = kCFBooleanTrue
    q[kSecMatchLimit as String] = kSecMatchLimitOne

    var out: CFTypeRef?
    let status = SecItemCopyMatching(q as CFDictionary, &out)
    if status == errSecSuccess, let data = out as? Data {
      resolve(data.base64EncodedString())
    } else if status == errSecItemNotFound {
      resolve(NSNull())
    } else {
      reject("EKEYCHAIN", "SecItemCopyMatching failed \(status)", nil)
    }
  }

  @objc func deleteItem(_ service: NSString, account: NSString,
                        resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    let q = baseQuery(service: service as String, account: account as String)
    let status = SecItemDelete(q as CFDictionary)
    if status == errSecSuccess || status == errSecItemNotFound {
      resolve(nil)
    } else {
      reject("EKEYCHAIN", "SecItemDelete failed \(status)", nil)
    }
  }
}
