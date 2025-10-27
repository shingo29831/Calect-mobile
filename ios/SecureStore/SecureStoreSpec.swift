import Foundation

@objc(SecureStoreSpec)
public protocol SecureStoreSpec: NSObjectProtocol {
  func setItem(_ service: NSString, account: NSString, valueB64: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock)
  func getItem(_ service: NSString, account: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock)
  func deleteItem(_ service: NSString, account: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock)
}
