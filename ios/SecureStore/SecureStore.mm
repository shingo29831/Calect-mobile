#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>

// Swiftクラス名: SecureStoreModule
// JSからのモジュール名: SecureStore
RCT_EXTERN_REMAP_MODULE(SecureStore, SecureStoreModule, NSObject)

RCT_EXTERN_METHOD(setItem:(NSString *)service
                  account:(NSString *)account
                  valueB64:(NSString *)valueB64
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(getItem:(NSString *)service
                  account:(NSString *)account
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(deleteItem:(NSString *)service
                  account:(NSString *)account
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

+ (BOOL)requiresMainQueueSetup { return NO; }
@end
